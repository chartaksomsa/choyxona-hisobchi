# Choyxona Hisobchi v4.5

Mobil-birinchi cafe accounting PWA — React + Vite + Supabase + Tailwind.

## v4.5 yangiliklari (Phase 2B)

**Telegram avto-jadval va ob-havo bot — Cloudflare Worker orqali**

- **Avto-hisobotlar:** Sozlama → Telegram → har qabul qiluvchiga "Avtomatik yuborish" yoqing va vaqtni tanlang. Worker har daqiqa ishlaydi va belgilangan vaqtda hisobotni yuboradi.

- **Ob-havo ogohlantirishi:** Sozlama → Telegram → "Ob-havo ogohlantirish" yoqing, shaharingizni yozib qo'ying. Bot har kuni:
  - Ertalab 08:00 — bugungi 12 soatlik prognozni tekshiradi (kuchli shamol, yomg'ir, qor, issiqlik)
  - Kechqurun 18:00 — yarim tun va ertaga ertalabgi 18 soatlik prognozni tekshiradi (somsa **ertaga sotilishi kerak** bo'lgani uchun, kechki keskin o'zgarishlarni)
  - Faqat haqiqiy ogohlantirish bor bo'lsa yuboradi (har kuni keraksiz xabar yo'q)

**Cloudflare Worker o'rnatish:** `cloudflare-worker/README.md` ga qarang. Bepul plan yetarli.

## Phase 2 da qolganlar
- ⏳ PWA push notification (alohida sessiya)
- ⏳ Sentry — account ochish kerak
- ⏳ Avtomatlashtirilgan testlar

## v4.4 dagilar (Phase 2A)
- Dark mode (kunduzgi/tungi)
- Surib o'chirish (swipe-to-delete)
- Audit log (Tarix)

## v4.3 dagilar (Phase 1)
- Bug fix: somsa yegani daromaddan ayriladi
- Bug fix: kassa balansi to'g'ri (naqd kirim − naqd chiqim)
- "230k" → 230 000 avto-tushunish
- Raqamlar bo'shliq bilan
- Tendensiya kartasi
- Eng yaxshi/yomon kunlar tahlili
- Backup va Eksport
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

