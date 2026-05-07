# Choyxona Hisobchi v4.2

Mobil-birinchi cafe accounting PWA — React + Vite + Supabase + Tailwind.

## v4.2 yangiliklari

1. **ENTER bilan saqlash** — Endi har qanday formada ENTER bossangiz, summa/yozuv saqlanadi. Saqlash tugmasini topib bosish shart emas.

2. **Ishchilar oyligi qayta ishlandi** — alohida bo'lim, Chiqim tabining eng yuqorisida:
   - Hamma faol ishchilar avtomatik chiqib turadi
   - Har birining yoniga summa yozasiz (allaqachon bugun to'lasangiz, summa avtomatik to'ldirilgan bo'ladi va tahrirlash mumkin)
   - **Bitta** "Hammasini saqlash" tugmasi (har bir ishchiga alohida emas)
   - Bo'limning eng pastida bugungi to'lovlar ixcham ro'yxati: vaqt, ism, summa, jami

## v4.1 dagilar

1. Telegram batafsil hisobotlar (5 tur)
2. Ishchilar uchun ID/Kod
3. Qarzlar Hisobot tabiga ko'chirildi
4. Print 80mm chek
5. Ishchilar oyligi avto ro'yxat (asoslangan v4.2)

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

