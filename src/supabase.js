// src/supabase.js — v4
// Hybrid storage:
//  - `app_data` jsonb (categories, drinks, drink_daily, cash_register, tg_config, workers, debts) — low frequency
//  - `app_transactions` normalized table — high frequency (concurrency-safe)
// Plus: offline write queue + Supabase realtime channels.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const useCloud = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabase = useCloud
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

const LS_PREFIX = 'choyxona_';
const QUEUE_KEY = 'choyxona_sync_queue';

// jsonb keys (single-row config-style data)
const JSONB_KEYS = [
  'categories',
  'drinks',
  'drink_daily',
  'cash_register',
  'tg_config',
  'workers',
  'debts',
  'worker_ledger',
  'audit_log'
];

let userId = null;
let cache = {};         // cache for jsonb keys
let txCache = [];       // cache for transactions (array)
let isInitialized = false;
let onlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;

// Listeners for cross-device sync (UI subscribes via subscribeAll)
const listeners = new Set();
function notify() { listeners.forEach(fn => { try { fn(); } catch {} }); }

export function subscribeAll(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Xato xabarchi — saqlashda jiddiy xato bo'lsa UI'ga bildiradi (jim queue emas)
let errorHandler = null;
export function setErrorHandler(fn) { errorHandler = fn; }
function reportError(context, err) {
  const msg = err?.message || String(err);
  console.error(`[${context}]`, msg, err);
  if (errorHandler) {
    try { errorHandler(context, msg); } catch {}
  }
}

// Xato turini aniqlash: tarmoq (vaqtinchalik) vs doimiy (schema/RLS/auth)
// Tarmoq xatosi → queue (keyin qayta urinadi)
// Doimiy xato → UI'ga ko'rsatamiz, queue'ga tashlamaymiz (abadiy aylanmaslik uchun)
function isNetworkError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('load failed') ||
    err?.code === 'PGRST000' ||  // connection
    !navigator.onLine
  );
}

export function setUserId(id) {
  if (userId === id) return;
  userId = id;
  cache = {};
  txCache = [];
  isInitialized = false;
  if (channelTx) { try { supabase.removeChannel(channelTx); } catch {} channelTx = null; }
  if (channelData) { try { supabase.removeChannel(channelData); } catch {} channelData = null; }
}

export function getUserId() { return userId; }

// ============================================================
// LOAD ALL — initial sync from cloud (or localStorage fallback)
// ============================================================
export async function loadAll() {
  if (!useCloud) {
    // localStorage mode
    const out = {};
    for (const k of JSONB_KEYS) {
      const v = localStorage.getItem(LS_PREFIX + k);
      out[k] = v ? JSON.parse(v) : null;
    }
    cache = out;
    const txRaw = localStorage.getItem(LS_PREFIX + 'transactions');
    txCache = txRaw ? JSON.parse(txRaw) : [];
    isInitialized = true;
    return { ...out, transactions: txCache };
  }

  if (!userId) throw new Error('Not authenticated');

  // Load jsonb config row
  const { data: cfg, error: cfgErr } = await supabase
    .from('app_data')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (cfgErr) throw cfgErr;

  if (!cfg) {
    const empty = {};
    for (const k of JSONB_KEYS) empty[k] = null;
    const { error: insertErr } = await supabase
      .from('app_data')
      .insert({ user_id: userId, ...empty });
    if (insertErr) throw insertErr;
    cache = empty;
  } else {
    const out = {};
    for (const k of JSONB_KEYS) out[k] = cfg[k];
    cache = out;
  }

  // Load transactions (normalized table)
  const { data: txs, error: txErr } = await supabase
    .from('app_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  if (txErr) throw txErr;
  txCache = (txs || []).map(rowToTx);

  isInitialized = true;

  // Subscribe to realtime updates (idempotent — only if not yet subscribed)
  startRealtime();

  // Try to flush any queued offline writes
  flushQueue().catch(() => {});

  return { ...cache, transactions: txCache };
}

// ============================================================
// JSONB GET/SET — same as before for non-tx data
// ============================================================
export async function sGet(key, fallback) {
  if (!isInitialized) await loadAll();
  if (key === 'transactions') {
    return txCache;
  }
  const v = cache[key];
  return (v === null || v === undefined) ? fallback : v;
}

// Sinxron cache o'qish — loadAll'ni QAYTA CHAQIRMAYDI.
// Faqat allaqachon yuklangan cache'dan o'qiydi (UI yangilash uchun xavfsiz).
export function cacheGet(key, fallback) {
  if (key === 'transactions') return txCache;
  const v = cache[key];
  return (v === null || v === undefined) ? fallback : v;
}

export async function sSet(key, value) {
  if (key === 'transactions') {
    throw new Error('Use txInsert/txUpdate/txDelete for transactions');
  }
  cache[key] = value;
  if (!useCloud) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { reportError('Saqlash (lokal)', e); return false; }
  }
  if (!userId) { reportError('Saqlash', new Error('Tizimga kirilmagan')); return false; }
  try {
    const { error } = await supabase
      .from('app_data')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue({ kind: 'jsonb', key, value });
      return true;
    }
    reportError(`"${key}" saqlash`, e);
    return false;
  }
}

// ============================================================
// TRANSACTIONS — normalized API
// ============================================================
function txToRow(tx) {
  return {
    id: tx.id,
    user_id: userId,
    type: tx.type,
    category_id: tx.categoryId,
    amount: Number(tx.amount) || 0,
    qty: tx.qty != null ? Number(tx.qty) : null,
    qty_eaten: tx.qtyEaten != null ? Number(tx.qtyEaten) : null,
    payee: tx.payee || null,
    payee_worker_id: tx.payeeWorkerId || null,
    payment_method: tx.paymentMethod || null, // 'cash' | 'card' | null
    note: tx.note || null,
    date: tx.date,
    created_at: tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString(),
  };
}

function rowToTx(row) {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    amount: Number(row.amount) || 0,
    qty: row.qty != null ? Number(row.qty) : undefined,
    qtyEaten: row.qty_eaten != null ? Number(row.qty_eaten) : undefined,
    payee: row.payee || undefined,
    payeeWorkerId: row.payee_worker_id || undefined,
    paymentMethod: row.payment_method || undefined,
    note: row.note || undefined,
    date: row.date,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

export async function txInsert(tx) {
  txCache = [...txCache, tx];
  notify();

  if (!useCloud) {
    try { localStorage.setItem(LS_PREFIX + 'transactions', JSON.stringify(txCache)); }
    catch (e) { reportError('Saqlash (lokal)', e); return false; }
    return true;
  }

  if (!userId) { reportError('Saqlash', new Error('Tizimga kirilmagan')); return false; }
  const row = txToRow(tx);
  try {
    const { error } = await supabase.from('app_transactions').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    if (isNetworkError(e)) {
      // Tarmoq xatosi — queue'ga, keyin qayta urinadi
      enqueue({ kind: 'tx_insert', row });
      return true;
    }
    // Doimiy xato (schema/RLS) — UI'ga ko'rsatamiz, queue'ga TASHLAMAYMIZ
    reportError('Yozuvni saqlash', e);
    // Cache'dan ham olib tashlaymiz (chunki bazaga ketmadi)
    txCache = txCache.filter(t => t.id !== tx.id);
    notify();
    return false;
  }
}

export async function txDelete(id) {
  const removed = txCache.find(t => t.id === id);
  txCache = txCache.filter(t => t.id !== id);
  notify();

  if (!useCloud) {
    try { localStorage.setItem(LS_PREFIX + 'transactions', JSON.stringify(txCache)); }
    catch (e) { reportError('O\'chirish (lokal)', e); return false; }
    return true;
  }

  if (!userId) { reportError('O\'chirish', new Error('Tizimga kirilmagan')); return false; }
  try {
    const { error } = await supabase
      .from('app_transactions')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue({ kind: 'tx_delete', id });
      return true;
    }
    reportError('Yozuvni o\'chirish', e);
    // Qaytarib qo'yamiz (o'chirilmadi)
    if (removed) { txCache = [...txCache, removed]; notify(); }
    return false;
  }
}

// ============================================================
// OFFLINE QUEUE
// ============================================================
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
function enqueue(op) {
  const q = readQueue();
  q.push({ ...op, ts: Date.now(), attempts: 0 });
  writeQueue(q);
}
export function getQueueSize() { return readQueue().length; }
// Qotib qolgan queue'ni tozalash (foydalanuvchi qo'lda chaqiradi)
export function clearQueue() {
  writeQueue([]);
  notify();
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !useCloud || !userId) return;
  if (!navigator.onLine) return;
  const q = readQueue();
  if (q.length === 0) return;
  flushing = true;
  try {
    const remaining = [];
    for (const op of q) {
      try {
        if (op.kind === 'jsonb') {
          const { error } = await supabase
            .from('app_data')
            .update({ [op.key]: op.value, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          if (error) throw error;
        } else if (op.kind === 'tx_insert') {
          const { error } = await supabase
            .from('app_transactions')
            .upsert(op.row, { onConflict: 'id' });
          if (error) throw error;
        } else if (op.kind === 'tx_delete') {
          const { error } = await supabase
            .from('app_transactions')
            .delete()
            .eq('user_id', userId)
            .eq('id', op.id);
          if (error) throw error;
        }
      } catch (e) {
        const attempts = (op.attempts || 0) + 1;
        if (isNetworkError(e) && attempts < 5) {
          // Tarmoq xatosi — yana saqlab qo'yamiz (5 martagacha)
          remaining.push({ ...op, attempts });
        } else {
          // Doimiy xato yoki 5 marta urinildi — tashlab yuboramiz va xabar beramiz
          reportError('Sinxronlash', e);
        }
      }
    }
    writeQueue(remaining);
  } finally {
    flushing = false;
  }
  notify();
}

// online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    onlineState = true;
    flushQueue().catch(() => {});
    notify();
  });
  window.addEventListener('offline', () => {
    onlineState = false;
    notify();
  });
}
export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ============================================================
// REALTIME — Supabase channels
// ============================================================
let channelTx = null;
let channelData = null;

function startRealtime() {
  if (!useCloud || !userId) return;

  if (!channelTx) {
    channelTx = supabase
      .channel(`tx-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_transactions', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const tx = rowToTx(payload.new);
            if (!txCache.find(t => t.id === tx.id)) {
              txCache = [...txCache, tx];
              notify();
            }
          } else if (payload.eventType === 'DELETE') {
            const id = payload.old?.id;
            if (id) {
              txCache = txCache.filter(t => t.id !== id);
              notify();
            }
          } else if (payload.eventType === 'UPDATE') {
            const tx = rowToTx(payload.new);
            txCache = txCache.map(t => t.id === tx.id ? tx : t);
            notify();
          }
        })
      .subscribe();
  }

  if (!channelData) {
    channelData = supabase
      .channel(`data-${userId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_data', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new) {
            for (const k of JSONB_KEYS) {
              if (payload.new[k] !== undefined) cache[k] = payload.new[k];
            }
            notify();
          }
        })
      .subscribe();
  }
}

export async function reloadFromCloud() {
  if (!useCloud || !userId) return;
  isInitialized = false;
  return loadAll();
}

// ============================================================
// DIAGNOSTIKA — ulanish va saqlashni tekshiradi
// ============================================================
export async function runDiagnostics() {
  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok, detail });

  // 1. Cloud sozlanganmi?
  if (!useCloud) {
    add('Rejim', true, 'Lokal (localStorage) — Supabase ulanmagan');
    add('localStorage', testLocalStorage(), testLocalStorage() ? 'Ishlaydi' : 'BLOKLANGAN — brauzer sozlamasini tekshiring');
    return results;
  }
  add('Rejim', true, 'Bulut (Supabase)');

  // 2. Auth
  add('Tizimga kirish', !!userId, userId ? `User ID mavjud` : 'KIRILMAGAN');
  if (!userId) return results;

  // 3. app_data o'qish
  try {
    const { error } = await supabase.from('app_data').select('user_id').eq('user_id', userId).maybeSingle();
    add('app_data o\'qish', !error, error ? error.message : 'OK');
  } catch (e) { add('app_data o\'qish', false, e.message); }

  // 4. app_data yozish (audit_log ustuni mavjudligini tekshiradi)
  try {
    const { error } = await supabase.from('app_data')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    add('app_data yozish', !error, error ? error.message : 'OK');
  } catch (e) { add('app_data yozish', false, e.message); }

  // 5. audit_log ustuni bormi?
  try {
    const { error } = await supabase.from('app_data')
      .update({ audit_log: [] })
      .eq('user_id', userId);
    add('audit_log ustuni', !error, error ? `YO'Q: ${error.message}` : 'Mavjud');
  } catch (e) { add('audit_log ustuni', false, e.message); }

  // 6. app_transactions yozish (asosiy muammo shu yerda bo'lishi mumkin)
  const testId = 'diag_' + Date.now();
  try {
    const { error } = await supabase.from('app_transactions').insert({
      id: testId, user_id: userId, type: 'income', category_id: 'diag',
      amount: 1, date: new Date().toISOString().slice(0, 10),
    });
    if (error) {
      add('app_transactions yozish', false, error.message);
    } else {
      add('app_transactions yozish', true, 'OK');
      // Tozalash
      await supabase.from('app_transactions').delete().eq('id', testId);
    }
  } catch (e) { add('app_transactions yozish', false, e.message); }

  // 7. Navbat holati
  add('Navbat (queue)', getQueueSize() === 0, `${getQueueSize()} ta yozuv kutmoqda`);

  return results;
}

function testLocalStorage() {
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return true;
  } catch { return false; }
}

// ============================================================
// MIGRATION — localStorage → cloud (v3 → v4 compatible)
// ============================================================
export function hasLocalData() {
  for (const k of JSONB_KEYS) {
    if (localStorage.getItem(LS_PREFIX + k)) return true;
  }
  if (localStorage.getItem(LS_PREFIX + 'transactions')) return true;
  return false;
}

export async function migrateLocalToCloud() {
  if (!useCloud || !userId) return { migrated: 0 };
  let migrated = 0;

  // 1) jsonb keys
  const updates = {};
  for (const k of JSONB_KEYS) {
    const raw = localStorage.getItem(LS_PREFIX + k);
    if (raw) {
      try { updates[k] = JSON.parse(raw); migrated++; } catch {}
    }
  }
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('app_data')
      .update(updates)
      .eq('user_id', userId);
    if (error) throw error;
  }

  // 2) transactions → normalized table
  let txMigrationOk = true;
  const txRaw = localStorage.getItem(LS_PREFIX + 'transactions');
  if (txRaw) {
    try {
      const arr = JSON.parse(txRaw);
      if (Array.isArray(arr) && arr.length > 0) {
        // Insert in batches of 200
        const rows = arr.map(t => txToRow({ ...t, id: t.id || (Date.now().toString(36) + Math.random().toString(36).substring(2, 7)) }));
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const { error } = await supabase
            .from('app_transactions')
            .upsert(batch, { onConflict: 'id' });
          if (error) throw error;
        }
        migrated++;
      }
    } catch (e) {
      // MUHIM: migration xato bersa, localStorage'ni O'CHIRMAYMIZ
      txMigrationOk = false;
      throw new Error(`Tranzaksiyalarni ko'chirishda xato: ${e.message}. Ma'lumotlar saqlanib qoldi.`);
    }
  }

  // Cleanup localStorage — FAQAT hammasi muvaffaqiyatli bo'lsa
  if (txMigrationOk) {
    for (const k of JSONB_KEYS) localStorage.removeItem(LS_PREFIX + k);
    localStorage.removeItem(LS_PREFIX + 'transactions');
  }

  // Update caches
  for (const k of JSONB_KEYS) {
    if (updates[k] !== undefined) cache[k] = updates[k];
  }
  // Reload tx cache
  const { data: txs } = await supabase
    .from('app_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  txCache = (txs || []).map(rowToTx);

  notify();
  return { migrated };
}

// ============================================================
// AUTH HELPERS
// ============================================================
export async function signUp(email, password) {
  if (!useCloud) throw new Error('Cloud not configured');
  return supabase.auth.signUp({ email, password });
}
export async function signIn(email, password) {
  if (!useCloud) throw new Error('Cloud not configured');
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  if (!useCloud) return;
  if (channelTx) { try { supabase.removeChannel(channelTx); } catch {} channelTx = null; }
  if (channelData) { try { supabase.removeChannel(channelData); } catch {} channelData = null; }
  return supabase.auth.signOut();
}
export async function getSession() {
  if (!useCloud) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(cb) {
  if (!useCloud) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
