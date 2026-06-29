// ============================================================
// numbers.js — formatlash va parsing yordamchilar
// ============================================================

// "230k" → 230000, "1.5k" → 1500, "1m" → 1000000, "230" → 230
// Qabul qiladi: lotincha k/m, kirilcha к/м, bo'sh joylar, vergullar
export function parseAmount(input) {
  if (input === null || input === undefined) return 0;
  let s = String(input).trim();
  if (!s) return 0;
  // Bo'sh joy va vergullarni olib tashlash (formatlash artefaktlari)
  s = s.replace(/[\s,]/g, '');
  // Suffiks tekshirish
  const lastChar = s.charAt(s.length - 1).toLowerCase();
  let multiplier = 1;
  if (lastChar === 'k' || lastChar === 'к') {
    multiplier = 1000;
    s = s.slice(0, -1);
  } else if (lastChar === 'm' || lastChar === 'м') {
    multiplier = 1000000;
    s = s.slice(0, -1);
  }
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  return Math.round(num * multiplier);
}

// Format raqam: 1234567 → "1 234 567"
export const formatNumber = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));

// onKeyDown helperi: Enter bossa onSave chaqiradi
export function enterToSave(onSave) {
  return (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave();
    }
  };
}
