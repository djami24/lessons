# English Folder — Firebase sozlash qo‘llanmasi

Bu tizim **Firebase** (Authentication + Firestore) ustida ishlaydi: General English kursi Beginner → Elementary → Pre-Intermediate darajalaridan iborat, har bir darsda video/material, uy vazifasi va test bor. O'quvchi testni kamida 60% ball bilan yechsagina keyingi dars ochiladi. Kurs 50 000 so'mlik to'lov admin tomonidan tasdiqlangach ochiladi.

## 1. Firebase loyihasini yaratish (5 daqiqa)

1. https://console.firebase.google.com ga kiring (Google hisobingiz bilan)
2. **"Add project"** → loyiha nomini kiriting (masalan `english-folder`) → davom eting → yaratiladi

## 2. Web ilova qo'shish va konfiguratsiyani olish

1. Loyiha bosh sahifasida **`</>`** (Web) belgisini bosing
2. Ilova nomini kiriting (masalan `english-folder-web`) → **"Register app"**
3. Sizga shunga o'xshash kod ko'rsatiladi:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "english-folder.firebaseapp.com",
     projectId: "english-folder",
     storageBucket: "english-folder.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
4. Shu qiymatlarni **`firebase-config.js`** faylidagi `firebaseConfig` obyektiga joylashtiring (fayl loyiha papkasining tub qismida).

## 3. Authentication'ni yoqish

1. Chap menyudan **Build → Authentication → Get started**
2. **Sign-in method** bo'limida **Email/Password**'ni tanlang → **Enable** → Save

## 4. Firestore Database'ni yaratish

1. Chap menyudan **Build → Firestore Database → Create database**
2. **Production mode**'ni tanlang → sizga yaqin regionni tanlang → Enable

## 5. Xavfsizlik qoidalarini (Security Rules) joylashtirish

1. Firestore Database → **Rules** bo'limiga o'ting
2. `FIRESTORE_RULES.txt` faylidagi barcha matnni nusxalab, mavjud qoidalar o'rniga joylashtiring
3. **Publish** tugmasini bosing

## 6. Birinchi admin hisobini yaratish

Admin hisoblari xavfsizlik uchun faqat Firebase Console orqali yaratiladi:

1. **Authentication → Users → Add user**
2. Email va parol kiriting (masalan `admin@englishfolder.uz`) → **Add user**
3. Yaratilgan foydalanuvchining **User UID** qatorini nusxalang (masalan `aB3xY...`)
4. **Firestore Database → Data → Start collection**
5. Collection ID: `admins`
6. Document ID: yuqorida nusxalagan **UID**'ni qo'ying (avtomatik ID emas!)
7. Bitta field qo'shing: `email` (string) = admin emailingiz → **Save**

Endi shu email/parol bilan `admin/login.html` orqali kira olasiz.

## 7. Saytni joylashtirish (hosting)

Firebase Authentication `file://` orqali ochilgan sahifalarda ishlamasligi mumkin — saytni internetga joylashtiring:

**Eng oson yo'l — Firebase Hosting (bepul):**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # public papka sifatida loyiha papkasini ko'rsating
firebase deploy
```
Yoki oddiygina loyiha papkasini **Netlify** yoki **GitHub Pages**'ga tashlang — ular ham bepul va tez ishlaydi.

## 8. Darslarni joylashtirish (General English)

1. `admin/dashboard.html` ga kiring — birinchi kirishda **Beginner / Elementary / Pre-Intermediate** darajalari avtomatik yaratiladi.
2. Bir darajani oching → **"Yangi dars qo'shish"** → dars nomi, video havolasi, material havolasi, mavzu tavsifi, uy vazifasi va test savollarini kiriting.
3. Har bir test savoliga 4 ta variant va to'g'ri javobni belgilang. O'quvchi shu testni kamida **60%** to'g'ri yechsagina keyingi dars ochiladi.

## 9. O'quvchilar va to'lovni tasdiqlash

O'quvchilar `student/register.html` orqali **o'zlari** ro'yxatdan o'tadi (yoki admin ularni qo'lda qo'shishi ham mumkin). Ro'yxatdan o'tgach:

1. O'quvchi General English kursini ochadi → 50 000 so'mlik to'lov ko'rsatiladi → pulni o'tkazib, skrinshotni Telegram orqali (**t.me/djamiteacher**) yuboradi → saytda **"To'lov qildim"** tugmasini bosadi.
2. Admin `admin/dashboard.html` → **"O'quvchilar"** bo'limida shu o'quvchini topadi (holati: "Kutilmoqda") → Telegram'dagi skrinshotni tekshiradi → **"Ko'rish"** → **"To'lovni tasdiqlash"**.
3. Tasdiqlangach, o'quvchiga Beginner darajasidan boshlab butun kurs ochiladi.

> Agar admin biror o'quvchiga to'g'ridan-to'g'ri (Telegram orqali kutmasdan) kurs ochib bermoqchi bo'lsa, shunchaki uni "O'quvchilar" ro'yxatida topib, tasdiqlab qo'ya oladi — o'quvchi hech narsa qilmasa ham bo'ladi.

## Fayl tuzilishi

```
/
├── index.html              ← marketing sahifa
├── style.css                 ← umumiy dizayn
├── firebase-config.js         ← siz to'ldirasiz (2-qadam)
├── FIRESTORE_RULES.txt        ← Firestore Rules'ga joylashtiriladi (5-qadam)
├── admin/
│   ├── login.html
│   └── dashboard.html         ← darajalar/darslar/test boshqaruvi + to'lov tasdiqlash
└── student/
    ├── login.html
    ├── register.html
    └── dashboard.html         ← kurslar, darslar, testlar
```

## Muhim eslatmalar

- O'quvchi o'chirilganda, uning Firestore yozuvi o'chadi, lekin Authentication hisobi Firebase Console'da qoladi (xavfsizlik sababli, buni faqat server-side kod o'chira oladi). Kerak bo'lsa, **Authentication → Users**'dan qo'lda o'chiring.
- Parolni unutgan o'quvchi uchun hozircha yangi parolni faqat siz **Authentication → Users → ⋮ → Reset password** orqali (yoki qo'lda yangi parol belgilab) o'rnatib bera olasiz.
- `firebase-config.js` ichidagi kalitlar (`apiKey` va boshqalar) ochiq ko'rinsa ham xavfsiz — haqiqiy himoya Firestore **Security Rules** orqali ta'minlanadi (5-qadam).
