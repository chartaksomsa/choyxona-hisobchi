# Choyxona Hisobchi v4.6

Mobil-birinchi cafe accounting PWA — React + Vite + Supabase + Tailwind.

## v4.6 yangiliklari (MUHIM — saqlash tuzatildi)

Bu versiya saqlash bilan bog'liq jiddiy muammolarni hal qiladi:

1. **Ma'lumot yo'qolishi tuzatildi** — avval saqlash xato berganda kod jim-jit "navbat"ga tashlardi va muvaffaqiyat deb ko'rsatardi. Doimiy xato bo'lsa (masalan bazada ustun yetishmasa) yozuvlar navbatda abadiy qotib qolardi va oyna yangilanganda yo'qolardi. Endi:
   - Tarmoq xatosi → navbatga (qayta urinadi, 5 martagacha)
   - Doimiy xato (baza/ruxsat) → **ekranda qizil ogohlantirish** ko'rsatiladi, jim tashlanmaydi
   - Saqlash muvaffaqiyatsiz bo'lsa "Saqlandi" deb yolg'on ko'rsatmaydi

2. **"Yozayotganda raqamlar o'chib ketishi" tuzatildi** — ishchilar oyligi va kassa balansi inputlarida har soniyada qiymat qayta yuklanardi. Endi faqat kun yoki saqlangan qiymat o'zgarsa yangilanadi, siz yozayotganda tegmaydi.

3. **Tashxis tugmasi** — Sozlama → Backup → "Tekshirishni boshlash". Supabase ulanishini va saqlashni test qilib, aniq qaysi qadam buzilganini ko'rsatadi.

4. **Navbatni tozalash** — agar ko'p yozuv navbatda qotib qolsa, akkaunt menyusida "Navbatni tozalash" tugmasi (ekrandagi ma'lumotlarga ta'sir qilmaydi).

### Agar 4.5 yoki undan oldingi versiyadan kelayotgan bo'lsangiz

Supabase SQL Editor'da `supabase-schema.sql` ni **qayta run qiling** — bu `audit_log` ustunini qo'shadi (idempotent, hech narsa buzilmaydi). Bu muhim qadam.

## Avvalgi versiyalar
- v4.5 — Telegram avto-jadval + ob-havo bot (Cloudflare Worker)
- v4.4 — Dark mode, swipe-to-delete, audit log
- v4.3 — somsa bug fix, kassa fix, "230k" parsing, tendensiya, backup, undo
- v4.2 — ENTER bilan saqlash, ishchilar oyligi paneli
- v4.1 — Telegram batafsil hisobotlar, ishchi ID, print 80mm

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

