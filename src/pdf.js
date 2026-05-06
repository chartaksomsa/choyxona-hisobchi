// src/pdf.js — Oylik hisobot PDF eksport (v4)
// Bu fayl asosiy bundle'dan AJRATILGAN — faqat foydalanuvchi
// "PDF yuklab olish" tugmasini bosganda dinamik yuklanadi
// (App.jsx'da `await import('./pdf.js')` orqali).
//
// Font: Helvetica (jsPDF ichida bor). Uzbek Latin harflari uchun
// yetarli. Maxsus belgilar (egri apostrof, em-dash) sanitizatsiya
// qilinadi.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));

const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

// Helvetica (Latin-1) ga mos bo'lmagan belgilarni almashtirish.
// Uzbek matnida ko'p uchraydi: egri apostrof (' '), tirelar (— –).
function sanitize(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // egri apostroflar
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // egri qo'shtirnoqlar
    .replace(/[\u2013\u2014]/g, '-')              // en-dash, em-dash
    .replace(/[\u2026]/g, '...')                  // multinuqta
    .replace(/[\u00A0]/g, ' ');                   // non-breaking space
}
const s = sanitize;

export function exportMonthlyPDF({ year, month, categories, transactions, drinks, drinkDaily, cashRegister, debts, workers }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'normal');

  const monthName = MONTHS[month];
  const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // === HEADER ===
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 251, 235);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(s('CHOYXONA HISOBOTI'), W / 2, 14, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(s(`${monthName} ${year}`), W / 2, 22, { align: 'center' });

  doc.setTextColor(30, 30, 30);
  let y = 40;

  const monthTxs = transactions.filter(t => t.date >= startStr && t.date <= endStr);

  // Sum income/expense by category
  const incByCat = {}, expByCat = {}, perUnitByCat = {};
  let totalIncome = 0, totalExpense = 0, totalCashlessExp = 0, totalCardIncome = 0;
  monthTxs.forEach(t => {
    if (t.type === 'income') {
      const cat = categories.income.find(c => c.id === t.categoryId);
      const real = cat?.hasCommission
        ? Number(t.amount) * (Number(cat.commissionPercent) || 0) / 100
        : Number(t.amount);
      incByCat[t.categoryId] = (incByCat[t.categoryId] || 0) + real;
      totalIncome += real;
      if (t.paymentMethod === 'card') totalCardIncome += real;
      if (t.qty) {
        if (!perUnitByCat[t.categoryId]) perUnitByCat[t.categoryId] = { qty: 0, qtyEaten: 0 };
        perUnitByCat[t.categoryId].qty += Number(t.qty);
        perUnitByCat[t.categoryId].qtyEaten += Number(t.qtyEaten || 0);
      }
    } else {
      expByCat[t.categoryId] = (expByCat[t.categoryId] || 0) + Number(t.amount);
      totalExpense += Number(t.amount);
      const cat = categories.expense.find(c => c.id === t.categoryId);
      if (cat?.isCashless) totalCashlessExp += Number(t.amount);
    }
  });

  // Drinks revenue
  let drinksRevenue = 0, drinksProfit = 0, drinksSold = 0;
  Object.keys(drinkDaily || {}).filter(d => d >= startStr && d <= endStr).forEach(d => {
    const dayRec = drinkDaily[d];
    drinks.forEach(drink => {
      const rec = dayRec[drink.id];
      if (!rec || rec.endStock === null || rec.endStock === undefined || rec.endStock === '') return;
      const sold = Math.max(0, Number(rec.startStock || 0) + Number(rec.added || 0) - Number(rec.endStock));
      drinksSold += sold;
      drinksRevenue += sold * Number(drink.salePrice || 0);
      drinksProfit += sold * (Number(drink.salePrice || 0) - Number(drink.purchasePrice || 0));
    });
  });
  const suvCat = categories.income.find(c => c.autoFromDrinks);
  if (suvCat && drinksRevenue > 0) {
    incByCat[suvCat.id] = (incByCat[suvCat.id] || 0) + drinksRevenue;
    totalIncome += drinksRevenue;
  }

  const totalPlastik = totalCardIncome + totalCashlessExp;
  const totalNaqd = totalIncome - totalPlastik;
  const net = totalIncome - totalExpense;

  // === SUMMARY BOX ===
  doc.setFillColor(245, 245, 244);
  doc.rect(15, y, W - 30, 36, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(s('OYLIK XULOSA'), 20, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(5, 150, 105);
  doc.text(s(`Tushum:  ${fmt(totalIncome)} so'm`), 20, y + 14);
  doc.setTextColor(190, 18, 60);
  doc.text(s(`Chiqim:  ${fmt(totalExpense)} so'm`), 20, y + 20);
  doc.setTextColor(net >= 0 ? 5 : 190, net >= 0 ? 150 : 18, net >= 0 ? 105 : 60);
  doc.setFont('helvetica', 'bold');
  doc.text(s(`Sof:     ${net >= 0 ? '+' : ''}${fmt(net)} so'm`), 20, y + 26);
  if (totalPlastik > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(s(`Naqd: ${fmt(totalNaqd)} | Plastik: ${fmt(totalPlastik)}`), 20, y + 32);
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  y += 44;

  // === INCOME TABLE ===
  if (Object.keys(incByCat).length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(s('TUSHUMLAR'), 15, y);
    y += 4;
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');

    const incRows = categories.income
      .filter(c => incByCat[c.id])
      .sort((a, b) => incByCat[b.id] - incByCat[a.id])
      .map(cat => {
        const amount = incByCat[cat.id];
        let detail = '';
        const ud = perUnitByCat[cat.id];
        if (ud) detail = `${ud.qty} dona${ud.qtyEaten > 0 ? ` (${ud.qtyEaten} yedi)` : ''}`;
        if (cat.hasCommission) detail = `${cat.commissionPercent}% ulush`;
        if (cat.autoFromDrinks) detail = `${drinksSold} dona suv`;
        return [
          s(cat.name),
          s(detail),
          `${fmt(amount)} so'm`,
          `${((amount / totalIncome) * 100).toFixed(1)}%`
        ];
      });

    autoTable(doc, {
      startY: y,
      head: [[s("Bo'lim"), s('Izoh'), s('Summa'), s('%')]],
      body: incRows,
      foot: [[s('Jami'), '', `${fmt(totalIncome)} so'm`, '100%']],
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105], textColor: 255 },
      footStyles: { fillColor: [220, 252, 231], textColor: [5, 150, 105], fontStyle: 'bold' },
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // === EXPENSE TABLE ===
  if (Object.keys(expByCat).length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(190, 18, 60);
    doc.text(s('CHIQIMLAR'), 15, y);
    y += 4;
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');

    const expRows = categories.expense
      .filter(c => expByCat[c.id])
      .sort((a, b) => expByCat[b.id] - expByCat[a.id])
      .map(cat => {
        const amount = expByCat[cat.id];
        const linked = categories.income.find(c => c.id === cat.linkedTo);
        return [
          s(cat.name + (cat.isCashless ? ' (plastik)' : '')),
          s(linked ? linked.name : '-'),
          `${fmt(amount)} so'm`,
          `${((amount / totalExpense) * 100).toFixed(1)}%`
        ];
      });

    autoTable(doc, {
      startY: y,
      head: [[s("Bo'lim"), s('Aloqador'), s('Summa'), s('%')]],
      body: expRows,
      foot: [[s('Jami'), '', `${fmt(totalExpense)} so'm`, '100%']],
      theme: 'striped',
      headStyles: { fillColor: [190, 18, 60], textColor: 255 },
      footStyles: { fillColor: [254, 226, 226], textColor: [190, 18, 60], fontStyle: 'bold' },
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // === WORKER PAYMENTS (id orqali, ism o'zgarsa ham to'g'ri ishlaydi) ===
  const salaryTxs = monthTxs.filter(t => t.type === 'expense' && (t.payeeWorkerId || t.payee));
  if (salaryTxs.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text(s('ISHCHILAR OYLIGI'), 15, y);
    y += 4;
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');

    // Group by workerId (or payee name as fallback for old data)
    const byWorker = {};
    const workerById = (workers || []).reduce((m, w) => { m[w.id] = w; return m; }, {});
    salaryTxs.forEach(t => {
      let key, displayName;
      if (t.payeeWorkerId && workerById[t.payeeWorkerId]) {
        key = t.payeeWorkerId;
        displayName = workerById[t.payeeWorkerId].name;
      } else {
        key = t.payee || '_unknown';
        displayName = t.payee || "Noma'lum";
      }
      if (!byWorker[key]) byWorker[key] = { name: displayName, total: 0, count: 0 };
      byWorker[key].total += Number(t.amount);
      byWorker[key].count += 1;
    });
    const totalSalaries = Object.values(byWorker).reduce((sum, v) => sum + v.total, 0);

    autoTable(doc, {
      startY: y,
      head: [[s('Ishchi'), s('Necha marta'), s('Jami summa')]],
      body: Object.values(byWorker)
        .sort((a, b) => b.total - a.total)
        .map(v => [s(v.name), String(v.count), `${fmt(v.total)} so'm`]),
      foot: [[s('Jami'), '', `${fmt(totalSalaries)} so'm`]],
      theme: 'striped',
      headStyles: { fillColor: [180, 83, 9], textColor: 255 },
      footStyles: { fillColor: [254, 243, 199], textColor: [180, 83, 9], fontStyle: 'bold' },
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // === DAILY SUMMARY ===
  if (y > 200) { doc.addPage(); y = 20; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(s('KUNLIK XULOSA'), 15, y);
  y += 4;

  const dayMap = {};
  monthTxs.forEach(t => {
    if (!dayMap[t.date]) dayMap[t.date] = { income: 0, expense: 0 };
    if (t.type === 'income') {
      const cat = categories.income.find(c => c.id === t.categoryId);
      const real = cat?.hasCommission
        ? Number(t.amount) * (Number(cat.commissionPercent) || 0) / 100
        : Number(t.amount);
      dayMap[t.date].income += real;
    } else {
      dayMap[t.date].expense += Number(t.amount);
    }
  });
  Object.keys(drinkDaily || {}).filter(d => d >= startStr && d <= endStr).forEach(d => {
    const dayRec = drinkDaily[d];
    let dayRev = 0;
    drinks.forEach(drink => {
      const rec = dayRec[drink.id];
      if (!rec || rec.endStock === null || rec.endStock === undefined || rec.endStock === '') return;
      const sold = Math.max(0, Number(rec.startStock || 0) + Number(rec.added || 0) - Number(rec.endStock));
      dayRev += sold * Number(drink.salePrice || 0);
    });
    if (dayRev > 0) {
      if (!dayMap[d]) dayMap[d] = { income: 0, expense: 0 };
      dayMap[d].income += dayRev;
    }
  });

  const dayRows = Object.keys(dayMap).sort().map(d => {
    const { income, expense } = dayMap[d];
    const dn = income - expense;
    const dt = new Date(d);
    return [
      `${dt.getDate()}-${MONTHS[dt.getMonth()].toLowerCase()}`,
      `${fmt(income)}`,
      `${fmt(expense)}`,
      `${dn >= 0 ? '+' : ''}${fmt(dn)}`
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [[s('Sana'), s('Tushum'), s('Chiqim'), s('Sof')]],
    body: dayRows,
    theme: 'grid',
    headStyles: { fillColor: [60, 60, 60], textColor: 255 },
    margin: { left: 15, right: 15 },
    styles: { fontSize: 8 },
  });

  // === FOOTER ===
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      s(`Choyxona Hisobchi  •  ${new Date().toLocaleString('en-GB')}  •  ${i}/${pageCount}`),
      W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' }
    );
  }

  doc.save(`Choyxona-hisobot-${year}-${String(month + 1).padStart(2, '0')}.pdf`);
}
