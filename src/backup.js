// Backup va eksport yordamchilari
// JSON: butun loyiha ma'lumoti — qaytarib yuklash mumkin
// CSV: Excel'da ochiladigan tranzaksiyalar ro'yxati

export function exportJSON({ categories, transactions, drinks, drinkDaily, cashRegister, debts, workers, tgConfig }) {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 'v4.3',
    data: {
      categories, transactions, drinks, drinkDaily,
      cashRegister, debts, workers, tgConfig,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `choyxona-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTransactionsCSV({ categories, transactions, workers }) {
  const incCats = Object.fromEntries(categories.income.map(c => [c.id, c]));
  const expCats = Object.fromEntries(categories.expense.map(c => [c.id, c]));
  const wMap = Object.fromEntries((workers || []).map(w => [w.id, w]));

  const headers = ['Sana', 'Vaqt', 'Tur', "Bo'lim", 'Summa', "To'lov", 'Miqdor', 'Yedi', 'Kim', 'ID/Kod', 'Izoh'];
  const rows = [headers];

  const sorted = [...transactions].sort((a, b) => {
    const ta = new Date(a.createdAt || a.date).getTime();
    const tb = new Date(b.createdAt || b.date).getTime();
    return ta - tb;
  });

  for (const t of sorted) {
    const cat = t.type === 'income' ? incCats[t.categoryId] : expCats[t.categoryId];
    const time = t.createdAt ? new Date(t.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '';
    const w = t.payeeWorkerId ? wMap[t.payeeWorkerId] : null;
    rows.push([
      t.date,
      time,
      t.type === 'income' ? 'Tushum' : 'Chiqim',
      cat?.name || '—',
      Number(t.amount) || 0,
      t.paymentMethod === 'card' ? 'Plastik' : (cat?.isCashless ? 'Plastik' : 'Naqd'),
      t.qty || '',
      t.qtyEaten || '',
      t.payee || '',
      w?.code || '',
      (t.note || '').replace(/[\r\n]+/g, ' '),
    ]);
  }

  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(',')).join('\n');

  // BOM qo'shamiz Excel uchun (UTF-8 to'g'ri o'qilsin)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `choyxona-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importJSON(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload?.data) throw new Error("Backup fayli noto'g'ri formatda");
  return payload.data;
}
