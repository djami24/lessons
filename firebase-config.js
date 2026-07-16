/* ============================================================
   English Folder — Firebase config
   ------------------------------------------------------------
   1. https://console.firebase.google.com → "Add project"
   2. Project sozlamalari (⚙ Project settings) → "Your apps" →
      Web (</>) belgisini bosing → nom bering → "Register app"
   3. Sizga shunga o‘xshash kod ko‘rsatiladi — o‘sha qiymatlarni
      pastdagi firebaseConfig ichiga joylashtiring.
   4. Firebase Console'da yoqing:
        Build → Authentication → Sign-in method → Email/Password (Enable)
        Build → Firestore Database → Create database (production mode)
   5. Firestore → Rules bo‘limiga FIRESTORE_RULES.txt faylidagi
      qoidalarni joylashtiring va "Publish" bosing.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyAuYHKIftVKAbG2GfESGlTBHBQPJPsyelM",
  authDomain: "lessons-26179.firebaseapp.com",
  projectId: "lessons-26179",
  storageBucket: "lessons-26179.firebasestorage.app",
  messagingSenderId: "908675729948",
  appId: "1:908675729948:web:d76fac773b4c42e4fc6dd9"
};

// Primary app — used for the signed-in session on every page.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Secondary app — used ONLY when admin creates a new student account.
// Creating a user with the client SDK automatically signs that user in;
// running it on a separate app instance keeps the admin's own session
// untouched. We sign the secondary app out immediately after use.
function getSecondaryAuth(){
  let secondaryApp = firebase.apps.find(a => a.name === 'Secondary');
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
  }
  return secondaryApp.auth();
}
