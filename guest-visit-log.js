/* ============================================================
   Djami Lessons — Mehmon (ro'yxatdan o'tmagan) tashrif jurnali
   ------------------------------------------------------------
   Bu skript faqat OMMAVIY sahifalarga ulanadi (login/dashboard/admin
   sahifalariga emas). Tizimga kirmagan tashrifchi sahifani ochganda,
   Firestore'dagi activity_log kolleksiyasiga role:'guest', action:'visit'
   yozuvi qo'shiladi — bu yozuv admin panel > "Faollik jurnali"da chiqadi.

   Mehmon haqida quyidagilar yoziladi (ism/telefon EMAS — mehmon buni hech
   qayerga kiritmagan, shuning uchun texnik jihatdan bilib bo'lmaydi):
     - qurilma turi va brauzer (user-agent'dan)
     - taxminiy joylashuv — shahar/davlat (IP orqali, ochiq ipapi.co xizmati)
     - shu brauzer birinchi marta kiryaptimi yoki avval ham kelganmi
       (localStorage'ga saqlangan anonim ID orqali — real shaxs emas,
       faqat "shu qurilma avval ham bo'lgan" degan belgi)

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
  var VISITOR_ID_KEY = 'djami_visitor_id';

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

  // Shu brauzerga tegishli, o'zgarmas anonim ID. Real shaxsni aniqlamaydi —
  // faqat "shu qurilma avval ham kelganmi" degan savolga javob beradi.
  function getVisitorId() {
    try {
      var id = localStorage.getItem(VISITOR_ID_KEY);
      var isReturning = !!id;
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
        localStorage.setItem(VISITOR_ID_KEY, id);
      }
      return { id: id, isReturning: isReturning };
    } catch (e) {
      return { id: null, isReturning: false };
    }
  }

  function parseBrowser(ua) {
    if (!ua) return 'Nomaʼlum';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
    if (/CriOS/i.test(ua)) return 'Chrome (iOS)';
    if (/FxiOS/i.test(ua)) return 'Firefox (iOS)';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return 'Safari';
    return 'Nomaʼlum';
  }

  // Taxminiy joylashuv — faqat shahar/davlat darajasida, IP orqali.
  // Ochiq (bepul, kalitsiz) ipapi.co xizmatidan foydalaniladi; agar
  // xizmat javob bermasa yoki limitga yetgan bo'lsa, jim tarzda
  // o'tkazib yuboriladi (sayt ishlashiga ta'sir qilmaydi).
  function fetchApproxLocation() {
    return fetch('https://ipapi.co/json/', { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || data.error) return null;
        return {
          ip: data.ip || null,
          city: data.city || null,
          country: data.country_name || null
        };
      })
      .catch(function () { return null; });
  }

  function logGuestVisit() {
    if (!shouldLog()) return;
    var db = firebase.firestore();
    var visitor = getVisitorId();
    var browser = parseBrowser(navigator.userAgent);

    fetchApproxLocation().then(function (geo) {
      var entry = {
        role: 'guest',
        action: 'visit',
        page: document.title || location.pathname,
        path: location.pathname,
        at: firebase.firestore.FieldValue.serverTimestamp(),
        ua: navigator.userAgent,
        browser: browser,
        deviceId: visitor.id,
        isReturning: visitor.isReturning
      };
      if (geo) {
        if (geo.ip) entry.ip = geo.ip;
        if (geo.city) entry.city = geo.city;
        if (geo.country) entry.country = geo.country;
      }
      db.collection('activity_log').add(entry).then(markLogged).catch(function () {
        // Sayt ishlashiga ta'sir qilmasin — jim tarzda o'tkazib yuboriladi
        // (masalan Firestore qoidalari hali yangilanmagan bo'lsa)
      });
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
