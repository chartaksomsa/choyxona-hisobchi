// Theme: 'auto' | 'light' | 'dark'
// 'auto' — tizim sozlamasiga qarab (prefers-color-scheme)
// localStorage'da saqlanadi

const THEME_KEY = 'choyxona_theme';

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch (_) {}
  return 'auto';
}

export function setStoredTheme(t) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch (_) {}
  applyTheme(t);
}

export function applyTheme(t) {
  const root = document.documentElement;
  let isDark;
  if (t === 'dark') isDark = true;
  else if (t === 'light') isDark = false;
  else {
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  if (isDark) root.classList.add('dark');
  else root.classList.remove('dark');
}

// Tizim rejimi o'zgargan paytda 'auto' bo'lsa moslashtirish
export function watchSystemTheme() {
  if (!window.matchMedia) return () => {};
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getStoredTheme() === 'auto') applyTheme('auto');
  };
  if (mql.addEventListener) mql.addEventListener('change', handler);
  else mql.addListener(handler);
  return () => {
    if (mql.removeEventListener) mql.removeEventListener('change', handler);
    else mql.removeListener(handler);
  };
}
