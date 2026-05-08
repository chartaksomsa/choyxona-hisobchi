# Choyxona Hisobchi v4.4

Mobil-birinchi cafe accounting PWA — React + Vite + Supabase + Tailwind.

## v4.4 yangiliklari (Phase 2A)

- **Dark mode** — kunduzgi/tungi rejim. Header'da quyosh/oy tugmasi orqali almashtiriladi. Tanlovingiz brauzerda saqlanadi (qayta ochganda eslab qoladi).
- **Surib o'chirish** — tx ro'yxatda chap-o'ngga sudrab o'chirish. Telefonda tezroq.
- **Tarix (audit log)** — Sozlama → Tarix tabida hamma o'zgarishlar ko'rinadi: tushum, chiqim, ishchi, qarz, bo'lim qo'shildi/o'chirildi/yangilandi. Oxirgi 500 yozuv saqlanadi. Filtrlash mumkin (Tx, Bo'lim, Ishchi, Qarz).

## Phase 2 da qolganlar (alohida sessiyalar)

- ⏳ Telegram avto-jadval bo'yicha hisobot — Cloudflare Worker yoki Supabase Edge Function infra kerak
- ⏳ Ob-havo bot — somsa kunlari uchun ogohlantirish (OpenWeatherMap API + cron)
- ⏳ PWA push notification — VAPID keys + backend
- ⏳ Sentry — account ochish + DSN
- ⏳ Avtomatlashtirilgan testlar

## v4.3 dagilar (Phase 1)
- Bug fix: somsa yegani daromaddan ayriladi
- Bug fix: kassa balansi to'g'ri (naqd kirim − naqd chiqim)
- "230k" → 230 000 avto-tushunish
- Raqamlar bo'shliq bilan
- Tendensiya kartasi (bugun/hafta/oy o'tgan davrga nisbatan)
- Eng yaxshi/yomon kunlar tahlili
- Backup va Eksport (JSON, CSV)
- Undo o'chirishda

## Deploy

GitHub Desktop orqali kodni yangilang. Vercel avtomatik build qiladi.

### Xato yuzaga kelsa

PWA agressiv kesh tufayli yangi versiya darhol ko'rinmasligi mumkin:
- Brauzer: **Ctrl+Shift+R** (hard refresh)
- PWA o'rnatilgan bo'lsa: o'chirib qayta o'rnating yoki cache tozalang


## v4.0 dagilar (avvalgi versiyadan)

1. Concurrency fix — alohida `app_transactions` jadval
2. Offline mode — internet yo'q paytda queue, kelgach avtomatik
3. Realtime sync — qurilmalar orasida darhol yangilanish
4. Bundle splitting — kerak bo'lgandagina yuklash
5. Vizualizatsiya — pie/line/bar chartlar
6. Plastik tushum — har tushumda Naqd/Plastik tugmasi
7. PDF Uzbek matn fix

## Deploy qilish

### 1. Supabase'da DB ni yangilang (faqat birinchi marta)

Supabase **SQL Editor** → `supabase-schema.sql` mazmunini yopishtiring → **Run**.

> Idempotent — agar v3/v4.0 dan kelayotgan bo'lsangiz, hech narsa yo'qolmaydi.

### 2. Vercel ENV variables (faqat birinchi marta)

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. Deploy

GitHub'da kodni yangilang → Vercel avtomatik build qiladi.

## Lokalda

```bash
npm install
cp .env.example .env.local
# .env.local'ni to'ldiring
npm run dev
```

## Print 80mm haqida

Print tugmasi bosilganda yangi oynada chek-shaklidagi hisobot ochiladi va brauzerning Print dialog'i avtomatik ishga tushadi. **Print sozlamasida:**

- Printer: Xprinter (yoki sizdagi 80mm thermal printer)
- Paper size: 80mm × auto (yoki "Receipt")
- Margin: None / Minimum
- Headers and footers: Off

Agar pop-up bloklansa, brauzer sozlamalaridan ruxsat berishingiz kerak.

