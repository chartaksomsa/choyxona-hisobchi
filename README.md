# Choyxona Hisobchi v4

Mobil-birinchi cafe accounting PWA — React + Vite + Supabase + Tailwind.

## v4 da nima yangilandi

1. **Concurrency fix** — `transactions` jadval normallashtirildi (alohida `app_transactions` jadval). Endi 2 ta qurilmadan bir vaqtda yozsa, hech narsa yo'qolmaydi.
2. **Offline mode** — internetsiz ishlaydi. Yozgan narsangiz queue ga tushadi va internet kelganida avtomatik yuboriladi. Header da Wi-Fi belgisi va kutayotgan yozuvlar soni ko'rsatiladi.
3. **Realtime sync** — Telefondan yozsangiz, kompyuterda darhol ko'rinadi. Supabase Realtime channel.
4. **Bundle splitting** — jsPDF va recharts kerak bo'lgandagina yuklanadi (Hisobotlar tabini ochganda). Birinchi yuklanish 250KB tezroq.
5. **Chartlar** — Hisobotlar tabida pie chart (tushumlar/chiqimlar), kunlik chiziq grafik, kunlik sof natija (bar).
6. **Plastik tushumi** — Endi har bir tushumda **Naqd / Plastik** tugmasi bor. Eski "plastik chiqim" usuli ham ishlashda davom etadi.
7. **PDF Uzbek matn** — Maxsus harflar (curly quote, tire, ellipsis) endi PDFda buzilmaydi.

### Qo'shimcha (foydalanuvchi so'rovi)

A. **Ishchilar ID si** — Endi har bir ishchi unique ID ga ega. Ismni o'zgartirsangiz ham statistika va tarix saqlanadi.
B. **Ishchilar to'liq CRUD** — Qo'shish, tahrirlash, o'chirish, lavozim qo'shish, faol/faolemas qilish. Har bir ishchining oylik tarixi alohida ko'rinadi.
C. **Bosh sahifa kassa kartasi** — Plastik tushumi endi "Kunlik kassa balansi" kartasi ichida ko'rsatiladi (avval alohida edi). Buxgalteriya bo'yicha to'g'rirog'i.

## Deploy qilish (3 qadam)

### 1. Supabase'da DB ni yangilang

Supabase loyihangiz **SQL Editor**ini oching va `supabase-schema.sql` faylining mazmunini yopishtiring va **Run** ni bosing.

> Idempotent — agar v3 dan kelayotgan bo'lsangiz, eski jsonb dagi tranzaksiyalar avtomatik yangi jadvalga ko'chiriladi. Hech narsa yo'qolmaydi.

### 2. Vercel da ENV variables (agar avval qo'shilmagan bo'lsa)

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. Deploy

```bash
npm install
npm run build
# yoki to'g'ridan-to'g'ri vercel ga push qiling
```

## Lokalda ishga tushirish

```bash
npm install
cp .env.example .env.local
# .env.local ga supabase URL va keyni qo'ying
npm run dev
```

## Public papkadagi ikonalar

`public/` papkasi bo'sh — agar avvalgi versiyangizdan icon-192.png, icon-512.png, icon-512-maskable.png, favicon.svg, apple-touch-icon.png lar bor bo'lsa, ularni shu yerga ko'chiring.

## Migratsiya v3 → v4

Hech narsa qilish kerak emas — `supabase-schema.sql` ni run qilsangiz tayyor:

- `app_data.transactions` (jsonb) ichidagi eski yozuvlar `app_transactions` jadvalga ko'chiriladi
- Eski `endCash` field hali ham qabul qilinadi (yangi nomi `countedCash`)
- Eski "isCashless" plastik chiqim usuli yangi paymentMethod bilan birga ishlaydi
- Eski tranzaksiyalarda `payeeWorkerId` yo'q — ism orqali ishchiga bog'lanadi (legacy fallback)
