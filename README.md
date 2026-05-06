# Choyxona Hisobchi v4.1

Mobil-birinchi cafe accounting PWA — React + Vite + Supabase + Tailwind.

## v4.1 yangiliklari

1. **Telegram batafsil hisobotlar** — endi 5 turdagi hisobot:
   - 🥤 Suvlar — qisqa
   - 🥤 Suvlar — batafsil (qaysi suv qo'shildi, har bir suv bo'yicha sotuv/foyda)
   - ☕ To'liq — qisqa
   - ☕ To'liq — batafsil (har ishchi qancha oldi, har chiqim batafsil)
   - 📋 Hammasi — har bir yozuv (vaqt belgisi bilan)

2. **Ishchilar uchun ID/Kod** — har ishchiga `W001`, `ofitsant-1` kabi qisqa kod berish mumkin. Ro'yxatda, hisobotda, dropdownda ham ko'rinadi.

3. **Qarzlar Hisobot tabiga ko'chirildi** — bottom nav 6 ta tabga tushdi (qulayroq). Qarzlar Hisobot tabida burishtirilgan ko'rinishda.

4. **Print 80mm chek** — Hisobot tabida PDF yoniga **Chek (80mm)** tugmasi. Xprinter-style printerlarga to'g'ridan-to'g'ri chiqaradi (browserdagi Print dialog).

5. **Ishchilar oyligi soddalashtirildi** — Chiqim → Ishchilar oyligi tabini ochsangiz, hamma faol ishchilarning ismi avtomatik chiqadi. Har birining yoniga summa yozib, tugmani bosish kifoya. Bonus: bugun ishchiga qancha to'langan bo'lsa, ko'rsatib turadi.

6. **Long Telegram messages** — Agar hisobot 4096 belgidan oshsa, qism-qism yuboriladi (avtomatik).

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

