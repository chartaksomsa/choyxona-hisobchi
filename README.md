# Choyxona Hisobchi v4.3

Mobil-birinchi cafe accounting PWA — React + Vite + Supabase + Tailwind.

## v4.3 yangiliklari (Phase 1)

### Bug fix
- **Somsa yegani daromaddan ayriladi** — agar 1000 dona umumiy va 30 ta ishchilar yegan bo'lsa, daromad 970 × narx (avval 1000 × narx hisoblar edi)
- **Kassa balansi to'g'rilandi** — endi "Kassada bo'lishi kerak" = naqd savdo − naqd chiqim (oylik, mahsulot va h.k. ayriladi)

### Yangi funksiyalar
- **"230k" → 230 000** avto-tushunish (lotin va kirill 'к', 'м' uchun ham)
- **Raqamlar bo'shliq bilan**: "230 000" formatida
- **Tendensiya** — Bosh sahifada bugun/hafta/oy o'tgan davr bilan solishtirish, foiz va o'q ko'rinishida
- **Eng yaxshi/yomon kunlar** — Hisobotda hafta kunlari bo'yicha o'rtacha tahlil (haftalik va oylik tanlanadi)
- **Backup va Eksport** — Sozlama → Backup tab:
  - JSON backup (to'liq) yuklash
  - Tranzaksiyalarni Excel/CSV ga eksport
  - JSON backup'dan tiklash
- **Undo o'chirishda** — tranzaksiyani o'chirsangiz, 5 sekund ichida "Bekor" tugmasi orqali tiklash mumkin

## v4.2 dagilar
- ENTER bilan saqlash
- Ishchilar oyligi alohida bo'lim, bitta saqlash tugmasi
- Createdat sort tuzatildi (oppoq ekran fix)

## v4.1 dagilar
- Telegram batafsil hisobotlar (5 tur)
- Ishchilar uchun ID/Kod
- Qarzlar Hisobot tabiga ko'chirildi
- Print 80mm chek

## Phase 2 (kelgusi sessiyalar)
- Dark mode (kunduzgi/tungi rejim birgalikda)
- Telegram avto-jadval bo'yicha hisobot yuborish
- Ob-havo bot — somsa kunlari uchun ogohlantirish
- PWA push notification
- Audit log (kim, qachon, nimani o'zgartirdi)
- Sentry xato kuzatuvi
- Avtomatlashtirilgan testlar
- Surib o'chirish (swipe-to-delete)

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

