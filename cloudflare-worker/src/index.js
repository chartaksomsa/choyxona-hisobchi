// Choyxona Hisobchi — Cloudflare Worker (cron scheduler)
// Vazifasi:
// 1. Belgilangan vaqtda Telegram'ga avto-hisobotlar yuborish
// 2. Ertalab/kechqurun ob-havo ogohlantirishlari
//
// Setup: cloudflare-worker/README.md ga qarang

// === HELPERS ===
const TZ_OFFSET = 5; // O'zbekiston UTC+5

function fmt(n) {
  if (n == null || n === '') return '0';
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
function fmtSom(n) { return `${fmt(n)} so'm`; }

function todayLocal() {
  const now = Date.now() + TZ_OFFSET * 3600 * 1000;
  return new Date(now).toISOString().split('T')[0];
}
function nowHM() {
  const now = Date.now() + TZ_OFFSET * 3600 * 1000;
  const d = new Date(now);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function escapeHTML(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function formatUzbDateFull(s) {
  if (!s) return '';
  const months = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const days = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  const d = new Date(s + 'T00:00:00');
  return `${days[d.getDay()]}, ${d.getDate()}-${months[d.getMonth()]} ${d.getFullYear()}-yil`;
}

// === SUPABASE READ ===
async function supaGet(env, table, params) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_KEY,
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${table} ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchUserData(env, userId) {
  // app_data — barcha jsonb yozuvlar
  const dataRows = await supaGet(env, 'app_data', `user_id=eq.${userId}&select=key,value`);
  const data = {};
  for (const r of dataRows) data[r.key] = r.value;

  // app_transactions — bugungi yozuvlar
  const today = todayLocal();
  const txs = await supaGet(env, 'app_transactions', `user_id=eq.${userId}&date=eq.${today}&select=*`);
  // Field'larni v3+ formatga moslash
  const transactions = txs.map(r => ({
    id: r.id,
    type: r.type,
    categoryId: r.category_id,
    amount: Number(r.amount) || 0,
    date: r.date,
    qty: r.qty,
    qtyEaten: r.qty_eaten,
    note: r.note,
    payee: r.payee,
    payeeWorkerId: r.payee_worker_id,
    paymentMethod: r.payment_method,
    createdAt: r.created_at,
  }));

  return {
    categories: data.categories || { income: [], expense: [] },
    drinks: data.drinks || [],
    drinkDaily: data.drink_daily || {},
    cashRegister: data.cash_register || {},
    workers: data.workers || [],
    debts: data.debts || [],
    tgConfig: data.tg_config || {},
    transactions,
  };
}

// === COMPUTE ===
function computeStats(date, data) {
  const { categories, transactions } = data;
  const incomeByCategory = {}, expenseByCategory = {}, perUnitDetails = {};
  let totalIncome = 0, totalExpense = 0;
  let cardIncome = 0, cashIncome = 0;
  let cashlessExpense = 0, cashExpense = 0;

  for (const t of transactions) {
    if (t.type === 'income') {
      const cat = categories.income.find(c => c.id === t.categoryId);
      let realAmount;
      if (cat?.perUnit && cat?.trackEaten && t.qty != null) {
        const sold = Math.max(0, Number(t.qty) - Number(t.qtyEaten || 0));
        realAmount = sold * Number(cat.unitPrice || 0);
      } else if (cat?.hasCommission) {
        realAmount = Number(t.amount) * (Number(cat.commissionPercent) || 0) / 100;
      } else {
        realAmount = Number(t.amount);
      }
      incomeByCategory[t.categoryId] = (incomeByCategory[t.categoryId] || 0) + realAmount;
      totalIncome += realAmount;
      if (t.paymentMethod === 'card') cardIncome += realAmount;
      else cashIncome += realAmount;
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
      else cashExpense += Number(t.amount);
    }
  }

  // Suvlar
  const dayRec = data.drinkDaily?.[date] || {};
  let drinkRevenue = 0, drinkProfit = 0, drinkSold = 0;
  const perDrink = [];
  for (const drink of (data.drinks || [])) {
    const rec = dayRec[drink.id] || {};
    const start = Number(rec.startStock || 0);
    const added = Number(rec.added || 0);
    const end = (rec.endStock !== undefined && rec.endStock !== null && rec.endStock !== '')
      ? Number(rec.endStock) : null;
    const sold = end !== null ? Math.max(0, start + added - end) : 0;
    const revenue = sold * Number(drink.salePrice || 0);
    const profit = sold * (Number(drink.salePrice || 0) - Number(drink.purchasePrice || 0));
    drinkRevenue += revenue; drinkProfit += profit; drinkSold += sold;
    perDrink.push({ drink, start, added, end, sold, revenue, profit, hasEnd: end !== null });
  }
  const suvCat = categories.income.find(c => c.autoFromDrinks);
  if (suvCat && drinkRevenue > 0) {
    incomeByCategory[suvCat.id] = (incomeByCategory[suvCat.id] || 0) + drinkRevenue;
    totalIncome += drinkRevenue;
    cashIncome += drinkRevenue;
  }

  const totalCashless = cardIncome + cashlessExpense;
  const expectedCash = cashIncome - cashExpense;
  const drinkStats = { totalRevenue: drinkRevenue, totalProfit: drinkProfit, totalSold: drinkSold, perDrink };

  return {
    incomeByCategory, expenseByCategory, perUnitDetails,
    totalIncome, totalExpense, totalCashless,
    cardIncome, cashIncome, cashlessExpense, cashExpense, expectedCash,
    drinkStats,
  };
}

// === REPORT BUILDERS (qisqartirilgan, asosiy) ===
function buildOwnerReport(date, data, stats) {
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
    for (const cat of data.categories.income) {
      if (!stats.incomeByCategory[cat.id]) continue;
      const a = stats.incomeByCategory[cat.id];
      let extra = '';
      if (cat.hasCommission) extra = ` [${cat.commissionPercent}% ulush]`;
      if (cat.perUnit) {
        const ud = stats.perUnitDetails[cat.id];
        if (ud) extra = ` (${Math.max(0, ud.qty - ud.qtyEaten)} dona)`;
      }
      lines.push(`• ${cat.icon || ''} ${escapeHTML(cat.name)}: <b>${fmtSom(a)}</b>${extra}`);
    }
    lines.push('');
  }

  if (Object.keys(stats.expenseByCategory).length > 0) {
    lines.push(`<b>📉 Chiqimlar:</b>`);
    for (const cat of data.categories.expense) {
      if (!stats.expenseByCategory[cat.id]) continue;
      const a = stats.expenseByCategory[cat.id];
      lines.push(`• ${escapeHTML(cat.name)}: <b>${fmtSom(a)}</b>${cat.isCashless ? ' 💳' : ''}`);
    }
    lines.push('');
  }

  if (stats.totalCashless > 0) {
    lines.push(`<b>Naqd:</b> ${fmtSom(stats.cashIncome)}`);
    lines.push(`<b>💳 Plastik:</b> ${fmtSom(stats.totalCashless)}`);
    lines.push('');
  }

  const cr = data.cashRegister[date];
  const counted = cr?.countedCash !== undefined && cr?.countedCash !== null
    ? cr.countedCash : cr?.endCash;
  if (counted !== null && counted !== undefined && counted !== '') {
    const diff = Number(counted) - stats.expectedCash;
    lines.push(`<b>💼 Kassada bo'lishi kerak:</b> ${fmtSom(stats.expectedCash)}`);
    lines.push(`<b>Sanab kiritildi:</b> ${fmtSom(counted)}`);
    if (diff === 0) lines.push(`✅ Mukammal balans`);
    else lines.push(`${Math.abs(diff) < 1000 ? '⚠️' : '❌'} Farq: ${diff > 0 ? '+' : ''}${fmtSom(diff)}`);
    lines.push('');
  }

  if (stats.drinkStats.totalSold > 0) {
    lines.push(`<b>🥤 Suvlar:</b> ${stats.drinkStats.totalSold} dona, ${fmtSom(stats.drinkStats.totalRevenue)} (foyda: ${fmtSom(stats.drinkStats.totalProfit)})`);
  }

  lines.push('');
  lines.push(`<i>🤖 Cloudflare Worker tomonidan avto-yuborildi</i>`);
  return lines.join('\n');
}

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
  for (const d of drinkStats.perDrink) {
    if (!d.hasEnd) {
      lines.push(`• ${escapeHTML(d.drink.name)}: <i>kiritilmagan</i>`);
    } else {
      lines.push(`• ${escapeHTML(d.drink.name)}: ${d.start}+${d.added}−${d.end} = <b>${d.sold} dona</b> (${fmt(d.revenue)} so'm)`);
    }
  }
  lines.push('');
  lines.push(`<i>🤖 Cloudflare Worker tomonidan avto-yuborildi</i>`);
  return lines.join('\n');
}

function buildReport(reportType, date, data, stats) {
  switch (reportType) {
    case 'drinks':
    case 'drinks_detailed':
      return buildDrinksReport(date, stats.drinkStats);
    case 'owner':
    case 'owner_detailed':
    case 'full':
    default:
      return buildOwnerReport(date, data, stats);
  }
}

// === TELEGRAM ===
async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const MAX = 3800;
  const parts = [];
  if (text.length <= MAX) {
    parts.push(text);
  } else {
    let buf = '';
    for (const line of text.split('\n')) {
      if ((buf + line + '\n').length > MAX) { parts.push(buf); buf = line + '\n'; }
      else { buf += line + '\n'; }
    }
    if (buf) parts.push(buf);
  }
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] + (parts.length > 1 ? `\n<i>(${i+1}/${parts.length})</i>` : '');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: 'HTML' })
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Telegram error:', body);
      return false;
    }
    if (i < parts.length - 1) await new Promise(r => setTimeout(r, 350));
  }
  return true;
}

// === WEATHER ===
async function fetchWeather(env, city) {
  if (!env.OPENWEATHER_KEY) throw new Error('OPENWEATHER_KEY o\'rnatilmagan');
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${env.OPENWEATHER_KEY}&units=metric&lang=en`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OWM ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Ob-havo bahosi: bizga muhim narsa — somsa sotishga ta'sir qiladimi?
function evaluateForecast(forecast, mode) {
  // mode: 'morning' (8 AM, look at next 12h) | 'evening' (6 PM, look at evening + tomorrow morning)
  const list = forecast.list || [];
  const now = Math.floor(Date.now() / 1000);

  // Tegishli oraliqni tanlaymiz
  let relevant;
  if (mode === 'morning') {
    // Keyingi 12 soat (4 ta 3-soatli interval)
    relevant = list.filter(f => f.dt > now && f.dt < now + 12 * 3600).slice(0, 4);
  } else {
    // 18:00 dan ertaga 12:00 gacha — 18 soat
    relevant = list.filter(f => f.dt > now && f.dt < now + 18 * 3600).slice(0, 6);
  }

  const warnings = [];
  for (const f of relevant) {
    const time = new Date(f.dt * 1000 + TZ_OFFSET * 3600 * 1000);
    const timeStr = `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`;
    const temp = Math.round(f.main?.temp ?? 0);
    const wind = f.wind?.speed ?? 0; // m/s
    const gust = f.wind?.gust ?? 0;
    const rain = f.rain?.['3h'] ?? 0;
    const snow = f.snow?.['3h'] ?? 0;
    const desc = f.weather?.[0]?.description || '';
    const main = f.weather?.[0]?.main || '';

    // Kuchli shamol — chang ko'taradi
    if (gust >= 15 || wind >= 12) {
      warnings.push(`🌪 ${timeStr} — kuchli shamol (${wind.toFixed(0)}-${gust.toFixed(0)} m/s), chang ko'tarilishi mumkin`);
    } else if (wind >= 9) {
      warnings.push(`💨 ${timeStr} — shamolli (${wind.toFixed(0)} m/s)`);
    }

    // Yomg'ir
    if (rain >= 3) {
      warnings.push(`🌧 ${timeStr} — kuchli yomg'ir (${rain.toFixed(1)} mm)`);
    } else if (rain >= 1) {
      warnings.push(`🌦 ${timeStr} — yomg'ir kutilmoqda`);
    }

    // Qor
    if (snow >= 1) {
      warnings.push(`❄️ ${timeStr} — qor (${snow.toFixed(1)} mm)`);
    }

    // Issiqlik (38+ darajada odamlar uyda o'tiradi)
    if (temp >= 40) {
      warnings.push(`🥵 ${timeStr} — juda issiq (${temp}°C)`);
    }

    // Bo'ron / momaqaldiroq
    if (main === 'Thunderstorm') {
      warnings.push(`⛈ ${timeStr} — momaqaldiroq`);
    }
  }

  // Takrorlanuvchi xabarlarni tozalash
  const seen = new Set();
  return warnings.filter(w => {
    if (seen.has(w)) return false;
    seen.add(w);
    return true;
  }).slice(0, 5); // Eng ko'pi 5 ta
}

function buildWeatherWarning(city, mode, warnings) {
  const lines = [];
  if (mode === 'morning') {
    lines.push(`<b>🌤 Ertalabki ob-havo ogohlantirishi</b>`);
    lines.push(`<i>${escapeHTML(city)} — bugun</i>`);
  } else {
    lines.push(`<b>🌙 Kechki ob-havo ogohlantirishi</b>`);
    lines.push(`<i>${escapeHTML(city)} — keyingi 18 soat</i>`);
  }
  lines.push('');
  lines.push(`<b>⚠️ Diqqat — savdoga ta'sir qilishi mumkin:</b>`);
  for (const w of warnings) lines.push(w);
  lines.push('');
  if (mode === 'evening') {
    lines.push(`<i>🌶 Somsa ertaga sotilishi kerak — ehtiyot bo'ling.</i>`);
  } else {
    lines.push(`<i>💡 Mijozlar kamayishi mumkin, somsa miqdorini moslang.</i>`);
  }
  lines.push(`<i>🤖 Cloudflare Worker</i>`);
  return lines.join('\n');
}

// === SCHEDULER MAIN ===
async function runScheduler(env, manualUserId = null) {
  const currentTime = nowHM();
  const today = todayLocal();
  console.log(`Worker fired at ${currentTime} (Tashkent), date ${today}`);

  // Hamma user'lar uchun tg_config'ni olish
  let configs;
  if (manualUserId) {
    configs = await supaGet(env, 'app_data', `user_id=eq.${manualUserId}&key=eq.tg_config&select=user_id,value`);
  } else {
    configs = await supaGet(env, 'app_data', `key=eq.tg_config&select=user_id,value`);
  }

  let actions = 0;
  for (const row of configs) {
    const userId = row.user_id;
    const cfg = row.value || {};
    if (!cfg.botToken) continue;

    let userData = null; // Lazy load — keraksiz fetchlardan saqlanish

    // 1. Recipient avto-jadvallar
    for (const r of (cfg.recipients || [])) {
      if (!r.autoSchedule?.enabled) continue;
      if (r.enabled === false) continue;
      const target = r.autoSchedule.time;
      if (!target || target !== currentTime) continue;

      try {
        if (!userData) userData = await fetchUserData(env, userId);
        const stats = computeStats(today, userData);
        const report = buildReport(r.reportType || 'owner', today, userData, stats);
        const ok = await sendTelegram(cfg.botToken, r.chatId, report);
        if (ok) {
          actions++;
          console.log(`Sent ${r.reportType} to ${r.name} (${r.chatId})`);
        }
      } catch (e) {
        console.error(`Auto-send failed for ${r.name}:`, e.message);
      }
    }

    // 2. Ob-havo ogohlantirish
    const w = cfg.weather;
    if (w?.enabled && w.chatId && w.city) {
      let mode = null;
      if (currentTime === '08:00') mode = 'morning';
      else if (currentTime === '18:00') mode = 'evening';

      if (mode) {
        try {
          const forecast = await fetchWeather(env, w.city);
          const warnings = evaluateForecast(forecast, mode);
          if (warnings.length > 0) {
            const text = buildWeatherWarning(w.city, mode, warnings);
            const ok = await sendTelegram(cfg.botToken, w.chatId, text);
            if (ok) {
              actions++;
              console.log(`Sent ${mode} weather warning (${warnings.length} alerts) to ${w.chatId}`);
            }
          } else {
            console.log(`No weather warnings for ${w.city} (${mode})`);
          }
        } catch (e) {
          console.error(`Weather check failed for ${w.city}:`, e.message);
        }
      }
    }
  }

  return { actions, time: currentTime };
}

// === ENTRY POINTS ===
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduler(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      const userId = url.searchParams.get('user_id');
      try {
        const result = await runScheduler(env, userId);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(`Error: ${e.message}`, { status: 500 });
      }
    }
    if (url.pathname === '/test-weather') {
      const city = url.searchParams.get('city') || 'Tashkent';
      try {
        const f = await fetchWeather(env, city);
        const morning = evaluateForecast(f, 'morning');
        const evening = evaluateForecast(f, 'evening');
        return new Response(JSON.stringify({ city, morning, evening }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(`Error: ${e.message}`, { status: 500 });
      }
    }
    return new Response(`Choyxona Hisobchi Scheduler Worker.

Endpoints:
  GET /run                      — Hozirgi vaqtda jadval bo'yicha yuborish (manual test)
  GET /run?user_id=<uuid>       — Faqat bitta user uchun
  GET /test-weather?city=Tashkent — Ob-havo natijalarini tekshirish

Hozirgi vaqt (Tashkent): ${nowHM()}`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
