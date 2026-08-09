/* ============================================================
   Djami Lessons — Mehmon (ro'yxatdan o'tmagan) tashrif jurnali
   ------------------------------------------------------------
   Bu skript faqat OMMAVIY sahifalarga ulanadi (login/dashboard/admin
   sahifalariga emas). Tizimga kirmagan tashrifchi sahifani ochganda,
   Firestore'dagi activity_log kolleksiyasiga role:'guest', action:'visit'
   yozuvi qo'shiladi — bu yozuv admin panel > "Faollik jurnali"da chiqadi.

   Muhim: bu ishlashi uchun Firebase Console > Firestore > Rules bo'limida
   FIRESTORE_RULES.txt faylidagi yangilangan qoidalar joylashtirilgan va
   "Publish" qilingan bo'lishi kerak — aks holda Firestore bu yozuvlarni
   xavfsizlik siyosati bo'yicha rad etadi.

   Bir xil tashrifchi qayta-qayta sahifani yangilaganda jurnal
   to'lib ketmasligi uchun, bitta brauzerdan 30 daqiqada bir marta
   yoziladi (localStorage orqali).
   Include AFTER firebase-config.js.
   ============================================================ */
(function () {
  if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;

  var THROTTLE_MS = 30 * 60 * 1000; // 30 daqiqa
  var STORAGE_KEY = 'djami_last_guest_log_at';

  function shouldLog() {
    try {
      var last = localStorage.getItem(STORAGE_KEY);
      if (!last) return true;
      return (Date.now() - parseInt(last, 10)) > THROTTLE_MS;
    } catch (e) {
      return true;
    }
  }

  function markLogged() {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (e) { /* ignore */ }
  }

  function logGuestVisit() {
    if (!shouldLog()) return;
    var db = firebase.firestore();
    db.collection('activity_log').add({
      role: 'guest',
      action: 'visit',
      page: document.title || location.pathname,
      path: location.pathname,
      at: firebase.firestore.FieldValue.serverTimestamp(),
      ua: navigator.userAgent
    }).then(markLogged).catch(function () {
      // Sayt ishlashiga ta'sir qilmasin — jim tarzda o'tkazib yuboriladi
      // (masalan Firestore qoidalari hali yangilanmagan bo'lsa)
    });
  }

  var auth = firebase.auth();
  auth.onAuthStateChanged(function (user) {
    // Faqat tizimga kirmagan (mehmon) tashrifchilar uchun yoziladi —
    // talaba/ota-ona kirish/ro'yxatdan o'tishi allaqachon alohida
    // (role: 'student'/'parent') yozib borilyapti.
    if (!user) logGuestVisit();
  });
})();
