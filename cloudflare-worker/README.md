# Choyxona Scheduler — Cloudflare Worker

Bu worker Telegram avto-hisobotlar va ob-havo ogohlantirishlarini yuboradi.

## Nima uchun kerak?

Asosiy React ilovasi brauzerda ishlaydi — siz uni yopsangiz, hisobotlar yuborilmaydi.
Cloudflare Worker server'da (24/7) ishlaydi va belgilangan vaqtda Telegram'ga avto-yuboradi.

**Bepul** (Cloudflare free plan: 100 000 so'rov/kun, har daqiqada cron — bepul).

## Sozlash (taxminan 15 daqiqa)

### 1. Cloudflare hisobi

[cloudflare.com](https://cloudflare.com) — bepul ro'yxatdan o'ting (Email + parol).

### 2. Wrangler CLI o'rnatish

Kompyuteringizda terminal oching va:

```bash
npm install -g wrangler
wrangler login
```

Brauzer ochiladi — Cloudflare hisobingizga kirib ruxsat bering.

### 3. Worker papkasiga o'tish

ZIP'dan ochilgan loyihangizdan:

```bash
cd choyxona-hisobchi-v4/cloudflare-worker
npm install
```

### 4. Sirli kalitlarni o'rnatish

Quyidagi 3 ta kalitni alohida-alohida kiriting:

```bash
wrangler secret put SUPABASE_URL
# Yopishtiring: https://xxxxx.supabase.co  (dashboard → Settings → API → "Project URL")

wrangler secret put SUPABASE_SERVICE_KEY
# Yopishtiring: eyJ...  (Settings → API → "service_role" — anon emas!)

wrangler secret put OPENWEATHER_KEY
# Yopishtiring: openweathermap.org dan olingan API key
```

⚠️ **`service_role` kaliti ADMIN kalit** — uni hech kimga bermang, brauzerda ishlatmang.
U faqat shu Worker ichida xavfsiz bo'ladi.

### 5. OpenWeatherMap kaliti olish

1. [openweathermap.org/api](https://openweathermap.org/api) — bepul ro'yxatdan o'ting
2. Email tasdiqlang
3. Profile → API keys → kalit nusxa oling
4. **Eslatma:** Yangi kalit 1-2 soat ichida faol bo'ladi

### 6. Worker'ni deploy qilish

```bash
wrangler deploy
```

3-5 sekundda quyidagi natijani olasiz:

```
Published choyxona-scheduler (1.23 sec)
  https://choyxona-scheduler.<sizning-username>.workers.dev
```

Ishladi! Endi bu URL har daqiqada avto ishlaydi.

### 7. Tekshirish

Brauzerda URL'ni oching, masalan:

```
https://choyxona-scheduler.foo.workers.dev/test-weather?city=Tashkent
```

Ob-havo natijalarini ko'rsatishi kerak.

Manual ishga tushirish:

```
https://choyxona-scheduler.foo.workers.dev/run
```

## Loglarni kuzatish

Worker bajargan ishlarni real-time ko'rish:

```bash
wrangler tail
```

Yoki Cloudflare Dashboard → Workers & Pages → choyxona-scheduler → Logs.

## Nima qiladi?

Har daqiqada (`* * * * *`) ishlaydi va:

1. **Avto-hisobotlar:** Sozlama → Telegram → har bir qabul qiluvchi uchun "Avtomatik yuborish" yoqilgan bo'lsa va belgilangan vaqt hozirgi vaqt bilan mos kelsa, hisobot yuboriladi.

2. **Ob-havo (08:00):** Sozlama → Telegram → "Ob-havo ogohlantirish" yoqilgan bo'lsa, bugungi 12 soatlik prognozni ko'radi. Quyidagilarda ogohlantiradi:
   - Kuchli shamol (≥9 m/s) yoki bo'ron (≥12 m/s)
   - Yomg'ir (≥1 mm)
   - Qor
   - Juda issiq (≥40°C)
   - Momaqaldiroq

3. **Ob-havo (18:00):** Yarim tun va ertaga ertalabgi 18 soatlik prognozni tekshiradi. Somsa **ertaga sotilishi kerak** bo'lgani uchun, kechqurun keskin o'zgarishni eski-yangi qilib ogohlantiradi.

## Vaqt mintaqasi

Ichkarida **Tashkent vaqti** (UTC+5) ishlatiladi. Cloudflare cron UTC'da, lekin worker o'zi konvertatsiya qiladi.

## Nima xato bo'lsa?

- **"Supabase 401"** — `SUPABASE_SERVICE_KEY` xato (anon key emasligini tekshiring)
- **"OWM 401"** — OpenWeatherMap kaliti hali faollashmagan (1-2 soat kuting)
- **Hech narsa yuborilmadi** — `wrangler tail` ni ishga tushiring va loglarni ko'ring

## Yangilash

Worker kodini o'zgartirsangiz:

```bash
wrangler deploy
```

## O'chirish

```bash
wrangler delete choyxona-scheduler
```

Yoki Cloudflare Dashboard → Workers & Pages → ... → Manage → Delete.
