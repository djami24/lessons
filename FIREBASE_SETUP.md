# English Folder — Firebase sozlash qo‘llanmasi

Bu tizim endi **Firebase** (Authentication + Firestore) ustida ishlaydi — ya'ni siz papka/dars qo'shsangiz, bu darhol **barcha qurilmalarda** ko'rinadi, va har bir o'quvchi **o'z shaxsiy login/paroli** bilan kiradi.

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

## 8. O'quvchi qo'shish

1. `admin/login.html` orqali kiring
2. Avval kamida bitta **papka** yarating ("Yangi papka ochish")
3. **"O'quvchilar"** bo'limiga o'ting → **"Yangi o'quvchi qo'shish"**
4. Ism, email, boshlang'ich parol va papkani kiriting → saqlang

O'quvchi endi `student/login.html` orqali shu email/parol bilan kiradi va faqat o'ziga biriktirilgan papkani ko'radi.

## Fayl tuzilishi

```
/
├── index.html              ← marketing sahifa
├── style.css                 ← umumiy dizayn
├── firebase-config.js         ← siz to'ldirasiz (2-qadam)
├── FIRESTORE_RULES.txt        ← Firestore Rules'ga joylashtiriladi (5-qadam)
├── admin/
│   ├── login.html
│   └── dashboard.html         ← papkalar + o'quvchilar boshqaruvi
└── student/
    ├── login.html
    └── dashboard.html         ← o'quvchining shaxsiy papkasi
```

## Muhim eslatmalar

- O'quvchi o'chirilganda, uning Firestore yozuvi o'chadi, lekin Authentication hisobi Firebase Console'da qoladi (xavfsizlik sababli, buni faqat server-side kod o'chira oladi). Kerak bo'lsa, **Authentication → Users**'dan qo'lda o'chiring.
- Parolni unutgan o'quvchi uchun hozircha yangi parolni faqat siz **Authentication → Users → ⋮ → Reset password** orqali (yoki qo'lda yangi parol belgilab) o'rnatib bera olasiz.
- `firebase-config.js` ichidagi kalitlar (`apiKey` va boshqalar) ochiq ko'rinsa ham xavfsiz — haqiqiy himoya Firestore **Security Rules** orqali ta'minlanadi (5-qadam).
