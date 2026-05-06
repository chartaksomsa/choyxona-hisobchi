import { useState, useEffect, useMemo } from "react";
import {
  Home, TrendingUp, TrendingDown, Coffee, Settings as SettingsIcon,
  BarChart3, Plus, Trash2, Edit3, Save, X, Calendar, Wallet,
  AlertTriangle, Package, ChevronDown, ChevronUp,
  CreditCard, Percent, Check, Banknote, Link2, Info, Send,
  Eye, EyeOff, Loader2, BookOpen, CheckCircle2, Users,
  HandCoins, FileDown, LogOut, UserCircle, Mail, Lock,
  Calendar as CalendarIcon, ArrowUpRight, ArrowDownLeft, Clock,
  Wifi, WifiOff, RefreshCw, PieChart as PieChartIcon, Printer, Hash
} from "lucide-react";
import {
  useCloud, supabase, setUserId, loadAll, sGet, sSet,
  txInsert, txDelete,
  hasLocalData, migrateLocalToCloud, reloadFromCloud,
  signUp, signIn, signOut, getSession, onAuthChange,
  subscribeAll, isOnline, getQueueSize, flushQueue
} from './supabase.js';

// Note: charts.jsx is dynamically imported in ChartsLoader (Reports tab),
// which Vite splits into its own chunk via vite.config.js manualChunks.

// ============== HELPERS ==============
const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
const fmtSom = (n) => `${fmt(n)} so'm`;
const todayStr = () => new Date().toISOString().split('T')[0];
const genId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

const formatUzbDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  const months = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  const days = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  return `${days[d.getDay()]}, ${d.getDate()}-${months[d.getMonth()]}`;
};

const formatUzbDateFull = (s) => {
  if (!s) return '';
  const d = new Date(s);
  const months = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  const days = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);
const escapeHTML = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const DEFAULT_CATEGORIES = {
  income: [
    { id: 'inc_somsa', name: 'Somsa sotuvi', icon: '🥟', perUnit: true, unitPrice: 5000, trackEaten: true },
    { id: 'inc_shashlik', name: 'Shashlik sotuvi', icon: '🍢', hasCommission: true, commissionPercent: 24 },
    { id: 'inc_ovqat', name: 'Ovqat sotuvi', icon: '🍲' },
    { id: 'inc_suv', name: 'Suv/Ichimlik sotuvi', icon: '🥤', autoFromDrinks: true },
  ],
  expense: [
    { id: 'exp_pomidor', name: 'Pomidor (somsa uchun)', linkedTo: 'inc_somsa' },
    { id: 'exp_oylik', name: 'Ishchilar oyligi', linkedTo: 'inc_somsa', trackPayee: true },
    { id: 'exp_benzin', name: 'Motor uchun benzin', linkedTo: 'inc_somsa' },
    { id: 'exp_taxsi', name: 'Taxsi mahsulotlari', linkedTo: 'inc_somsa' },
    { id: 'exp_gosht', name: "Go'sht mahsulotlari", linkedTo: 'inc_ovqat' },
    { id: 'exp_sut', name: 'Sut mahsulotlari', linkedTo: 'inc_ovqat' },
    { id: 'exp_non', name: 'Non mahsulotlari', linkedTo: 'inc_ovqat' },
    { id: 'exp_bozor', name: 'Kundalik bozor (qalampir, pomidor, bodring...)', linkedTo: 'inc_ovqat' },
    { id: 'exp_qassob', name: 'Qassob qarzi', linkedTo: 'inc_ovqat' },
  ]
};

// ============== TELEGRAM ==============
async function tgSend(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    return { ok: data.ok, error: data.description };
  } catch (e) { return { ok: false, error: e.message }; }
}
// Uzun matnlar uchun (Telegram limiti 4096 belgi) — qatorlar bo'yicha ajratib yuboradi
async function tgSendLong(token, chatId, text) {
  const MAX = 3800; // xavfsiz limit
  if (text.length <= MAX) return tgSend(token, chatId, text);
  const parts = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if ((buf + line + '\n').length > MAX) {
      parts.push(buf);
      buf = line + '\n';
    } else {
      buf += line + '\n';
    }
  }
  if (buf) parts.push(buf);
  for (let i = 0; i < parts.length; i++) {
    const r = await tgSend(token, chatId, parts[i] + (i < parts.length - 1 ? `\n<i>(${i+1}/${parts.length})</i>` : ''));
    if (!r.ok) return r;
    await new Promise(res => setTimeout(res, 350)); // rate-limit'ni hurmat qilish
  }
  return { ok: true };
}
async function tgGetMe(token) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    return { ok: data.ok, info: data.result, error: data.description };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ============================================================
// ROOT — Auth Guard
// ============================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!useCloud) {
      setAuthChecked(true);
      return;
    }
    getSession().then(s => {
      setSession(s);
      if (s) setUserId(s.user.id);
      setAuthChecked(true);
    });
    const unsub = onAuthChange((s) => {
      setSession(s);
      if (s) setUserId(s.user.id);
      else setUserId(null);
    });
    return unsub;
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Coffee className="w-12 h-12 text-emerald-700 animate-pulse" />
      </div>
    );
  }

  if (useCloud && !session) return <AuthScreen />;

  return <ChoyxonaHisobchi userEmail={session?.user?.email} />;
}

// ============================================================
// AUTH SCREEN
// ============================================================
function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  async function submit() {
    setError(null); setInfo(null);
    if (!email || !password) { setError("Email va parolni kiriting"); return; }
    if (password.length < 6) { setError("Parol kamida 6 belgi bo'lishi kerak"); return; }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        if (data.user && !data.session) {
          setInfo("Email manzilingizga tasdiqlash xati yuborildi. Uni oching va tasdiqlang.");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (e) { setError(e.message || "Xato yuz berdi"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl mb-3 shadow-lg">
            <Coffee className="w-8 h-8 text-emerald-950" />
          </div>
          <h1 className="text-2xl font-bold text-amber-50">Choyxona Hisobchi</h1>
          <p className="text-amber-200/70 text-sm mt-1">Kunlik kirim-chiqim ilovasi</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-1 bg-stone-100 rounded-lg p-1">
            <button onClick={() => { setMode('login'); setError(null); setInfo(null); }}
              className={`py-2 rounded-md text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-600'}`}>
              Kirish
            </button>
            <button onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
              className={`py-2 rounded-md text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-600'}`}>
              Ro'yxatdan o'tish
            </button>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600 uppercase">Email</span>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none"
                placeholder="siz@example.com" />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600 uppercase">Parol</span>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="w-full pl-10 pr-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none"
                placeholder="Kamida 6 belgi" />
            </div>
          </label>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}
          {info && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900 flex gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{info}</span>
            </div>
          )}

          <button onClick={submit} disabled={loading}
            className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? "Kirish" : "Akkaunt yaratish"}
          </button>

          <p className="text-[10px] text-center text-slate-400 leading-relaxed">
            {mode === 'signup'
              ? <>Akkaunt yaratganingizdan keyin email manzilingizga<br/>tasdiqlash xati yuboriladi.</>
              : <>Birinchi marta foydalanyapsizmi?<br/>"Ro'yxatdan o'tish" ni tanlang.</>}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP — ChoyxonaHisobchi
// ============================================================
function ChoyxonaHisobchi({ userEmail }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [migrationOffer, setMigrationOffer] = useState(false);

  // Connectivity status
  const [online, setOnline] = useState(isOnline());
  const [queueSize, setQueueSize] = useState(getQueueSize());

  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [transactions, setTransactions] = useState([]);
  const [drinks, setDrinks] = useState([]);
  const [drinkDaily, setDrinkDaily] = useState({});
  const [cashRegister, setCashRegister] = useState({});
  const [tgConfig, setTgConfig] = useState({ botToken: '', recipients: [] });
  const [workers, setWorkers] = useState([]);
  const [debts, setDebts] = useState([]);

  useEffect(() => { initialize(); }, []);

  // Realtime + connectivity subscription
  useEffect(() => {
    const unsub = subscribeAll(() => {
      // Re-pull from cache (which has been updated by realtime/queue)
      loadStateFromCache();
      setQueueSize(getQueueSize());
      setOnline(isOnline());
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Periodic queue size refresh
  useEffect(() => {
    const id = setInterval(() => setQueueSize(getQueueSize()), 3000);
    return () => clearInterval(id);
  }, []);

  // visibilitychange — refresh from cloud when tab regains focus
  useEffect(() => {
    if (!useCloud) return;
    const handler = async () => {
      if (document.visibilityState === 'visible') {
        try {
          await reloadFromCloud();
          await loadStateFromCache();
          await flushQueue();
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  async function loadStateFromCache() {
    let cats = await sGet('categories', null);
    if (!cats) {
      cats = DEFAULT_CATEGORIES;
      await sSet('categories', cats);
    }
    setCategories(cats);
    setTransactions(await sGet('transactions', []));
    setDrinks(await sGet('drinks', []));
    setDrinkDaily(await sGet('drink_daily', {}));
    setCashRegister(await sGet('cash_register', {}));
    setTgConfig(await sGet('tg_config', { botToken: '', recipients: [] }));
    setWorkers(await sGet('workers', []));
    setDebts(await sGet('debts', []));
  }

  async function initialize() {
    try {
      await loadAll();
      if (useCloud && hasLocalData()) {
        const cloudHasData = await sGet('transactions', []);
        if (!cloudHasData || cloudHasData.length === 0) {
          setMigrationOffer(true);
        }
      }
      await loadStateFromCache();
    } catch (e) {
      console.error('Init error:', e);
      showToast(`Yuklash xatosi: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function doMigration() {
    try {
      const r = await migrateLocalToCloud();
      await loadStateFromCache();
      showToast(`${r.migrated} ta ma'lumot bulutga ko'chirildi`);
    } catch (e) {
      showToast(`Xato: ${e.message}`, 'error');
    }
    setMigrationOffer(false);
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2400);
  }

  // ============= CRUD =============
  async function addCategory(type, cat) {
    const newCat = { id: genId(), ...cat };
    const updated = { ...categories, [type]: [...categories[type], newCat] };
    setCategories(updated);
    await sSet('categories', updated);
    showToast("Bo'lim qo'shildi");
  }
  async function updateCategory(type, id, updates) {
    const updated = {
      ...categories,
      [type]: categories[type].map(c => c.id === id ? { ...c, ...updates } : c)
    };
    setCategories(updated);
    await sSet('categories', updated);
    showToast("Yangilandi");
  }
  async function deleteCategory(type, id) {
    if (!confirm("Rostan ham o'chirmoqchimisiz?")) return;
    const updated = {
      ...categories,
      [type]: categories[type].filter(c => c.id !== id)
    };
    setCategories(updated);
    await sSet('categories', updated);
    showToast("O'chirildi");
  }

  // === TRANSACTIONS — normalized API (concurrency-safe) ===
  async function addTransaction(tx) {
    const newTx = { id: genId(), createdAt: Date.now(), ...tx };
    setTransactions(prev => [...prev, newTx]);
    await txInsert(newTx);
    showToast("Saqlandi");
  }
  async function deleteTransaction(id) {
    setTransactions(prev => prev.filter(t => t.id !== id));
    await txDelete(id);
    showToast("O'chirildi");
  }

  async function addDrink(drink) {
    const newDrink = { id: genId(), ...drink };
    const updated = [...drinks, newDrink];
    setDrinks(updated);
    await sSet('drinks', updated);
    showToast("Suv qo'shildi");
  }
  async function updateDrink(id, updates) {
    const updated = drinks.map(d => d.id === id ? { ...d, ...updates } : d);
    setDrinks(updated);
    await sSet('drinks', updated);
    showToast("Yangilandi");
  }
  async function deleteDrink(id) {
    if (!confirm("Bu suv o'chiriladi.")) return;
    const updated = drinks.filter(d => d.id !== id);
    setDrinks(updated);
    await sSet('drinks', updated);
    showToast("O'chirildi");
  }
  async function saveDrinkDayRecord(date, drinkId, record) {
    const dayRecords = { ...(drinkDaily[date] || {}), [drinkId]: record };
    const updated = { ...drinkDaily, [date]: dayRecords };
    setDrinkDaily(updated);
    await sSet('drink_daily', updated);
  }

  async function saveCashRegister(date, data) {
    const updated = { ...cashRegister, [date]: data };
    setCashRegister(updated);
    await sSet('cash_register', updated);
    showToast("Kassa saqlandi");
  }

  async function saveTgConfig(cfg) {
    setTgConfig(cfg);
    await sSet('tg_config', cfg);
  }

  async function addWorker(w) {
    const newW = { id: genId(), active: true, createdAt: Date.now(), ...w };
    const updated = [...workers, newW];
    setWorkers(updated);
    await sSet('workers', updated);
    showToast("Ishchi qo'shildi");
  }
  async function updateWorker(id, updates) {
    const updated = workers.map(w => w.id === id ? { ...w, ...updates } : w);
    setWorkers(updated);
    await sSet('workers', updated);
    showToast("Yangilandi");
  }
  async function deleteWorker(id) {
    if (!confirm("Ishchini o'chirmoqchimisiz? Bu uning oldingi tarixini ham o'chirmaydi.")) return;
    const updated = workers.filter(w => w.id !== id);
    setWorkers(updated);
    await sSet('workers', updated);
    showToast("O'chirildi");
  }

  async function addDebt(d) {
    const newD = { id: genId(), createdAt: Date.now(), status: 'pending', remaining: Number(d.amount), ...d };
    const updated = [...debts, newD];
    setDebts(updated);
    await sSet('debts', updated);
    showToast("Qarz qo'shildi");
  }
  async function updateDebt(id, updates) {
    const updated = debts.map(d => d.id === id ? { ...d, ...updates } : d);
    setDebts(updated);
    await sSet('debts', updated);
    showToast("Yangilandi");
  }
  async function deleteDebt(id) {
    if (!confirm("O'chirmoqchimisiz?")) return;
    const updated = debts.filter(d => d.id !== id);
    setDebts(updated);
    await sSet('debts', updated);
    showToast("O'chirildi");
  }
  async function recordDebtPayment(id, amount) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;
    const newRemaining = Math.max(0, Number(debt.remaining) - Number(amount));
    const updates = { remaining: newRemaining };
    if (newRemaining === 0) {
      updates.status = 'paid';
      updates.paidDate = todayStr();
    }
    await updateDebt(id, updates);
  }

  function getPrevEndStock(date, drinkId) {
    const dates = Object.keys(drinkDaily).filter(d => d < date).sort();
    for (let i = dates.length - 1; i >= 0; i--) {
      const rec = drinkDaily[dates[i]]?.[drinkId];
      if (rec && rec.endStock !== undefined && rec.endStock !== null && rec.endStock !== '') {
        return Number(rec.endStock);
      }
    }
    return 0;
  }

  // Worker name → id resolver (for old data without payeeWorkerId)
  const workerByName = useMemo(() => {
    const m = {};
    workers.forEach(w => { if (w.name) m[w.name] = w.id; });
    return m;
  }, [workers]);

  // ============= COMPUTED =============
  const dayTransactions = useMemo(
    () => transactions.filter(t => t.date === selectedDate),
    [transactions, selectedDate]
  );

  const drinkDayStats = useMemo(() => {
    const dayRec = drinkDaily[selectedDate] || {};
    let totalRevenue = 0, totalProfit = 0, totalSold = 0;
    const perDrink = drinks.map(drink => {
      const rec = dayRec[drink.id] || {};
      const start = rec.startStock !== undefined && rec.startStock !== '' && rec.startStock !== null
        ? Number(rec.startStock) : getPrevEndStock(selectedDate, drink.id);
      const added = Number(rec.added || 0);
      const end = rec.endStock !== undefined && rec.endStock !== '' && rec.endStock !== null
        ? Number(rec.endStock) : null;
      const sold = end !== null ? Math.max(0, start + added - end) : 0;
      const revenue = sold * Number(drink.salePrice || 0);
      const profit = sold * (Number(drink.salePrice || 0) - Number(drink.purchasePrice || 0));
      totalRevenue += revenue; totalProfit += profit; totalSold += sold;
      return { drink, start, added, end, sold, revenue, profit, hasEnd: end !== null };
    });
    return { perDrink, totalRevenue, totalProfit, totalSold };
  }, [drinkDaily, selectedDate, drinks]);

  const dayStats = useMemo(() => {
    const incomeByCategory = {}, expenseByCategory = {}, perUnitDetails = {};
    let totalIncome = 0, totalExpense = 0;
    let cardIncome = 0;       // YANGI: paymentMethod='card' bo'lgan tushum
    let cashlessExpense = 0;  // ESKI: isCashless chiqim (backward-compat)

    dayTransactions.forEach(t => {
      if (t.type === 'income') {
        const cat = categories.income.find(c => c.id === t.categoryId);
        const realAmount = cat?.hasCommission
          ? Number(t.amount) * (Number(cat.commissionPercent) || 0) / 100
          : Number(t.amount);
        incomeByCategory[t.categoryId] = (incomeByCategory[t.categoryId] || 0) + realAmount;
        totalIncome += realAmount;
        if (t.paymentMethod === 'card') cardIncome += realAmount;
        if (t.qty) {
          if (!perUnitDetails[t.categoryId]) perUnitDetails[t.categoryId] = { qty: 0, qtyEaten: 0 };
          perUnitDetails[t.categoryId].qty += Number(t.qty);
          perUnitDetails[t.categoryId].qtyEaten += Number(t.qtyEaten || 0);
        }
      } else {
        expenseByCategory[t.categoryId] = (expenseByCategory[t.categoryId] || 0) + Number(t.amount);
        totalExpense += Number(t.amount);
        const cat = categories.expense.find(c => c.id === t.categoryId);
        if (cat?.isCashless) cashlessExpense += Number(t.amount);
      }
    });

    const suvCat = categories.income.find(c => c.autoFromDrinks);
    if (suvCat && drinkDayStats.totalRevenue > 0) {
      incomeByCategory[suvCat.id] = (incomeByCategory[suvCat.id] || 0) + drinkDayStats.totalRevenue;
      totalIncome += drinkDayStats.totalRevenue;
      // Suv tushumi naqd hisoblanadi (default)
    }

    // Plastik: yangi card-income + eski isCashless-expense (har ikkalasi ham hisobga olinadi)
    const totalCashless = cardIncome + cashlessExpense;

    return {
      incomeByCategory, expenseByCategory, perUnitDetails,
      totalIncome, totalExpense, totalCashless,
      cardIncome, cashlessExpense
    };
  }, [dayTransactions, categories, drinkDayStats.totalRevenue]);

  const debtsStats = useMemo(() => {
    const owedToUs = debts.filter(d => d.type === 'owed_to_us' && d.status === 'pending')
      .reduce((s, d) => s + Number(d.remaining || d.amount), 0);
    const weOwe = debts.filter(d => d.type === 'we_owe' && d.status === 'pending')
      .reduce((s, d) => s + Number(d.remaining || d.amount), 0);
    return { owedToUs, weOwe };
  }, [debts]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <Coffee className="w-12 h-12 mx-auto text-emerald-700 animate-pulse" />
          <p className="mt-4 text-slate-600 font-medium">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  // Connectivity badge text
  const connStatus = !useCloud
    ? { text: '📱 Faqat shu qurilmada', cls: 'text-amber-200/70' }
    : !online
      ? { text: queueSize > 0 ? `📴 Offline (${queueSize} ta navbatda)` : '📴 Offline', cls: 'text-rose-300' }
      : queueSize > 0
        ? { text: `↻ Sinxronlanmoqda (${queueSize})`, cls: 'text-amber-300' }
        : { text: '☁️ Bulutda saqlanadi', cls: 'text-amber-200/70' };

  return (
    <div className="min-h-screen bg-stone-50 pb-24" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-emerald-900 text-amber-50 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Coffee className="w-5 h-5 text-emerald-950" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-wide truncate">Choyxona Hisobchi</h1>
              <p className={`text-[11px] ${connStatus.cls}`}>{connStatus.text}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-1.5 bg-emerald-950 hover:bg-black/30 px-2.5 py-2 rounded-lg text-xs transition-colors">
              <Calendar className="w-4 h-4" />
              <span className="font-medium hidden xs:inline">{formatUzbDate(selectedDate)}</span>
            </button>
            {useCloud && (
              <button onClick={() => setShowUserMenu(!showUserMenu)}
                className="bg-emerald-950 hover:bg-black/30 p-2 rounded-lg transition-colors relative">
                <UserCircle className="w-5 h-5" />
                {(!online || queueSize > 0) && (
                  <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${!online ? 'bg-rose-500' : 'bg-amber-400'} live-dot`} />
                )}
              </button>
            )}
          </div>
        </div>

        {showDatePicker && (
          <div className="bg-emerald-950 px-4 pb-3 border-t border-emerald-800">
            <div className="max-w-4xl mx-auto pt-3">
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-emerald-900 text-amber-50 px-3 py-2 rounded-lg border border-emerald-700 focus:border-amber-500 outline-none" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setSelectedDate(todayStr()); setShowDatePicker(false); }}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-emerald-950 font-semibold py-2 rounded-lg transition-colors">Bugun</button>
                <button onClick={() => setShowDatePicker(false)}
                  className="px-4 bg-emerald-800 hover:bg-emerald-700 py-2 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}

        {showUserMenu && useCloud && (
          <div className="bg-emerald-950 px-4 pb-3 border-t border-emerald-800">
            <div className="max-w-4xl mx-auto pt-3 space-y-2">
              <div className="bg-emerald-900 rounded-lg p-3">
                <p className="text-[11px] text-amber-200/70">Kirgan akkaunt:</p>
                <p className="text-sm font-medium truncate">{userEmail}</p>
              </div>
              <div className={`rounded-lg p-3 flex items-center gap-2 ${online ? 'bg-emerald-900' : 'bg-rose-900/50'}`}>
                {online ? <Wifi className="w-4 h-4 text-emerald-300" /> : <WifiOff className="w-4 h-4 text-rose-300" />}
                <div className="text-[11px] flex-1">
                  <p className="font-semibold">{online ? 'Onlayn' : 'Offline'}</p>
                  <p className="opacity-70">{queueSize > 0 ? `${queueSize} ta yozuv navbatda` : 'Hammasi sinxronlangan'}</p>
                </div>
                {queueSize > 0 && online && (
                  <button onClick={() => flushQueue()} className="bg-amber-500 text-emerald-950 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />Yuborish
                  </button>
                )}
              </div>
              <button onClick={async () => { await signOut(); }}
                className="w-full bg-rose-700 hover:bg-rose-600 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                <LogOut className="w-4 h-4" />Chiqish
              </button>
            </div>
          </div>
        )}
      </header>

      {migrationOffer && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <Info className="w-5 h-5 text-amber-700 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">Eski ma'lumotlar topildi</p>
              <p className="text-xs text-amber-800">Telefoningizdagi ma'lumotlarni bulutga ko'chirasizmi?</p>
            </div>
            <button onClick={doMigration} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0">Ko'chirish</button>
            <button onClick={() => setMigrationOffer(false)} className="text-amber-700 p-2 flex-shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-4">
        {activeTab === 'dashboard' && (
          <DashboardTab date={selectedDate} categories={categories} transactions={dayTransactions}
            stats={dayStats} drinkStats={drinkDayStats} cashRegister={cashRegister}
            onSaveCash={saveCashRegister} tgConfig={tgConfig} drinks={drinks}
            drinkDaily={drinkDaily} workers={workers} debts={debts}
            debtsStats={debtsStats} onToast={showToast} />
        )}
        {activeTab === 'income' && (
          <IncomeTab date={selectedDate} categories={categories.income}
            transactions={dayTransactions.filter(t => t.type === 'income')}
            onAdd={addTransaction} onDelete={deleteTransaction} />
        )}
        {activeTab === 'expense' && (
          <ExpenseTab date={selectedDate} categories={categories} workers={workers}
            transactions={dayTransactions.filter(t => t.type === 'expense')}
            onAdd={addTransaction} onDelete={deleteTransaction} onAddCategory={addCategory} />
        )}
        {activeTab === 'drinks' && (
          <DrinksTab date={selectedDate} drinks={drinks} drinkDaily={drinkDaily}
            stats={drinkDayStats} onAdd={addDrink} onUpdate={updateDrink}
            onDelete={deleteDrink} onSaveDay={saveDrinkDayRecord} />
        )}
        {activeTab === 'reports' && (
          <ReportsTab categories={categories} transactions={transactions}
            drinkDaily={drinkDaily} drinks={drinks} cashRegister={cashRegister}
            debts={debts} debtsStats={debtsStats} workers={workers}
            onAddDebt={addDebt} onUpdateDebt={updateDebt} onDeleteDebt={deleteDebt} onPayDebt={recordDebtPayment}
            onToast={showToast} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab categories={categories} workers={workers} transactions={transactions}
            workerByName={workerByName}
            onAddCat={addCategory} onUpdateCat={updateCategory} onDeleteCat={deleteCategory}
            onAddWorker={addWorker} onUpdateWorker={updateWorker} onDeleteWorker={deleteWorker}
            tgConfig={tgConfig} onSaveTgConfig={saveTgConfig} onToast={showToast} />
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 z-30" style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }}>
        <div className="max-w-4xl mx-auto grid grid-cols-6">
          {[
            { id: 'dashboard', icon: Home, label: 'Bosh' },
            { id: 'income', icon: TrendingUp, label: 'Tushum' },
            { id: 'expense', icon: TrendingDown, label: 'Chiqim' },
            { id: 'drinks', icon: Package, label: 'Suvlar' },
            { id: 'reports', icon: BarChart3, label: 'Hisobot' },
            { id: 'settings', icon: SettingsIcon, label: 'Sozlama' },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                className={`relative py-2.5 px-1 flex flex-col items-center gap-0.5 transition-colors ${
                  isActive ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600'
                }`}>
                <Icon style={{ width: '18px', height: '18px' }} className={isActive ? 'stroke-[2.5]' : ''} />
                <span className="text-[9px] font-semibold">{item.label}</span>
                {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 bg-amber-500 w-6 rounded-b" />}
              </button>
            );
          })}
        </div>
      </nav>

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2 z-40 text-white text-sm font-medium ${
          toast.type === 'error' ? 'bg-rose-700' : 'bg-emerald-800'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD TAB — plastik kartochka kassa bilan birga (#C)
// ============================================================
function DashboardTab({ date, categories, transactions, stats, drinkStats, cashRegister, onSaveCash, tgConfig, drinks, drinkDaily, workers, debts, debtsStats, onToast }) {
  const net = stats.totalIncome - stats.totalExpense;

  return (
    <div className="space-y-4">
      <div className="text-center py-1">
        <p className="text-xs text-slate-500 uppercase tracking-wider">{formatUzbDateFull(date)}</p>
      </div>

      <div className={`rounded-2xl p-5 shadow-sm ${
        net >= 0 ? 'bg-gradient-to-br from-emerald-700 to-emerald-900 text-white' : 'bg-gradient-to-br from-rose-700 to-rose-900 text-white'
      }`}>
        <p className="text-sm opacity-80 font-medium">Sof natija</p>
        <p className="text-3xl sm:text-4xl font-bold mt-1 tracking-tight">
          {net >= 0 ? '+' : ''}{fmtSom(net)}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/20">
          <div>
            <p className="text-xs opacity-70">Jami tushum</p>
            <p className="text-base font-semibold mt-0.5">{fmtSom(stats.totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs opacity-70">Jami chiqim</p>
            <p className="text-base font-semibold mt-0.5">{fmtSom(stats.totalExpense)}</p>
          </div>
        </div>
      </div>

      <CashRegisterCard
        date={date}
        cashRegister={cashRegister}
        totalIncome={stats.totalIncome}
        totalCashless={stats.totalCashless}
        onSave={onSaveCash}
      />

      {(debtsStats.owedToUs > 0 || debtsStats.weOwe > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {debtsStats.owedToUs > 0 && (
            <div className="bg-white rounded-xl p-3 border border-emerald-200">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700" />
                <p className="text-[10px] text-emerald-900 font-semibold uppercase">Bizga qarzdor</p>
              </div>
              <p className="text-sm font-bold text-emerald-900">{fmtSom(debtsStats.owedToUs)}</p>
            </div>
          )}
          {debtsStats.weOwe > 0 && (
            <div className="bg-white rounded-xl p-3 border border-rose-200">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-700" />
                <p className="text-[10px] text-rose-900 font-semibold uppercase">Biz qarzdormiz</p>
              </div>
              <p className="text-sm font-bold text-rose-900">{fmtSom(debtsStats.weOwe)}</p>
            </div>
          )}
        </div>
      )}

      {tgConfig.botToken && tgConfig.recipients?.length > 0 && (
        <TelegramQuickSend date={date} tgConfig={tgConfig} categories={categories}
          transactions={transactions} stats={stats} drinkStats={drinkStats}
          cashRegister={cashRegister} drinks={drinks} drinkDaily={drinkDaily}
          workers={workers} debts={debts} onToast={onToast} />
      )}

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-emerald-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-semibold text-emerald-900">Tushumlar</h3>
        </div>
        <div className="divide-y divide-stone-100">
          {categories.income.length === 0 && (
            <div className="p-4 text-center text-sm text-slate-400">Bo'limlar mavjud emas</div>
          )}
          {categories.income.map(cat => {
            const amount = stats.incomeByCategory[cat.id] || 0;
            const isShashlik = cat.hasCommission;
            const totalSales = isShashlik
              ? transactions.filter(t => t.type === 'income' && t.categoryId === cat.id)
                  .reduce((s, t) => s + Number(t.amount), 0)
              : null;
            const unitInfo = stats.perUnitDetails[cat.id];
            return (
              <div key={cat.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xl">{cat.icon || '💰'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{cat.name}</p>
                    {isShashlik && totalSales > 0 && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Umumiy sotuv: {fmtSom(totalSales)} • {cat.commissionPercent}% ulush
                      </p>
                    )}
                    {unitInfo && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {unitInfo.qty} dona × {fmt(cat.unitPrice)} so'm
                        {unitInfo.qtyEaten > 0 && <span className="text-amber-700"> • Ishchilar yedi: {unitInfo.qtyEaten} dona</span>}
                      </p>
                    )}
                    {cat.autoFromDrinks && drinkStats.totalSold > 0 && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{drinkStats.totalSold} dona sotildi</p>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold text-emerald-700 whitespace-nowrap">
                  {amount > 0 ? `+${fmtSom(amount)}` : '—'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-rose-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-rose-700" />
          <h3 className="text-sm font-semibold text-rose-900">Chiqimlar</h3>
        </div>
        <div className="divide-y divide-stone-100">
          {Object.keys(stats.expenseByCategory).length === 0 && (
            <div className="p-4 text-center text-sm text-slate-400">Bugun chiqim yo'q</div>
          )}
          {categories.expense
            .filter(c => stats.expenseByCategory[c.id])
            .sort((a, b) => (stats.expenseByCategory[b.id] || 0) - (stats.expenseByCategory[a.id] || 0))
            .map(cat => {
              const amount = stats.expenseByCategory[cat.id] || 0;
              const linkedCat = categories.income.find(c => c.id === cat.linkedTo);
              return (
                <div key={cat.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{cat.name}</p>
                      {cat.isCashless && (
                        <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">PLASTIK</span>
                      )}
                    </div>
                    {linkedCat && (
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <Link2 className="w-3 h-3" />{linkedCat.name}
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-rose-700 whitespace-nowrap">−{fmtSom(amount)}</p>
                </div>
              );
            })}
        </div>
      </div>

      {drinkStats.totalSold > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">Suvlar bo'yicha foyda</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg p-2.5">
              <p className="text-[10px] text-blue-700 font-medium uppercase">Sotildi</p>
              <p className="text-sm font-bold text-blue-900 mt-1">{drinkStats.totalSold} dona</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2.5">
              <p className="text-[10px] text-emerald-700 font-medium uppercase">Tushum</p>
              <p className="text-sm font-bold text-emerald-900 mt-1">{fmt(drinkStats.totalRevenue)}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2.5">
              <p className="text-[10px] text-amber-700 font-medium uppercase">Foyda</p>
              <p className="text-sm font-bold text-amber-900 mt-1">{fmt(drinkStats.totalProfit)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CASH REGISTER CARD — plastik tarkibi shu yerda (#C)
// ============================================================
function CashRegisterCard({ date, cashRegister, totalIncome, totalCashless, onSave }) {
  const existing = cashRegister[date] || {};
  const initialCounted = existing.countedCash !== undefined && existing.countedCash !== null
    ? existing.countedCash
    : (existing.endCash !== undefined && existing.endCash !== null ? existing.endCash : '');
  const [countedCash, setCountedCash] = useState(initialCounted);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const ex = cashRegister[date] || {};
    const c = ex.countedCash !== undefined && ex.countedCash !== null
      ? ex.countedCash
      : (ex.endCash !== undefined && ex.endCash !== null ? ex.endCash : '');
    setCountedCash(c);
    setDirty(false);
  }, [date, cashRegister]);

  const naqdSavdo = totalIncome - totalCashless;
  const counted = countedCash !== '' ? Number(countedCash) : null;
  const diff = counted !== null ? counted - naqdSavdo : null;

  function save() {
    onSave(date, { countedCash: countedCash === '' ? null : Number(countedCash) });
    setDirty(false);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="bg-amber-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
        <Wallet className="w-4 h-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">Kunlik kassa balansi</h3>
      </div>
      <div className="p-4 space-y-3">
        {/* Naqd va plastik tarkibi — shu yerda (#C) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Banknote className="w-3.5 h-3.5 text-emerald-700" />
              <p className="text-[10px] font-bold text-emerald-900 uppercase">Naqd savdo</p>
            </div>
            <p className="text-base font-bold text-emerald-900">{fmtSom(naqdSavdo)}</p>
          </div>
          <div className={`border rounded-lg p-3 ${totalCashless > 0 ? 'bg-violet-50 border-violet-200' : 'bg-stone-50 border-stone-200'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <CreditCard className={`w-3.5 h-3.5 ${totalCashless > 0 ? 'text-violet-700' : 'text-slate-400'}`} />
              <p className={`text-[10px] font-bold uppercase ${totalCashless > 0 ? 'text-violet-900' : 'text-slate-500'}`}>Plastik</p>
            </div>
            <p className={`text-base font-bold ${totalCashless > 0 ? 'text-violet-900' : 'text-slate-400'}`}>{fmtSom(totalCashless)}</p>
          </div>
        </div>

        {/* Hisob-kitob ma'lumoti */}
        <div className="bg-stone-50 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-600">Bugungi jami savdo:</span>
            <span className="font-semibold text-slate-900">{fmtSom(totalIncome)}</span>
          </div>
          {totalCashless > 0 && (
            <div className="flex justify-between">
              <span className="text-violet-700">− Plastik:</span>
              <span className="font-semibold text-violet-700">{fmtSom(totalCashless)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-stone-200">
            <span className="font-semibold text-emerald-900">Kassada bo'lishi kerak:</span>
            <span className="font-bold text-emerald-900">{fmtSom(naqdSavdo)}</span>
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Kassada bugun yig'ilgan naqd pul
          </span>
          <input type="number" inputMode="numeric" value={countedCash}
            onChange={(e) => { setCountedCash(e.target.value); setDirty(true); }}
            placeholder="Sanab kiriting"
            className="w-full mt-1 px-3 py-2.5 border border-stone-300 rounded-lg text-base font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none" />
        </label>

        {counted !== null && diff !== null && (
          <div className={`rounded-lg p-3 flex items-start gap-2 ${
            diff === 0 ? 'bg-emerald-50 border border-emerald-200' :
            Math.abs(diff) < 1000 ? 'bg-amber-50 border border-amber-200' :
            'bg-rose-50 border border-rose-200'
          }`}>
            {diff === 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> :
             <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${Math.abs(diff) < 1000 ? 'text-amber-600' : 'text-rose-600'}`} />}
            <div className="text-xs flex-1">
              <p className={`font-bold ${
                diff === 0 ? 'text-emerald-900' :
                Math.abs(diff) < 1000 ? 'text-amber-900' : 'text-rose-900'
              }`}>
                {diff === 0 ? "✅ Mukammal balans!" : `Farq: ${diff > 0 ? '+' : ''}${fmtSom(diff)}`}
              </p>
              {diff !== 0 && (
                <p className={`mt-1 ${Math.abs(diff) < 1000 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {diff > 0 ? "Kassada savdoga qaraganda ortiqcha pul bor." : "Kassada savdoga qaraganda kam pul bor — sababini tekshiring."}
                </p>
              )}
            </div>
          </div>
        )}

        {dirty && (
          <button onClick={save} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm">
            <Save className="w-4 h-4" />Saqlash
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TELEGRAM QUICK SEND
// ============================================================
const REPORT_TYPE_LABELS = {
  drinks: '🥤 Suvlar (qisqa)',
  drinks_detailed: '🥤 Suvlar — batafsil',
  owner: "☕ To'liq (qisqa)",
  owner_detailed: "☕ To'liq — batafsil",
  full: '📋 Hammasi — har yozuv',
};

function TelegramQuickSend({ date, tgConfig, categories, transactions, stats, drinkStats, cashRegister, drinks, drinkDaily, workers, debts, onToast }) {
  const [sending, setSending] = useState(null);

  async function send(recipient) {
    setSending(recipient.id);
    let report = '';
    const ctx = { date, categories, transactions, stats, drinkStats, cashRegister, drinks, drinkDaily, workers, debts };
    switch (recipient.reportType) {
      case 'drinks_detailed': report = buildDrinksDetailedReport(ctx); break;
      case 'owner_detailed': report = buildOwnerDetailedReport(ctx); break;
      case 'full': report = buildFullReport(ctx); break;
      case 'drinks': report = buildDrinksReport(date, drinkStats); break;
      case 'owner':
      default:
        report = buildOwnerReport(date, categories, transactions, stats, drinkStats, cashRegister);
    }
    const result = await tgSendLong(tgConfig.botToken, recipient.chatId, report);
    setSending(null);
    if (result.ok) onToast(`${recipient.name}ga yuborildi`);
    else onToast(`Xato: ${result.error || 'Yuborilmadi'}`, 'error');
  }

  const enabled = tgConfig.recipients.filter(r => r.enabled !== false);
  if (enabled.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="bg-blue-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
        <Send className="w-4 h-4 text-blue-700" />
        <h3 className="text-sm font-semibold text-blue-900">Telegramga yuborish</h3>
      </div>
      <div className="divide-y divide-stone-100">
        {enabled.map(r => (
          <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{r.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {REPORT_TYPE_LABELS[r.reportType] || r.reportType}
              </p>
            </div>
            <button onClick={() => send(r)} disabled={sending === r.id}
              className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-stone-300 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5">
              {sending === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Yuborish
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// INCOME TAB
// ============================================================
function IncomeTab({ date, categories, transactions, onAdd, onDelete }) {
  const [openCat, setOpenCat] = useState(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="w-5 h-5 text-emerald-700" />
        <h2 className="text-lg font-semibold text-slate-900">Tushumlar kiritish</h2>
      </div>
      <p className="text-xs text-slate-500 -mt-2">Sana: {formatUzbDateFull(date)}</p>

      {categories.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Bo'limlar yo'q. <strong>Sozlama</strong> tabidan qo'shing.
        </div>
      )}

      {categories.map(cat => {
        const catTxs = transactions.filter(t => t.categoryId === cat.id);
        const totalAmount = catTxs.reduce((s, t) => s + Number(t.amount), 0);
        const totalQty = catTxs.reduce((s, t) => s + Number(t.qty || 0), 0);
        const totalEaten = catTxs.reduce((s, t) => s + Number(t.qtyEaten || 0), 0);
        const realIncome = cat.hasCommission ? totalAmount * (cat.commissionPercent || 0) / 100 : totalAmount;
        const isOpen = openCat === cat.id;
        const isAuto = cat.autoFromDrinks;
        const cardCount = catTxs.filter(t => t.paymentMethod === 'card').length;

        return (
          <div key={cat.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <button onClick={() => !isAuto && setOpenCat(isOpen ? null : cat.id)} disabled={isAuto}
              className={`w-full px-4 py-3 flex items-center justify-between gap-3 ${isAuto ? '' : 'hover:bg-stone-50 active:bg-stone-100'} transition-colors`}>
              <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <span className="text-2xl">{cat.icon || '💰'}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{cat.name}</p>
                  {cat.hasCommission && <p className="text-[11px] text-amber-700 font-medium mt-0.5 flex items-center gap-1"><Percent className="w-3 h-3" />Ulush: {cat.commissionPercent}%</p>}
                  {cat.perUnit && <p className="text-[11px] text-blue-700 font-medium mt-0.5">Bir dona: {fmt(cat.unitPrice)} so'm{totalQty > 0 && ` • Bugun: ${totalQty} dona`}{totalEaten > 0 && ` • Yedi: ${totalEaten}`}</p>}
                  {isAuto && <p className="text-[11px] text-blue-700 font-medium mt-0.5 flex items-center gap-1"><Info className="w-3 h-3" />Avtomatik (Suvlar tabidan)</p>}
                  {cardCount > 0 && <p className="text-[11px] text-violet-700 font-medium mt-0.5 flex items-center gap-1"><CreditCard className="w-3 h-3" />{cardCount} ta plastik</p>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {cat.hasCommission ? (
                  <><p className="text-[10px] text-slate-500">Sotuv: {fmt(totalAmount)}</p><p className="text-sm font-bold text-emerald-700">{fmtSom(realIncome)}</p></>
                ) : (<p className="text-sm font-bold text-emerald-700">{fmtSom(totalAmount)}</p>)}
                {!isAuto && (isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 inline ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 inline ml-1" />)}
              </div>
            </button>
            {isOpen && !isAuto && (
              <div className="border-t border-stone-200 bg-stone-50 p-4">
                <QuickAddForm category={cat} onSubmit={(data) => { onAdd({ type: 'income', categoryId: cat.id, ...data, date }); setOpenCat(null); }} />
                {catTxs.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bugungi yozuvlar</p>
                    {catTxs.map(tx => <TxRow key={tx.id} tx={tx} onDelete={onDelete} accent="emerald" />)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// EXPENSE TAB
// ============================================================
function ExpenseTab({ date, categories, workers, transactions, onAdd, onDelete, onAddCategory }) {
  const [openCat, setOpenCat] = useState(null);
  const [filterIncomeId, setFilterIncomeId] = useState('all');
  const [showNewCatForm, setShowNewCatForm] = useState(false);

  const filteredCats = filterIncomeId === 'all'
    ? categories.expense
    : categories.expense.filter(c => c.linkedTo === filterIncomeId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <TrendingDown className="w-5 h-5 text-rose-700" />
        <h2 className="text-lg font-semibold text-slate-900">Chiqimlar kiritish</h2>
      </div>
      <p className="text-xs text-slate-500 -mt-2">Sana: {formatUzbDateFull(date)}</p>

      <button onClick={() => setShowNewCatForm(!showNewCatForm)}
        className="w-full bg-white border-2 border-dashed border-stone-300 hover:border-emerald-500 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
        {showNewCatForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showNewCatForm ? 'Bekor qilish' : "Yangi chiqim turi qo'shish"}
      </button>

      {showNewCatForm && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <CategoryForm type="expense" incomeCategories={categories.income}
            onSubmit={(data) => { onAddCategory('expense', data); setShowNewCatForm(false); }}
            onCancel={() => setShowNewCatForm(false)} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-2 flex flex-wrap gap-1.5">
        <button onClick={() => setFilterIncomeId('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterIncomeId === 'all' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-slate-700'}`}>
          Hammasi
        </button>
        {categories.income.filter(c => !c.autoFromDrinks).map(c => (
          <button key={c.id} onClick={() => setFilterIncomeId(c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterIncomeId === c.id ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-slate-700'}`}>
            {c.icon} {c.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {filteredCats.map(cat => {
        const catTxs = transactions.filter(t => t.categoryId === cat.id);
        const total = catTxs.reduce((s, t) => s + Number(t.amount), 0);
        const isOpen = openCat === cat.id;
        const linkedCat = categories.income.find(c => c.id === cat.linkedTo);

        return (
          <div key={cat.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <button onClick={() => setOpenCat(isOpen ? null : cat.id)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-stone-50 active:bg-stone-100 transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <div className="w-10 h-10 bg-rose-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <TrendingDown className="w-4 h-4 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 truncate">{cat.name}</p>
                    {cat.isCashless && <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">PLASTIK</span>}
                    {cat.trackPayee && <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">ISHCHILAR</span>}
                  </div>
                  {linkedCat && <p className="text-[11px] text-slate-500 mt-0.5">{linkedCat.icon} {linkedCat.name}</p>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-rose-700">{total > 0 ? fmtSom(total) : '—'}</p>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 inline ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 inline ml-1" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-stone-200 bg-stone-50 p-4">
                {cat.trackPayee && workers.filter(w => w.active !== false).length > 0 ? (
                  <WorkerSalaryQuickEntry
                    cat={cat} date={date} workers={workers.filter(w => w.active !== false)}
                    catTxs={catTxs}
                    onAdd={(data) => onAdd({ type: 'expense', categoryId: cat.id, ...data, date })} />
                ) : (
                  <QuickAddForm expenseCat={cat} variant="expense" workers={workers}
                    onSubmit={(data) => { onAdd({ type: 'expense', categoryId: cat.id, ...data, date }); setOpenCat(null); }} />
                )}
                {catTxs.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bugungi yozuvlar</p>
                    {catTxs.map(tx => <TxRow key={tx.id} tx={tx} onDelete={onDelete} accent="rose" />)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// QUICK ADD FORM — paymentMethod (#6) + payeeWorkerId (#A)
// ============================================================
function QuickAddForm({ category, expenseCat, onSubmit, variant = 'income', workers = [] }) {
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('');
  const [qtyEaten, setQtyEaten] = useState('');
  const [note, setNote] = useState('');
  const [payee, setPayee] = useState('');           // worker name (display)
  const [payeeWorkerId, setPayeeWorkerId] = useState(''); // worker id (stable link)
  const [customPayee, setCustomPayee] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card'

  const isPerUnit = category?.perUnit;
  const isCommission = category?.hasCommission;
  const trackEaten = category?.trackEaten;
  const trackPayee = expenseCat?.trackPayee;
  const activeWorkers = workers.filter(w => w.active !== false);
  const useWorkerSelect = trackPayee && activeWorkers.length > 0;

  // Income paymentMethod toggle: hide for commission and auto-from-drinks (always cash)
  const showPaymentToggle = variant === 'income' && !isCommission && !category?.autoFromDrinks;

  const computedAmount = isPerUnit && qty ? Number(qty) * Number(category.unitPrice || 0) : null;
  const commissionShare = isCommission && amount ? Number(amount) * (Number(category.commissionPercent) || 0) / 100 : null;

  function submit() {
    if (isPerUnit) {
      const q = Number(qty);
      if (!q || q <= 0) return;
      const data = {
        amount: q * Number(category.unitPrice || 0),
        qty: q,
        qtyEaten: qtyEaten ? Number(qtyEaten) : 0,
        note,
      };
      if (showPaymentToggle && paymentMethod === 'card') data.paymentMethod = 'card';
      onSubmit(data);
    } else {
      const num = Number(amount);
      if (!num || num <= 0) return;
      const data = { amount: num, note };
      if (showPaymentToggle && paymentMethod === 'card') data.paymentMethod = 'card';
      if (trackPayee) {
        if (useWorkerSelect) {
          if (payee === '__other__') {
            const cp = customPayee.trim();
            if (cp) data.payee = cp;
          } else if (payee) {
            // From dropdown — save BOTH name (display) AND workerId (stable)
            data.payee = payee;
            if (payeeWorkerId) data.payeeWorkerId = payeeWorkerId;
          }
        } else {
          const cp = payee.trim();
          if (cp) data.payee = cp;
        }
      }
      onSubmit(data);
    }
    setAmount(''); setQty(''); setQtyEaten(''); setNote('');
    setPayee(''); setPayeeWorkerId(''); setCustomPayee('');
    setPaymentMethod('cash');
  }

  function onWorkerSelect(value) {
    setPayee(value);
    if (value === '__other__' || !value) {
      setPayeeWorkerId('');
    } else {
      const w = activeWorkers.find(w => w.name === value);
      setPayeeWorkerId(w ? w.id : '');
    }
  }

  const accentBtn = variant === 'expense' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-700 hover:bg-emerald-800';

  return (
    <div className="space-y-2">
      {isPerUnit ? (
        <>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Sotilgan dona soni</span>
            <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0"
              className="w-full mt-1 px-3 py-2.5 border border-stone-300 rounded-lg text-base font-semibold focus:border-emerald-600 outline-none" />
          </label>
          {trackEaten && (
            <label className="block">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Ishchilar yedi (dona, ixtiyoriy)</span>
              <input type="number" inputMode="numeric" value={qtyEaten} onChange={(e) => setQtyEaten(e.target.value)} placeholder="0"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-amber-600 outline-none" />
            </label>
          )}
          {computedAmount !== null && qty && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs">
              <span className="text-emerald-800">Tushum: {qty} × {fmt(category.unitPrice)} = <strong className="text-emerald-900">{fmtSom(computedAmount)}</strong></span>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              {isCommission ? "Umumiy sotuv summasi (so'm)" : "Summa (so'm)"}
            </span>
            <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="w-full mt-1 px-3 py-2.5 border border-stone-300 rounded-lg text-base font-semibold focus:border-emerald-600 outline-none" />
          </label>
          {commissionShare !== null && amount && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
              <span className="text-amber-800">Sizning ulushingiz ({category.commissionPercent}%): <strong className="text-amber-900">{fmtSom(commissionShare)}</strong></span>
            </div>
          )}
          {trackPayee && (
            useWorkerSelect ? (
              <>
                <label className="block">
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Kim oldi?</span>
                  <select value={payee} onChange={(e) => onWorkerSelect(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-amber-600 outline-none bg-white">
                    <option value="">— Tanlang —</option>
                    {activeWorkers.map(w => <option key={w.id} value={w.name}>{w.code ? `[${w.code}] ` : ''}{w.name}{w.position ? ` (${w.position})` : ''}</option>)}
                    <option value="__other__">Boshqa (qo'lda yozish)</option>
                  </select>
                </label>
                {payee === '__other__' && (
                  <input type="text" value={customPayee} onChange={(e) => setCustomPayee(e.target.value)} placeholder="Ism familiya"
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-amber-600 outline-none" />
                )}
              </>
            ) : (
              <label className="block">
                <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Kim oldi?</span>
                <input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Ism familiya"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-amber-600 outline-none" />
                <p className="text-[10px] text-slate-500 mt-1">Ishchilar ro'yxati Sozlama → Ishchilarda</p>
              </label>
            )
          )}
        </>
      )}

      {/* PaymentMethod toggle for income (#6) */}
      {showPaymentToggle && (
        <div>
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">To'lov turi</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPaymentMethod('cash')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-stone-200 bg-white text-slate-600'
              }`}>
              <Banknote className="w-4 h-4" />Naqd
            </button>
            <button type="button" onClick={() => setPaymentMethod('card')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                paymentMethod === 'card' ? 'border-violet-500 bg-violet-50 text-violet-900' : 'border-stone-200 bg-white text-slate-600'
              }`}>
              <CreditCard className="w-4 h-4" />Plastik
            </button>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Izoh (ixtiyoriy)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qo'shimcha ma'lumot"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
      </label>
      <button onClick={submit} disabled={isPerUnit ? !qty || Number(qty) <= 0 : !amount || Number(amount) <= 0}
        className={`w-full ${accentBtn} disabled:bg-stone-300 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2`}>
        <Save className="w-4 h-4" />Saqlash
      </button>
    </div>
  );
}

// ============================================================
// TX ROW
// ============================================================
function TxRow({ tx, onDelete, accent }) {
  const time = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="bg-white rounded-lg border border-stone-200 px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={`text-sm font-bold ${accent === 'rose' ? 'text-rose-700' : 'text-emerald-700'}`}>
            {accent === 'rose' ? '−' : '+'}{fmtSom(tx.amount)}
          </p>
          {tx.qty && <span className="text-[11px] text-slate-500">({tx.qty} dona{tx.qtyEaten ? ` + ${tx.qtyEaten} yedi` : ''})</span>}
          {tx.paymentMethod === 'card' && (
            <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">PLASTIK</span>
          )}
        </div>
        {(tx.note || tx.payee) && (
          <p className="text-[11px] text-slate-500 truncate">
            {tx.payee && <span className="font-semibold text-amber-700">{tx.payee}</span>}
            {tx.payee && tx.note && ' • '}{tx.note}
          </p>
        )}
      </div>
      {time && <span className="text-[10px] text-slate-400 flex-shrink-0">{time}</span>}
      <button onClick={() => onDelete(tx.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors flex-shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================================
// WORKER SALARY QUICK ENTRY (#5) — har ishchiga 1 satr, summa va saqlash
// ============================================================
function WorkerSalaryQuickEntry({ cat, date, workers, catTxs, onAdd }) {
  const [amounts, setAmounts] = useState({});
  const [notes, setNotes] = useState({});
  const [showOther, setShowOther] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [otherAmount, setOtherAmount] = useState('');
  const [otherNote, setOtherNote] = useState('');

  // Bugun har ishchiga qancha to'langan
  const paidByWorker = useMemo(() => {
    const m = {};
    catTxs.forEach(t => {
      const key = t.payeeWorkerId || t.payee;
      if (key) m[key] = (m[key] || 0) + Number(t.amount);
    });
    return m;
  }, [catTxs]);

  function saveWorker(w) {
    const a = Number(amounts[w.id]);
    if (!a || a <= 0) return;
    onAdd({
      amount: a,
      payee: w.name,
      payeeWorkerId: w.id,
      note: notes[w.id] || '',
    });
    // Field'ni tozalash
    setAmounts(prev => ({ ...prev, [w.id]: '' }));
    setNotes(prev => ({ ...prev, [w.id]: '' }));
  }

  function saveOther() {
    const a = Number(otherAmount);
    if (!a || a <= 0 || !otherName.trim()) return;
    onAdd({
      amount: a,
      payee: otherName.trim(),
      note: otherNote || '',
    });
    setOtherName(''); setOtherAmount(''); setOtherNote('');
    setShowOther(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-amber-700" />
        <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider">Ishchilarga to'lash</p>
      </div>
      {workers.map(w => {
        const paid = paidByWorker[w.id] || paidByWorker[w.name] || 0;
        return (
          <div key={w.id} className="bg-white border border-stone-200 rounded-lg p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-amber-800">{w.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {w.code && <span className="text-[9px] bg-stone-200 text-stone-700 font-mono px-1 py-0.5 rounded font-bold">{w.code}</span>}
                  <p className="text-sm font-semibold text-slate-900 truncate">{w.name}</p>
                </div>
                {paid > 0 && <p className="text-[10px] text-emerald-700 font-semibold">Bugun: {fmtSom(paid)}</p>}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <input type="number" inputMode="numeric"
                value={amounts[w.id] || ''}
                onChange={(e) => setAmounts(prev => ({ ...prev, [w.id]: e.target.value }))}
                placeholder="Summa"
                className="px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-amber-600 outline-none" />
              <button onClick={() => saveWorker(w)}
                disabled={!amounts[w.id] || Number(amounts[w.id]) <= 0}
                className="bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white font-semibold px-3 rounded-lg text-sm flex items-center gap-1">
                <Save className="w-3.5 h-3.5" />
              </button>
            </div>
            <input type="text"
              value={notes[w.id] || ''}
              onChange={(e) => setNotes(prev => ({ ...prev, [w.id]: e.target.value }))}
              placeholder="Izoh (ixtiyoriy)"
              className="w-full mt-1.5 px-2 py-1.5 border border-stone-200 rounded-lg text-xs focus:border-amber-600 outline-none" />
          </div>
        );
      })}

      <button onClick={() => setShowOther(!showOther)}
        className="w-full mt-2 bg-white border border-dashed border-stone-300 hover:border-stone-400 text-slate-600 font-medium py-2 rounded-lg text-xs flex items-center justify-center gap-1.5">
        {showOther ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        {showOther ? 'Bekor' : "Boshqa kishi (qo'lda)"}
      </button>

      {showOther && (
        <div className="bg-white border border-stone-200 rounded-lg p-3 space-y-2">
          <input type="text" value={otherName} onChange={(e) => setOtherName(e.target.value)}
            placeholder="Ism familiya"
            className="w-full px-2 py-2 border border-stone-300 rounded-lg text-sm focus:border-amber-600 outline-none" />
          <input type="number" inputMode="numeric" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)}
            placeholder="Summa"
            className="w-full px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-amber-600 outline-none" />
          <input type="text" value={otherNote} onChange={(e) => setOtherNote(e.target.value)}
            placeholder="Izoh"
            className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-xs focus:border-amber-600 outline-none" />
          <button onClick={saveOther}
            disabled={!otherName.trim() || !otherAmount || Number(otherAmount) <= 0}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white font-semibold py-2 rounded-lg text-sm flex items-center justify-center gap-1.5">
            <Save className="w-3.5 h-3.5" />Saqlash
          </button>
        </div>
      )}
    </div>
  );
}
function DrinksTab({ date, drinks, drinkDaily, stats, onAdd, onUpdate, onDelete, onSaveDay }) {
  const [view, setView] = useState('daily');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-5 h-5 text-blue-700" />
        <h2 className="text-lg font-semibold text-slate-900">Suvlar boshqaruvi</h2>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-1 grid grid-cols-2 gap-1">
        <button onClick={() => setView('daily')} className={`py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'daily' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
          Kunlik hisob
        </button>
        <button onClick={() => setView('catalog')} className={`py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'catalog' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
          Suvlar ro'yxati
        </button>
      </div>

      {view === 'daily' && (
        <>
          <p className="text-xs text-slate-500">Sana: {formatUzbDateFull(date)}</p>
          {drinks.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
              Avval <strong>Suvlar ro'yxati</strong>ga suv qo'shing.
            </div>
          )}
          {drinks.length > 0 && (
            <>
              <div className="bg-gradient-to-br from-blue-700 to-blue-900 text-white rounded-xl p-4">
                <p className="text-xs opacity-80">Bugungi suv tushumi</p>
                <p className="text-2xl font-bold mt-1">{fmtSom(stats.totalRevenue)}</p>
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/20">
                  <div><p className="text-[11px] opacity-70">Sotildi</p><p className="text-sm font-semibold">{stats.totalSold} dona</p></div>
                  <div><p className="text-[11px] opacity-70">Sof foyda</p><p className="text-sm font-semibold">{fmtSom(stats.totalProfit)}</p></div>
                </div>
              </div>
              {stats.perDrink.map(({ drink, start, added, end }) => (
                <DrinkDayCard key={drink.id} drink={drink} start={start} added={added} end={end} date={date}
                  onSave={(rec) => onSaveDay(date, drink.id, rec)} />
              ))}
            </>
          )}
        </>
      )}

      {view === 'catalog' && (
        <>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />Yangi suv qo'shish
          </button>
          {showAddForm && <DrinkForm onSubmit={(data) => { onAdd(data); setShowAddForm(false); }} onCancel={() => setShowAddForm(false)} />}
          {drinks.length === 0 && !showAddForm && <div className="text-center py-8 text-slate-400 text-sm">Hali suv qo'shilmagan</div>}
          {drinks.map(drink => (
            <div key={drink.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {editingId === drink.id ? (
                <DrinkForm initial={drink} onSubmit={(data) => { onUpdate(drink.id, data); setEditingId(null); }} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{drink.name}</p>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="bg-stone-50 rounded-lg p-2"><p className="text-[10px] text-slate-500 uppercase">Tan narx</p><p className="text-sm font-bold text-slate-900">{fmt(drink.purchasePrice)}</p></div>
                        <div className="bg-emerald-50 rounded-lg p-2"><p className="text-[10px] text-emerald-700 uppercase">Sotuv</p><p className="text-sm font-bold text-emerald-900">{fmt(drink.salePrice)}</p></div>
                        <div className="bg-amber-50 rounded-lg p-2"><p className="text-[10px] text-amber-700 uppercase">Foyda</p><p className="text-sm font-bold text-amber-900">{fmt(Number(drink.salePrice) - Number(drink.purchasePrice))}</p></div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => setEditingId(drink.id)} className="p-2 text-slate-500 hover:bg-stone-100 rounded-lg"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => onDelete(drink.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DrinkDayCard({ drink, start, added, end, date, onSave }) {
  const [startVal, setStartVal] = useState(start);
  const [addedVal, setAddedVal] = useState(added);
  const [endVal, setEndVal] = useState(end !== null ? end : '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setStartVal(start); setAddedVal(added);
    setEndVal(end !== null ? end : '');
    setDirty(false);
  }, [drink.id, date]);

  const localSold = endVal !== '' ? Math.max(0, Number(startVal || 0) + Number(addedVal || 0) - Number(endVal)) : 0;
  const localRevenue = localSold * Number(drink.salePrice || 0);
  const localProfit = localSold * (Number(drink.salePrice || 0) - Number(drink.purchasePrice || 0));

  function save() {
    onSave({
      startStock: Number(startVal || 0),
      added: Number(addedVal || 0),
      endStock: endVal === '' ? null : Number(endVal),
    });
    setDirty(false);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-slate-900">{drink.name}</p>
        <p className="text-[11px] text-slate-500">{fmt(drink.salePrice)} so'm/dona</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Boshlang'ich</span>
          <input type="number" inputMode="numeric" value={startVal} onChange={(e) => { setStartVal(e.target.value); setDirty(true); }}
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Qo'shildi</span>
          <input type="number" inputMode="numeric" value={addedVal} onChange={(e) => { setAddedVal(e.target.value); setDirty(true); }}
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Qoldi</span>
          <input type="number" inputMode="numeric" value={endVal} onChange={(e) => { setEndVal(e.target.value); setDirty(true); }} placeholder="—"
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none" />
        </label>
      </div>
      {endVal !== '' && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-lg px-2 py-1.5"><p className="text-[9px] text-blue-700 font-bold uppercase">Sotildi</p><p className="text-sm font-bold text-blue-900">{localSold} d.</p></div>
          <div className="bg-emerald-50 rounded-lg px-2 py-1.5"><p className="text-[9px] text-emerald-700 font-bold uppercase">Tushum</p><p className="text-sm font-bold text-emerald-900">{fmt(localRevenue)}</p></div>
          <div className="bg-amber-50 rounded-lg px-2 py-1.5"><p className="text-[9px] text-amber-700 font-bold uppercase">Foyda</p><p className="text-sm font-bold text-amber-900">{fmt(localProfit)}</p></div>
        </div>
      )}
      {dirty && (
        <button onClick={save} className="w-full mt-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm">
          <Save className="w-4 h-4" />Saqlash
        </button>
      )}
    </div>
  );
}

function DrinkForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice || '');
  const [salePrice, setSalePrice] = useState(initial?.salePrice || '');

  function submit() {
    if (!name.trim() || !purchasePrice || !salePrice) return;
    onSubmit({ name: name.trim(), purchasePrice: Number(purchasePrice), salePrice: Number(salePrice) });
  }
  const profit = (Number(salePrice) || 0) - (Number(purchasePrice) || 0);

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">{initial ? "Suvni tahrirlash" : "Yangi suv"}</p>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Nomi</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kola 0.5L"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase">Tan narx</span>
          <input type="number" inputMode="numeric" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="6000"
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase">Sotuv narx</span>
          <input type="number" inputMode="numeric" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="10000"
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none" />
        </label>
      </div>
      {salePrice && purchasePrice && (
        <div className={`rounded-lg px-3 py-2 text-xs ${profit >= 0 ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`}>
          Foyda har bir donadan: <strong>{fmtSom(profit)}</strong>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">Bekor</button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">Saqlash</button>
      </div>
    </div>
  );
}

// ============================================================
// DEBTS SECTION (Hisobot tabi ichida #3)
// ============================================================
function DebtsSection({ debts, stats, onAdd, onUpdate, onDelete, onPayment }) {
  const [filter, setFilter] = useState('owed_to_us');
  const [showStatus, setShowStatus] = useState('pending');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [paymentFor, setPaymentFor] = useState(null);

  const filtered = debts
    .filter(d => d.type === filter)
    .filter(d => showStatus === 'all' ? true : d.status === showStatus)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.takenDate.localeCompare(a.takenDate);
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setFilter('owed_to_us')}
          className={`rounded-xl p-3 text-left border-2 transition-all ${filter === 'owed_to_us' ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700" />
            <p className="text-[10px] text-emerald-900 font-bold uppercase">Bizga qarzdor</p>
          </div>
          <p className="text-base font-bold text-emerald-900">{fmtSom(stats.owedToUs)}</p>
        </button>
        <button onClick={() => setFilter('we_owe')}
          className={`rounded-xl p-3 text-left border-2 transition-all ${filter === 'we_owe' ? 'border-rose-500 bg-rose-50' : 'border-stone-200 bg-white'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-700" />
            <p className="text-[10px] text-rose-900 font-bold uppercase">Biz qarzdormiz</p>
          </div>
          <p className="text-base font-bold text-rose-900">{fmtSom(stats.weOwe)}</p>
        </button>
      </div>

      <button onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); }}
        className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
        {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showAddForm ? 'Bekor qilish' : "Yangi qarz qo'shish"}
      </button>

      {showAddForm && (
        <DebtForm defaultType={filter}
          onSubmit={(data) => { onAdd(data); setShowAddForm(false); }}
          onCancel={() => setShowAddForm(false)} />
      )}

      <div className="bg-stone-50 rounded-xl border border-stone-200 p-1 grid grid-cols-3 gap-1">
        {[
          { id: 'pending', label: "Hal bo'lmagan" },
          { id: 'paid', label: "To'langan" },
          { id: 'all', label: 'Hammasi' }
        ].map(s => (
          <button key={s.id} onClick={() => setShowStatus(s.id)}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${showStatus === s.id ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">
          {showStatus === 'pending' ? "Hal bo'lmagan qarz yo'q" : showStatus === 'paid' ? "To'langan qarz yo'q" : "Qarzlar ro'yxati bo'sh"}
        </div>
      )}

      {filtered.map(debt => (
        <DebtCard key={debt.id} debt={debt}
          isEditing={editingId === debt.id}
          isPaying={paymentFor === debt.id}
          onEdit={() => { setEditingId(debt.id); setPaymentFor(null); }}
          onCancelEdit={() => setEditingId(null)}
          onPay={() => { setPaymentFor(debt.id); setEditingId(null); }}
          onCancelPay={() => setPaymentFor(null)}
          onSave={(updates) => { onUpdate(debt.id, updates); setEditingId(null); }}
          onDelete={() => onDelete(debt.id)}
          onRecordPayment={(amount) => { onPayment(debt.id, amount); setPaymentFor(null); }} />
      ))}
    </div>
  );
}

function DebtCard({ debt, isEditing, isPaying, onEdit, onCancelEdit, onPay, onCancelPay, onSave, onDelete, onRecordPayment }) {
  const isOwedToUs = debt.type === 'owed_to_us';
  const remaining = Number(debt.remaining ?? debt.amount);
  const total = Number(debt.amount);
  const paid = total - remaining;
  const isPartial = paid > 0 && remaining > 0;
  const isPaid = debt.status === 'paid';
  const today = todayStr();
  const isOverdue = !isPaid && debt.dueDate && debt.dueDate < today;
  const daysOver = isOverdue ? daysBetween(debt.dueDate, today) : 0;
  const dueSoon = !isPaid && debt.dueDate && !isOverdue && daysBetween(today, debt.dueDate) <= 3;

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl border-2 border-emerald-500 overflow-hidden">
        <DebtForm initial={debt} onSubmit={onSave} onCancel={onCancelEdit} />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      isPaid ? 'border-stone-200 opacity-70' :
      isOverdue ? 'border-rose-300' :
      dueSoon ? 'border-amber-300' :
      'border-stone-200'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-base font-bold text-slate-900 truncate">{debt.partyName}</p>
              {isPaid && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">TO'LANGAN</span>}
              {isPartial && !isPaid && <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">QISMAN</span>}
              {isOverdue && <span className="text-[9px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold">MUDDAT O'TGAN</span>}
              {dueSoon && <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">YAQIN</span>}
            </div>
            {debt.note && <p className="text-xs text-slate-500 mt-1">{debt.note}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-lg font-bold ${isOwedToUs ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtSom(remaining)}</p>
            {isPartial && <p className="text-[10px] text-slate-500">Jami: {fmtSom(total)}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 mt-2">
          <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" />Olingan: {formatUzbDate(debt.takenDate)}</span>
          {debt.dueDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-rose-700 font-semibold' : dueSoon ? 'text-amber-700 font-semibold' : ''}`}>
              <Clock className="w-3 h-3" />Muddat: {formatUzbDate(debt.dueDate)}
              {isOverdue && ` (+${daysOver} kun)`}
            </span>
          )}
          {isPaid && debt.paidDate && (
            <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3 h-3" />To'langan: {formatUzbDate(debt.paidDate)}</span>
          )}
        </div>

        {isPaying && (
          <div className="mt-3 bg-stone-50 border border-stone-200 rounded-lg p-3">
            <PaymentForm maxAmount={remaining} onSubmit={onRecordPayment} onCancel={onCancelPay} />
          </div>
        )}

        {!isPaying && !isPaid && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button onClick={onPay} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1">
              <Banknote className="w-3.5 h-3.5" />To'lov
            </button>
            <button onClick={onEdit} className="bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1">
              <Edit3 className="w-3.5 h-3.5" />Tahrir
            </button>
            <button onClick={onDelete} className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1">
              <Trash2 className="w-3.5 h-3.5" />O'chir
            </button>
          </div>
        )}
        {!isPaying && isPaid && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={onEdit} className="bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1">
              <Edit3 className="w-3.5 h-3.5" />Tahrir
            </button>
            <button onClick={onDelete} className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1">
              <Trash2 className="w-3.5 h-3.5" />O'chir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DebtForm({ initial, defaultType, onSubmit, onCancel }) {
  const [type, setType] = useState(initial?.type || defaultType || 'owed_to_us');
  const [partyName, setPartyName] = useState(initial?.partyName || '');
  const [amount, setAmount] = useState(initial?.amount || '');
  const [takenDate, setTakenDate] = useState(initial?.takenDate || todayStr());
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [note, setNote] = useState(initial?.note || '');

  function submit() {
    if (!partyName.trim() || !amount || Number(amount) <= 0) return;
    const data = {
      type, partyName: partyName.trim(), amount: Number(amount),
      takenDate, dueDate: dueDate || null, note: note.trim(),
    };
    if (initial) {
      data.remaining = Number(amount) === Number(initial.amount)
        ? initial.remaining
        : Number(amount);
    }
    onSubmit(data);
  }

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">{initial ? "Qarzni tahrirlash" : "Yangi qarz"}</p>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setType('owed_to_us')}
          className={`py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors ${type === 'owed_to_us' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-stone-200 bg-white text-slate-600'}`}>
          Bizga qarzdor
        </button>
        <button onClick={() => setType('we_owe')}
          className={`py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors ${type === 'we_owe' ? 'border-rose-500 bg-rose-50 text-rose-900' : 'border-stone-200 bg-white text-slate-600'}`}>
          Biz qarzdormiz
        </button>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Ism / Tashkilot</span>
        <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Masalan: Aziz aka"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Summa (so'm)</span>
        <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
          className="w-full mt-1 px-3 py-2.5 border border-stone-300 rounded-lg text-base font-semibold focus:border-emerald-600 outline-none" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase">Olingan sana</span>
          <input type="date" value={takenDate} onChange={(e) => setTakenDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase">To'lash muddati</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Izoh (ixtiyoriy)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nima uchun"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
      </label>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">Bekor</button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">Saqlash</button>
      </div>
    </div>
  );
}

function PaymentForm({ maxAmount, onSubmit, onCancel }) {
  const [amount, setAmount] = useState('');

  function submit() {
    const a = Number(amount);
    if (!a || a <= 0) return;
    onSubmit(Math.min(a, maxAmount));
  }
  function fullPay() { onSubmit(maxAmount); }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700">To'langan summa (qoldiq: {fmtSom(maxAmount)})</p>
      <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus
        className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-base font-semibold focus:border-emerald-600 outline-none" />
      <div className="grid grid-cols-3 gap-2">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-xs">Bekor</button>
        <button onClick={fullPay} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-xs">To'liq to'lov</button>
        <button onClick={submit} disabled={!amount || Number(amount) <= 0}
          className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-semibold py-2 rounded-lg text-xs">Saqlash</button>
      </div>
    </div>
  );
}

// ============================================================
// REPORTS TAB — chartlar (#5) + dinamik PDF (#4) + Print + Qarzlar
// ============================================================
function ReportsTab({ categories, transactions, drinkDaily, drinks, cashRegister, debts, debtsStats, workers, onAddDebt, onUpdateDebt, onDeleteDebt, onPayDebt, onToast }) {
  const today = new Date();
  const [period, setPeriod] = useState('month');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [showDebts, setShowDebts] = useState(false);

  const startStr = period === 'month'
    ? `${year}-${String(month + 1).padStart(2, '0')}-01`
    : `${year}-01-01`;
  const endStr = period === 'month'
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
    : `${year}-12-31`;

  const periodTxs = transactions.filter(t => t.date >= startStr && t.date <= endStr);

  const stats = useMemo(() => {
    const incByCat = {}, expByCat = {}, perUnit = {};
    let totalIncome = 0, totalExpense = 0, cardIncome = 0, cashlessExp = 0;
    const dailyMap = {};

    periodTxs.forEach(t => {
      if (!dailyMap[t.date]) dailyMap[t.date] = { income: 0, expense: 0 };
      if (t.type === 'income') {
        const cat = categories.income.find(c => c.id === t.categoryId);
        const real = cat?.hasCommission
          ? Number(t.amount) * (Number(cat.commissionPercent) || 0) / 100
          : Number(t.amount);
        incByCat[t.categoryId] = (incByCat[t.categoryId] || 0) + real;
        totalIncome += real;
        dailyMap[t.date].income += real;
        if (t.paymentMethod === 'card') cardIncome += real;
        if (t.qty) {
          if (!perUnit[t.categoryId]) perUnit[t.categoryId] = { qty: 0, qtyEaten: 0 };
          perUnit[t.categoryId].qty += Number(t.qty);
          perUnit[t.categoryId].qtyEaten += Number(t.qtyEaten || 0);
        }
      } else {
        expByCat[t.categoryId] = (expByCat[t.categoryId] || 0) + Number(t.amount);
        totalExpense += Number(t.amount);
        dailyMap[t.date].expense += Number(t.amount);
        const cat = categories.expense.find(c => c.id === t.categoryId);
        if (cat?.isCashless) cashlessExp += Number(t.amount);
      }
    });

    let drinksRevenue = 0, drinksProfit = 0, drinksSold = 0;
    Object.keys(drinkDaily || {}).filter(d => d >= startStr && d <= endStr).forEach(d => {
      const dayRec = drinkDaily[d];
      let dayRev = 0;
      drinks.forEach(drink => {
        const rec = dayRec[drink.id];
        if (!rec || rec.endStock === null || rec.endStock === undefined || rec.endStock === '') return;
        const sold = Math.max(0, Number(rec.startStock || 0) + Number(rec.added || 0) - Number(rec.endStock));
        drinksSold += sold;
        const rev = sold * Number(drink.salePrice || 0);
        drinksRevenue += rev;
        dayRev += rev;
        drinksProfit += sold * (Number(drink.salePrice || 0) - Number(drink.purchasePrice || 0));
      });
      if (dayRev > 0) {
        if (!dailyMap[d]) dailyMap[d] = { income: 0, expense: 0 };
        dailyMap[d].income += dayRev;
      }
    });
    const suvCat = categories.income.find(c => c.autoFromDrinks);
    if (suvCat && drinksRevenue > 0) {
      incByCat[suvCat.id] = (incByCat[suvCat.id] || 0) + drinksRevenue;
      totalIncome += drinksRevenue;
    }

    const totalCashless = cardIncome + cashlessExp;

    // Chart data
    const incomePieData = categories.income
      .filter(c => incByCat[c.id])
      .map(c => ({ name: c.name, value: Math.round(incByCat[c.id]) }));
    const expensePieData = categories.expense
      .filter(c => expByCat[c.id])
      .map(c => ({ name: c.name, value: Math.round(expByCat[c.id]) }));
    const dailyChartData = Object.keys(dailyMap).sort().map(d => ({
      day: d.slice(8, 10),
      income: Math.round(dailyMap[d].income),
      expense: Math.round(dailyMap[d].expense),
      net: Math.round(dailyMap[d].income - dailyMap[d].expense),
    }));

    return {
      incByCat, expByCat, perUnit,
      totalIncome, totalExpense, totalCashless, cardIncome, cashlessExp,
      drinksRevenue, drinksProfit, drinksSold,
      net: totalIncome - totalExpense,
      incomePieData, expensePieData, dailyChartData,
    };
  }, [periodTxs, categories, drinkDaily, drinks, startStr, endStr]);

  const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

  // Dynamic PDF import (#4 — bundle splitting)
  async function downloadPDF() {
    setPdfLoading(true);
    try {
      const { exportMonthlyPDF } = await import('./pdf.js');
      const m = period === 'month' ? month : today.getMonth();
      exportMonthlyPDF({ year, month: m, categories, transactions, drinks, drinkDaily, cashRegister, debts, workers });
    } catch (e) {
      onToast(`PDF xato: ${e.message}`, 'error');
    } finally {
      setPdfLoading(false);
    }
  }

  // Print to 80mm thermal printer
  function printReport() {
    setPrintLoading(true);
    try {
      const html = buildPrintHTML({
        period, year, month, stats, categories, transactions, drinks, drinkDaily, cashRegister, debts, workers, periodTxs
      });
      const w = window.open('', '_blank', 'width=380,height=600');
      if (!w) {
        onToast("Pop-up bloklangan. Brauzer sozlamasidan ruxsat bering.", 'error');
        return;
      }
      w.document.write(html);
      w.document.close();
      // Wait for fonts/render then trigger print
      w.onload = () => {
        setTimeout(() => { w.focus(); w.print(); }, 200);
      };
    } catch (e) {
      onToast(`Print xato: ${e.message}`, 'error');
    } finally {
      setPrintLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-5 h-5 text-emerald-700" />
        <h2 className="text-lg font-semibold text-slate-900">Hisobotlar</h2>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setPeriod('month')}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${period === 'month' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-slate-600'}`}>
            Oylik
          </button>
          <button onClick={() => setPeriod('year')}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${period === 'year' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-slate-600'}`}>
            Yillik
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {period === 'month' && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          )}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className={`px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white ${period === 'year' ? 'col-span-2' : ''}`}>
            {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y =>
              <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={downloadPDF} disabled={pdfLoading}
          className="bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors">
          {pdfLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
          {pdfLoading ? '...' : 'PDF'}
        </button>
        <button onClick={printReport} disabled={printLoading}
          className="bg-slate-700 hover:bg-slate-800 disabled:bg-stone-300 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors">
          {printLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
          {printLoading ? '...' : 'Chek (80mm)'}
        </button>
      </div>

      <div className={`rounded-2xl p-5 shadow-sm ${stats.net >= 0 ? 'bg-gradient-to-br from-emerald-700 to-emerald-900 text-white' : 'bg-gradient-to-br from-rose-700 to-rose-900 text-white'}`}>
        <p className="text-xs opacity-80 font-medium uppercase tracking-wider">
          {period === 'month' ? `${MONTHS[month]} ${year}` : `${year}-yil`}
        </p>
        <p className="text-3xl font-bold mt-1 tracking-tight">{stats.net >= 0 ? '+' : ''}{fmtSom(stats.net)}</p>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/20">
          <div><p className="text-xs opacity-70">Tushum</p><p className="text-base font-semibold">{fmtSom(stats.totalIncome)}</p></div>
          <div><p className="text-xs opacity-70">Chiqim</p><p className="text-base font-semibold">{fmtSom(stats.totalExpense)}</p></div>
        </div>
        {stats.totalCashless > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10 text-xs opacity-80">
            Naqd: {fmt(stats.totalIncome - stats.totalCashless)} • Plastik: {fmt(stats.totalCashless)}
          </div>
        )}
      </div>

      {/* Chartlar (#5) */}
      {(stats.incomePieData.length > 0 || stats.dailyChartData.length > 0) && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-emerald-900">Vizualizatsiya</h3>
          </div>
          <div className="p-4 space-y-5">
            <ChartsRenderer stats={stats} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-emerald-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-semibold text-emerald-900">Tushumlar</h3>
        </div>
        <div className="divide-y divide-stone-100">
          {Object.keys(stats.incByCat).length === 0 && <div className="p-4 text-center text-sm text-slate-400">Tushum yo'q</div>}
          {categories.income
            .filter(c => stats.incByCat[c.id])
            .sort((a, b) => stats.incByCat[b.id] - stats.incByCat[a.id])
            .map(cat => {
              const amount = stats.incByCat[cat.id];
              const pct = (amount / stats.totalIncome * 100).toFixed(1);
              const ud = stats.perUnit[cat.id];
              return (
                <div key={cat.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{cat.icon || '💰'}</span>
                      <p className="text-sm font-medium text-slate-900 truncate">{cat.name}</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-700 whitespace-nowrap">{fmtSom(amount)}</p>
                  </div>
                  <div className="bg-stone-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{ width: `${pct}%` }}></div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500">{pct}%</p>
                    {ud && <p className="text-[11px] text-slate-500">{ud.qty} dona{ud.qtyEaten > 0 ? ` (${ud.qtyEaten} yedi)` : ''}</p>}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-rose-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-rose-700" />
          <h3 className="text-sm font-semibold text-rose-900">Chiqimlar</h3>
        </div>
        <div className="divide-y divide-stone-100">
          {Object.keys(stats.expByCat).length === 0 && <div className="p-4 text-center text-sm text-slate-400">Chiqim yo'q</div>}
          {categories.expense
            .filter(c => stats.expByCat[c.id])
            .sort((a, b) => stats.expByCat[b.id] - stats.expByCat[a.id])
            .map(cat => {
              const amount = stats.expByCat[cat.id];
              const pct = (amount / stats.totalExpense * 100).toFixed(1);
              return (
                <div key={cat.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{cat.name}</p>
                      {cat.isCashless && <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0">PLASTIK</span>}
                    </div>
                    <p className="text-sm font-bold text-rose-700 whitespace-nowrap">{fmtSom(amount)}</p>
                  </div>
                  <div className="bg-stone-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-rose-500 h-full" style={{ width: `${pct}%` }}></div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{pct}%</p>
                </div>
              );
            })}
        </div>
      </div>

      {stats.drinksSold > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">Suvlar bo'yicha</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg p-2.5"><p className="text-[10px] text-blue-700 uppercase font-bold">Sotildi</p><p className="text-sm font-bold text-blue-900">{stats.drinksSold} dona</p></div>
            <div className="bg-emerald-50 rounded-lg p-2.5"><p className="text-[10px] text-emerald-700 uppercase font-bold">Tushum</p><p className="text-sm font-bold text-emerald-900">{fmt(stats.drinksRevenue)}</p></div>
            <div className="bg-amber-50 rounded-lg p-2.5"><p className="text-[10px] text-amber-700 uppercase font-bold">Sof foyda</p><p className="text-sm font-bold text-amber-900">{fmt(stats.drinksProfit)}</p></div>
          </div>
        </div>
      )}

      {/* Qarzlar bo'limi (Hisobotga ko'chirildi #3) */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <button onClick={() => setShowDebts(!showDebts)}
          className="w-full bg-amber-50 px-4 py-3 border-b border-stone-200 flex items-center justify-between hover:bg-amber-100 transition-colors">
          <div className="flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-amber-700" />
            <h3 className="text-sm font-semibold text-amber-900">Qarzlar</h3>
            {(debtsStats.owedToUs > 0 || debtsStats.weOwe > 0) && (
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                {debts.filter(d => d.status === 'pending').length}
              </span>
            )}
          </div>
          {showDebts ? <ChevronUp className="w-4 h-4 text-amber-700" /> : <ChevronDown className="w-4 h-4 text-amber-700" />}
        </button>
        {showDebts && (
          <div className="p-4">
            <DebtsSection debts={debts} stats={debtsStats}
              onAdd={onAddDebt} onUpdate={onUpdateDebt} onDelete={onDeleteDebt} onPayment={onPayDebt} />
          </div>
        )}
      </div>
    </div>
  );
}

// Lazy-renderer for charts (recharts only loads when Reports tab is mounted)
function ChartsRenderer({ stats }) {
  return (
    <ChartsLoader>
      {(C) => (
        <>
          {stats.incomePieData.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2 text-center">Tushumlar tarkibi</p>
              <C.CategoryPie data={stats.incomePieData} palette="income" />
            </div>
          )}
          {stats.expensePieData.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2 text-center">Chiqimlar tarkibi</p>
              <C.CategoryPie data={stats.expensePieData} palette="expense" />
            </div>
          )}
          {stats.dailyChartData.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2 text-center">Kunlik dinamika</p>
              <C.DailyLineChart data={stats.dailyChartData} />
            </div>
          )}
          {stats.dailyChartData.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2 text-center">Kunlik sof natija</p>
              <C.NetBarChart data={stats.dailyChartData} />
            </div>
          )}
        </>
      )}
    </ChartsLoader>
  );
}

function ChartsLoader({ children }) {
  const [mod, setMod] = useState(null);
  useEffect(() => {
    let alive = true;
    import('./charts.jsx').then(m => {
      if (alive) setMod({ CategoryPie: m.CategoryPie, DailyLineChart: m.DailyLineChart, NetBarChart: m.NetBarChart });
    });
    return () => { alive = false; };
  }, []);
  if (!mod) return <div className="h-48 flex items-center justify-center text-sm text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Yuklanmoqda...</div>;
  return children(mod);
}

// ============================================================
// SETTINGS TAB
// ============================================================
function SettingsTab({ categories, workers, transactions, workerByName, onAddCat, onUpdateCat, onDeleteCat, onAddWorker, onUpdateWorker, onDeleteWorker, tgConfig, onSaveTgConfig, onToast }) {
  const [section, setSection] = useState('categories');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <SettingsIcon className="w-5 h-5 text-emerald-700" />
        <h2 className="text-lg font-semibold text-slate-900">Sozlamalar</h2>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-1 grid grid-cols-3 gap-1">
        <button onClick={() => setSection('categories')}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors ${section === 'categories' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
          Bo'limlar
        </button>
        <button onClick={() => setSection('workers')}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors ${section === 'workers' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
          Ishchilar
        </button>
        <button onClick={() => setSection('telegram')}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors ${section === 'telegram' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
          Telegram bot
        </button>
      </div>

      {section === 'categories' && (
        <CategoriesSection categories={categories} onAdd={onAddCat} onUpdate={onUpdateCat} onDelete={onDeleteCat} />
      )}
      {section === 'workers' && (
        <WorkersSection workers={workers} transactions={transactions} workerByName={workerByName}
          onAdd={onAddWorker} onUpdate={onUpdateWorker} onDelete={onDeleteWorker} />
      )}
      {section === 'telegram' && (
        <TelegramSection config={tgConfig} onSave={onSaveTgConfig} onToast={onToast} />
      )}
    </div>
  );
}

// ============================================================
// CATEGORIES SECTION
// ============================================================
function CategoriesSection({ categories, onAdd, onUpdate, onDelete }) {
  const [tab, setTab] = useState('income');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const list = categories[tab];

  return (
    <>
      <div className="bg-white rounded-xl border border-stone-200 p-1 grid grid-cols-2 gap-1">
        <button onClick={() => { setTab('income'); setShowForm(false); setEditingId(null); }}
          className={`py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'income' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
          Tushum bo'limlari
        </button>
        <button onClick={() => { setTab('expense'); setShowForm(false); setEditingId(null); }}
          className={`py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'expense' ? 'bg-rose-700 text-white' : 'text-slate-600'}`}>
          Chiqim bo'limlari
        </button>
      </div>

      <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
        className={`w-full ${tab === 'income' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'} text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors`}>
        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showForm ? 'Bekor' : `Yangi ${tab === 'income' ? 'tushum' : 'chiqim'} bo'limi`}
      </button>

      {showForm && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <CategoryForm type={tab} incomeCategories={categories.income}
            onSubmit={(data) => { onAdd(tab, data); setShowForm(false); }}
            onCancel={() => setShowForm(false)} />
        </div>
      )}

      <div className="space-y-2">
        {list.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">Bo'limlar yo'q</div>}
        {list.map(cat => (
          <div key={cat.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            {editingId === cat.id ? (
              <CategoryForm type={tab} incomeCategories={categories.income} initial={cat}
                onSubmit={(data) => { onUpdate(tab, cat.id, data); setEditingId(null); }}
                onCancel={() => setEditingId(null)} />
            ) : (
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {cat.icon && <span className="text-2xl">{cat.icon}</span>}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{cat.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cat.perUnit && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">DONA × {fmt(cat.unitPrice)}</span>}
                      {cat.trackEaten && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">YEYISHNI HISOBLA</span>}
                      {cat.hasCommission && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">{cat.commissionPercent}% ULUSH</span>}
                      {cat.autoFromDrinks && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">SUVLARDAN</span>}
                      {cat.isCashless && <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">PLASTIK (eski)</span>}
                      {cat.trackPayee && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">ISHCHILAR</span>}
                    </div>
                    {cat.linkedTo && (
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        {categories.income.find(c => c.id === cat.linkedTo)?.name || '—'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => setEditingId(cat.id)} className="p-2 text-slate-500 hover:bg-stone-100 rounded-lg"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => onDelete(tab, cat.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function CategoryForm({ type, incomeCategories, initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || '');
  const [perUnit, setPerUnit] = useState(initial?.perUnit || false);
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice || '');
  const [trackEaten, setTrackEaten] = useState(initial?.trackEaten || false);
  const [hasCommission, setHasCommission] = useState(initial?.hasCommission || false);
  const [commissionPercent, setCommissionPercent] = useState(initial?.commissionPercent || '');
  const [autoFromDrinks, setAutoFromDrinks] = useState(initial?.autoFromDrinks || false);
  const [isCashless, setIsCashless] = useState(initial?.isCashless || false);
  const [trackPayee, setTrackPayee] = useState(initial?.trackPayee || false);
  const [linkedTo, setLinkedTo] = useState(initial?.linkedTo || '');

  function submit() {
    if (!name.trim()) return;
    const data = { name: name.trim(), icon: icon.trim() };
    if (type === 'income') {
      if (perUnit) {
        data.perUnit = true;
        data.unitPrice = Number(unitPrice) || 0;
        if (trackEaten) data.trackEaten = true;
      }
      if (hasCommission) {
        data.hasCommission = true;
        data.commissionPercent = Number(commissionPercent) || 0;
      }
      if (autoFromDrinks) data.autoFromDrinks = true;
    } else {
      if (linkedTo) data.linkedTo = linkedTo;
      if (isCashless) data.isCashless = true;
      if (trackPayee) data.trackPayee = true;
    }
    onSubmit(data);
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">{initial ? 'Tahrirlash' : `Yangi ${type === 'income' ? 'tushum' : 'chiqim'} bo'limi`}</p>

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-600 uppercase">Belgi</span>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🥟" maxLength={2}
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-base text-center focus:border-emerald-600 outline-none" />
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] font-semibold text-slate-600 uppercase">Nomi</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bo'lim nomi"
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
        </label>
      </div>

      {type === 'income' && (
        <>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={perUnit} onChange={(e) => setPerUnit(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-700">Donalab sotiladi (somsa kabi)</span>
          </label>
          {perUnit && (
            <>
              <label className="block ml-6">
                <span className="text-[10px] font-semibold text-slate-600 uppercase">Bir dona narxi</span>
                <input type="number" inputMode="numeric" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="5000"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none" />
              </label>
              <label className="flex items-center gap-2 cursor-pointer ml-6">
                <input type="checkbox" checked={trackEaten} onChange={(e) => setTrackEaten(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm text-slate-700">Ishchilar yegan dona sonini hisobla</span>
              </label>
            </>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hasCommission} onChange={(e) => setHasCommission(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-700">Ulush tushadi (shashlik kabi)</span>
          </label>
          {hasCommission && (
            <label className="block ml-6">
              <span className="text-[10px] font-semibold text-slate-600 uppercase">Ulush foizi (%)</span>
              <input type="number" inputMode="numeric" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} placeholder="24"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none" />
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={autoFromDrinks} onChange={(e) => setAutoFromDrinks(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-700">Avtomatik (Suvlar tabidan)</span>
          </label>
        </>
      )}

      {type === 'expense' && (
        <>
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-600 uppercase">Qaysi tushumga aloqador</span>
            <select value={linkedTo} onChange={(e) => setLinkedTo(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:border-emerald-600 outline-none">
              <option value="">— Aloqasiz —</option>
              {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </label>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Plastik to'lovni endi <strong>Tushum</strong> tabida belgilash mumkin (har yozuv uchun). Eski plastik chiqim ishlashda davom etadi.</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isCashless} onChange={(e) => setIsCashless(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-700">Plastik chiqim (eski usul)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={trackPayee} onChange={(e) => setTrackPayee(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-700">Kim olganini hisobla (oylik kabi)</span>
          </label>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">Bekor</button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">Saqlash</button>
      </div>
    </div>
  );
}

// ============================================================
// WORKERS SECTION — ID-orientirovka (#A)
// ============================================================
function WorkersSection({ workers, transactions, workerByName, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const sorted = [...workers].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
        className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showForm ? 'Bekor' : "Yangi ishchi qo'shish"}
      </button>

      {showForm && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <WorkerForm onSubmit={(data) => { onAdd(data); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Ishchilarni qo'shganingizdan keyin <strong>Chiqim</strong> tabida "Ishchilar oyligi" bo'limida ularning ismi avtomatik tanlanadi. Ism o'zgartirilsa ham, ID orqali statistika saqlanadi.</span>
      </div>

      {sorted.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">Hali ishchi qo'shilmagan</div>}

      {sorted.map(w => (
        <div key={w.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {editingId === w.id ? (
            <WorkerForm initial={w}
              onSubmit={(data) => { onUpdate(w.id, data); setEditingId(null); }}
              onCancel={() => setEditingId(null)} />
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-base font-bold text-amber-800">{w.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {w.code && <span className="text-[10px] bg-stone-200 text-stone-700 font-mono px-1.5 py-0.5 rounded font-bold">{w.code}</span>}
                      <p className="text-sm font-semibold text-slate-900 truncate">{w.name}</p>
                      {!w.active && <span className="text-[9px] bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded font-bold">FAOL EMAS</span>}
                    </div>
                    {w.position && <p className="text-[11px] text-slate-500 truncate">{w.position}</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => setEditingId(w.id)} className="p-2 text-slate-500 hover:bg-stone-100 rounded-lg"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => onDelete(w.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <button onClick={() => setHistoryFor(historyFor === w.id ? null : w.id)}
                className="w-full mt-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-slate-700 font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-2">
                <CalendarIcon className="w-3.5 h-3.5" />
                {historyFor === w.id ? 'Tarixni yashirish' : "Oylik tarixini ko'rish"}
              </button>
              {historyFor === w.id && <WorkerHistory worker={w} transactions={transactions} workerByName={workerByName} />}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function WorkerForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [code, setCode] = useState(initial?.code || '');
  const [position, setPosition] = useState(initial?.position || '');
  const [active, setActive] = useState(initial?.active !== false);

  function submit() {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      code: code.trim(),
      position: position.trim(),
      active
    });
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">{initial ? "Ishchini tahrirlash" : "Yangi ishchi"}</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-600 uppercase">ID / Kod</span>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="W001"
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-sm font-mono text-center focus:border-emerald-600 outline-none" />
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] font-semibold text-slate-600 uppercase">Ism familiya</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aziz Karimov"
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
        </label>
      </div>
      <p className="text-[10px] text-slate-500 -mt-1">ID ixtiyoriy — agar ko'p ishchi bo'lsa, ajratib ko'rish uchun (W001, ofitsant-1 va h.k.)</p>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Lavozim (ixtiyoriy)</span>
        <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Oshpaz / Ofitsiant"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
        <span className="text-sm text-slate-700">Hozir ishlayapti (faol)</span>
      </label>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">Bekor</button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">Saqlash</button>
      </div>
    </div>
  );
}

// WorkerHistory — ID-bo'yicha filter (eski yozuvlar uchun ism orqali fallback) #A
function WorkerHistory({ worker, transactions, workerByName = {} }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

  // Match transactions by workerId FIRST, then fallback to name match for old data
  const allPayments = transactions
    .filter(t => {
      if (t.type !== 'expense') return false;
      if (t.payeeWorkerId) return t.payeeWorkerId === worker.id;
      // Legacy: payee string matches worker name AND no other worker has same name
      if (t.payee && t.payee === worker.name) return true;
      return false;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  const monthPayments = allPayments.filter(t => t.date >= startStr && t.date <= endStr);
  const monthTotal = monthPayments.reduce((s, t) => s + Number(t.amount), 0);
  const allTimeTotal = allPayments.reduce((s, t) => s + Number(t.amount), 0);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  const dayMap = {};
  monthPayments.forEach(t => {
    const day = Number(t.date.split('-')[2]);
    dayMap[day] = (dayMap[day] || 0) + Number(t.amount);
  });

  return (
    <div className="mt-3 bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-lg p-2.5 border border-stone-200">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Bu oy jami</p>
          <p className="text-sm font-bold text-amber-800">{fmtSom(monthTotal)}</p>
          <p className="text-[10px] text-slate-500">{monthPayments.length} marta</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-stone-200">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Hammasi jami</p>
          <p className="text-sm font-bold text-emerald-800">{fmtSom(allTimeTotal)}</p>
          <p className="text-[10px] text-slate-500">{allPayments.length} marta</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
          className="px-2 py-1.5 border border-stone-300 rounded-lg text-xs bg-white">
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="px-2 py-1.5 border border-stone-300 rounded-lg text-xs bg-white">
          {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y =>
            <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-2">
        <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
          {['Du','Se','Ch','Pa','Ju','Sh','Ya'].map(d => <div key={d} className="text-[9px] font-bold text-slate-500 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: offset }).map((_, i) => <div key={`o${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const amount = dayMap[day];
            return (
              <div key={day} className={`aspect-square rounded flex flex-col items-center justify-center text-center p-0.5 ${
                amount ? 'bg-amber-100 border border-amber-300' : 'bg-stone-50'
              }`}>
                <span className={`text-[10px] font-bold ${amount ? 'text-amber-900' : 'text-slate-400'}`}>{day}</span>
                {amount && <span className="text-[8px] text-amber-700 leading-none mt-0.5">{Math.round(amount/1000)}k</span>}
              </div>
            );
          })}
        </div>
      </div>

      {monthPayments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Bu oydagi to'lovlar</p>
          {monthPayments.map(t => (
            <div key={t.id} className="bg-white rounded-lg border border-stone-200 px-3 py-2 flex items-center justify-between">
              <div className="text-xs">
                <p className="font-semibold text-slate-900">{formatUzbDate(t.date)}</p>
                {t.note && <p className="text-[11px] text-slate-500">{t.note}</p>}
                {!t.payeeWorkerId && (
                  <p className="text-[10px] text-amber-600">⚠ Eski yozuv (ism orqali bog'langan)</p>
                )}
              </div>
              <p className="text-sm font-bold text-amber-800">{fmtSom(t.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TELEGRAM SECTION
// ============================================================
function TelegramSection({ config, onSave, onToast }) {
  const [botToken, setBotToken] = useState(config.botToken || '');
  const [tokenDirty, setTokenDirty] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [botInfo, setBotInfo] = useState(null);
  const [showRecipientForm, setShowRecipientForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  async function testToken() {
    if (!botToken) return;
    setTesting(true); setBotInfo(null);
    const result = await tgGetMe(botToken);
    setTesting(false);
    if (result.ok) {
      setBotInfo(result.info);
      onToast(`Bot topildi: @${result.info.username}`);
    } else {
      onToast(`Xato: ${result.error || "Token noto'g'ri"}`, 'error');
    }
  }

  async function saveToken() {
    await onSave({ ...config, botToken });
    setTokenDirty(false);
    onToast('Token saqlandi');
  }

  async function addRecipient(data) {
    const newR = { id: genId(), ...data, enabled: true };
    await onSave({ ...config, recipients: [...(config.recipients || []), newR] });
    setShowRecipientForm(false);
    onToast("Qabul qiluvchi qo'shildi");
  }

  async function updateRecipient(id, data) {
    const updated = config.recipients.map(r => r.id === id ? { ...r, ...data } : r);
    await onSave({ ...config, recipients: updated });
    setEditingId(null);
    onToast('Yangilandi');
  }

  async function deleteRecipient(id) {
    if (!confirm("O'chirmoqchimisiz?")) return;
    const updated = config.recipients.filter(r => r.id !== id);
    await onSave({ ...config, recipients: updated });
    onToast("O'chirildi");
  }

  async function toggleRecipient(id) {
    const updated = config.recipients.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    await onSave({ ...config, recipients: updated });
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-700" />Telegram bot tokeni
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11px] text-blue-900 flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p>Telegramda <strong>@BotFather</strong>ni toping va <strong>/newbot</strong> buyrug'i bilan bot yarating. Token shu joyda chiqadi.</p>
          </div>
        </div>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase">Bot tokeni</span>
          <div className="relative mt-1">
            <input type={showToken ? "text" : "password"} value={botToken}
              onChange={(e) => { setBotToken(e.target.value); setTokenDirty(true); }}
              placeholder="123456789:ABC..."
              className="w-full px-3 py-2 pr-10 border border-stone-300 rounded-lg text-sm font-mono focus:border-emerald-600 outline-none" />
            <button onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400">
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </label>
        {botInfo && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-emerald-900">@{botInfo.username}</p>
              <p className="text-emerald-700 text-[11px]">{botInfo.first_name}</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={testToken} disabled={!botToken || testing}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-stone-300 text-white font-semibold py-2 rounded-lg text-sm flex items-center justify-center gap-2">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Tekshirish
          </button>
          <button onClick={saveToken} disabled={!tokenDirty}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-semibold py-2 rounded-lg text-sm flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />Saqlash
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4" />Qabul qiluvchilar
          </p>
          <button onClick={() => { setShowRecipientForm(!showRecipientForm); setEditingId(null); }}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">
            {showRecipientForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showRecipientForm ? 'Bekor' : "Qo'shish"}
          </button>
        </div>

        {showRecipientForm && (
          <div className="border-b border-stone-200">
            <RecipientForm onSubmit={addRecipient} onCancel={() => setShowRecipientForm(false)} />
          </div>
        )}

        {(config.recipients || []).length === 0 && !showRecipientForm && (
          <div className="p-4 text-center text-sm text-slate-400">Hali qabul qiluvchi qo'shilmagan</div>
        )}

        <div className="divide-y divide-stone-100">
          {(config.recipients || []).map(r => (
            <div key={r.id}>
              {editingId === r.id ? (
                <RecipientForm initial={r}
                  onSubmit={(data) => updateRecipient(r.id, data)}
                  onCancel={() => setEditingId(null)} />
              ) : (
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button onClick={() => toggleRecipient(r.id)}
                      className={`w-10 h-6 rounded-full relative flex-shrink-0 transition-colors ${r.enabled !== false ? 'bg-emerald-600' : 'bg-stone-300'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${r.enabled !== false ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{r.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {REPORT_TYPE_LABELS[r.reportType] || r.reportType}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setEditingId(r.id)} className="p-2 text-slate-500 hover:bg-stone-100 rounded-lg"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => deleteRecipient(r.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RecipientForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [chatId, setChatId] = useState(initial?.chatId || '');
  const [reportType, setReportType] = useState(initial?.reportType || 'owner');

  function submit() {
    if (!name.trim() || !chatId.trim()) return;
    onSubmit({ name: name.trim(), chatId: chatId.trim(), reportType });
  }

  return (
    <div className="p-4 space-y-3 bg-stone-50">
      <p className="text-sm font-semibold text-slate-900">{initial ? 'Tahrirlash' : "Yangi qabul qiluvchi"}</p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          Telegramda <strong>@userinfobot</strong>ga yozing — u sizga Chat ID raqamingizni beradi.
          Botingizga ham bir marta xabar yuboring (boshlash).
        </div>
      </div>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Nomi</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aka / Hisobchi"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none" />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Chat ID</span>
        <input type="text" inputMode="numeric" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono focus:border-emerald-600 outline-none" />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Hisobot turi</span>
        <select value={reportType} onChange={(e) => setReportType(e.target.value)}
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:border-emerald-600 outline-none">
          <optgroup label="Suvlar">
            <option value="drinks">🥤 Suvlar — qisqa</option>
            <option value="drinks_detailed">🥤 Suvlar — batafsil (har bir suv)</option>
          </optgroup>
          <optgroup label="To'liq hisobot">
            <option value="owner">☕ To'liq — qisqa</option>
            <option value="owner_detailed">☕ To'liq — batafsil (har ishchi/chiqim)</option>
          </optgroup>
          <optgroup label="Hammasi">
            <option value="full">📋 Hammasi — har bir yozuv (yorliqlar bilan)</option>
          </optgroup>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">Bekor</button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">Saqlash</button>
      </div>
    </div>
  );
}

// ============================================================
// TELEGRAM REPORT BUILDERS
// ============================================================
function buildDrinksReport(date, drinkStats) {
  const lines = [];
  lines.push(`<b>🥤 Suvlar hisoboti</b>`);
  lines.push(`<i>${escapeHTML(formatUzbDateFull(date))}</i>`);
  lines.push('');
  lines.push(`<b>Jami:</b> ${drinkStats.totalSold} dona`);
  lines.push(`<b>Tushum:</b> ${fmtSom(drinkStats.totalRevenue)}`);
  lines.push(`<b>Foyda:</b> ${fmtSom(drinkStats.totalProfit)}`);
  lines.push('');
  lines.push(`<b>Har bir suv:</b>`);
  drinkStats.perDrink.forEach(d => {
    if (!d.hasEnd) {
      lines.push(`• ${escapeHTML(d.drink.name)}: <i>kiritilmagan</i>`);
    } else {
      lines.push(`• ${escapeHTML(d.drink.name)}: ${d.start}+${d.added}−${d.end} = <b>${d.sold} dona</b> (${fmt(d.revenue)} so'm)`);
    }
  });
  return lines.join('\n');
}

function buildOwnerReport(date, categories, transactions, stats, drinkStats, cashRegister) {
  const lines = [];
  const net = stats.totalIncome - stats.totalExpense;

  lines.push(`<b>☕ Choyxona kunlik hisoboti</b>`);
  lines.push(`<i>${escapeHTML(formatUzbDateFull(date))}</i>`);
  lines.push('');
  lines.push(`<b>💰 Tushum:</b> ${fmtSom(stats.totalIncome)}`);
  lines.push(`<b>💸 Chiqim:</b> ${fmtSom(stats.totalExpense)}`);
  lines.push(`<b>${net >= 0 ? '✅' : '⚠️'} Sof:</b> ${net >= 0 ? '+' : ''}${fmtSom(net)}`);
  lines.push('');

  if (Object.keys(stats.incomeByCategory).length > 0) {
    lines.push(`<b>📈 Tushumlar:</b>`);
    categories.income.filter(c => stats.incomeByCategory[c.id]).forEach(cat => {
      const a = stats.incomeByCategory[cat.id];
      let extra = '';
      if (cat.perUnit) {
        const ud = stats.perUnitDetails[cat.id];
        if (ud) extra = ` (${ud.qty} dona${ud.qtyEaten > 0 ? `, ${ud.qtyEaten} yedi` : ''})`;
      }
      if (cat.hasCommission) extra = ` [${cat.commissionPercent}% ulush]`;
      // Card payment count
      const cardTxs = transactions.filter(t => t.type === 'income' && t.categoryId === cat.id && t.paymentMethod === 'card');
      if (cardTxs.length > 0) {
        const cardSum = cardTxs.reduce((s, t) => s + Number(t.amount), 0);
        extra += ` 💳${fmt(cardSum)}`;
      }
      lines.push(`• ${cat.icon || ''} ${escapeHTML(cat.name)}: <b>${fmtSom(a)}</b>${extra}`);
    });
    lines.push('');
  }

  if (Object.keys(stats.expenseByCategory).length > 0) {
    lines.push(`<b>📉 Chiqimlar:</b>`);
    categories.expense
      .filter(c => stats.expenseByCategory[c.id])
      .sort((a, b) => stats.expenseByCategory[b.id] - stats.expenseByCategory[a.id])
      .forEach(cat => {
        const a = stats.expenseByCategory[cat.id];
        const txs = transactions.filter(t => t.type === 'expense' && t.categoryId === cat.id && t.payee);
        const payees = [...new Set(txs.map(t => t.payee))];
        let extra = '';
        if (payees.length > 0) extra = ` (${payees.join(', ')})`;
        if (cat.isCashless) extra += ' 💳';
        lines.push(`• ${escapeHTML(cat.name)}: <b>${fmtSom(a)}</b>${extra}`);
      });
    lines.push('');
  }

  if (stats.totalCashless > 0) {
    lines.push(`<b>Naqd:</b> ${fmtSom(stats.totalIncome - stats.totalCashless)}`);
    lines.push(`<b>💳 Plastik:</b> ${fmtSom(stats.totalCashless)}`);
    lines.push('');
  }

  const cr = cashRegister[date];
  const counted = cr?.countedCash !== undefined && cr?.countedCash !== null
    ? cr.countedCash
    : cr?.endCash;
  if (counted !== null && counted !== undefined && counted !== '') {
    const naqdSavdo = stats.totalIncome - stats.totalCashless;
    const diff = Number(counted) - naqdSavdo;
    lines.push(`<b>💼 Kassa:</b> ${fmtSom(counted)}`);
    if (diff === 0) lines.push(`✅ Mukammal balans`);
    else lines.push(`${Math.abs(diff) < 1000 ? '⚠️' : '❌'} Farq: ${diff > 0 ? '+' : ''}${fmtSom(diff)}`);
    lines.push('');
  }

  if (drinkStats.totalSold > 0) {
    lines.push(`<b>🥤 Suvlar:</b> ${drinkStats.totalSold} dona, ${fmtSom(drinkStats.totalRevenue)} (foyda: ${fmtSom(drinkStats.totalProfit)})`);
  }

  return lines.join('\n');
}

// ============================================================
// BATAFSIL HISOBOTLAR (#1, #6)
// ============================================================
function buildDrinksDetailedReport({ date, drinkStats, drinks, drinkDaily }) {
  const lines = [];
  lines.push(`<b>🥤 Suvlar batafsil hisoboti</b>`);
  lines.push(`<i>${escapeHTML(formatUzbDateFull(date))}</i>`);
  lines.push('');
  lines.push(`<b>Umumiy:</b>`);
  lines.push(`• Sotildi: <b>${drinkStats.totalSold} dona</b>`);
  lines.push(`• Tushum: <b>${fmtSom(drinkStats.totalRevenue)}</b>`);
  lines.push(`• Sof foyda: <b>${fmtSom(drinkStats.totalProfit)}</b>`);
  lines.push('');

  // Bugungi qoldirilgan suvlar
  const todayRec = drinkDaily?.[date] || {};
  const addedToday = drinks.filter(d => {
    const r = todayRec[d.id];
    return r && Number(r.added) > 0;
  });
  if (addedToday.length > 0) {
    lines.push(`<b>📦 Bugun qo'shilgan suvlar:</b>`);
    addedToday.forEach(d => {
      const r = todayRec[d.id];
      lines.push(`• ${escapeHTML(d.name)}: +${r.added} dona`);
    });
    lines.push('');
  }

  // Har bir suv bo'yicha
  lines.push(`<b>📊 Har bir suv:</b>`);
  drinkStats.perDrink.forEach(d => {
    const profitPerUnit = Number(d.drink.salePrice || 0) - Number(d.drink.purchasePrice || 0);
    if (!d.hasEnd) {
      lines.push(`<b>${escapeHTML(d.drink.name)}</b>`);
      lines.push(`  Boshlang'ich: ${d.start} dona`);
      lines.push(`  Qo'shildi: +${d.added} dona`);
      lines.push(`  ⚠️ Qoldiq kiritilmagan`);
      lines.push('');
    } else {
      lines.push(`<b>${escapeHTML(d.drink.name)}</b>`);
      lines.push(`  ${d.start} + ${d.added} − ${d.end} = <b>${d.sold} dona sotildi</b>`);
      lines.push(`  Narx: ${fmt(d.drink.salePrice)} so'm/dona`);
      lines.push(`  Tushum: <b>${fmt(d.revenue)}</b>`);
      lines.push(`  Tan narx: ${fmt(d.drink.purchasePrice)} so'm`);
      lines.push(`  Foyda: <b>${fmt(d.sold * profitPerUnit)}</b> (${fmt(profitPerUnit)}/dona)`);
      lines.push('');
    }
  });

  return lines.join('\n');
}

function buildOwnerDetailedReport({ date, categories, transactions, stats, drinkStats, cashRegister, workers, debts }) {
  const lines = [];
  const net = stats.totalIncome - stats.totalExpense;

  lines.push(`<b>☕ To'liq batafsil hisobot</b>`);
  lines.push(`<i>${escapeHTML(formatUzbDateFull(date))}</i>`);
  lines.push('');
  lines.push(`<b>💰 Tushum:</b> ${fmtSom(stats.totalIncome)}`);
  lines.push(`<b>💸 Chiqim:</b> ${fmtSom(stats.totalExpense)}`);
  lines.push(`<b>${net >= 0 ? '✅' : '⚠️'} Sof:</b> ${net >= 0 ? '+' : ''}${fmtSom(net)}`);
  lines.push('');

  // Tushum batafsil — har kategoriya bo'yicha yozuvlar bilan
  if (Object.keys(stats.incomeByCategory).length > 0) {
    lines.push(`<b>📈 Tushumlar batafsil:</b>`);
    categories.income.filter(c => stats.incomeByCategory[c.id]).forEach(cat => {
      const a = stats.incomeByCategory[cat.id];
      const txs = transactions.filter(t => t.type === 'income' && t.categoryId === cat.id);
      const cashSum = txs.filter(t => t.paymentMethod !== 'card').reduce((s, t) => s + Number(t.amount), 0);
      const cardSum = txs.filter(t => t.paymentMethod === 'card').reduce((s, t) => s + Number(t.amount), 0);

      let header = `${cat.icon || ''} <b>${escapeHTML(cat.name)}</b>: ${fmtSom(a)}`;
      if (cat.hasCommission) header += ` [${cat.commissionPercent}% ulush]`;
      if (cat.perUnit) {
        const ud = stats.perUnitDetails[cat.id];
        if (ud) header += ` — ${ud.qty} dona${ud.qtyEaten > 0 ? `, ${ud.qtyEaten} yedi` : ''}`;
      }
      lines.push(header);
      if (cardSum > 0) lines.push(`  💵 Naqd: ${fmt(cashSum)} | 💳 Plastik: ${fmt(cardSum)}`);
    });
    lines.push('');
  }

  // Chiqim batafsil — har bir kategoriya, kim olganligi
  if (Object.keys(stats.expenseByCategory).length > 0) {
    lines.push(`<b>📉 Chiqimlar batafsil:</b>`);
    categories.expense
      .filter(c => stats.expenseByCategory[c.id])
      .sort((a, b) => stats.expenseByCategory[b.id] - stats.expenseByCategory[a.id])
      .forEach(cat => {
        const a = stats.expenseByCategory[cat.id];
        const txs = transactions.filter(t => t.type === 'expense' && t.categoryId === cat.id);
        let header = `<b>${escapeHTML(cat.name)}</b>: ${fmtSom(a)}`;
        if (cat.isCashless) header += ' 💳';
        lines.push(header);
        // Har yozuv:
        txs.forEach(t => {
          const parts = [`  • ${fmtSom(t.amount)}`];
          if (t.payee) {
            const w = t.payeeWorkerId ? (workers || []).find(x => x.id === t.payeeWorkerId) : null;
            const codeStr = w?.code ? `[${w.code}] ` : '';
            parts.push(`— ${codeStr}${escapeHTML(t.payee)}`);
          }
          if (t.note) parts.push(`(${escapeHTML(t.note)})`);
          lines.push(parts.join(' '));
        });
      });
    lines.push('');
  }

  // Plastik
  if (stats.totalCashless > 0) {
    lines.push(`<b>💵 Naqd savdo:</b> ${fmtSom(stats.totalIncome - stats.totalCashless)}`);
    lines.push(`<b>💳 Plastik:</b> ${fmtSom(stats.totalCashless)}`);
    lines.push('');
  }

  // Kassa
  const cr = cashRegister[date];
  const counted = cr?.countedCash !== undefined && cr?.countedCash !== null
    ? cr.countedCash : cr?.endCash;
  if (counted !== null && counted !== undefined && counted !== '') {
    const naqdSavdo = stats.totalIncome - stats.totalCashless;
    const diff = Number(counted) - naqdSavdo;
    lines.push(`<b>💼 Kassa balansi:</b>`);
    lines.push(`  Bo'lishi kerak: ${fmtSom(naqdSavdo)}`);
    lines.push(`  Sanab kiritildi: ${fmtSom(counted)}`);
    if (diff === 0) lines.push(`  ✅ Mukammal balans`);
    else lines.push(`  ${Math.abs(diff) < 1000 ? '⚠️' : '❌'} Farq: ${diff > 0 ? '+' : ''}${fmtSom(diff)}`);
    lines.push('');
  }

  // Suvlar
  if (drinkStats.totalSold > 0) {
    lines.push(`<b>🥤 Suvlar:</b> ${drinkStats.totalSold} dona, ${fmtSom(drinkStats.totalRevenue)} (foyda ${fmtSom(drinkStats.totalProfit)})`);
    lines.push('');
  }

  // Qarzlar
  if (debts && debts.length > 0) {
    const pendingOwed = debts.filter(d => d.type === 'owed_to_us' && d.status === 'pending');
    const pendingOwe = debts.filter(d => d.type === 'we_owe' && d.status === 'pending');
    if (pendingOwed.length > 0 || pendingOwe.length > 0) {
      lines.push(`<b>🤝 Qarzlar:</b>`);
      if (pendingOwed.length > 0) {
        const total = pendingOwed.reduce((s, d) => s + Number(d.remaining ?? d.amount), 0);
        lines.push(`  ⬇️ Bizga qarzdor: ${fmtSom(total)} (${pendingOwed.length} kishi)`);
      }
      if (pendingOwe.length > 0) {
        const total = pendingOwe.reduce((s, d) => s + Number(d.remaining ?? d.amount), 0);
        lines.push(`  ⬆️ Biz qarzdormiz: ${fmtSom(total)} (${pendingOwe.length} kishi)`);
      }
    }
  }

  return lines.join('\n');
}

function buildFullReport({ date, categories, transactions, stats, drinkStats, cashRegister, drinks, drinkDaily, workers, debts }) {
  const lines = [];
  const net = stats.totalIncome - stats.totalExpense;

  lines.push(`<b>📋 HAR BIR YOZUV — to'liq hisobot</b>`);
  lines.push(`<i>${escapeHTML(formatUzbDateFull(date))}</i>`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`💰 <b>Tushum:</b> ${fmtSom(stats.totalIncome)}`);
  lines.push(`💸 <b>Chiqim:</b> ${fmtSom(stats.totalExpense)}`);
  lines.push(`${net >= 0 ? '✅' : '⚠️'} <b>Sof:</b> ${net >= 0 ? '+' : ''}${fmtSom(net)}`);
  lines.push('');

  // HAR TUSHUM
  const incomeTxs = transactions.filter(t => t.type === 'income');
  if (incomeTxs.length > 0) {
    lines.push(`<b>📈 Tushum yozuvlari (${incomeTxs.length} ta):</b>`);
    categories.income.forEach(cat => {
      const txs = incomeTxs.filter(t => t.categoryId === cat.id);
      if (txs.length === 0) return;
      lines.push('');
      lines.push(`${cat.icon || ''} <b>${escapeHTML(cat.name)}</b>`);
      txs.forEach(t => {
        const time = t.createdAt ? new Date(t.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '';
        const parts = [`  ${time ? `[${time}] ` : ''}${fmtSom(t.amount)}`];
        if (t.qty) parts.push(`— ${t.qty} dona`);
        if (t.qtyEaten) parts.push(`(${t.qtyEaten} yedi)`);
        if (t.paymentMethod === 'card') parts.push(`💳`);
        if (t.note) parts.push(`(${escapeHTML(t.note)})`);
        lines.push(parts.join(' '));
      });
    });
    lines.push('');
  }

  // HAR CHIQIM
  const expenseTxs = transactions.filter(t => t.type === 'expense');
  if (expenseTxs.length > 0) {
    lines.push(`<b>📉 Chiqim yozuvlari (${expenseTxs.length} ta):</b>`);
    categories.expense.forEach(cat => {
      const txs = expenseTxs.filter(t => t.categoryId === cat.id);
      if (txs.length === 0) return;
      lines.push('');
      lines.push(`<b>${escapeHTML(cat.name)}</b>${cat.isCashless ? ' 💳' : ''}`);
      txs.forEach(t => {
        const time = t.createdAt ? new Date(t.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '';
        const parts = [`  ${time ? `[${time}] ` : ''}${fmtSom(t.amount)}`];
        if (t.payee) {
          const w = t.payeeWorkerId ? (workers || []).find(x => x.id === t.payeeWorkerId) : null;
          const codeStr = w?.code ? `[${w.code}] ` : '';
          parts.push(`— ${codeStr}${escapeHTML(t.payee)}`);
        }
        if (t.note) parts.push(`(${escapeHTML(t.note)})`);
        lines.push(parts.join(' '));
      });
    });
    lines.push('');
  }

  // SUVLAR — har bir suv batafsil
  if (drinkStats.totalSold > 0) {
    lines.push(`<b>🥤 Suvlar:</b>`);
    drinkStats.perDrink.forEach(d => {
      if (!d.hasEnd) {
        lines.push(`• ${escapeHTML(d.drink.name)}: <i>kiritilmagan</i>`);
      } else {
        lines.push(`• ${escapeHTML(d.drink.name)}: ${d.start}+${d.added}−${d.end} = ${d.sold} dona, ${fmt(d.revenue)} so'm`);
      }
    });
    lines.push('');
  }

  // KASSA
  const cr = cashRegister[date];
  const counted = cr?.countedCash !== undefined && cr?.countedCash !== null
    ? cr.countedCash : cr?.endCash;
  if (counted !== null && counted !== undefined && counted !== '') {
    const naqdSavdo = stats.totalIncome - stats.totalCashless;
    const diff = Number(counted) - naqdSavdo;
    lines.push(`<b>💼 Kassa:</b>`);
    lines.push(`  Bo'lishi kerak: ${fmtSom(naqdSavdo)}`);
    lines.push(`  Sanab kiritildi: ${fmtSom(counted)}`);
    if (diff !== 0) lines.push(`  Farq: ${diff > 0 ? '+' : ''}${fmtSom(diff)}`);
    lines.push('');
  }

  // QARZLAR
  if (debts && debts.length > 0) {
    const pending = debts.filter(d => d.status === 'pending');
    if (pending.length > 0) {
      lines.push(`<b>🤝 Hal bo'lmagan qarzlar (${pending.length} ta):</b>`);
      pending.forEach(d => {
        const arrow = d.type === 'owed_to_us' ? '⬇️' : '⬆️';
        const remaining = Number(d.remaining ?? d.amount);
        lines.push(`${arrow} ${escapeHTML(d.partyName)}: ${fmtSom(remaining)}${d.dueDate ? ` (${formatUzbDate(d.dueDate)})` : ''}`);
      });
    }
  }

  return lines.join('\n');
}

// ============================================================
// PRINT 80mm — chek ko'rinishida (#4)
// ============================================================
function buildPrintHTML({ period, year, month, stats, categories, transactions, drinks, drinkDaily, cashRegister, debts, workers, periodTxs }) {
  const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const periodLabel = period === 'month' ? `${MONTHS[month]} ${year}` : `${year}-yil`;
  const today = new Date().toLocaleString('uz-UZ');
  const net = stats.totalIncome - stats.totalExpense;

  let body = '';
  body += `<div class="header">CHOYXONA HISOBCHI</div>`;
  body += `<div class="period">${periodLabel}</div>`;
  body += `<div class="date">Chiqarildi: ${escapeHTML(today)}</div>`;
  body += `<div class="hr"></div>`;

  body += `<div class="row big"><span>JAMI TUSHUM:</span><span>${fmt(stats.totalIncome)}</span></div>`;
  body += `<div class="row big"><span>JAMI CHIQIM:</span><span>${fmt(stats.totalExpense)}</span></div>`;
  body += `<div class="row big"><span>SOF NATIJA:</span><span>${net >= 0 ? '+' : ''}${fmt(net)}</span></div>`;
  body += `<div class="hr"></div>`;

  if (Object.keys(stats.incByCat).length > 0) {
    body += `<div class="section">TUSHUMLAR</div>`;
    categories.income
      .filter(c => stats.incByCat[c.id])
      .sort((a, b) => stats.incByCat[b.id] - stats.incByCat[a.id])
      .forEach(cat => {
        body += `<div class="row"><span>${escapeHTML(cat.name)}</span><span>${fmt(stats.incByCat[cat.id])}</span></div>`;
      });
    body += `<div class="hr"></div>`;
  }

  if (Object.keys(stats.expByCat).length > 0) {
    body += `<div class="section">CHIQIMLAR</div>`;
    categories.expense
      .filter(c => stats.expByCat[c.id])
      .sort((a, b) => stats.expByCat[b.id] - stats.expByCat[a.id])
      .forEach(cat => {
        body += `<div class="row"><span>${escapeHTML(cat.name)}${cat.isCashless ? ' [P]' : ''}</span><span>${fmt(stats.expByCat[cat.id])}</span></div>`;
      });
    body += `<div class="hr"></div>`;
  }

  if (stats.totalCashless > 0) {
    body += `<div class="row"><span>Naqd savdo:</span><span>${fmt(stats.totalIncome - stats.totalCashless)}</span></div>`;
    body += `<div class="row"><span>Plastik:</span><span>${fmt(stats.totalCashless)}</span></div>`;
    body += `<div class="hr"></div>`;
  }

  if (stats.drinksSold > 0) {
    body += `<div class="section">SUVLAR</div>`;
    body += `<div class="row"><span>Sotildi:</span><span>${stats.drinksSold} dona</span></div>`;
    body += `<div class="row"><span>Tushum:</span><span>${fmt(stats.drinksRevenue)}</span></div>`;
    body += `<div class="row"><span>Foyda:</span><span>${fmt(stats.drinksProfit)}</span></div>`;
    body += `<div class="hr"></div>`;
  }

  // Ishchilar oyligi (workerByName + payeeWorkerId)
  const payeeMap = {};
  periodTxs.filter(t => t.type === 'expense' && t.payee).forEach(t => {
    const key = t.payeeWorkerId || `name:${t.payee}`;
    if (!payeeMap[key]) {
      const w = (workers || []).find(x => x.id === t.payeeWorkerId);
      payeeMap[key] = { name: w?.name || t.payee, code: w?.code || '', total: 0 };
    }
    payeeMap[key].total += Number(t.amount);
  });
  const payees = Object.values(payeeMap).sort((a, b) => b.total - a.total);
  if (payees.length > 0) {
    body += `<div class="section">ISHCHILAR / OLGANLAR</div>`;
    payees.forEach(p => {
      const codeStr = p.code ? `[${p.code}] ` : '';
      body += `<div class="row"><span>${escapeHTML(codeStr + p.name)}</span><span>${fmt(p.total)}</span></div>`;
    });
    body += `<div class="hr"></div>`;
  }

  // Qarzlar
  const pending = (debts || []).filter(d => d.status === 'pending');
  if (pending.length > 0) {
    body += `<div class="section">QARZLAR (hal bo'lmagan)</div>`;
    pending.forEach(d => {
      const remaining = Number(d.remaining ?? d.amount);
      const arrow = d.type === 'owed_to_us' ? '<-' : '->';
      body += `<div class="row"><span>${arrow} ${escapeHTML(d.partyName)}</span><span>${fmt(remaining)}</span></div>`;
    });
    body += `<div class="hr"></div>`;
  }

  body += `<div class="footer">Choyxona Hisobchi v4</div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hisobot ${escapeHTML(periodLabel)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; line-height: 1.3; width: 74mm; }
  .header { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 4px; }
  .period { text-align: center; font-size: 12px; font-weight: bold; margin-bottom: 2px; }
  .date { text-align: center; font-size: 9px; margin-bottom: 4px; }
  .hr { border-top: 1px dashed #000; margin: 4px 0; }
  .section { font-weight: bold; font-size: 11px; margin-top: 4px; margin-bottom: 2px; text-decoration: underline; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; padding: 1px 0; }
  .row span:first-child { flex: 1; word-break: break-word; }
  .row span:last-child { font-weight: bold; white-space: nowrap; }
  .row.big { font-weight: bold; font-size: 12px; padding: 2px 0; }
  .footer { text-align: center; margin-top: 8px; font-size: 9px; color: #555; }
  @media print {
    body { width: 100%; }
    .no-print { display: none; }
  }
  .no-print { position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%); padding: 8px 16px; background: #047857; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
</style></head><body>${body}<button class="no-print" onclick="window.print()">🖨️ Print</button></body></html>`;
}
