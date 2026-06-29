// theme.js — sahifa ochilishida tungi/kunduzgi rejimni darhol qo'llash
// (FOUC — yonib-o'chish effektini oldini oladi)

const KEY = 'choyxona_theme';

export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (_) {}
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_) {}
  return 'light';
}

export function setStoredTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch (_) {}
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function watchSystemTheme() {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (e) => {
      // Faqat foydalanuvchi qo'lda tanlamagan bo'lsa tizimga ergashamiz
      let saved = null;
      try { saved = localStorage.getItem(KEY); } catch (_) {}
      if (saved !== 'dark' && saved !== 'light') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  } catch (_) {}
}
