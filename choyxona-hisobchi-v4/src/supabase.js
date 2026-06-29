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
  'debts'
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

export async function sSet(key, value) {
  if (key === 'transactions') {
    // Tx writes go through normalized API
    throw new Error('Use txInsert/txUpdate/txDelete for transactions');
  }
  cache[key] = value;
  if (!useCloud) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
  if (!userId) return false;
  if (!onlineState) {
    enqueue({ kind: 'jsonb', key, value });
    return true;
  }
  try {
    const { error } = await supabase
      .from('app_data')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('jsonb save failed, queueing:', e.message);
    enqueue({ kind: 'jsonb', key, value });
    return true; // optimistically successful from UI perspective
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
    const arr = txCache;
    try { localStorage.setItem(LS_PREFIX + 'transactions', JSON.stringify(arr)); } catch {}
    return true;
  }

  if (!userId) return false;
  const row = txToRow(tx);
  if (!onlineState) { enqueue({ kind: 'tx_insert', row }); return true; }
  try {
    const { error } = await supabase.from('app_transactions').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('tx insert failed, queueing:', e.message);
    enqueue({ kind: 'tx_insert', row });
    return true;
  }
}

export async function txDelete(id) {
  txCache = txCache.filter(t => t.id !== id);
  notify();

  if (!useCloud) {
    try { localStorage.setItem(LS_PREFIX + 'transactions', JSON.stringify(txCache)); } catch {}
    return true;
  }

  if (!userId) return false;
  if (!onlineState) { enqueue({ kind: 'tx_delete', id }); return true; }
  try {
    const { error } = await supabase
      .from('app_transactions')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('tx delete failed, queueing:', e.message);
    enqueue({ kind: 'tx_delete', id });
    return true;
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
  q.push({ ...op, ts: Date.now() });
  writeQueue(q);
}
export function getQueueSize() { return readQueue().length; }

let flushing = false;
export async function flushQueue() {
  if (flushing || !useCloud || !userId || !onlineState) return;
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
          // Use upsert to handle case where realtime already brought it back
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
        console.warn('flush op failed:', e.message);
        remaining.push(op);
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
export function isOnline() { return onlineState; }

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
    } catch (e) { console.warn('tx migration:', e.message); }
  }

  // Cleanup localStorage on success
  for (const k of JSONB_KEYS) localStorage.removeItem(LS_PREFIX + k);
  localStorage.removeItem(LS_PREFIX + 'transactions');

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
