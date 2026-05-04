import { useState, useEffect, useMemo } from "react";
import {
  Home, TrendingUp, TrendingDown, Coffee, Settings as SettingsIcon,
  BarChart3, Plus, Trash2, Edit3, Save, X, Calendar, Wallet,
  AlertTriangle, Package, ChevronDown, ChevronUp,
  CreditCard, Percent, Check, Banknote, Link2, Info, Send,
  Eye, EyeOff, Loader2, BookOpen, CheckCircle2, Users
} from "lucide-react";

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
    { id: 'exp_plastik', name: 'Plastikka tushgan naqtsiz pul', linkedTo: 'inc_ovqat', isCashless: true },
  ]
};

// ============== STORAGE (localStorage) ==============
const STORAGE_PREFIX = 'choyxona_';
async function sGet(key, fallback) {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key);
    if (v === null) return fallback;
    return JSON.parse(v);
  } catch { return fallback; }
}
async function sSet(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Storage error', e);
    return false;
  }
}

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
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
async function tgGetMe(token) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    return { ok: data.ok, info: data.result, error: data.description };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============== MAIN ==============
export default function ChoyxonaHisobchi() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [toast, setToast] = useState(null);

  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [transactions, setTransactions] = useState([]);
  const [drinks, setDrinks] = useState([]);
  const [drinkDaily, setDrinkDaily] = useState({});
  const [cashRegister, setCashRegister] = useState({});
  const [tgConfig, setTgConfig] = useState({ botToken: '', recipients: [] });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
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
    setLoading(false);
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2400);
  }

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

  async function addTransaction(tx) {
    const newTx = { id: genId(), createdAt: Date.now(), ...tx };
    const updated = [...transactions, newTx];
    setTransactions(updated);
    await sSet('transactions', updated);
    showToast("Saqlandi");
  }
  async function deleteTransaction(id) {
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    await sSet('transactions', updated);
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
    if (!confirm("Bu suv o'chiriladi. Ishonchingiz komilmi?")) return;
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
  function getPrevCash(date) {
    const dates = Object.keys(cashRegister).filter(d => d < date).sort();
    for (let i = dates.length - 1; i >= 0; i--) {
      const rec = cashRegister[dates[i]];
      if (rec && rec.endCash !== undefined && rec.endCash !== null && rec.endCash !== '') {
        return Number(rec.endCash);
      }
    }
    return 0;
  }

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
        ? Number(rec.startStock)
        : getPrevEndStock(selectedDate, drink.id);
      const added = Number(rec.added || 0);
      const end = rec.endStock !== undefined && rec.endStock !== '' && rec.endStock !== null
        ? Number(rec.endStock)
        : null;
      const sold = end !== null ? Math.max(0, start + added - end) : 0;
      const revenue = sold * Number(drink.salePrice || 0);
      const profit = sold * (Number(drink.salePrice || 0) - Number(drink.purchasePrice || 0));
      totalRevenue += revenue;
      totalProfit += profit;
      totalSold += sold;
      return { drink, start, added, end, sold, revenue, profit, hasEnd: end !== null };
    });
    return { perDrink, totalRevenue, totalProfit, totalSold };
  }, [drinkDaily, selectedDate, drinks]);

  const dayStats = useMemo(() => {
    const incomeByCategory = {};
    const expenseByCategory = {};
    const perUnitDetails = {};
    let totalIncome = 0, totalExpense = 0, totalCashless = 0;

    dayTransactions.forEach(t => {
      if (t.type === 'income') {
        const cat = categories.income.find(c => c.id === t.categoryId);
        const realAmount = cat?.hasCommission
          ? Number(t.amount) * (Number(cat.commissionPercent) || 0) / 100
          : Number(t.amount);
        incomeByCategory[t.categoryId] = (incomeByCategory[t.categoryId] || 0) + realAmount;
        totalIncome += realAmount;
        if (t.qty) {
          if (!perUnitDetails[t.categoryId]) perUnitDetails[t.categoryId] = { qty: 0, qtyEaten: 0 };
          perUnitDetails[t.categoryId].qty += Number(t.qty);
          perUnitDetails[t.categoryId].qtyEaten += Number(t.qtyEaten || 0);
        }
      } else {
        expenseByCategory[t.categoryId] = (expenseByCategory[t.categoryId] || 0) + Number(t.amount);
        totalExpense += Number(t.amount);
        const cat = categories.expense.find(c => c.id === t.categoryId);
        if (cat?.isCashless) totalCashless += Number(t.amount);
      }
    });

    const suvCat = categories.income.find(c => c.autoFromDrinks);
    if (suvCat && drinkDayStats.totalRevenue > 0) {
      incomeByCategory[suvCat.id] = (incomeByCategory[suvCat.id] || 0) + drinkDayStats.totalRevenue;
      totalIncome += drinkDayStats.totalRevenue;
    }

    return { incomeByCategory, expenseByCategory, perUnitDetails, totalIncome, totalExpense, totalCashless };
  }, [dayTransactions, categories, drinkDayStats.totalRevenue]);

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

  return (
    <div className="min-h-screen bg-stone-50 pb-24" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <header className="bg-emerald-900 text-amber-50 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Coffee className="w-5 h-5 text-emerald-950" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-wide truncate">Choyxona Hisobchi</h1>
              <p className="text-[11px] text-amber-200/70">Kunlik kirim-chiqim</p>
            </div>
          </div>
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-2 bg-emerald-950 hover:bg-black/30 px-3 py-2 rounded-lg text-xs sm:text-sm transition-colors flex-shrink-0">
            <Calendar className="w-4 h-4" />
            <span className="font-medium">{formatUzbDate(selectedDate)}</span>
          </button>
        </div>
        {showDatePicker && (
          <div className="bg-emerald-950 px-4 pb-3 border-t border-emerald-800">
            <div className="max-w-4xl mx-auto pt-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-emerald-900 text-amber-50 px-3 py-2 rounded-lg border border-emerald-700 focus:border-amber-500 outline-none"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setSelectedDate(todayStr()); setShowDatePicker(false); }}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-emerald-950 font-semibold py-2 rounded-lg transition-colors">
                  Bugun
                </button>
                <button onClick={() => setShowDatePicker(false)}
                  className="px-4 bg-emerald-800 hover:bg-emerald-700 py-2 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4">
        {activeTab === 'dashboard' && (
          <DashboardTab
            date={selectedDate}
            categories={categories}
            transactions={dayTransactions}
            stats={dayStats}
            drinkStats={drinkDayStats}
            cashRegister={cashRegister}
            getPrevCash={getPrevCash}
            onSaveCash={saveCashRegister}
            tgConfig={tgConfig}
            drinks={drinks}
            drinkDaily={drinkDaily}
            onToast={showToast}
          />
        )}
        {activeTab === 'income' && (
          <IncomeTab
            date={selectedDate}
            categories={categories.income}
            transactions={dayTransactions.filter(t => t.type === 'income')}
            onAdd={addTransaction}
            onDelete={deleteTransaction}
          />
        )}
        {activeTab === 'expense' && (
          <ExpenseTab
            date={selectedDate}
            categories={categories}
            transactions={dayTransactions.filter(t => t.type === 'expense')}
            onAdd={addTransaction}
            onDelete={deleteTransaction}
            onAddCategory={addCategory}
          />
        )}
        {activeTab === 'drinks' && (
          <DrinksTab
            date={selectedDate}
            drinks={drinks}
            drinkDaily={drinkDaily}
            stats={drinkDayStats}
            onAdd={addDrink}
            onUpdate={updateDrink}
            onDelete={deleteDrink}
            onSaveDay={saveDrinkDayRecord}
            getPrevEndStock={getPrevEndStock}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            categories={categories}
            onAddCat={addCategory}
            onUpdateCat={updateCategory}
            onDeleteCat={deleteCategory}
            tgConfig={tgConfig}
            onSaveTgConfig={saveTgConfig}
            onToast={showToast}
          />
        )}
        {activeTab === 'reports' && (
          <ReportsTab
            categories={categories}
            transactions={transactions}
            drinkDaily={drinkDaily}
            drinks={drinks}
          />
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 z-30" style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }}>
        <div className="max-w-4xl mx-auto grid grid-cols-6">
          {[
            { id: 'dashboard', icon: Home, label: 'Bosh' },
            { id: 'income', icon: TrendingUp, label: 'Tushum' },
            { id: 'expense', icon: TrendingDown, label: 'Chiqim' },
            { id: 'drinks', icon: Package, label: 'Suvlar' },
            { id: 'settings', icon: SettingsIcon, label: 'Sozlama' },
            { id: 'reports', icon: BarChart3, label: 'Hisobot' },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative py-3 px-1 flex flex-col items-center gap-1 transition-colors ${
                  isActive ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[10px] font-semibold">{item.label}</span>
                {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 bg-amber-500 w-8 rounded-b" />}
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

// ============== DASHBOARD TAB ==============
function DashboardTab({ date, categories, transactions, stats, drinkStats, cashRegister, getPrevCash, onSaveCash, tgConfig, drinks, drinkDaily, onToast }) {
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

      {tgConfig.botToken && tgConfig.recipients?.length > 0 && (
        <TelegramQuickSend
          date={date}
          tgConfig={tgConfig}
          categories={categories}
          transactions={transactions}
          stats={stats}
          drinkStats={drinkStats}
          drinks={drinks}
          drinkDaily={drinkDaily}
          cashRegister={cashRegister}
          getPrevCash={getPrevCash}
          onToast={onToast}
        />
      )}

      {stats.totalCashless > 0 && (
        <div className="bg-white rounded-xl p-4 border border-stone-200">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-900">Naqd va plastik tarkibi</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                <p className="text-[11px] font-medium text-emerald-900">Naqd tushum</p>
              </div>
              <p className="text-sm font-bold text-emerald-900">{fmtSom(stats.totalIncome - stats.totalCashless)}</p>
            </div>
            <div className="bg-violet-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-violet-700" />
                <p className="text-[11px] font-medium text-violet-900">Plastik</p>
              </div>
              <p className="text-sm font-bold text-violet-900">{fmtSom(stats.totalCashless)}</p>
            </div>
          </div>
        </div>
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
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {drinkStats.totalSold} dona sotildi
                      </p>
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
                        <Link2 className="w-3 h-3" />
                        {linkedCat.name}
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

// ============== CASH REGISTER CARD ==============
function CashRegisterCard({ date, cashRegister, totalIncome, totalCashless, onSave }) {
  const existing = cashRegister[date] || {};
  // Backward compat: eski "endCash" maydoni endi countedCash sifatida ishlatiladi
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

  const naqdSavdo = totalIncome - totalCashless; // bugun naqd ko'rinishida tushgan savdo
  const counted = countedCash !== '' ? Number(countedCash) : null;
  const diff = counted !== null ? counted - naqdSavdo : null;

  function save() {
    onSave(date, {
      countedCash: countedCash === '' ? null : Number(countedCash),
    });
    setDirty(false);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="bg-amber-50 px-4 py-2.5 border-b border-stone-200 flex items-center gap-2">
        <Wallet className="w-4 h-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">Kunlik kassa balansi</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="bg-stone-50 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-600">Bugungi jami savdo:</span>
            <span className="font-semibold text-slate-900">{fmtSom(totalIncome)}</span>
          </div>
          {totalCashless > 0 && (
            <div className="flex justify-between">
              <span className="text-violet-700">− Plastik orqali:</span>
              <span className="font-semibold text-violet-700">{fmtSom(totalCashless)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-stone-200">
            <span className="font-semibold text-emerald-900">Bugungi naqd savdo:</span>
            <span className="font-bold text-emerald-900">{fmtSom(naqdSavdo)}</span>
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Kassada bugun yig'ilgan naqd pul
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={countedCash}
            onChange={(e) => { setCountedCash(e.target.value); setDirty(true); }}
            placeholder="Sanab kiriting"
            className="w-full mt-1 px-3 py-2.5 border border-stone-300 rounded-lg text-base font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Faqat bugun kun davomida kassaga tushgan naqd pulni kiriting
          </p>
        </label>

        {counted !== null && diff !== null && (
          <div className={`rounded-lg p-3 flex items-start gap-2 ${
            diff === 0 ? 'bg-emerald-50 border border-emerald-200' :
            Math.abs(diff) < 1000 ? 'bg-amber-50 border border-amber-200' :
            'bg-rose-50 border border-rose-200'
          }`}>
            {diff === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${Math.abs(diff) < 1000 ? 'text-amber-600' : 'text-rose-600'}`} />
            )}
            <div className="text-xs flex-1">
              <p className={`font-bold ${
                diff === 0 ? 'text-emerald-900' :
                Math.abs(diff) < 1000 ? 'text-amber-900' :
                'text-rose-900'
              }`}>
                {diff === 0
                  ? "✅ Mukammal balans! Savdo va kassa to'la mos keldi."
                  : `Farq: ${diff > 0 ? '+' : ''}${fmtSom(diff)}`}
              </p>
              {diff !== 0 && (
                <p className={`mt-1 ${Math.abs(diff) < 1000 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {diff > 0
                    ? "Kassada savdoga qaraganda ortiqcha pul bor (eslatma: agar kechadan qoldiq olib qolingan bo'lsa, normal)."
                    : "Kassada savdoga qaraganda kam pul bor — sababini tekshiring."}
                </p>
              )}
            </div>
          </div>
        )}

        {dirty && (
          <button
            onClick={save}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
          >
            <Save className="w-4 h-4" />
            Saqlash
          </button>
        )}
      </div>
    </div>
  );
}

// ============== TELEGRAM QUICK SEND ==============
function TelegramQuickSend({ date, tgConfig, categories, transactions, stats, drinkStats, drinks, drinkDaily, cashRegister, getPrevCash, onToast }) {
  const [sending, setSending] = useState(null);

  async function send(recipient) {
    setSending(recipient.id);
    let report = '';
    if (recipient.reportType === 'drinks') {
      report = buildDrinksReport(date, drinkStats);
    } else if (recipient.reportType === 'owner') {
      report = buildOwnerReport(date, categories, transactions, stats, drinkStats, cashRegister, getPrevCash);
    } else {
      report = buildOwnerReport(date, categories, transactions, stats, drinkStats, cashRegister, getPrevCash);
    }
    const result = await tgSend(tgConfig.botToken, recipient.chatId, report);
    setSending(null);
    if (result.ok) {
      onToast(`${recipient.name}ga yuborildi`);
    } else {
      onToast(`Xato: ${result.error || 'Yuborilmadi'}`, 'error');
    }
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
                {r.reportType === 'drinks' && '🥤 Faqat suvlar hisoboti'}
                {r.reportType === 'owner' && "☕ Egasi uchun to'liq hisobot"}
                {r.reportType === 'full' && "📊 To'liq hisobot"}
              </p>
            </div>
            <button
              onClick={() => send(r)}
              disabled={sending === r.id}
              className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-stone-300 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5"
            >
              {sending === r.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Yuborish
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== INCOME TAB ==============
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
          Hech qanday tushum bo'limi yo'q. <strong>Sozlama</strong> tabidan qo'shing.
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

        return (
          <div key={cat.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <button
              onClick={() => !isAuto && setOpenCat(isOpen ? null : cat.id)}
              disabled={isAuto}
              className={`w-full px-4 py-3 flex items-center justify-between gap-3 ${isAuto ? '' : 'hover:bg-stone-50 active:bg-stone-100'} transition-colors`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <span className="text-2xl">{cat.icon || '💰'}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{cat.name}</p>
                  {cat.hasCommission && (
                    <p className="text-[11px] text-amber-700 font-medium mt-0.5 flex items-center gap-1">
                      <Percent className="w-3 h-3" />
                      Sizning ulushingiz: {cat.commissionPercent}%
                    </p>
                  )}
                  {cat.perUnit && (
                    <p className="text-[11px] text-blue-700 font-medium mt-0.5">
                      Bir dona: {fmt(cat.unitPrice)} so'm
                      {totalQty > 0 && ` • Bugun: ${totalQty} dona`}
                      {totalEaten > 0 && ` • Yedi: ${totalEaten}`}
                    </p>
                  )}
                  {isAuto && (
                    <p className="text-[11px] text-blue-700 font-medium mt-0.5 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Avtomatik (Suvlar tabidan)
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {cat.hasCommission ? (
                  <>
                    <p className="text-[10px] text-slate-500">Sotuv: {fmt(totalAmount)}</p>
                    <p className="text-sm font-bold text-emerald-700">{fmtSom(realIncome)}</p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-emerald-700">{fmtSom(totalAmount)}</p>
                )}
                {!isAuto && (
                  isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 inline ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 inline ml-1" />
                )}
              </div>
            </button>

            {isOpen && !isAuto && (
              <div className="border-t border-stone-200 bg-stone-50 p-4">
                <QuickAddForm
                  category={cat}
                  onSubmit={(data) => {
                    onAdd({ type: 'income', categoryId: cat.id, ...data, date });
                    setOpenCat(null);
                  }}
                />
                {catTxs.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bugungi yozuvlar</p>
                    {catTxs.map(tx => (
                      <TxRow key={tx.id} tx={tx} onDelete={onDelete} accent="emerald" />
                    ))}
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

// ============== EXPENSE TAB ==============
function ExpenseTab({ date, categories, transactions, onAdd, onDelete, onAddCategory }) {
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

      <button
        onClick={() => setShowNewCatForm(!showNewCatForm)}
        className="w-full bg-white border-2 border-dashed border-stone-300 hover:border-emerald-500 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {showNewCatForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showNewCatForm ? 'Bekor qilish' : "Yangi chiqim turi qo'shish"}
      </button>

      {showNewCatForm && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <CategoryForm
            type="expense"
            incomeCategories={categories.income}
            onSubmit={(data) => { onAddCategory('expense', data); setShowNewCatForm(false); }}
            onCancel={() => setShowNewCatForm(false)}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-2 flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterIncomeId('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filterIncomeId === 'all' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-slate-700 hover:bg-stone-200'
          }`}
        >
          Hammasi
        </button>
        {categories.income.filter(c => !c.autoFromDrinks).map(c => (
          <button
            key={c.id}
            onClick={() => setFilterIncomeId(c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterIncomeId === c.id ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-slate-700 hover:bg-stone-200'
            }`}
          >
            {c.icon} {c.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {filteredCats.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Bu bo'limga tegishli chiqim turi yo'q. Yuqoridagi tugmadan qo'shing.
        </div>
      )}

      {filteredCats.map(cat => {
        const catTxs = transactions.filter(t => t.categoryId === cat.id);
        const total = catTxs.reduce((s, t) => s + Number(t.amount), 0);
        const isOpen = openCat === cat.id;
        const linkedCat = categories.income.find(c => c.id === cat.linkedTo);

        return (
          <div key={cat.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <button
              onClick={() => setOpenCat(isOpen ? null : cat.id)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-stone-50 active:bg-stone-100 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <div className="w-10 h-10 bg-rose-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <TrendingDown className="w-4 h-4 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 truncate">{cat.name}</p>
                    {cat.isCashless && (
                      <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0">PLASTIK</span>
                    )}
                    {cat.trackPayee && (
                      <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold flex-shrink-0">ISHCHILAR</span>
                    )}
                  </div>
                  {linkedCat && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{linkedCat.icon} {linkedCat.name}</p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-rose-700">{total > 0 ? fmtSom(total) : '—'}</p>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 inline ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 inline ml-1" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-stone-200 bg-stone-50 p-4">
                <QuickAddForm
                  expenseCat={cat}
                  variant="expense"
                  onSubmit={(data) => {
                    onAdd({ type: 'expense', categoryId: cat.id, ...data, date });
                    setOpenCat(null);
                  }}
                />
                {catTxs.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bugungi yozuvlar</p>
                    {catTxs.map(tx => (
                      <TxRow key={tx.id} tx={tx} onDelete={onDelete} accent="rose" />
                    ))}
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

// ============== QUICK ADD FORM ==============
function QuickAddForm({ category, expenseCat, onSubmit, variant = 'income' }) {
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('');
  const [qtyEaten, setQtyEaten] = useState('');
  const [note, setNote] = useState('');
  const [payee, setPayee] = useState('');

  const isPerUnit = category?.perUnit;
  const isCommission = category?.hasCommission;
  const trackEaten = category?.trackEaten;
  const trackPayee = expenseCat?.trackPayee;

  const computedAmount = isPerUnit && qty ? Number(qty) * Number(category.unitPrice || 0) : null;
  const commissionShare = isCommission && amount ? Number(amount) * (Number(category.commissionPercent) || 0) / 100 : null;

  function submit() {
    if (isPerUnit) {
      const q = Number(qty);
      if (!q || q <= 0) return;
      const computedAmt = q * Number(category.unitPrice || 0);
      onSubmit({
        amount: computedAmt,
        qty: q,
        qtyEaten: qtyEaten ? Number(qtyEaten) : 0,
        note,
      });
    } else {
      const num = Number(amount);
      if (!num || num <= 0) return;
      const data = { amount: num, note };
      if (trackPayee && payee.trim()) data.payee = payee.trim();
      onSubmit(data);
    }
    setAmount(''); setQty(''); setQtyEaten(''); setNote(''); setPayee('');
  }

  const accentBtn = variant === 'expense' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-700 hover:bg-emerald-800';

  return (
    <div className="space-y-2">
      {isPerUnit ? (
        <>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Sotilgan dona soni
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="w-full mt-1 px-3 py-2.5 border border-stone-300 rounded-lg text-base font-semibold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none"
            />
          </label>
          {trackEaten && (
            <label className="block">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                Ishchilar yedi (dona, ixtiyoriy)
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={qtyEaten}
                onChange={(e) => setQtyEaten(e.target.value)}
                placeholder="0"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-amber-600 outline-none"
              />
            </label>
          )}
          {computedAmount !== null && qty && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs">
              <span className="text-emerald-800">
                Tushum: {qty} × {fmt(category.unitPrice)} = <strong className="text-emerald-900">{fmtSom(computedAmount)}</strong>
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              {isCommission ? "Umumiy sotuv summasi (so'm)" : "Summa (so'm)"}
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full mt-1 px-3 py-2.5 border border-stone-300 rounded-lg text-base font-semibold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none"
            />
          </label>
          {commissionShare !== null && amount && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
              <span className="text-amber-800">
                Sizning ulushingiz ({category.commissionPercent}%): <strong className="text-amber-900">{fmtSom(commissionShare)}</strong>
              </span>
            </div>
          )}
          {trackPayee && (
            <label className="block">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                Kim oldi? (ishchi nomi)
              </span>
              <input
                type="text"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="Masalan: Akmal"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-amber-600 outline-none"
              />
            </label>
          )}
        </>
      )}
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Izoh (ixtiyoriy)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Qo'shimcha ma'lumot"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none"
        />
      </label>
      <button
        onClick={submit}
        disabled={isPerUnit ? !qty || Number(qty) <= 0 : !amount || Number(amount) <= 0}
        className={`w-full ${accentBtn} disabled:bg-stone-300 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2`}
      >
        <Save className="w-4 h-4" />
        Saqlash
      </button>
    </div>
  );
}

// ============== TX ROW ==============
function TxRow({ tx, onDelete, accent }) {
  const time = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="bg-white rounded-lg border border-stone-200 px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={`text-sm font-bold ${accent === 'rose' ? 'text-rose-700' : 'text-emerald-700'}`}>
            {accent === 'rose' ? '−' : '+'}{fmtSom(tx.amount)}
          </p>
          {tx.qty && (
            <span className="text-[11px] text-slate-500">
              ({tx.qty} dona{tx.qtyEaten ? ` + ${tx.qtyEaten} yedi` : ''})
            </span>
          )}
        </div>
        {(tx.note || tx.payee) && (
          <p className="text-[11px] text-slate-500 truncate">
            {tx.payee && <span className="font-semibold text-amber-700">{tx.payee}</span>}
            {tx.payee && tx.note && ' • '}
            {tx.note}
          </p>
        )}
      </div>
      {time && <span className="text-[10px] text-slate-400 flex-shrink-0">{time}</span>}
      <button
        onClick={() => onDelete(tx.id)}
        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============== DRINKS TAB ==============
function DrinksTab({ date, drinks, drinkDaily, stats, onAdd, onUpdate, onDelete, onSaveDay, getPrevEndStock }) {
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
        <button
          onClick={() => setView('daily')}
          className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'daily' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-stone-50'
          }`}
        >
          Kunlik hisob
        </button>
        <button
          onClick={() => setView('catalog')}
          className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'catalog' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-stone-50'
          }`}
        >
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
                  <div>
                    <p className="text-[11px] opacity-70">Sotildi</p>
                    <p className="text-sm font-semibold">{stats.totalSold} dona</p>
                  </div>
                  <div>
                    <p className="text-[11px] opacity-70">Sof foyda</p>
                    <p className="text-sm font-semibold">{fmtSom(stats.totalProfit)}</p>
                  </div>
                </div>
              </div>

              {stats.perDrink.map(({ drink, start, added, end, sold, revenue, profit, hasEnd }) => (
                <DrinkDayCard
                  key={drink.id}
                  drink={drink}
                  start={start}
                  added={added}
                  end={end}
                  date={date}
                  onSave={(rec) => onSaveDay(date, drink.id, rec)}
                />
              ))}
            </>
          )}
        </>
      )}

      {view === 'catalog' && (
        <>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Yangi suv qo'shish
          </button>

          {showAddForm && (
            <DrinkForm
              onSubmit={(data) => { onAdd(data); setShowAddForm(false); }}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {drinks.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-slate-400 text-sm">Hali suv qo'shilmagan</div>
          )}

          {drinks.map(drink => (
            <div key={drink.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {editingId === drink.id ? (
                <DrinkForm
                  initial={drink}
                  onSubmit={(data) => { onUpdate(drink.id, data); setEditingId(null); }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{drink.name}</p>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="bg-stone-50 rounded-lg p-2">
                          <p className="text-[10px] text-slate-500 uppercase">Tan narx</p>
                          <p className="text-sm font-bold text-slate-900">{fmt(drink.purchasePrice)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-2">
                          <p className="text-[10px] text-emerald-700 uppercase">Sotuv narx</p>
                          <p className="text-sm font-bold text-emerald-900">{fmt(drink.salePrice)}</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-2">
                          <p className="text-[10px] text-amber-700 uppercase">Foyda/dona</p>
                          <p className="text-sm font-bold text-amber-900">
                            {fmt(Number(drink.salePrice) - Number(drink.purchasePrice))}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setEditingId(drink.id)}
                        className="p-2 text-slate-500 hover:bg-stone-100 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(drink.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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

// ============== DRINK DAY CARD ==============
function DrinkDayCard({ drink, start, added, end, date, onSave }) {
  const [startVal, setStartVal] = useState(start);
  const [addedVal, setAddedVal] = useState(added);
  const [endVal, setEndVal] = useState(end !== null ? end : '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setStartVal(start);
    setAddedVal(added);
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
          <input
            type="number"
            inputMode="numeric"
            value={startVal}
            onChange={(e) => { setStartVal(e.target.value); setDirty(true); }}
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Qo'shildi</span>
          <input
            type="number"
            inputMode="numeric"
            value={addedVal}
            onChange={(e) => { setAddedVal(e.target.value); setDirty(true); }}
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Qoldi</span>
          <input
            type="number"
            inputMode="numeric"
            value={endVal}
            onChange={(e) => { setEndVal(e.target.value); setDirty(true); }}
            placeholder="—"
            className="w-full mt-1 px-2 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none"
          />
        </label>
      </div>

      {endVal !== '' && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-lg px-2 py-1.5">
            <p className="text-[9px] text-blue-700 font-bold uppercase">Sotildi</p>
            <p className="text-sm font-bold text-blue-900">{localSold} d.</p>
          </div>
          <div className="bg-emerald-50 rounded-lg px-2 py-1.5">
            <p className="text-[9px] text-emerald-700 font-bold uppercase">Tushum</p>
            <p className="text-sm font-bold text-emerald-900">{fmt(localRevenue)}</p>
          </div>
          <div className="bg-amber-50 rounded-lg px-2 py-1.5">
            <p className="text-[9px] text-amber-700 font-bold uppercase">Foyda</p>
            <p className="text-sm font-bold text-amber-900">{fmt(localProfit)}</p>
          </div>
        </div>
      )}

      {dirty && (
        <button
          onClick={save}
          className="w-full mt-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
        >
          <Save className="w-4 h-4" />
          Saqlash
        </button>
      )}
    </div>
  );
}

// ============== DRINK FORM ==============
function DrinkForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice || '');
  const [salePrice, setSalePrice] = useState(initial?.salePrice || '');

  function submit() {
    if (!name.trim() || !purchasePrice || !salePrice) return;
    onSubmit({
      name: name.trim(),
      purchasePrice: Number(purchasePrice),
      salePrice: Number(salePrice),
    });
  }

  const profit = (Number(salePrice) || 0) - (Number(purchasePrice) || 0);

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">{initial ? "Suvni tahrirlash" : "Yangi suv"}</p>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Nomi</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kola 0.5L"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase">Tan narx (so'm)</span>
          <input
            type="number"
            inputMode="numeric"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            placeholder="6000"
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase">Sotuv narx (so'm)</span>
          <input
            type="number"
            inputMode="numeric"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="10000"
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-emerald-600 outline-none"
          />
        </label>
      </div>
      {salePrice && purchasePrice && (
        <div className={`rounded-lg px-3 py-2 text-xs ${
          profit >= 0 ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
        }`}>
          Foyda har bir donadan: <strong>{fmtSom(profit)}</strong>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">
          Bekor qilish
        </button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">
          Saqlash
        </button>
      </div>
    </div>
  );
}

// ============== SETTINGS TAB ==============
function SettingsTab({ categories, onAddCat, onUpdateCat, onDeleteCat, tgConfig, onSaveTgConfig, onToast }) {
  const [section, setSection] = useState('cats');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <SettingsIcon className="w-5 h-5 text-slate-700" />
        <h2 className="text-lg font-semibold text-slate-900">Sozlamalar</h2>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-1 grid grid-cols-2 gap-1">
        <button
          onClick={() => setSection('cats')}
          className={`py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
            section === 'cats' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-stone-50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Bo'limlar
        </button>
        <button
          onClick={() => setSection('telegram')}
          className={`py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
            section === 'telegram' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-stone-50'
          }`}
        >
          <Send className="w-4 h-4" />
          Telegram bot
        </button>
      </div>

      {section === 'cats' && (
        <CategoriesSection
          categories={categories}
          onAdd={onAddCat}
          onUpdate={onUpdateCat}
          onDelete={onDeleteCat}
        />
      )}

      {section === 'telegram' && (
        <TelegramSection
          tgConfig={tgConfig}
          onSave={onSaveTgConfig}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// ============== CATEGORIES SECTION ==============
function CategoriesSection({ categories, onAdd, onUpdate, onDelete }) {
  const [showAdd, setShowAdd] = useState(null);
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>Bu yerda siz xohlagan tushum va chiqim bo'limlarini qo'shishingiz, narx-navo bilan ishlashni sozlashingiz mumkin.</p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-emerald-50 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-emerald-900">Tushum bo'limlari</h3>
          </div>
          <button
            onClick={() => setShowAdd(showAdd === 'income' ? null : 'income')}
            className="text-emerald-700 hover:bg-emerald-100 p-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {showAdd === 'income' && (
          <CategoryForm
            type="income"
            onSubmit={(data) => { onAdd('income', data); setShowAdd(null); }}
            onCancel={() => setShowAdd(null)}
          />
        )}
        <div className="divide-y divide-stone-100">
          {categories.income.map(cat => (
            <div key={cat.id} className="px-4 py-3">
              {editingId === cat.id ? (
                <CategoryForm
                  type="income"
                  initial={cat}
                  onSubmit={(data) => { onUpdate('income', cat.id, data); setEditingId(null); }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xl">{cat.icon || '💰'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{cat.name}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {cat.hasCommission && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                            ULUSH {cat.commissionPercent}%
                          </span>
                        )}
                        {cat.perUnit && (
                          <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                            DONA × {fmt(cat.unitPrice)}
                          </span>
                        )}
                        {cat.trackEaten && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                            ISHCHILAR YEYISHI
                          </span>
                        )}
                        {cat.autoFromDrinks && (
                          <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                            AVTO (SUVLAR)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setEditingId(cat.id)} className="p-1.5 text-slate-500 hover:bg-stone-100 rounded">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDelete('income', cat.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-rose-50 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-700" />
            <h3 className="text-sm font-semibold text-rose-900">Chiqim bo'limlari</h3>
          </div>
          <button
            onClick={() => setShowAdd(showAdd === 'expense' ? null : 'expense')}
            className="text-rose-700 hover:bg-rose-100 p-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {showAdd === 'expense' && (
          <CategoryForm
            type="expense"
            incomeCategories={categories.income}
            onSubmit={(data) => { onAdd('expense', data); setShowAdd(null); }}
            onCancel={() => setShowAdd(null)}
          />
        )}
        <div className="divide-y divide-stone-100">
          {categories.expense.map(cat => {
            const linked = categories.income.find(c => c.id === cat.linkedTo);
            return (
              <div key={cat.id} className="px-4 py-3">
                {editingId === cat.id ? (
                  <CategoryForm
                    type="expense"
                    initial={cat}
                    incomeCategories={categories.income}
                    onSubmit={(data) => { onUpdate('expense', cat.id, data); setEditingId(null); }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900">{cat.name}</p>
                        {cat.isCashless && (
                          <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">PLASTIK</span>
                        )}
                        {cat.trackPayee && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">ISHCHILAR</span>
                        )}
                      </div>
                      {linked && (
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          {linked.name}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setEditingId(cat.id)} className="p-1.5 text-slate-500 hover:bg-stone-100 rounded">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete('expense', cat.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============== CATEGORY FORM ==============
function CategoryForm({ type, initial, incomeCategories = [], onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || '');
  const [hasCommission, setHasCommission] = useState(initial?.hasCommission || false);
  const [commissionPercent, setCommissionPercent] = useState(initial?.commissionPercent || 24);
  const [perUnit, setPerUnit] = useState(initial?.perUnit || false);
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice || '');
  const [trackEaten, setTrackEaten] = useState(initial?.trackEaten || false);
  const [linkedTo, setLinkedTo] = useState(initial?.linkedTo || '');
  const [isCashless, setIsCashless] = useState(initial?.isCashless || false);
  const [trackPayee, setTrackPayee] = useState(initial?.trackPayee || false);

  function submit() {
    if (!name.trim()) return;
    if (type === 'income') {
      const data = { name: name.trim(), icon: icon || '💰' };
      if (hasCommission) {
        data.hasCommission = true;
        data.commissionPercent = Number(commissionPercent) || 0;
      }
      if (perUnit && unitPrice) {
        data.perUnit = true;
        data.unitPrice = Number(unitPrice);
        if (trackEaten) data.trackEaten = true;
      }
      if (initial?.autoFromDrinks) data.autoFromDrinks = true;
      onSubmit(data);
    } else {
      const data = { name: name.trim() };
      if (linkedTo) data.linkedTo = linkedTo;
      if (isCashless) data.isCashless = true;
      if (trackPayee) data.trackPayee = true;
      onSubmit(data);
    }
  }

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 m-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">
        {initial ? "Tahrirlash" : `Yangi ${type === 'income' ? 'tushum' : 'chiqim'} bo'limi`}
      </p>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Nomi</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'income' ? "Masalan: Pitsa sotuvi" : "Masalan: Gaz uchun to'lov"}
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none"
        />
      </label>

      {type === 'income' && (
        <>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600 uppercase">Belgi (emoji, ixtiyoriy)</span>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🍕"
              maxLength={2}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none"
            />
          </label>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={perUnit}
                onChange={(e) => { setPerUnit(e.target.checked); if (e.target.checked) setHasCommission(false); }}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-900">
                <strong>Dona narxi asosida</strong> (somsa kabi)
              </span>
            </label>
            {perUnit && (
              <div className="space-y-2 pl-6">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase">Bir dona narxi (so'm)</span>
                  <input
                    type="number"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="5000"
                    className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-blue-600 outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Bunda kassir faqat dona sonini kiritadi, summa avtomatik hisoblanadi.
                  </p>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trackEaten}
                    onChange={(e) => setTrackEaten(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs text-slate-700">
                    <strong>Ishchilar yeyishini hisoblash</strong> (alohida kiritiladi)
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasCommission}
                onChange={(e) => { setHasCommission(e.target.checked); if (e.target.checked) setPerUnit(false); }}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-900">
                <strong>Foiz asosida</strong> (shashlik kabi)
              </span>
            </label>
            {hasCommission && (
              <div className="pl-6">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase">Sizning ulushingiz (%)</span>
                  <input
                    type="number"
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(e.target.value)}
                    min="0" max="100"
                    className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-semibold focus:border-amber-600 outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Misol: shashlikchi sizga 24% beradi → 24 yozing
                  </p>
                </label>
              </div>
            )}
          </div>
        </>
      )}

      {type === 'expense' && (
        <>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600 uppercase">Qaysi tushumga aloqador</span>
            <select
              value={linkedTo}
              onChange={(e) => setLinkedTo(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-emerald-600 outline-none bg-white"
            >
              <option value="">— Hech qaysi —</option>
              {incomeCategories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isCashless}
              onChange={(e) => setIsCashless(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-slate-700">
              <strong>Naqtsiz pul</strong> (plastikka tushgan)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={trackPayee}
              onChange={(e) => setTrackPayee(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-slate-700">
              <strong>Ishchi nomini yozish</strong> (oylik kabi)
            </span>
          </label>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">
          Bekor
        </button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">
          Saqlash
        </button>
      </div>
    </div>
  );
}

// ============== TELEGRAM SECTION ==============
function TelegramSection({ tgConfig, onSave, onToast }) {
  const [token, setToken] = useState(tgConfig.botToken || '');
  const [recipients, setRecipients] = useState(tgConfig.recipients || []);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [botInfo, setBotInfo] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showRecipientForm, setShowRecipientForm] = useState(false);
  const [editingRecId, setEditingRecId] = useState(null);

  async function saveAll() {
    await onSave({ botToken: token.trim(), recipients });
    onToast("Sozlamalar saqlandi");
  }

  async function testConnection() {
    if (!token.trim()) {
      onToast("Avval bot tokenini kiriting", 'error');
      return;
    }
    setTesting(true);
    const r = await tgGetMe(token.trim());
    setTesting(false);
    if (r.ok) {
      setBotInfo(r.info);
      onToast(`Bot tayyor: @${r.info.username}`);
    } else {
      setBotInfo(null);
      onToast(`Xato: ${r.error || "Token noto'g'ri"}`, 'error');
    }
  }

  async function sendTest(rec) {
    if (!token.trim()) return;
    const msg = `🧪 <b>Test xabar</b>\n\nBu Choyxona Hisobchi botidan test xabari.\n\n✅ Hammasi yaxshi ishlayapti!\nKim oladi: ${escapeHTML(rec.name)}`;
    const r = await tgSend(token.trim(), rec.chatId, msg);
    if (r.ok) {
      onToast(`Test xabari ${rec.name}ga yuborildi`);
    } else {
      onToast(`Xato: ${r.error || 'Yuborilmadi'}`, 'error');
    }
  }

  async function addRecipient(data) {
    const newRec = { id: genId(), enabled: true, ...data };
    const updated = [...recipients, newRec];
    setRecipients(updated);
    setShowRecipientForm(false);
    await onSave({ botToken: token, recipients: updated });
    onToast("Qabul qiluvchi qo'shildi");
  }
  async function updateRecipient(id, data) {
    const updated = recipients.map(r => r.id === id ? { ...r, ...data } : r);
    setRecipients(updated);
    setEditingRecId(null);
    await onSave({ botToken: token, recipients: updated });
    onToast("Yangilandi");
  }
  async function deleteRecipient(id) {
    if (!confirm("O'chirmoqchimisiz?")) return;
    const updated = recipients.filter(r => r.id !== id);
    setRecipients(updated);
    await onSave({ botToken: token, recipients: updated });
    onToast("O'chirildi");
  }
  async function toggleEnabled(id) {
    const updated = recipients.map(r => r.id === id ? { ...r, enabled: r.enabled === false } : r);
    setRecipients(updated);
    await onSave({ botToken: token, recipients: updated });
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full flex items-center justify-between text-left font-semibold"
        >
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Telegram botni qanday sozlash mumkin?
          </span>
          {showHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showHelp && (
          <div className="mt-3 space-y-2 leading-relaxed">
            <p><strong>1-qadam:</strong> Telegramda <code className="bg-white px-1 rounded">@BotFather</code>ga kiring va <code className="bg-white px-1 rounded">/newbot</code> komandasini yuboring.</p>
            <p><strong>2-qadam:</strong> Bot uchun nom va username tanlang.</p>
            <p><strong>3-qadam:</strong> BotFather sizga <strong>token</strong> beradi (masalan: <code className="bg-white px-1 rounded">123456:ABC-DEF...</code>). Uni shu yerga kiriting.</p>
            <p><strong>4-qadam:</strong> Bot xabar yuborishi uchun har bir qabul qiluvchi botingizga <code className="bg-white px-1 rounded">/start</code> yozishi kerak.</p>
            <p><strong>5-qadam:</strong> <strong>Chat ID</strong>ni olish uchun <code className="bg-white px-1 rounded">@userinfobot</code>dan foydalaning — uni qabul qiluvchi telegramda ochib, bot beradigan ID raqamni ko'chiring.</p>
            <p><strong>6-qadam:</strong> Pastdan "Qabul qiluvchi qo'shish" orqali yangi qabul qiluvchini sozlang.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Bot token</p>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456789:ABC-DEF..."
            className="w-full px-3 py-2 pr-10 border border-stone-300 rounded-lg text-sm font-mono focus:border-blue-600 outline-none"
          />
          <button
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={testConnection}
            disabled={testing || !token.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-stone-300 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Tokenni tekshirish
          </button>
          <button
            onClick={saveAll}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Saqlash
          </button>
        </div>
        {botInfo && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-900">
            ✓ Bot ulandi: <strong>@{botInfo.username}</strong> ({botInfo.first_name})
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Qabul qiluvchilar</h3>
          </div>
          <button
            onClick={() => setShowRecipientForm(!showRecipientForm)}
            className="text-emerald-700 hover:bg-emerald-100 p-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showRecipientForm && (
          <RecipientForm
            onSubmit={addRecipient}
            onCancel={() => setShowRecipientForm(false)}
          />
        )}

        {recipients.length === 0 && !showRecipientForm && (
          <div className="p-4 text-center text-sm text-slate-400">
            Qabul qiluvchi yo'q. Yuqoridagi + tugmasidan qo'shing.
          </div>
        )}

        <div className="divide-y divide-stone-100">
          {recipients.map(rec => (
            <div key={rec.id} className="px-4 py-3">
              {editingRecId === rec.id ? (
                <RecipientForm
                  initial={rec}
                  onSubmit={(data) => updateRecipient(rec.id, data)}
                  onCancel={() => setEditingRecId(null)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium ${rec.enabled === false ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {rec.name}
                      </p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        rec.reportType === 'drinks' ? 'bg-blue-100 text-blue-800' :
                        rec.reportType === 'owner' ? 'bg-amber-100 text-amber-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {rec.reportType === 'drinks' ? 'SUVLAR' : rec.reportType === 'owner' ? 'EGASI' : "TO'LIQ"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{rec.chatId}</p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => sendTest(rec)}
                      disabled={!token.trim()}
                      className="p-1.5 text-blue-500 hover:bg-blue-50 disabled:text-stone-300 rounded"
                      title="Test yuborish"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleEnabled(rec.id)}
                      className="p-1.5 text-slate-500 hover:bg-stone-100 rounded"
                      title={rec.enabled === false ? "Yoqish" : "O'chirish"}
                    >
                      {rec.enabled === false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditingRecId(rec.id)}
                      className="p-1.5 text-slate-500 hover:bg-stone-100 rounded"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteRecipient(rec.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============== RECIPIENT FORM ==============
function RecipientForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [chatId, setChatId] = useState(initial?.chatId || '');
  const [reportType, setReportType] = useState(initial?.reportType || 'owner');

  function submit() {
    if (!name.trim() || !chatId.trim()) return;
    onSubmit({ name: name.trim(), chatId: chatId.trim(), reportType });
  }

  return (
    <div className="bg-stone-50 border-y border-stone-200 p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">
        {initial ? "Tahrirlash" : "Yangi qabul qiluvchi"}
      </p>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Nomi</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Masalan: Akmal aka (egasi)"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-blue-600 outline-none"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Chat ID</span>
        <input
          type="text"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="123456789"
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono focus:border-blue-600 outline-none"
        />
        <p className="text-[10px] text-slate-500 mt-1">
          @userinfobot orqali oling
        </p>
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600 uppercase">Hisobot turi</span>
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:border-blue-600 outline-none bg-white"
        >
          <option value="drinks">🥤 Faqat suvlar (tushum + foyda)</option>
          <option value="owner">☕ Egasi uchun (somsa, chiqimlar, oylik)</option>
          <option value="full">📊 To'liq hisobot</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} className="bg-stone-200 hover:bg-stone-300 text-slate-700 font-semibold py-2 rounded-lg text-sm">
          Bekor
        </button>
        <button onClick={submit} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm">
          Saqlash
        </button>
      </div>
    </div>
  );
}

// ============== TELEGRAM REPORT BUILDERS ==============
function buildDrinksReport(date, drinkStats) {
  let txt = `🥤 <b>Suvlar hisoboti</b>\n`;
  txt += `📅 ${formatUzbDateFull(date)}\n\n`;
  txt += `📦 Jami sotildi: <b>${drinkStats.totalSold}</b> dona\n`;
  txt += `💰 Tushum: <b>${fmtSom(drinkStats.totalRevenue)}</b>\n`;
  txt += `✨ Sof foyda: <b>${fmtSom(drinkStats.totalProfit)}</b>\n\n`;
  if (drinkStats.perDrink.some(p => p.sold > 0)) {
    txt += `<b>Tafsilotlar:</b>\n`;
    drinkStats.perDrink.filter(p => p.sold > 0).forEach(p => {
      txt += `• ${escapeHTML(p.drink.name)} — ${p.sold} × ${fmt(p.drink.salePrice)} = <b>${fmt(p.revenue)}</b>\n`;
    });
  }
  txt += `\n— Choyxona Hisobchi`;
  return txt;
}

function buildOwnerReport(date, categories, transactions, stats, drinkStats, cashRegister, getPrevCash) {
  let txt = `☕ <b>Egasi uchun hisobot</b>\n`;
  txt += `📅 ${formatUzbDateFull(date)}\n\n`;

  categories.income.filter(c => c.perUnit).forEach(cat => {
    const ud = stats.perUnitDetails[cat.id];
    if (ud) {
      txt += `${cat.icon} <b>${escapeHTML(cat.name).toUpperCase()}</b>\n`;
      txt += `├ Sotildi: <b>${ud.qty}</b> dona\n`;
      if (ud.qtyEaten > 0) {
        txt += `├ Ishchilar yedi: ${ud.qtyEaten} dona\n`;
      }
      txt += `└ Tushum: <b>${fmtSom(stats.incomeByCategory[cat.id] || 0)}</b>\n\n`;
    }
  });

  categories.income.filter(c => !c.perUnit).forEach(cat => {
    const amount = stats.incomeByCategory[cat.id];
    if (amount > 0) {
      txt += `${cat.icon || '💰'} <b>${escapeHTML(cat.name).toUpperCase()}</b>\n`;
      if (cat.hasCommission) {
        const totalSales = transactions.filter(t => t.type === 'income' && t.categoryId === cat.id)
          .reduce((s, t) => s + Number(t.amount), 0);
        txt += `├ Umumiy sotuv: ${fmt(totalSales)}\n`;
        txt += `└ Sizning ulushingiz (${cat.commissionPercent}%): <b>${fmtSom(amount)}</b>\n\n`;
      } else if (cat.autoFromDrinks) {
        txt += `└ Tushum: <b>${fmtSom(amount)}</b> (${drinkStats.totalSold} dona)\n\n`;
      } else {
        txt += `└ Tushum: <b>${fmtSom(amount)}</b>\n\n`;
      }
    }
  });

  txt += `📊 <b>JAMI TUSHUM: ${fmtSom(stats.totalIncome)}</b>\n\n`;

  txt += `💸 <b>CHIQIMLAR:</b>\n`;
  const expEntries = Object.entries(stats.expenseByCategory).sort((a, b) => b[1] - a[1]);
  if (expEntries.length === 0) {
    txt += `Bugun chiqim yo'q\n`;
  } else {
    expEntries.forEach(([catId, amount]) => {
      const cat = categories.expense.find(c => c.id === catId);
      if (!cat) return;
      txt += `• ${escapeHTML(cat.name)}: <b>${fmt(amount)}</b>\n`;

      if (cat.trackPayee) {
        const payeeTxs = transactions.filter(t => t.type === 'expense' && t.categoryId === catId && t.payee);
        if (payeeTxs.length > 0) {
          payeeTxs.forEach(tx => {
            txt += `   └ ${escapeHTML(tx.payee)}: ${fmt(tx.amount)}\n`;
          });
        }
      }
    });
  }
  txt += `\n<b>JAMI CHIQIM: ${fmtSom(stats.totalExpense)}</b>\n\n`;

  const net = stats.totalIncome - stats.totalExpense;
  txt += `📈 <b>SOF FOYDA: ${net >= 0 ? '+' : ''}${fmtSom(net)}</b>\n`;

  const cashRec = cashRegister[date];
  const counted = cashRec
    ? (cashRec.countedCash !== undefined && cashRec.countedCash !== null
        ? cashRec.countedCash
        : (cashRec.endCash !== undefined && cashRec.endCash !== null ? cashRec.endCash : null))
    : null;
  if (counted !== null) {
    const naqdSavdo = stats.totalIncome - stats.totalCashless;
    const diff = Number(counted) - naqdSavdo;
    txt += `\n💰 <b>KASSA BALANSI:</b>\n`;
    txt += `Naqd savdo: ${fmt(naqdSavdo)}\n`;
    txt += `Kassada yig'ilgan: ${fmt(counted)}\n`;
    if (diff === 0) {
      txt += `✅ Mos keldi\n`;
    } else {
      txt += `⚠️ Farq: ${diff > 0 ? '+' : ''}${fmt(diff)}\n`;
    }
  }

  txt += `\n— Choyxona Hisobchi`;
  return txt;
}

// ============== REPORTS TAB ==============
function ReportsTab({ categories, transactions, drinkDaily, drinks }) {
  const [period, setPeriod] = useState('week');

  const stats = useMemo(() => {
    const now = new Date();
    let startDate = new Date(0);
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 29);
    }
    const startStr = startDate.toISOString().split('T')[0];

    const filtered = transactions.filter(t => t.date >= startStr);
    const dayMap = {};
    let totalIncome = 0, totalExpense = 0;
    const incomeByCategory = {}, expenseByCategory = {};

    filtered.forEach(t => {
      if (!dayMap[t.date]) dayMap[t.date] = { income: 0, expense: 0 };
      if (t.type === 'income') {
        const cat = categories.income.find(c => c.id === t.categoryId);
        const real = cat?.hasCommission
          ? Number(t.amount) * (Number(cat.commissionPercent) || 0) / 100
          : Number(t.amount);
        dayMap[t.date].income += real;
        totalIncome += real;
        incomeByCategory[t.categoryId] = (incomeByCategory[t.categoryId] || 0) + real;
      } else {
        dayMap[t.date].expense += Number(t.amount);
        totalExpense += Number(t.amount);
        expenseByCategory[t.categoryId] = (expenseByCategory[t.categoryId] || 0) + Number(t.amount);
      }
    });

    Object.keys(drinkDaily).filter(d => d >= startStr).forEach(d => {
      const dayRec = drinkDaily[d];
      let dayDrinkRev = 0;
      drinks.forEach(drink => {
        const rec = dayRec[drink.id];
        if (!rec || rec.endStock === null || rec.endStock === undefined || rec.endStock === '') return;
        const sold = Math.max(0, Number(rec.startStock || 0) + Number(rec.added || 0) - Number(rec.endStock));
        const rev = sold * Number(drink.salePrice || 0);
        dayDrinkRev += rev;
      });
      if (dayDrinkRev > 0) {
        if (!dayMap[d]) dayMap[d] = { income: 0, expense: 0 };
        dayMap[d].income += dayDrinkRev;
        totalIncome += dayDrinkRev;
        const suvCat = categories.income.find(c => c.autoFromDrinks);
        if (suvCat) {
          incomeByCategory[suvCat.id] = (incomeByCategory[suvCat.id] || 0) + dayDrinkRev;
        }
      }
    });

    const days = Object.keys(dayMap).sort();
    return { dayMap, days, totalIncome, totalExpense, incomeByCategory, expenseByCategory };
  }, [transactions, period, categories, drinkDaily, drinks]);

  const net = stats.totalIncome - stats.totalExpense;
  const maxDay = Math.max(...stats.days.map(d => Math.max(stats.dayMap[d].income, stats.dayMap[d].expense)), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-5 h-5 text-slate-700" />
        <h2 className="text-lg font-semibold text-slate-900">Hisobotlar</h2>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-1 grid grid-cols-3 gap-1">
        {[
          { id: 'week', label: '7 kun' },
          { id: 'month', label: '30 kun' },
          { id: 'all', label: 'Barchasi' },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
              period === p.id ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-stone-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={`rounded-xl p-4 text-white ${
        net >= 0 ? 'bg-gradient-to-br from-emerald-700 to-emerald-900' : 'bg-gradient-to-br from-rose-700 to-rose-900'
      }`}>
        <p className="text-xs opacity-80">Sof natija</p>
        <p className="text-2xl font-bold mt-1">{net >= 0 ? '+' : ''}{fmtSom(net)}</p>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/20">
          <div>
            <p className="text-[11px] opacity-70">Tushum</p>
            <p className="text-sm font-semibold">{fmtSom(stats.totalIncome)}</p>
          </div>
          <div>
            <p className="text-[11px] opacity-70">Chiqim</p>
            <p className="text-sm font-semibold">{fmtSom(stats.totalExpense)}</p>
          </div>
        </div>
      </div>

      {stats.days.length > 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-sm font-semibold text-slate-900 mb-3">Kunlik dinamika</p>
          <div className="space-y-2">
            {stats.days.slice(-30).reverse().map(d => {
              const { income, expense } = stats.dayMap[d];
              const incPct = (income / maxDay) * 100;
              const expPct = (expense / maxDay) * 100;
              return (
                <div key={d}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-600 font-medium">{formatUzbDate(d)}</span>
                    <span className={`font-bold ${income - expense >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {income - expense >= 0 ? '+' : ''}{fmt(income - expense)}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${incPct}%` }} />
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${expPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-stone-100 text-[10px]">
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full" /> Tushum</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 rounded-full" /> Chiqim</span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-slate-400">
          Bu davrda ma'lumot yo'q
        </div>
      )}

      {Object.keys(stats.incomeByCategory).length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-2.5 border-b border-stone-200">
            <h3 className="text-sm font-semibold text-emerald-900">Tushum bo'limlari bo'yicha</h3>
          </div>
          <div className="divide-y divide-stone-100">
            {categories.income
              .filter(c => stats.incomeByCategory[c.id])
              .sort((a, b) => stats.incomeByCategory[b.id] - stats.incomeByCategory[a.id])
              .map(cat => {
                const amount = stats.incomeByCategory[cat.id];
                const pct = (amount / stats.totalIncome) * 100;
                return (
                  <div key={cat.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium text-slate-900">{cat.icon} {cat.name}</p>
                      <p className="text-sm font-bold text-emerald-700">{fmtSom(amount)}</p>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{pct.toFixed(1)}%</p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {Object.keys(stats.expenseByCategory).length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-rose-50 px-4 py-2.5 border-b border-stone-200">
            <h3 className="text-sm font-semibold text-rose-900">Chiqim bo'limlari bo'yicha</h3>
          </div>
          <div className="divide-y divide-stone-100">
            {categories.expense
              .filter(c => stats.expenseByCategory[c.id])
              .sort((a, b) => stats.expenseByCategory[b.id] - stats.expenseByCategory[a.id])
              .map(cat => {
                const amount = stats.expenseByCategory[cat.id];
                const pct = (amount / stats.totalExpense) * 100;
                return (
                  <div key={cat.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium text-slate-900">{cat.name}</p>
                      <p className="text-sm font-bold text-rose-700">{fmtSom(amount)}</p>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{pct.toFixed(1)}%</p>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
