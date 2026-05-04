# Choyxona Hisobchi

Choyxona kassiri uchun kunlik kirim-chiqim ilovasi. React + Vite + Tailwind asosida qurilgan, PWA (telefon ilovasi kabi ishlaydi).

---

## 🚀 Vercelga joylashtirish — qadam-baqadam

### 1-qadam: Hisoblar yaratish (10 daqiqa)

#### GitHub
1. https://github.com saytiga kiring
2. Yuqori o'ng burchakdagi **Sign up** tugmasini bosing
3. Email, parol, foydalanuvchi nomi kiriting
4. Emailga kelgan tasdiq kodini kiriting

#### Vercel
1. https://vercel.com saytiga kiring
2. **Sign Up** tugmasini bosing
3. **Continue with GitHub** ni tanlang — bu eng oson yo'l
4. GitHub ruxsatini bering

✅ Tayyor — endi GitHub va Vercel akkauntingiz bor

---

### 2-qadam: Loyihani GitHub'ga yuklash (15 daqiqa)

#### Variant A — Brauzer orqali (oson, kompyuterga hech narsa o'rnatmasdan)

1. https://github.com/new sahifasiga kiring
2. **Repository name**: `choyxona-hisobchi` deb yozing
3. **Public** ni tanlang (Vercel bepul tarif uchun shunday bo'lishi shart emas, lekin oson)
4. **Create repository** tugmasini bosing

5. Yangi sahifada **uploading an existing file** havolasini bosing
6. Loyiha fayllarini sudrab tashlang yoki **choose your files** orqali tanlang
7. Bunda yuklash kerak bo'lgan fayllar:

```
choyxona-hisobchi/
├── public/
│   ├── apple-touch-icon.png
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-512-maskable.png
├── src/
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── vite.config.js
```

⚠️ **Muhim:** `node_modules` papkasini yuklamang — kerak emas, juda katta.

8. Pastdagi maydonga **Initial commit** deb yozing
9. **Commit changes** tugmasini bosing

#### Variant B — Git orqali (kompyuterda Git o'rnatilgan bo'lsa)

```bash
cd choyxona-hisobchi
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SIZNING_USERNAME/choyxona-hisobchi.git
git push -u origin main
```

✅ Tayyor — kodingiz GitHub'da

---

### 3-qadam: Vercelga ulash (5 daqiqa)

1. https://vercel.com/new sahifasiga kiring
2. **Import Git Repository** bo'limida `choyxona-hisobchi` repozitoriysini toping
3. Yon tomondagi **Import** tugmasini bosing
4. Sozlamalar avtomatik aniqlanadi:
   - **Framework Preset**: Vite ✓
   - **Build Command**: `npm run build` ✓
   - **Output Directory**: `dist` ✓
5. **Deploy** tugmasini bosing

⏱️ 1-2 daqiqa kuting...

✅ **Tabriklayman!** Sizga `https://choyxona-hisobchi-xxxx.vercel.app` ko'rinishidagi manzil beriladi. Bu manzilni telefonda yoki notebookda ochib ishlatishingiz mumkin.

---

## 📱 Telefon ilovasi sifatida o'rnatish (PWA)

Loyiha allaqachon PWA sifatida tayyor. Vercelda ochilgandan keyin:

### Android (Chrome)
1. Brauzerda Vercel manzilini oching
2. Yuqori o'ng burchakdagi **⋮** menyusini bosing
3. **Add to Home screen** (Bosh ekranga qo'shish) tugmasini bosing
4. **Install** ni tasdiqlang

✅ Endi telefon ekranida ikona paydo bo'ladi va oddiy ilova kabi ishlaydi.

### iPhone (Safari)
1. Brauzerda Vercel manzilini oching
2. Pastdagi **Share** (yuqoriga o'q) tugmasini bosing
3. Pastga qarab **Add to Home Screen** ni toping
4. **Add** tugmasini bosing

### Windows / Mac
1. Chrome yoki Edge'da manzilni oching
2. Adres satrining o'ng tomonida **Install** ikonasi paydo bo'ladi (kompyuter ko'rinishida)
3. Bosing va tasdiqlang

---

## 💾 Ma'lumotlar qayerda saqlanadi?

Hamma ma'lumotlar **brauzeringizning localStorage** ichida saqlanadi:
- ✅ Internet kerakmas — offline ham ishlaydi
- ✅ Tezkor — server kerak emas
- ⚠️ Faqat **shu qurilmada** saqlanadi — telefon va kompyuter o'rtasida sinxronlanmaydi
- ⚠️ Brauzer kesh tozalansa, ma'lumot yo'qoladi

**Tavsiya:** Faqat bitta qurilmada (masalan, kassada turadigan telefonda) ishlating. Bekup uchun har oyda Hisobot tabidagi ma'lumotni Telegram orqali yuborib turing.

---

## 🔧 Yangilanishlar kiritish

Loyihada o'zgartirish kiritish kerak bo'lsa:

1. GitHub repozitoriyangizdagi faylni o'zgartiring (qalam ikonasi orqali)
2. Pastda **Commit changes** ni bosing
3. **Vercel avtomatik** ravishda yangi versiyani 1-2 daqiqada deploy qiladi
4. Brauzeringizda ilovani yangilang (sahifani qayta yuklang)

---

## 🐛 Muammo yuzaga kelsa

### "Build failed" Vercelda
- `package.json` to'g'ri yuklanganini tekshiring
- `node_modules` papkasi yuklanmaganligiga ishonch hosil qiling
- Vercel logini o'qing va xato qatorini Google'da qidiring yoki menga jo'nating

### Telefonda ochilmayapti
- Vercel manzili to'g'rimi?
- Vercel dashboardda "Production" deployment'ning yashil belgisi bormi?

### Telegram bot xato beryapti
- Bot tokeni to'g'rimi (Sozlamalar tabida "Tokenni tekshirish")
- Qabul qiluvchi botingizga `/start` yozganmi?
- Chat ID to'g'rimi (`@userinfobot` orqali oldingizmi)?

---

## 📦 Texnologiyalar

- **React 18** — UI freymvorki
- **Vite** — build vositasi
- **Tailwind CSS** — stillar
- **lucide-react** — ikonlar
- **vite-plugin-pwa** — PWA qo'llab-quvvatlash
- **localStorage** — ma'lumotlar saqlash
- **Telegram Bot API** — xabarlar yuborish

---

## 📝 Litsenziya

O'zingizniki — istalgancha o'zgartiring va ishlating.
