/* ============================================================
   Listening uy vazifalari: talaba va admin uchun umumiy modul
   ------------------------------------------------------------
   Firestore:
     listening_exercises/{exId}
       { title, mediaUrl, answers:[5 ta matn], createdAt, updatedAt,
         durationHours, deadlineAt }   // deadlineAt: topshirish tugaydigan vaqt (ms); null: cheksiz
       answers[i]: i-bo‘sh joy uchun to‘g‘ri javob.
       Bir nechta to‘g‘ri variant bo‘lsa "|" bilan ajrating: "color | colour"
     listening_submissions/{exId_uid}
       { exerciseId, studentId, studentName, answers:[5], score, total, marks, submittedAt }
       Talaba har mashqni faqat bir marta topshiradi (hujjat ID = exId_uid).
     Point: har mashqdan nechta to'g'ri topilsa (0–5) shuncha point. Mashq o'chirilganda natija
     oquv_progress/{ID}/bonus/ls_{exId}_{uid} (source:'listening') ga ko'chiriladi: point yo'qolmaydi.

   Ishlatish:
     ListeningHW.openStudent({ uid, name }) : talaba paneli (#lhwStudentRoot)
     ListeningHW.openAdmin()                : admin paneli  (#lhwAdminRoot)
   Talab qilinadi: firebase-config.js (global `db`, `firebase`).
   ============================================================ */
(function (global) {
  'use strict';

  var COL_EX = 'listening_exercises';
  var COL_SUB = 'listening_submissions';
  var BLANKS = 5;        // eski mashqlar uchun standart
  var MAX_BLANKS = 40;   // bitta mashqda ko‘pi bilan shuncha bo‘shliq
  var MAX_ANSWER_LEN = 200;
  // Taxmin qoidasi: barcha bo‘shliqlar noto‘g‘ri bo‘lsa -
  // mashq uchun 0 ball beriladi, PENALTY ta jazo qayd etiladi (balldan ayrilmaydi), natija domlaga taqdim etiladi.
  var PENALTY = 100;
  // Marafonning umumiy soni: har bir kiritilgan mashq: bitta marafon (qolganini shundan hisoblaydi)
  var MARATHON_TOTAL = 12;
  // Eshitib yozish (dikta): talaba matni listening_texts da, asl matn listening_keys da (faqat admin o'qiydi)
  var COL_KEY = 'listening_keys';
  var COL_TXT = 'listening_texts';
  var DICT_MAX = 3000;
  var DICT_POINTS = 5;

  /* ---------- yordamchilar ---------- */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // Javobni solishtirish uchun: kichik harf, tinish belgilarisiz, ortiqcha bo‘shliqlarsiz
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[.,!?;:"“”‘’'()\[\]\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Mashqdagi bo‘shliqlar soni (javoblar ro‘yxati uzunligi)
  function countOf(ex) {
    var n = ex && Array.isArray(ex.answers) ? ex.answers.length : 0;
    return n >= 1 ? Math.min(n, MAX_BLANKS) : BLANKS;
  }

  // Topshirilgan javobdagi bo‘shliqlar soni
  function subCount(sub) {
    var n = Number(sub && sub.total);
    if (n >= 1) return n;
    var m = sub && Array.isArray(sub.answers) ? sub.answers.length : 0;
    return m >= 1 ? m : BLANKS;
  }

  function acceptedVariants(key) {
    return String(key == null ? '' : key).split('|').map(norm).filter(Boolean);
  }

  function grade(keyAnswers, studentAnswers) {
    var n = (keyAnswers && keyAnswers.length) ? keyAnswers.length : BLANKS;
    var marks = [], correct = 0;
    for (var i = 0; i < n; i++) {
      var ok = acceptedVariants((keyAnswers || [])[i]).indexOf(norm((studentAnswers || [])[i])) !== -1;
      marks.push(ok);
      if (ok) correct++;
    }
    // Barcha bo‘shliqlar noto‘g‘ri bo‘lsa: taxmin (0 ball, jazo)
    var flagged = n > 0 && correct === 0;
    var score = flagged ? 0 : correct;
    var penalty = flagged ? PENALTY : 0;
    return { score: score, marks: marks, total: n, flagged: flagged, penalty: penalty, finalScore: score };
  }

  /* ---------- Eshitib yozish (dikta) ---------- */
  function isDict(ex) { return !!ex && ex.kind === 'dictation'; }

  // So‘zlarga bo‘lish: kichik harf, apostrof va tinish belgilarisiz (don't = dont)
  function dictTokens(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[’‘`ʼ']/g, '')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/).filter(Boolean);
  }

  function editDist(a, b) {
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  // Bitta harf xato (4+ harfli so‘zda): imlo xatosi deb hisoblanadi
  function isSpellingSlip(r, s) { return r.length >= 4 && editDist(r, s) === 1; }

  // Talaba matnini asl matn bilan so‘zma-so‘z solishtiradi.
  // eq: to‘g‘ri; spell: imlo xatosi (yarim ball); wrong: boshqa so‘z; missing: tushib qolgan; extra: ortiqcha (yarim ball ayriladi)
  function dictDiff(refText, stuText) {
    var R = dictTokens(refText), S2 = dictTokens(stuText);
    var n = R.length, m = S2.length, i, j, k;
    var dp = [];
    for (i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = R[i] === S2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var ops = [], run = { del: [], ins: [] };
    function flush() {
      var p = Math.min(run.del.length, run.ins.length);
      for (k = 0; k < p; k++) {
        var r = R[run.del[k]], s = S2[run.ins[k]];
        ops.push(isSpellingSlip(r, s) ? { t: 'spell', r: r, s: s } : { t: 'wrong', r: r, s: s });
      }
      for (k = p; k < run.del.length; k++) ops.push({ t: 'missing', r: R[run.del[k]] });
      for (k = p; k < run.ins.length; k++) ops.push({ t: 'extra', s: S2[run.ins[k]] });
      run = { del: [], ins: [] };
    }
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && R[i] === S2[j]) { flush(); ops.push({ t: 'eq', r: R[i], s: S2[j] }); i++; j++; }
      else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { run.del.push(i); i++; }
      else { run.ins.push(j); j++; }
    }
    flush();
    var c = { eq: 0, spell: 0, wrong: 0, missing: 0, extra: 0 };
    ops.forEach(function (o) { c[o.t]++; });
    var credit = c.eq + 0.5 * c.spell - 0.5 * c.extra;
    var acc = n ? Math.max(0, Math.min(1, credit / n)) : 0;
    return {
      ops: ops, refN: n, eq: c.eq, spell: c.spell, wrong: c.wrong, missing: c.missing, extra: c.extra,
      pct: Math.round(acc * 100), score: acc >= 1 ? DICT_POINTS : Math.floor(acc * DICT_POINTS)
    };
  }

  // Reytingdagi yakuniy ball (jazo balldan ayrilmaydi, alohida qayd etiladi)
  function finalOf(r) {
    return typeof r.finalScore === 'number' ? r.finalScore : (r.score || 0);
  }

  function tsMs(t) {
    if (typeof t === 'number') return t;
    return t && typeof t.toMillis === 'function' ? t.toMillis() : Date.now();
  }

  // Sana-vaqt: 16.10.2026 17:48 (Toshkent vaqti, UTC+5)
  function fmtDT(ms) {
    var d = new Date(ms + 5 * 3600 * 1000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear() + ' ' +
      p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }

  // Qolgan vaqtni o‘qiladigan ko‘rinishga keltiradi: "1 kun 5 soat", "3 soat 12 daq", "42 daq 10 son"
  function fmtLeft(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + ' kun ' + h + ' soat';
    if (h > 0) return h + ' soat ' + m + ' daq';
    return m + ' daq ' + sec + ' son';
  }

  function deadlineOf(ex) {
    return (ex && typeof ex.deadlineAt === 'number') ? ex.deadlineAt : null;
  }

  function isExpired(ex) {
    var dl = deadlineOf(ex);
    return dl !== null && Date.now() >= dl;
  }

  // Admin qo‘lda yopib qo‘ygan mashq
  function isClosed(ex) { return !!(ex && ex.closed === true); }
  // Talaba javob kirita olmaydi: yopilgan yoki vaqti tugagan
  function isLocked(ex) { return isClosed(ex) || isExpired(ex); }

  function timerColor(left) {
    return left <= 0 ? '#E5484D' : (left < 3600000 ? '#E8890C' : '#1FAE7A');
  }

  function sortByCreated(list) {
    return list.slice().sort(function (a, b) { return tsMs(a.createdAt) - tsMs(b.createdAt); });
  }

  function safeUrl(u) {
    var v = String(u == null ? '' : u).trim();
    return /^https?:\/\/\S+$/i.test(v) ? v : '';
  }

  function showErr(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function stopList(list) {
    while (list.length) {
      var f = list.pop();
      try { f(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- reyting ---------- */

  // Ball bo‘yicha o‘rin: teng ball: bir xil o‘rin; tengda kim oldin topshirgan bo‘lsa, yuqorida
  function rankRows(rows) {
    var sorted = rows.slice().sort(function (a, b) {
      return finalOf(b) - finalOf(a) || tsMs(a.submittedAt) - tsMs(b.submittedAt);
    });
    var rank = 0, prev = null;
    return sorted.map(function (r, idx) {
      if (finalOf(r) !== prev) { rank = idx + 1; prev = finalOf(r); }
      return { rank: rank, row: r };
    });
  }

  function leaderboardHTML(rows, myUid, adminView) {
    if (rows === null) return '<p class="lhw-muted">Natijalarni yuklab bo‘lmadi.</p>';
    if (!rows.length) return '<p class="lhw-muted">Hali hech kim topshirmagan. Birinchi bo‘lib toping!</p>';
    return '<ol class="lhw-board">' + rankRows(rows).map(function (x) {
      var r = x.row, me = !!myUid && r.studentId === myUid;
      var fin = finalOf(r);
      var score = r.graded === false ? '<span class="lhw-score lhw-pend">Tekshirilmoqda</span>' : r.penalty
        ? '<span class="lhw-score">' + fin + ' ball</span><small class="lhw-pen">' + r.penalty + ' ta jazo</small>'
        : '<span class="lhw-score">' + (r.score || 0) + '/' + subCount(r) + '</span>';
      var flag = (adminView && r.flagged) ? ' <span class="lhw-flag"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L22 20H2z" fill="#F59E0B" stroke="#B45309" stroke-width="1.5" stroke-linejoin="round"/><rect x="11" y="9" width="2" height="6" rx="1" fill="#fff"/><circle cx="12" cy="17.5" r="1.2" fill="#fff"/></svg> Domlaga</span>' : '';
      return '<li class="lhw-row' + (me ? ' me' : '') + (adminView ? ' lhw-click' : '') + '" data-sid="' + esc(r._id || '') + '">' +
        '<span class="lhw-rank">' + x.rank + '</span>' +
        '<span class="lhw-name">' + esc(r.studentName || 'Talaba') + (me ? ' <em>(siz)</em>' : '') + flag + '</span>' +
        score +
        '</li>';
    }).join('') + '</ol>';
  }

  // Mashq guruhga biriktirilgan bo‘lsa, reytingda faqat shu guruh talabalari ko‘rinadi
  function watchLeaderboard(exId, groupId, cb) {
    return db.collection(COL_SUB).where('exerciseId', '==', exId).onSnapshot(
      function (snap) {
        var rows = snap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data()); });
        if (groupId) rows = rows.filter(function (r) { return r.groupId === groupId; });
        cb(rows);
      },
      function () { cb(null); }
    );
  }

  /* ============================================================
     TALABA
     ============================================================ */
  var S = { uid: null, name: 'Talaba', groupId: '', exercises: [], subs: {}, allTotals: {}, unsubs: [], lbUnsub: null, activeId: null, timerId: null, dictText: {} };

  function stopStudentLb() {
    if (S.lbUnsub) { try { S.lbUnsub(); } catch (e) { /* ignore */ } S.lbUnsub = null; }
  }

  function studentBody() { return document.getElementById('lhwStudentBody'); }

  // Mashq guruhga biriktirilmagan bo‘lsa (guruhsiz) hamma ko‘radi; aks holda faqat o‘z guruhi
  function visibleToStudent(ex) {
    return !ex.groupId || ex.groupId === S.groupId;
  }

  function openStudent(opts) {
    var root = document.getElementById('lhwStudentRoot');
    if (!root || typeof db === 'undefined') return;
    stopList(S.unsubs);
    stopStudentLb();
    if (S.timerId) { clearInterval(S.timerId); S.timerId = null; }
    S.activeId = null;
    S.uid = (opts && opts.uid) || null;
    S.name = (opts && opts.name) || 'Talaba';
    S.groupId = (opts && opts.groupId) || '';
    root.innerHTML =
      '<div class="lhw-head"><div>' +
        '<h1>Exercises</h1>' +
        '<p>Mashqni oching, bo‘sh joylarni to‘ldiring va topshiring.</p>' +
      '</div></div>' +
      '<div class="lhw-banner"><span class="lhw-banner-ico"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#F5B700"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" fill="none" stroke="#D99A00" stroke-width="1.6"/><rect x="10.5" y="14" width="3" height="4" fill="#D99A00"/><rect x="7" y="18" width="10" height="2.5" rx="1" fill="#B77E00"/></svg></span><div><b>Abduraxmonova Mufazzalxon</b> listening marafon g‘olibi bo‘ldilar!<br>Marafon o‘z nihoyasiga yetdi. Qolgan vazifalarga mukofot berilmaydi. Har bir qilinmagan listening uchun <b>100 ta jazo</b>.</div></div>' +
      '<div id="lhwStudentBody"><div class="lhw-muted"><div class="sk-rows" role="status" aria-label="Yuklanmoqda"><i></i><i></i><i></i><i></i></div></div></div>';
    if (!S.uid) return;

    S.unsubs.push(db.collection(COL_EX).onSnapshot(function (snap) {
      S.exercises = sortByCreated(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
      renderStudentList();
    }, function (e) {
      var b = studentBody();
      if (b) b.innerHTML = '<div class="lhw-empty">Mashqlarni yuklab bo‘lmadi: ' + esc(e && e.message) + '</div>';
    }));

    S.unsubs.push(db.collection(COL_SUB).where('studentId', '==', S.uid).onSnapshot(function (snap) {
      S.subs = {};
      snap.docs.forEach(function (d) { var x = d.data(); S.subs[x.exerciseId] = x; });
      if (S.activeId) {
        var openEx = S.exercises.find(function (e) { return e.id === S.activeId; });
        if (openEx && isDict(openEx) && S.subs[openEx.id] && document.getElementById('lhwFormArea')) renderDictResult(openEx, S.subs[openEx.id]);
      }
      renderStudentList();
    }));

    // Hamma talabalarning umumiy balli (o‘rinni hisoblash uchun)
    S.unsubs.push(db.collection(COL_SUB).onSnapshot(function (snap) {
      var totals = {};
      snap.docs.forEach(function (d) {
        var x = d.data();
        totals[x.studentId] = (totals[x.studentId] || 0) + finalOf(x);
      });
      S.allTotals = totals;
      renderStudentList();
    }, function () { /* o‘rin ko‘rsatilmasa ham ro‘yxat ishlayveradi */ }));

    S.timerId = setInterval(tick, 1000);
    maybeShowWelcome();
  }

  // Har soniyada: qolgan vaqtni yangilaydi; muddat tugasa: forma yopiladi
  function tick() {
    var root = document.getElementById('lhwStudentRoot');
    if (!root || !document.body.contains(root)) return;
    var now = Date.now(), listExpired = false;
    root.querySelectorAll('[data-dl]').forEach(function (el) {
      var left = +el.getAttribute('data-dl') - now;
      el.innerHTML = left > 0 ? '<svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="2.5" rx="1" fill="#6B7280"/><rect x="5" y="19.5" width="14" height="2.5" rx="1" fill="#6B7280"/><path d="M7 4.5h10l-5 7z" fill="#F59E0B"/><path d="M7 19.5h10l-5-7z" fill="#FBBF24"/></svg> Qoldi: ' + fmtLeft(left) : '<svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E5484D"/><rect x="6.5" y="10.5" width="11" height="3" rx="1.5" fill="#fff"/></svg> Vaqt tugadi';
      el.style.color = timerColor(left);
      if (left <= 0 && el.closest('.lhw-card')) listExpired = true;
    });
    if (S.activeId) {
      var ex = S.exercises.find(function (e) { return e.id === S.activeId; });
      if (ex && isLocked(ex) && !S.subs[ex.id] && (document.getElementById('lhwSubmitForm') || document.getElementById('lhwDictForm'))) renderExpired(ex);
    } else if (listExpired) {
      renderStudentList();
    }
  }

  function renderExpired(ex) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    area.innerHTML = isClosed(ex)
      ? '<div class="lhw-warn"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#6B7280" stroke-width="2"/><rect x="5" y="10" width="14" height="11" rx="2" fill="#6B7280"/><circle cx="12" cy="15.5" r="1.5" fill="#fff"/></svg> Bu mashq yopilgan: hozircha javob kiritib bo‘lmaydi.</div>'
      : '<div class="lhw-warn"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E5484D"/><rect x="6.5" y="10.5" width="11" height="3" rx="1.5" fill="#fff"/></svg> Bu mashq uchun vaqt tugagan: javob kiritib bo‘lmaydi.</div>';
  }

  // Umumiy reytingdagi o‘rin: mendan yuqori umumiy ballga ega talabalar soni + 1
  function overallRank() {
    var ids = Object.keys(S.allTotals);
    if (!ids.length || !(S.uid in S.allTotals)) return null;
    var mine = S.allTotals[S.uid];
    var above = ids.filter(function (id) { return S.allTotals[id] > mine; }).length;
    return { rank: above + 1, of: ids.length };
  }

  // Talaba birinchi marta Listening bo‘limiga kirganda tabrik chiqadi (bir martalik)
  function maybeShowWelcome() {
    db.collection('students').doc(S.uid).get().then(function (snap) {
      if (!snap.exists || (snap.data() || {}).listeningWelcomed) return;
      showWelcomeModal(S.name, function () {
        db.collection('students').doc(S.uid).update({ listeningWelcomed: true }).catch(function () {});
      });
    }).catch(function () {});
  }

  function showWelcomeModal(name, onClose) {
    if (document.querySelector('.lhw-modal-bg')) return;
    var first = String(name || 'Talaba').split(' ')[0];
    var bg = document.createElement('div');
    bg.className = 'lhw-modal-bg';
    bg.innerHTML =
      '<div class="lhw-modal" role="dialog" aria-modal="true">' +
        '<div class="lhw-modal-emoji"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.6 1.4-6.8L2.2 9.1l6.9-.8z" fill="#F5B700" stroke="#D99A00" stroke-width="1"/></svg></div>' +
        '<h2>Tabriklayman, ' + esc(first) + '!</h2>' +
        '<p>Siz <b>Listening marafon</b>ga qo‘shildingiz!</p>' +
        '<p>Jami <b>12 ta marafon</b> bo‘ladi. Har bir mashqda bir nechta bo‘shliq bor: har bir to‘g‘ri javob <b>1 ball</b>.</p>' +
        '<div class="lhw-modal-prize"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#F5B700"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" fill="none" stroke="#D99A00" stroke-width="1.6"/><rect x="10.5" y="14" width="3" height="4" fill="#D99A00"/><rect x="7" y="18" width="10" height="2.5" rx="1" fill="#B77E00"/></svg> Marafon oxirida eng yuqori ball to‘plagan talabaga <b>sovg‘a</b> beriladi!</div>' +
        '<p class="lhw-modal-warn"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L22 20H2z" fill="#F59E0B" stroke="#B45309" stroke-width="1.5" stroke-linejoin="round"/><rect x="11" y="9" width="2" height="6" rx="1" fill="#fff"/><circle cx="12" cy="17.5" r="1.2" fill="#fff"/></svg> Eslatma: barcha bo‘shliqlar noto‘g‘ri bo‘lsa, bu taxmin deb hisoblanadi: 0 ball, <b>100 ta jazo</b> qayd etiladi va natija domlaga taqdim etiladi.</p>' +
        '<button type="button" class="lhw-modal-btn">Boshlaymiz!</button>' +
      '</div>';
    document.body.appendChild(bg);
    bg.querySelector('.lhw-modal-btn').addEventListener('click', function () {
      bg.remove();
      if (onClose) onClose();
    });
  }

  function renderStudentList() {
    if (S.activeId) return; // mashq ochiq bo‘lsa, forma o‘chib ketmasligi uchun
    var visibleList = S.exercises.filter(visibleToStudent);
    var body = studentBody();
    if (!body) return;
    if (!visibleList.length) {
      body.innerHTML = '<div class="lhw-empty">Hozircha listening uy vazifasi qo‘yilmagan.</div>';
      return;
    }
    var total = 0, done = 0;
    visibleList.forEach(function (ex) { var sb = S.subs[ex.id]; if (sb) { done++; total += finalOf(sb); } });
    var summary = '<div class="lhw-total">' +
      '<div><span class="lhw-total-label">Sizning umumiy ballingiz</span><span class="lhw-total-num">' + total + '</span></div>' +
      '<div class="lhw-total-meta">Topshirildi: ' + done + ' / ' + visibleList.length + '</div>' +
      '<div class="lhw-total-meta"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E5484D"/><circle cx="12" cy="12" r="6.5" fill="#fff"/><circle cx="12" cy="12" r="3.5" fill="#E5484D"/></svg> Qolgan marafon: ' + Math.max(0, MARATHON_TOTAL - S.exercises.length) + ' ta</div>' +
      (function () {
        var o = overallRank();
        return o ? '<div class="lhw-total-meta"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2h3l1 6H7zM13 2h3l-1 6h-3z" fill="#3B82F6"/><circle cx="12" cy="15" r="6" fill="#F5B700" stroke="#D99A00" stroke-width="1.2"/></svg> Umumiy o‘rin: ' + o.rank + '-o‘rin / ' + o.of + '</div>' : '';
      })() + '</div>';
    body.innerHTML = '<div class="lhw-list">' + visibleList.map(function (ex, i) {
      var sub = S.subs[ex.id];
      var dl = isClosed(ex) ? null : deadlineOf(ex), expired = isLocked(ex);
      var timer = '';
      if (isClosed(ex) && !sub) {
        timer = '<small class="lhw-timer" style="display:block;font-weight:700;color:#6B7280;"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#6B7280" stroke-width="2"/><rect x="5" y="10" width="14" height="11" rx="2" fill="#6B7280"/><circle cx="12" cy="15.5" r="1.5" fill="#fff"/></svg> Yopiq</small>';
      } else if (dl !== null && !sub) {
        timer = expired
          ? '<small class="lhw-timer" style="display:block;font-weight:700;color:#E5484D;"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E5484D"/><rect x="6.5" y="10.5" width="11" height="3" rx="1.5" fill="#fff"/></svg> Vaqt tugadi</small>'
          : '<small class="lhw-timer" data-dl="' + dl + '" style="display:block;font-weight:700;color:' + timerColor(dl - Date.now()) + ';"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="2.5" rx="1" fill="#6B7280"/><rect x="5" y="19.5" width="14" height="2.5" rx="1" fill="#6B7280"/><path d="M7 4.5h10l-5 7z" fill="#F59E0B"/><path d="M7 19.5h10l-5-7z" fill="#FBBF24"/></svg> Qoldi: ' + fmtLeft(dl - Date.now()) + '</small>';
      }
      var badge = sub
        ? (sub.penalty
            ? '<span class="lhw-badge bad" style="background:rgba(229,72,77,.12);color:#E5484D;">Taxmin: ' + sub.penalty + ' ta jazo</span>'
            : '<span class="lhw-badge done" style="background:rgba(31,174,122,.14);color:#1FAE7A;">' + (sub.score || 0) + '/' + subCount(sub) + ' ball</span>')
        : (expired
            ? '<span class="lhw-badge todo" style="background:rgba(120,120,130,.18);color:#6B7280;">Yopilgan</span>'
            : '<span class="lhw-badge todo" style="background:rgba(229,72,77,.12);color:#E5484D;">Topshirilmagan</span>');
      if (sub && sub.graded === false) badge = '<span class="lhw-badge done" style="background:rgba(232,137,12,.14);color:#B45309;">Tekshirilmoqda</span>';
      return '<button type="button" class="lhw-card" data-id="' + esc(ex.id) + '">' +
        '<span class="lhw-num">' + (i + 1) + '</span>' +
        '<span class="lhw-card-title">' + esc(ex.title) + timer + (isDict(ex) ? ' <span class="lhw-dict-btn">ESHITIB YOZISH</span>' : '') + '</span>' + badge +
        '</button>';
    }).join('') + '</div>';
    body.querySelectorAll('.lhw-card').forEach(function (b) {
      b.addEventListener('click', function () { openExercise(b.getAttribute('data-id')); });
    });
  }

  function openExercise(id) {
    var ex = S.exercises.find(function (e) { return e.id === id; });
    var body = studentBody();
    if (!ex || !body) return;
    stopStudentLb();
    S.activeId = id;
    var media = safeUrl(ex.mediaUrl);
    body.innerHTML =
      '<button type="button" class="lhw-back" id="lhwBack">Ro‘yxatga qaytish</button>' +
      '<div class="lhw-detail' + (isDict(ex) ? ' lhw-protect' : '') + '">' +
        '<h2>' + esc(ex.title) + '</h2>' +
        (media && isDict(ex) ? dictAudioHTML(media) : '') +
        (media && !isDict(ex) ? '<a class="lhw-media" href="' + esc(media) + '" target="_blank" rel="noopener noreferrer"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="#374151" stroke-width="2"/><rect x="3" y="14" width="5" height="7" rx="2" fill="#3B82F6"/><rect x="16" y="14" width="5" height="7" rx="2" fill="#3B82F6"/></svg> Audio / materialni ochish</a>' : '') +
        (!isClosed(ex) && deadlineOf(ex) !== null && !S.subs[id]
          ? '<p class="lhw-deadline" data-dl="' + deadlineOf(ex) + '" style="font-weight:700;margin:8px 0;"></p>'
          : '') +
        '<div id="lhwFormArea"></div>' +
      '</div>' +
      '<div class="lhw-lb-wrap">' +
        '<h3 class="lhw-sub-title">Reyting</h3>' +
        '<button type="button" class="lhw-btn primary lhw-lb-btn" id="lhwLbBtn"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="12" width="4" height="9" fill="#3B82F6"/><rect x="10" y="7" width="4" height="14" fill="#1FAE7A"/><rect x="17" y="3" width="4" height="18" fill="#F59E0B"/></svg> Jonli reytingni ko‘rish</button>' +
        '<div id="lhwLeaderboard" class="lhw-lb" hidden></div>' +
      '</div>';

    document.getElementById('lhwBack').addEventListener('click', function () {
      stopStudentLb();
      S.activeId = null;
      renderStudentList();
    });
    document.getElementById('lhwLbBtn').addEventListener('click', function () {
      showStudentLeaderboard(ex);
    });

    var sub = S.subs[id];
    if (isDict(ex)) renderDictBody(ex, sub);
    else if (sub) renderResult(ex, sub);
    else if (isLocked(ex)) renderExpired(ex);
    else renderForm(ex);
    tick();
  }

  // Tugma bosilganda reyting jonli (real vaqt) rejimda ochiladi
  function showStudentLeaderboard(ex) {
    var btn = document.getElementById('lhwLbBtn');
    var lb = document.getElementById('lhwLeaderboard');
    if (!lb) return;
    stopStudentLb();
    if (btn) btn.hidden = true;
    lb.hidden = false;
    lb.innerHTML = '<p class="lhw-live"><span class="lhw-dot"></span> Jonli yangilanmoqda</p><div class="lhw-muted"><div class="sk-rows" role="status" aria-label="Yuklanmoqda"><i></i><i></i><i></i><i></i></div></div>';
    S.lbUnsub = watchLeaderboard(ex.id, ex.groupId || '', function (rows) {
      var el = document.getElementById('lhwLeaderboard');
      if (el) el.innerHTML = '<p class="lhw-live"><span class="lhw-dot"></span> Jonli yangilanmoqda</p>' + leaderboardHTML(rows, S.uid, false);
    });
  }

  function renderForm(ex) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    var inputs = '';
    var n = countOf(ex);
    for (var i = 0; i < n; i++) {
      inputs += '<label class="lhw-blank"><span class="lhw-blank-no">' + (i + 1) + '</span>' +
        '<input type="text" autocomplete="off" spellcheck="false" data-i="' + i + '" placeholder="Bo‘sh joy ' + (i + 1) + '"></label>';
    }
    area.innerHTML =
      '<form id="lhwSubmitForm" class="lhw-form-student">' + inputs +
        '<p class="lhw-err" id="lhwSubErr" hidden></p>' +
        '<button type="submit" class="lhw-btn primary" id="lhwSubmitBtn">Topshirish</button>' +
        '<p class="lhw-hint">Diqqat: topshirilgan javobni keyin o‘zgartirib bo‘lmaydi.</p>' +
      '</form>';
    document.getElementById('lhwSubmitForm').addEventListener('submit', function (e) {
      e.preventDefault();
      submitExercise(ex);
    });
  }

  function submitExercise(ex) {
    var err = document.getElementById('lhwSubErr');
    var btn = document.getElementById('lhwSubmitBtn');
    if (isLocked(ex)) { renderExpired(ex); return; }
    var answers = [];
    document.querySelectorAll('#lhwFormArea input[data-i]').forEach(function (inp) {
      answers[+inp.getAttribute('data-i')] = inp.value.trim();
    });
    var n = countOf(ex);
    for (var i = 0; i < n; i++) {
      if (!answers[i]) { showErr(err, 'Barcha ' + n + ' ta bo‘sh joyni to‘ldiring.'); return; }
      if (answers[i].length > MAX_ANSWER_LEN) { showErr(err, 'Javob juda uzun.'); return; }
    }
    if (err) err.hidden = true;
    btn.disabled = true;

    var ref = db.collection(COL_SUB).doc(ex.id + '_' + S.uid);
    ref.get().then(function (snap) {
      if (snap.exists) return snap.data(); // allaqachon topshirilgan
      var g = grade(ex.answers, answers);
      var data = {
        exerciseId: ex.id,
        studentId: S.uid,
        studentName: S.name,
        groupId: S.groupId || '',
        answers: answers,
        score: g.score,
        total: countOf(ex),
        marks: g.marks,
        penalty: g.penalty,
        finalScore: g.finalScore,
        flagged: g.flagged,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      return ref.set(data).then(function () { return data; });
    }).then(function (data) {
      S.subs[ex.id] = data;
      if (S.activeId === ex.id) renderResult(ex, data); // talaba boshqa mashqqa o‘tib ketmagan bo‘lsa
    }).catch(function (e) {
      btn.disabled = false;
      var denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      showErr(err, denied && isLocked(ex)
        ? (isClosed(ex) ? 'Mashq yopilgan: javob qabul qilinmaydi.' : 'Vaqt tugagan: javob qabul qilinmaydi.')
        : 'Xatolik: ' + (e && e.message ? e.message : 'topshirib bo‘lmadi'));
    });
  }

  /* ---------- Eshitib yozish: talaba ---------- */
  function dictAudioHTML(url) {
    var direct = /\.(mp3|wav|ogg|m4a|aac|webm)(\?|#|$)/i.test(url);
    return direct
      ? '<audio class="lhw-audio" controls preload="metadata" controlslist="nodownload noplaybackrate" src="' + esc(url) + '"></audio>'
      : '<a class="lhw-media" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Audioni ochish</a>';
  }

  function renderDictBody(ex, sub) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    if (sub) { renderDictResult(ex, sub); return; }
    if (isLocked(ex)) { renderExpired(ex); return; }
    area.innerHTML =
      '<form id="lhwDictForm" class="lhw-form-student">' +
        '<p class="lhw-hint">Audioni eshiting va eshitganingizni o‘zingiz yozing. Matnni nusxalab bo‘lmaydi. Topshirgach o‘zgartirib bo‘lmaydi.</p>' +
        '<textarea id="lhwDictText" class="lhw-dict-ta" maxlength="' + DICT_MAX + '" rows="10" spellcheck="false" autocomplete="off" placeholder="Eshitganingizni shu yerga yozing..."></textarea>' +
        '<p class="lhw-err" id="lhwSubErr" hidden></p>' +
        '<button type="submit" class="lhw-btn primary" id="lhwSubmitBtn">Topshirish</button>' +
      '</form>';
    var ta = document.getElementById('lhwDictText');
    ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop'].forEach(function (evt) {
      ta.addEventListener(evt, function (e) { e.preventDefault(); });
    });
    document.getElementById('lhwDictForm').addEventListener('submit', function (e) {
      e.preventDefault();
      submitDictation(ex);
    });
    protectView();
  }

  function submitDictation(ex) {
    var err = document.getElementById('lhwSubErr');
    var btn = document.getElementById('lhwSubmitBtn');
    if (isLocked(ex)) { renderExpired(ex); return; }
    var ta = document.getElementById('lhwDictText');
    var text = ta ? ta.value.trim() : '';
    if (!dictTokens(text).length) { showErr(err, 'Eshitganingizni yozing: matn bo‘sh.'); return; }
    if (text.length > DICT_MAX) { showErr(err, 'Matn juda uzun (' + DICT_MAX + ' belgigacha).'); return; }
    if (err) err.hidden = true;
    btn.disabled = true;
    var id = ex.id + '_' + S.uid;
    var subRef = db.collection(COL_SUB).doc(id);
    var txtRef = db.collection(COL_TXT).doc(id);
    subRef.get().then(function (snap) {
      if (snap.exists) return snap.data();
      var data = {
        exerciseId: ex.id, studentId: S.uid, studentName: S.name, groupId: S.groupId || '',
        kind: 'dictation', graded: false, answers: [], marks: [], score: 0, total: DICT_POINTS,
        penalty: 0, finalScore: 0, flagged: false,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      var batch = db.batch();
      batch.set(txtRef, { exerciseId: ex.id, studentId: S.uid, text: text, submittedAt: data.submittedAt });
      batch.set(subRef, data);
      return batch.commit().then(function () { return data; });
    }).then(function (data) {
      S.subs[ex.id] = data;
      S.dictText[ex.id] = text;
      if (S.activeId === ex.id) renderDictResult(ex, data);
    }).catch(function (e) {
      btn.disabled = false;
      var denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      showErr(err, denied && isLocked(ex)
        ? 'Mashq yopilgan yoki vaqt tugagan: javob qabul qilinmaydi.'
        : 'Xatolik: ' + (e && e.message ? e.message : 'topshirib bo‘lmadi'));
    });
  }

  function renderDictResult(ex, sub) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    var mineId = ex.id + '_' + S.uid;
    var textHtml = '<div class="lhw-dict-mine"><b>Sizning matningiz:</b><div id="lhwDictMine" class="lhw-dict-text">' +
      esc(S.dictText[ex.id] || 'Yuklanmoqda…') + '</div></div>';
    if (S.dictText[ex.id] == null) {
      db.collection(COL_TXT).doc(mineId).get().then(function (s) {
        var t = s.exists ? String((s.data() || {}).text || '') : '';
        S.dictText[ex.id] = t;
        var el = document.getElementById('lhwDictMine');
        if (el) el.textContent = t || '—';
      }).catch(function () {
        var el = document.getElementById('lhwDictMine');
        if (el) el.textContent = 'Yuklab bo‘lmadi';
      });
    }
    if (sub.graded === false) {
      area.innerHTML = '<div class="lhw-result">' +
        '<div class="lhw-warn lhw-pending">Javobingiz qabul qilindi. Natija o‘qituvchi tekshirgach chiqadi.</div>' +
        textHtml + '</div>';
      return;
    }
    var d = sub.diff || {};
    area.innerHTML = '<div class="lhw-result">' +
      '<div class="lhw-score-big">' + (sub.score || 0) + '<span>/' + DICT_POINTS + '</span></div>' +
      '<p class="lhw-muted">Aniqlik: <b>' + (d.pct || 0) + '%</b>. Natija topshirilgan: o‘zgartirib bo‘lmaydi.</p>' +
      '<ul class="lhw-dict-stats">' +
        '<li class="ok">To‘g‘ri: <b>' + (d.eq || 0) + '</b></li>' +
        '<li class="spell">Imlo xatosi: <b>' + (d.spell || 0) + '</b></li>' +
        '<li class="bad">Noto‘g‘ri so‘z: <b>' + (d.wrong || 0) + '</b></li>' +
        '<li class="bad">Tushib qolgan: <b>' + (d.missing || 0) + '</b></li>' +
        '<li class="extra">Ortiqcha: <b>' + (d.extra || 0) + '</b></li>' +
      '</ul>' + textHtml +
      '<p class="lhw-hint lhw-ask-teacher">To‘g‘ri matnni o‘qituvchingizdan oling.</p>' +
    '</div>';
  }

  // Nusxalash, kesish, joylashtirish, o‘ng tugma va tanlashni cheklaydi (faqat shu brauzer ichida)
  var _protectOn = false;
  function protectView() {
    if (_protectOn) return;
    _protectOn = true;
    var active = function () { return !!document.querySelector('.lhw-protect'); };
    ['copy', 'cut', 'paste', 'contextmenu', 'dragstart'].forEach(function (evt) {
      document.addEventListener(evt, function (e) { if (active()) e.preventDefault(); }, true);
    });
    document.addEventListener('selectstart', function (e) {
      if (active() && !(e.target && e.target.closest && e.target.closest('textarea'))) e.preventDefault();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!active()) return;
      var k = String(e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].indexOf(k) !== -1) e.preventDefault();
    }, true);
  }

  function renderResult(ex, sub) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    var marks = sub.marks || [];
    var answers = sub.answers || [];
    var rows = '';
    var n = subCount(sub);
    for (var i = 0; i < n; i++) {
      var ok = !!marks[i];
      // To‘g‘ri javoblar talabaga ko‘rsatilmaydi: faqat o‘z javobi va belgisi
      rows += '<li class="lhw-res ' + (ok ? 'ok' : 'bad') + '">' +
        '<span class="lhw-blank-no">' + (i + 1) + '</span>' +
        '<span class="lhw-res-yours">' + esc(answers[i] || '-') + '</span>' +
        '<span class="lhw-res-mark">' + (ok ? '✓' : '✗') + '</span>' +
        '</li>';
    }
    var score = sub.score || 0;
    area.innerHTML =
      '<div class="lhw-result">' +
        '<div class="lhw-score-big">' + score + '<span>/' + n + '</span></div>' +
        '<p class="lhw-muted">Siz ' + n + ' ta bo‘shliqdan ' + score + 'tasini to‘g‘ri topdingiz. Natija topshirilgan: o‘zgartirib bo‘lmaydi.</p>' +
        (sub.penalty ? '<div class="lhw-warn"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L22 20H2z" fill="#F59E0B" stroke="#B45309" stroke-width="1.5" stroke-linejoin="round"/><rect x="11" y="9" width="2" height="6" rx="1" fill="#fff"/><circle cx="12" cy="17.5" r="1.2" fill="#fff"/></svg> Taxmin aniqlandi: 0 ball, ' + sub.penalty + ' ta jazo qayd etildi. Natija domlaga taqdim etildi.</div>' : '') +
        '<ol class="lhw-res-list">' + rows + '</ol>' +
        '<p class="lhw-hint lhw-ask-teacher"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" fill="#3B82F6"/><path d="M3 6l9 7 9-7" fill="none" stroke="#fff" stroke-width="1.8"/></svg> To‘g‘ri javoblarni o‘qituvchingizdan oling.</p>' +
      '</div>';
  }

  /* ============================================================
     ADMIN
     ============================================================ */
  var A = { exercises: [], unsubs: [], lbUnsub: null, editingId: null, lbId: null, detailSid: null, lastRows: [], allSubs: [], groupNames: {}, keys: {}, groupRoster: null };

  function stopAdminLb() {
    if (A.lbUnsub) { try { A.lbUnsub(); } catch (e) { /* ignore */ } A.lbUnsub = null; }
  }

  function openAdmin() {
    var root = document.getElementById('lhwAdminRoot');
    if (!root || typeof db === 'undefined') return;
    stopList(A.unsubs);
    stopAdminLb();
    A.editingId = null;
    A.lbId = null;

    var blanks = answerRowsHTML(['', '', '', '', '']);

    root.innerHTML =
      '<div class="lhw-head"><div>' +
        '<h1>Listening uy vazifalari</h1>' +
        '<p>Har bir mashq uchun kerakli sonda (1–40) to‘g‘ri javob kiriting. Talaba bo‘sh joylarni to‘ldiradi; har bir to‘g‘ri javob: 1 ball. Bir nechta to‘g‘ri variant uchun "|" belgisidan foydalaning.</p>' +
      '</div></div>' +
      '<div id="lhwOverall" class="lhw-overall"></div>' +
      '<div class="lhw-admin-grid">' +
        '<form id="lhwAdminForm" class="lhw-form">' +
          '<h3 id="lhwFormTitle">Yangi mashq qo‘shish</h3>' +
          '<label class="lhw-field"><span>Mashq nomi *</span><input type="text" id="lhwTitle" maxlength="120" placeholder="Masalan: 1-mashq"></label>' +
          '<label class="lhw-field"><span>Guruh</span><select id="lhwGroup"><option value="">Barcha guruhlar</option></select></label>' +
          '<label class="lhw-field"><span>Mashq turi</span><select id="lhwKind"><option value="blanks">Bo‘shliqli (javoblar avtomatik tekshiriladi)</option><option value="dictation">Eshitib yozish (dikta)</option></select></label>' +
          '<label class="lhw-field lhw-dict-field" style="display:none;"><span>Asl matn: audioda aytilgan so‘zlar (tekshirish uchun, talabaga ko‘rinmaydi)</span><textarea id="lhwTranscript" rows="8" spellcheck="false" placeholder="Audioda aytilgan matnni to‘liq yozing"></textarea></label>' +
          '<label class="lhw-field"><span>Topshirish muddati, soat (ixtiyoriy)</span>' +
            '<input type="number" id="lhwHours" min="0.1" max="1000" step="any" placeholder="Masalan: 24 yoki 30 (bo‘sh: cheklanmagan)"></label>' +
          '<p class="lhw-hint">Muddat saqlangan paytdan boshlab hisoblanadi. Tahrirlashda soatni o‘zgartirsangiz, muddat qaytadan hozirdan boshlanadi. Vaqt tugagach talabalar javob kirita olmaydi.</p>' +
          '<label class="lhw-field"><span>Audio / material havolasi (ixtiyoriy)</span><input type="text" id="lhwMedia" placeholder="https://..."></label>' +
          '<div id="lhwBlanksWrap">' +
          '<div class="lhw-bulk">' +
            '<label class="lhw-field"><span><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#F5B700"/></svg> Tezkor kiritish: javoblarni bittada qo‘ying</span>' +
              '<textarea id="lhwBulk" rows="5" spellcheck="false" placeholder="Har qatorda bitta javob (Enter bilan ajrating):&#10;apple&#10;banana | bananas&#10;cat&#10;dog&#10;egg"></textarea></label>' +
            '<p class="lhw-bulk-st" id="lhwBulkSt">Javoblarni shu yerga ustun qilib yozing yoki joylab qo‘ying: pastdagi bo‘sh joylar o‘zi to‘ladi. “1. apple” ko‘rinishidagi raqamlar avtomatik olib tashlanadi.</p>' +
          '</div>' +
          '<div class="lhw-answers" id="lhwAnswers">' + blanks + '</div>' +
          '<div class="lhw-blank-tools"><button type="button" class="lhw-btn sm" id="lhwAddBlank">+ Bo‘sh joy qo‘shish</button>' +
          '<span class="lhw-muted" id="lhwBlankCount"></span></div>' +
          '</div>' +
          '<p class="lhw-err" id="lhwFormErr" hidden></p>' +
          '<div class="lhw-actions">' +
            '<button type="submit" class="lhw-btn primary" id="lhwSave">Saqlash</button>' +
            '<button type="button" class="lhw-btn" id="lhwCancel" hidden>Bekor qilish</button>' +
          '</div>' +
        '</form>' +
        '<div class="lhw-admin-list"><div id="lhwAdminList"></div></div>' +
      '</div>' +
      '<div id="lhwAdminLb" class="lhw-lb-panel" hidden></div>';

    document.getElementById('lhwAdminForm').addEventListener('submit', saveExercise);
    document.getElementById('lhwKind').addEventListener('change', applyKindUI);
    initBulkAnswers();
    loadGroupOptions();
    document.getElementById('lhwCancel').addEventListener('click', resetAdminForm);
    document.getElementById('lhwAdminList').addEventListener('click', onAdminListClick);

    A.unsubs.push(db.collection(COL_SUB).onSnapshot(function (snap) {
      A.allSubs = snap.docs.map(function (d) { return d.data(); });
      renderOverall();
    }));

    A.unsubs.push(db.collection(COL_EX).onSnapshot(function (snap) {
      A.exercises = sortByCreated(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
      renderOverall();
      if (A.lbId && !A.exercises.some(function (e) { return e.id === A.lbId; })) closeAdminLb();
      renderAdminList();
    }, function (e) {
      var list = document.getElementById('lhwAdminList');
      if (list) list.innerHTML = '<div class="lhw-empty">Yuklab bo‘lmadi: ' + esc(e && e.message) + '</div>';
    }));
  }

  // Tezkor kiritish: bitta oynaga har qatorga bitta javob: bo‘sh joylar avtomatik to‘ladi
  function parseBulkLines(text) {
    return String(text || '').split(/\r?\n/)
      .map(function (l) { return l.replace(/^\s*\d{1,2}\s*[.)\-:]\s+/, '').trim(); })
      .filter(function (l) { return l.length; });
  }

  // Javob maydonlari soni o‘zgaruvchan (1 dan MAX_BLANKS gacha)
  function readAnswerValues() {
    return Array.prototype.map.call(document.querySelectorAll('#lhwAnswers input[data-ans]'), function (inp) {
      return inp.value;
    });
  }

  function answerRowsHTML(vals) {
    return vals.map(function (v, i) {
      return '<div class="lhw-ans-row">' +
        '<label class="lhw-field"><span>' + (i + 1) + '-bo‘sh joy javobi *</span>' +
        '<input type="text" data-ans="' + i + '" maxlength="' + MAX_ANSWER_LEN + '" autocomplete="off" value="' + esc(v) + '" placeholder="Masalan: apple  (yoki: apple | apples)"></label>' +
        '<button type="button" class="lhw-btn sm danger" data-rm="' + i + '" title="Bu bo‘sh joyni o‘chirish" aria-label="O‘chirish">✕</button>' +
        '</div>';
    }).join('');
  }

  function updateBlankCount() {
    var n = readAnswerValues().length;
    var el = document.getElementById('lhwBlankCount');
    if (el) el.textContent = 'Bo‘sh joylar: ' + n + ' / ' + MAX_BLANKS;
    var add = document.getElementById('lhwAddBlank');
    if (add) add.disabled = n >= MAX_BLANKS;
  }

  function setAnswerRows(vals) {
    var box = document.getElementById('lhwAnswers');
    if (!box) return;
    box.innerHTML = answerRowsHTML((vals && vals.length) ? vals.slice(0, MAX_BLANKS) : ['']);
    updateBlankCount();
  }

  function initBulkAnswers() {
    var ta = document.getElementById('lhwBulk');
    var st = document.getElementById('lhwBulkSt');
    var box = document.getElementById('lhwAnswers');
    if (!ta || !box) return;
    var defaultMsg = st ? st.textContent : '';
    function setStatus(msg, kind) { if (st) { st.textContent = msg; st.className = 'lhw-bulk-st' + (kind ? ' ' + kind : ''); } }
    function clip(v) { return String(v).slice(0, MAX_ANSWER_LEN); }

    ta.addEventListener('input', function () {
      var all = parseBulkLines(ta.value);
      if (!all.length) { setStatus(defaultMsg); return; }
      var lines = all.slice(0, MAX_BLANKS).map(clip);
      setAnswerRows(lines);
      if (all.length > MAX_BLANKS) setStatus(all.length + ' ta qator kiritildi, faqat dastlabki ' + MAX_BLANKS + ' tasi olindi.', 'warn');
      else setStatus('✓ ' + lines.length + ' ta javob joylashtirildi: pastda tekshirib, “Saqlash” ni bosing.', 'ok');
    });

    // Bo‘sh joy maydoniga ko‘p qatorli matn joylansa: shu maydondan boshlab ketma-ket to‘ldiriladi
    box.addEventListener('paste', function (e) {
      var inp = e.target.closest ? e.target.closest('input[data-ans]') : null;
      if (!inp) return;
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!/\r?\n/.test(txt.trim())) return;
      var lines = parseBulkLines(txt);
      if (lines.length < 2) return;
      e.preventDefault();
      var start = +inp.getAttribute('data-ans');
      var vals = readAnswerValues();
      var n = 0;
      lines.forEach(function (l, k) {
        var idx = start + k;
        if (idx >= MAX_BLANKS) return;
        while (vals.length <= idx) vals.push('');
        vals[idx] = clip(l);
        n++;
      });
      setAnswerRows(vals);
      setStatus('✓ ' + n + ' ta javob joylashtirildi' + (start + lines.length > MAX_BLANKS ? ' (ortiqcha qatorlar olinmadi)' : '') + '.', 'ok');
    });

    // O‘chirish (✕) tugmasi
    box.addEventListener('click', function (e) {
      var rm = e.target.closest ? e.target.closest('button[data-rm]') : null;
      if (!rm) return;
      var vals = readAnswerValues();
      vals.splice(+rm.getAttribute('data-rm'), 1);
      setAnswerRows(vals);
    });

    // + Bo‘sh joy qo‘shish
    var add = document.getElementById('lhwAddBlank');
    if (add) add.addEventListener('click', function () {
      var vals = readAnswerValues();
      if (vals.length >= MAX_BLANKS) return;
      vals.push('');
      setAnswerRows(vals);
      var inps = box.querySelectorAll('input[data-ans]');
      if (inps.length) inps[inps.length - 1].focus();
    });
    updateBlankCount();
  }

  // Guruhlar ro‘yxatini oquv_groups dan to‘ldiradi
  function loadGroupOptions() {
    db.collection('oquv_groups').orderBy('name').get().then(function (snap) {
      var sel = document.getElementById('lhwGroup');
      if (!sel) return;
      var keep = sel.value;
      snap.docs.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.id;
        o.textContent = d.data().name || d.id;
        A.groupNames[d.id] = o.textContent;
        sel.appendChild(o);
      });
      sel.value = keep;
    }).catch(function () { /* guruhlar yuklanmasa ham "Barcha guruhlar" ishlaydi */ });
  }

  // Admin: barcha talabalarning umumiy reytingi (jonli)
  function renderOverall() {
    var box = document.getElementById('lhwOverall');
    if (!box) return;
    var by = {};
    A.allSubs.forEach(function (x) {
      var k = x.studentId;
      if (!by[k]) by[k] = { id: k, name: 'Talaba', groupId: '', total: 0, done: 0, flagged: 0, last: 0 };
      by[k].last = Math.max(by[k].last, tsMs(x.submittedAt));
      by[k].name = x.studentName || by[k].name;
      if (x.groupId) by[k].groupId = x.groupId;
      by[k].total += finalOf(x);
      by[k].done += 1;
      if (x.flagged) by[k].flagged += 1;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) { return b.total - a.total || b.done - a.done; });
    var rank = 0, prev = null;
    var rowsHtml = list.map(function (r, idx) {
      if (r.total !== prev) { rank = idx + 1; prev = r.total; }
      var grp = r.groupId ? (A.groupNames[r.groupId] || '-') : 'Guruhsiz';
      return '<tr>' +
        '<td class="lhw-t-rank">' + rank + '</td>' +
        '<td><button type="button" class="lhw-link" data-uid="' + esc(r.id) + '" data-name="' + esc(r.name) + '">' + esc(r.name) + '</button></td>' +
        '<td class="lhw-muted">' + esc(grp) + '</td>' +
        '<td class="lhw-t-total">' + r.total + '</td>' +
        '<td>' + r.done + ' / ' + A.exercises.length + '</td>' +
        '<td>' + fmtDT(r.last) + '</td>' +
        '<td>' + (r.flagged ? '<span class="lhw-flag"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L22 20H2z" fill="#F59E0B" stroke="#B45309" stroke-width="1.5" stroke-linejoin="round"/><rect x="11" y="9" width="2" height="6" rx="1" fill="#fff"/><circle cx="12" cy="17.5" r="1.2" fill="#fff"/></svg> ' + r.flagged + '</span>' : '-') + '</td>' +
        '</tr>';
    }).join('');
    box.innerHTML =
      '<div class="lhw-overall-card">' +
        '<div class="lhw-lb-head"><h3>Umumiy reyting</h3>' +
          '<div class="lhw-lb-tools"><span class="lhw-muted">Mashqlar: ' + A.exercises.length + ' ta · Ishtirokchilar: ' + list.length + ' ta</span>' +
          '<button type="button" class="lhw-btn sm lhw-noexp" id="lhwOverallPng">Rasm yuklash</button><button type="button" class="lhw-btn sm lhw-noexp" id="lhwOverallRefresh"><svg class="lhw-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg> Yangilash</button></div></div>' +
        (list.length
          ? '<div class="lhw-overall-wrap"><table class="lhw-table"><thead><tr>' +
              '<th>O‘rin</th><th>Talaba</th><th>Guruh</th><th>Jami ball</th><th>Topshirgan</th><th>Oxirgi topshirgan vaqti</th><th>Taxmin</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
          : '<p class="lhw-muted">Hali hech kim topshirmagan.</p>') +
        '<div id="lhwOverallDetail"></div>' +
      '</div>';
    var btn = document.getElementById('lhwOverallRefresh');
    if (btn) btn.addEventListener('click', refreshOverall);
    var pngBtn = document.getElementById('lhwOverallPng');
    if (pngBtn) pngBtn.addEventListener('click', function () {
      var card = box.querySelector('.lhw-overall-card');
      if (!card || typeof html2canvas !== 'function') { alert('Rasm kutubxonasi yuklanmadi'); return; }
      html2canvas(card, {
        scale: 2, backgroundColor: '#ffffff',
        ignoreElements: function (el) { return !!(el.classList && el.classList.contains('lhw-noexp')); },
        onclone: function (doc, el) { el.style.background = '#ffffff'; el.style.color = '#1c1c22'; }
      }).then(function (canvas) {
        canvas.toBlob(function (blob) {
          if (!blob) { alert('Rasmni yaratib bo‘lmadi'); return; }
          var url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = 'umumiy-reyting.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        }, 'image/png');
      }).catch(function (e) { alert('Rasmga olib bo‘lmadi: ' + (e && e.message)); });
    });
    box.querySelectorAll('[data-uid]').forEach(function (b) {
      b.addEventListener('click', function () {
        var uid = b.getAttribute('data-uid');
        showOverallDetail(A.overallUid === uid ? null : uid, b.getAttribute('data-name'));
      });
    });
    if (A.overallUid) showOverallDetail(A.overallUid, A.overallName);
  }

  // Talaba ustiga bosilganda: har bir mashq bo‘yicha qaysi bo‘shliqni to‘g‘ri/noto‘g‘ri yechgani
  function showOverallDetail(uid, name) {
    A.overallUid = uid || null;
    A.overallName = name || '';
    var box = document.getElementById('lhwOverallDetail');
    if (!box) return;
    if (!uid) { box.innerHTML = ''; return; }
    var mine = {};
    A.allSubs.forEach(function (x) { if (x.studentId === uid) mine[x.exerciseId] = x; });
    var correctAll = 0, totalAll = 0, pointsAll = 0;
    var cards = A.exercises.map(function (ex, idx) {
      var title = ex.title || ('Mashq ' + (idx + 1));
      var sub = mine[ex.id];
      if (!sub) {
        return '<li class="lhw-res-ex none"><div class="lhw-res-ex-h"><b>' + esc(title) + '</b><span class="lhw-muted">Topshirilmagan</span></div></li>';
      }
      var answers = sub.answers || [];
      var n = subCount(sub);
      var marks = (sub.marks && sub.marks.length) ? sub.marks : grade(ex.answers, answers).marks;
      var correct = 0, items = '';
      for (var i = 0; i < n; i++) {
        var ok = !!marks[i];
        if (ok) correct++;
        var key = String((ex.answers || [])[i] || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean).join(' / ') || '-';
        items += '<li class="lhw-res ' + (ok ? 'ok' : 'bad') + '">' +
          '<span class="lhw-blank-no">' + (i + 1) + '</span>' +
          '<span class="lhw-res-yours">' + esc(answers[i] || '-') + '</span>' +
          (ok ? '<span class="lhw-res-mark">✓</span>'
              : '<span class="lhw-res-mark">✗ <small>to‘g‘ri: ' + esc(key) + '</small></span>') +
          '</li>';
      }
      correctAll += correct; totalAll += n; pointsAll += finalOf(sub);
      var summary = sub.penalty
        ? 'Taxmin: 0 ball, ' + sub.penalty + ' ta jazo'
        : correct + ' / ' + n + ' to‘g‘ri · ' + finalOf(sub) + ' ball';
      return '<li class="lhw-res-ex"><div class="lhw-res-ex-h"><b>' + esc(title) + '</b><span class="lhw-muted">' + esc(summary) + '</span></div>' +
        '<ol class="lhw-res-list">' + items + '</ol></li>';
    }).join('');
    box.innerHTML = '<div class="lhw-admin-detail">' +
      '<div class="lhw-lb-head"><h3>' + esc(name || 'Talaba') + ': mashqlar natijalari</h3>' +
      '<span class="lhw-muted">Jami: ' + pointsAll + ' ball · ' + correctAll + ' / ' + totalAll + ' to‘g‘ri</span></div>' +
      '<ol class="lhw-ex-list">' + cards + '</ol></div>';
  }

  // Qo‘lda yangilash: barcha topshiriqlarni qayta o‘qiydi
  function refreshOverall() {
    var btn = document.getElementById('lhwOverallRefresh');
    if (btn) btn.disabled = true;
    db.collection(COL_SUB).get().then(function (snap) {
      A.allSubs = snap.docs.map(function (d) { return d.data(); });
      renderOverall();
    }).catch(function (e) {
      alert('Yangilashda xatolik: ' + (e && e.message));
      if (btn) btn.disabled = false;
    });
  }

  function renderAdminList() {
    var list = document.getElementById('lhwAdminList');
    if (!list) return;
    if (!A.exercises.length) {
      list.innerHTML = '<div class="lhw-empty">Hali mashq yo‘q. Chap tomondagi forma orqali qo‘shing.</div>';
      return;
    }
    list.innerHTML = A.exercises.map(function (ex, i) {
      var preview = (ex.answers || []).map(function (a) { return String(a).split('|')[0].trim(); }).join(' · ');
      var dlTxt = '';
      if (isClosed(ex)) {
        dlTxt = ' <span class="lhw-badge todo" style="background:rgba(120,120,130,.18);color:#6B7280;"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#6B7280" stroke-width="2"/><rect x="5" y="10" width="14" height="11" rx="2" fill="#6B7280"/><circle cx="12" cy="15.5" r="1.5" fill="#fff"/></svg> Yopiq</span>';
      } else if (deadlineOf(ex) !== null) {
        dlTxt = isExpired(ex)
          ? ' <span class="lhw-badge todo" style="background:rgba(229,72,77,.12);color:#E5484D;"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E5484D"/><rect x="6.5" y="10.5" width="11" height="3" rx="1.5" fill="#fff"/></svg> Muddat tugagan: ' + fmtDT(ex.deadlineAt) + '</span>'
          : ' <span class="lhw-badge done" style="background:rgba(31,174,122,.14);color:#1FAE7A;"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="2.5" rx="1" fill="#6B7280"/><rect x="5" y="19.5" width="14" height="2.5" rx="1" fill="#6B7280"/><path d="M7 4.5h10l-5 7z" fill="#F59E0B"/><path d="M7 19.5h10l-5-7z" fill="#FBBF24"/></svg> Muddat: ' + fmtDT(ex.deadlineAt) + '</span>';
      }
      return '<div class="lhw-admin-row" data-id="' + esc(ex.id) + '">' +
        '<div class="lhw-admin-info" style="flex:1 1 220px;min-width:0;">' +
          '<div class="lhw-admin-title"><span class="lhw-num">' + (i + 1) + '</span>' +
            '<span style="min-width:0;overflow-wrap:anywhere;">' + esc(ex.title) + '</span></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px;">' +
            '<span class="lhw-badge todo">' + esc(ex.groupName || 'Barcha guruhlar') + '</span>' +
            (isDict(ex) ? '<span class="lhw-badge todo">Eshitib yozish</span>' : '<span class="lhw-badge todo">' + countOf(ex) + ' ta bo‘shliq</span>') + dlTxt + '</div>' +
          '<div class="lhw-muted lhw-preview">' + esc(preview) + '</div>' +
        '</div>' +
        '<div class="lhw-admin-btns">' +
          (isDict(ex) ? '<button type="button" class="lhw-btn sm" data-act="regrade">Tekshirish</button>' : '') +
          '<button type="button" class="lhw-btn sm" data-act="lb">Natijalar</button>' +
          (isClosed(ex)
            ? '<button type="button" class="lhw-btn sm" data-act="open"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 7.5-2" fill="none" stroke="#6B7280" stroke-width="2"/><rect x="5" y="10" width="14" height="11" rx="2" fill="#6B7280"/><circle cx="12" cy="15.5" r="1.5" fill="#fff"/></svg> Ochish</button>'
            : '<button type="button" class="lhw-btn sm" data-act="close"><svg class="lhw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#6B7280" stroke-width="2"/><rect x="5" y="10" width="14" height="11" rx="2" fill="#6B7280"/><circle cx="12" cy="15.5" r="1.5" fill="#fff"/></svg> Yopish</button>') +
          '<button type="button" class="lhw-btn sm" data-act="edit">Tahrirlash</button>' +
          '<button type="button" class="lhw-btn sm danger" data-act="del">O‘chirish</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function findAdminEx(id) {
    return A.exercises.find(function (e) { return e.id === id; });
  }

  function onAdminListClick(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var row = btn.closest('.lhw-admin-row');
    var ex = row && findAdminEx(row.getAttribute('data-id'));
    if (!ex) return;
    var act = btn.getAttribute('data-act');
    if (act === 'lb') openAdminLb(ex);
    else if (act === 'edit') fillAdminForm(ex);
    else if (act === 'close') closeExercise(ex);
    else if (act === 'open') openExerciseAdmin(ex);
    else if (act === 'regrade') regradeEx(ex);
    else if (act === 'del') deleteExercise(ex);
  }

  // Yopish: talabalar javob kirita olmaydi; vaqt olib tashlanadi (ochilganda qaytadan qo‘yiladi)
  function closeExercise(ex) {
    if (!confirm('“' + ex.title + '” mashqini yopasizmi?\n\nTalabalar javob kirita olmaydi. Muddat olib tashlanadi.')) return;
    db.collection(COL_EX).doc(ex.id).update({ closed: true, deadlineAt: null, durationHours: null, updatedAt: Date.now() })
      .catch(function (er) { alert('Yopishda xatolik: ' + (er && er.message)); });
  }

  // Ochish: yangi muddat (soat) so‘raladi; bo‘sh qoldirilsa: cheklanmagan
  function openExerciseAdmin(ex) {
    var v = prompt('“' + ex.title + '” ochiladi.\nNecha soat ochiq bo‘lsin? (masalan 24 yoki 30; bo‘sh qoldirsangiz: cheklanmagan)', '24');
    if (v === null) return;
    v = String(v).trim().replace(',', '.');
    var hours = v === '' ? null : Number(v);
    if (hours !== null && (!isFinite(hours) || hours <= 0 || hours > 1000)) { alert('Soat 0 dan katta son bo‘lishi kerak.'); return; }
    db.collection(COL_EX).doc(ex.id).update({
      closed: false,
      durationHours: hours,
      deadlineAt: hours === null ? null : Date.now() + Math.round(hours * 3600000),
      updatedAt: Date.now()
    }).catch(function (er) { alert('Ochishda xatolik: ' + (er && er.message)); });
  }

  function openAdminLb(ex) {
    stopAdminLb();
    A.lbId = ex.id;
    A.detailSid = null;
    A.lastRows = [];
    var panel = document.getElementById('lhwAdminLb');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML =
      '<div class="lhw-lb-head"><h3>Jonli natijalar: ' + esc(ex.title) + '</h3>' +
        '<button type="button" class="lhw-btn sm" id="lhwLbClose">Yopish</button></div>' +
      '<div id="lhwAdminLbBody"><div class="lhw-muted"><div class="sk-rows" role="status" aria-label="Yuklanmoqda"><i></i><i></i><i></i><i></i></div></div></div>' +
      '<div id="lhwNotSub" class="lhw-notsub"></div>' +
      '<div id="lhwAdminDetail"></div>';
    document.getElementById('lhwLbClose').addEventListener('click', closeAdminLb);
    // Talabaning qatoriga bosilsa: uning javoblari pastda ochiladi (qayta bossa yopiladi)
    panel.onclick = function (e) {
      var row = e.target.closest('.lhw-click');
      if (!row) return;
      var sid = row.getAttribute('data-sid');
      A.detailSid = (A.detailSid === sid) ? null : sid;
      showAdminDetail(A.detailSid);
    };
    A.lbUnsub = watchLeaderboard(ex.id, ex.groupId || '', function (rows) {
      A.lastRows = rows || [];
      var body = document.getElementById('lhwAdminLbBody');
      if (!body) return;
      var flagged = (rows || []).filter(function (r) { return r.flagged; });
      body.innerHTML = leaderboardHTML(rows, null, true) +
        (rows ? '<p class="lhw-muted">Topshirganlar: ' + rows.length + ' ta: qatorga bosing, javoblarini ko‘ring</p>' : '') +
        (flagged.length ? '<div class="lhw-warn">Domlaga taqdim etilgan taxminchilar (' + PENALTY + ' ta jazo): ' +
          flagged.map(function (r) { return esc(r.studentName || 'Talaba'); }).join(', ') + '</div>' : '');
      renderNotSub(A.lastRows);
      if (isDict(ex) && A.keys[ex.id] && (rows || []).some(function (r) { return r.graded === false; })) {
        gradePending(ex.id, A.keys[ex.id], false).catch(function () {});
      }
      if (A.detailSid) showAdminDetail(A.detailSid);
    });
    getKeyText(ex.id).catch(function () {});
    A.groupRoster = null;
    if (ex.groupId) {
      loadRoster(ex.groupId).then(function (r) { A.groupRoster = r; renderNotSub(A.lastRows); }).catch(function () { renderNotSub(A.lastRows); });
    }
    renderNotSub(A.lastRows);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Tanlangan talabaning javoblari: qaysi bo‘shliq to‘g‘ri/noto‘g‘ri, to‘g‘ri javob qanday
  function showAdminDetail(sid) {
    var box = document.getElementById('lhwAdminDetail');
    if (!box) return;
    var sub = sid ? (A.lastRows || []).find(function (r) { return r._id === sid; }) : null;
    var ex = A.lbId ? findAdminEx(A.lbId) : null;
    if (!sub || !ex) { box.innerHTML = ''; return; }
    if (isDict(ex)) { showDictDetail(sid, sub, ex); return; }
    var answers = sub.answers || [];
    var marks = (sub.marks && sub.marks.length) ? sub.marks : grade(ex.answers, answers).marks;
    var items = '';
    var n = subCount(sub);
    for (var i = 0; i < n; i++) {
      var ok = !!marks[i];
      var correct = String((ex.answers || [])[i] || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean).join(' / ') || '-';
      items += '<li class="lhw-res ' + (ok ? 'ok' : 'bad') + '">' +
        '<span class="lhw-blank-no">' + (i + 1) + '</span>' +
        '<span class="lhw-res-yours">' + esc(answers[i] || '-') + '</span>' +
        (ok ? '<span class="lhw-res-mark">✓</span>'
            : '<span class="lhw-res-mark">✗ <small>to‘g‘ri: ' + esc(correct) + '</small></span>') +
        '</li>';
    }
    var summary = (sub.penalty
      ? 'Taxmin: 0 ball, ' + sub.penalty + ' ta jazo'
      : 'Ball: ' + (sub.score || 0) + '/' + n) + ' · Topshirgan: ' + fmtDT(tsMs(sub.submittedAt));
    box.innerHTML = '<div class="lhw-admin-detail">' +
      '<div class="lhw-lb-head"><h3>' + esc(sub.studentName || 'Talaba') + ': javoblari</h3>' +
      '<span class="lhw-muted">' + esc(summary) + '</span></div>' +
      '<ol class="lhw-res-list">' + items + '</ol></div>';
  }

  function closeAdminLb() {
    stopAdminLb();
    A.lbId = null;
    A.detailSid = null;
    A.overallUid = null;
    A.lastRows = [];
    var panel = document.getElementById('lhwAdminLb');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; panel.onclick = null; }
  }

  /* ---------- Eshitib yozish: admin ---------- */
  function applyKindUI() {
    var sel = document.getElementById('lhwKind');
    var dict = !!sel && sel.value === 'dictation';
    var wrap = document.getElementById('lhwBlanksWrap');
    var tr = document.querySelector('.lhw-dict-field');
    if (wrap) wrap.style.display = dict ? 'none' : '';
    if (tr) tr.style.display = dict ? '' : 'none';
  }

  function getKeyText(exId) {
    if (A.keys[exId] !== undefined) return Promise.resolve(A.keys[exId]);
    return db.collection(COL_KEY).doc(exId).get().then(function (s) {
      A.keys[exId] = s.exists ? String((s.data() || {}).transcript || '') : '';
      return A.keys[exId];
    });
  }

  // Asl matnni saqlaydi va shu mashqning barcha topshiriqlarini qayta tekshiradi
  function saveTranscript(exId, transcript) {
    return db.collection(COL_KEY).doc(exId).set({ transcript: transcript, updatedAt: Date.now() }).then(function () {
      A.keys[exId] = transcript;
      return gradePending(exId, transcript, true);
    });
  }

  // Tekshirilmagan (yoki hammasi, all=true) eshitib yozish javoblarini baholaydi; natijani yozadi
  function gradePending(exId, transcript, all) {
    return Promise.all([
      db.collection(COL_SUB).where('exerciseId', '==', exId).get(),
      db.collection(COL_TXT).where('exerciseId', '==', exId).get()
    ]).then(function (res) {
      var texts = {};
      res[1].docs.forEach(function (d) { texts[d.id] = String((d.data() || {}).text || ''); });
      var todo = res[0].docs.filter(function (d) {
        var x = d.data() || {};
        return x.kind === 'dictation' && (all || x.graded === false) && texts[d.id] != null;
      });
      var batches = [], batch = null, count = 0;
      todo.forEach(function (d) {
        if (count % 400 === 0) { batch = db.batch(); batches.push(batch); }
        var r = dictDiff(transcript, texts[d.id]);
        batch.update(d.ref, {
          graded: true, score: r.score, total: DICT_POINTS, finalScore: r.score,
          marks: [], penalty: 0, flagged: false,
          diff: { refN: r.refN, eq: r.eq, spell: r.spell, wrong: r.wrong, missing: r.missing, extra: r.extra, pct: r.pct },
          gradedAt: Date.now()
        });
        count++;
      });
      return batches.reduce(function (p, b) { return p.then(function () { return b.commit(); }); }, Promise.resolve())
        .then(function () { return count; });
    });
  }

  function regradeEx(ex) {
    getKeyText(ex.id).then(function (t) {
      if (!t) { alert('Avval asl matnni kiriting: "Tahrirlash" tugmasi orqali.'); return null; }
      return gradePending(ex.id, t, true).then(function (n) { alert(n + ' ta javob tekshirildi.'); });
    }).catch(function (er) { alert('Tekshirishda xatolik: ' + (er && er.message)); });
  }

  // Guruh ro‘yxati: har bir talabaning akkaunt ID si (topshirganini solishtirish uchun)
  function loadRoster(gid) {
    return db.collection('oquv_groups').doc(gid).collection('students').get().then(function (snap) {
      var list = snap.docs.map(function (d) { return { code: d.id, name: (d.data() || {}).name || d.id, uid: null }; });
      return Promise.all(list.map(function (s) {
        return db.collection('students').where('oquvProgressCode', '==', s.code).limit(1).get().then(function (q) {
          if (!q.empty) s.uid = q.docs[0].id;
          return s;
        }).catch(function () { return s; });
      }));
    });
  }

  function renderNotSub(rows) {
    var box = document.getElementById('lhwNotSub');
    if (!box || !A.lbId) return;
    var ex = findAdminEx(A.lbId);
    if (!ex || !ex.groupId) { box.innerHTML = '<p class="lhw-muted">Topshirmaganlarni ko‘rish uchun mashqni guruhga biriktiring.</p>'; return; }
    if (!A.groupRoster) { box.innerHTML = '<p class="lhw-muted">Guruh ro‘yxati yuklanmoqda…</p>'; return; }
    var done = {};
    (rows || []).forEach(function (r) { done[r.studentId] = true; });
    var missing = A.groupRoster.filter(function (s) { return !s.uid || !done[s.uid]; });
    box.innerHTML = '<h4 class="lhw-sub-title">Topshirmaganlar: ' + missing.length + ' ta</h4>' +
      (missing.length
        ? '<ul class="lhw-missing">' + missing.map(function (s) { return '<li>' + esc(s.name) + '</li>'; }).join('') + '</ul>'
        : '<p class="lhw-muted">Guruhdagi hamma talaba topshirgan.</p>');
  }

  function dictOpHTML(o) {
    if (o.t === 'eq') return '<span class="dd-eq">' + esc(o.s) + '</span>';
    if (o.t === 'spell') return '<span class="dd-spell" title="To‘g‘ri: ' + esc(o.r) + '">' + esc(o.s) + '</span>';
    if (o.t === 'wrong') return '<span class="dd-wrong">' + esc(o.s) + '</span><span class="dd-fix">' + esc(o.r) + '</span>';
    if (o.t === 'missing') return '<span class="dd-miss">' + esc(o.r) + '</span>';
    return '<span class="dd-extra">' + esc(o.s) + '</span>';
  }

  function showDictDetail(sid, sub, ex) {
    var box = document.getElementById('lhwAdminDetail');
    if (!box) return;
    box.innerHTML = '<div class="lhw-admin-detail"><div class="lhw-lb-head"><h3>' + esc(sub.studentName || 'Talaba') + ': matni</h3></div><p class="lhw-muted">Yuklanmoqda…</p></div>';
    Promise.all([db.collection(COL_TXT).doc(sub._id).get(), getKeyText(ex.id)]).then(function (res) {
      if (A.detailSid !== sid) return;
      var txt = res[0].exists ? String((res[0].data() || {}).text || '') : '';
      var key = res[1] || '';
      var head = '<div class="lhw-admin-detail"><div class="lhw-lb-head"><h3>' + esc(sub.studentName || 'Talaba') + ': matni</h3>';
      if (!key) {
        box.innerHTML = head + '</div><p class="lhw-muted">Asl matn hali kiritilmagan: "Tahrirlash" orqali kiriting.</p><div class="lhw-dict-diff">' + esc(txt) + '</div></div>';
        return;
      }
      var r = dictDiff(key, txt);
      box.innerHTML = head +
        '<span class="lhw-muted">Ball: ' + r.score + '/' + DICT_POINTS + ' · aniqlik ' + r.pct + '% · to‘g‘ri ' + r.eq +
        ', imlo ' + r.spell + ', noto‘g‘ri ' + r.wrong + ', tushgan ' + r.missing + ', ortiqcha ' + r.extra + '</span></div>' +
        '<div class="lhw-dict-diff">' + r.ops.map(dictOpHTML).join(' ') + '</div>' +
        '<p class="lhw-muted">Rang: yashil = to‘g‘ri, sariq = imlo xatosi, qizil = noto‘g‘ri so‘z (o‘ngda to‘g‘risi), qizil fon = tushib qolgan, kulrang = ortiqcha.</p></div>';
    }).catch(function (e) {
      box.innerHTML = '<div class="lhw-warn">Yuklab bo‘lmadi: ' + esc(e && e.message) + '</div>';
    });
  }

  function setFormMode(editing) {
    document.getElementById('lhwFormTitle').textContent = editing ? 'Mashqni tahrirlash' : 'Yangi mashq qo‘shish';
    document.getElementById('lhwCancel').hidden = !editing;
    document.getElementById('lhwSave').textContent = editing ? 'Yangilash' : 'Saqlash';
  }

  function fillAdminForm(ex) {
    A.editingId = ex.id;
    document.getElementById('lhwTitle').value = ex.title || '';
    document.getElementById('lhwMedia').value = ex.mediaUrl || '';
    document.getElementById('lhwHours').value = (typeof ex.durationHours === 'number') ? ex.durationHours : '';
    var gsel = document.getElementById('lhwGroup');
    if (gsel) gsel.value = ex.groupId || '';
    setAnswerRows((ex.answers || []).map(function (a) { return a == null ? '' : String(a); }));
    document.getElementById('lhwKind').value = isDict(ex) ? 'dictation' : 'blanks';
    applyKindUI();
    if (isDict(ex)) getKeyText(ex.id).then(function (t) { document.getElementById('lhwTranscript').value = t || ''; }).catch(function () {});
    setFormMode(true);
    document.getElementById('lhwAdminForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetAdminForm() {
    A.editingId = null;
    var form = document.getElementById('lhwAdminForm');
    if (form) form.reset();
    applyKindUI();
    setAnswerRows(['', '', '', '', '']);
    var bst = document.getElementById('lhwBulkSt');
    if (bst) { bst.className = 'lhw-bulk-st'; bst.textContent = 'Javoblarni shu yerga ustun qilib yozing yoki joylab qo‘ying: pastdagi bo‘sh joylar o‘zi to‘ladi. “1. apple” ko‘rinishidagi raqamlar avtomatik olib tashlanadi.'; }
    var err = document.getElementById('lhwFormErr');
    if (err) err.hidden = true;
    setFormMode(false);
  }

  function saveExercise(e) {
    e.preventDefault();
    var err = document.getElementById('lhwFormErr');
    var btn = document.getElementById('lhwSave');
    var title = document.getElementById('lhwTitle').value.trim();
    var mediaRaw = document.getElementById('lhwMedia').value.trim();
    var gsel = document.getElementById('lhwGroup');
    var groupId = gsel ? gsel.value : '';
    var groupName = groupId && gsel.selectedIndex >= 0 ? gsel.options[gsel.selectedIndex].textContent : '';
    var answers = readAnswerValues().map(function (v) { return v.trim(); });
    var kind = (document.getElementById('lhwKind') || {}).value === 'dictation' ? 'dictation' : 'blanks';
    var transcript = kind === 'dictation' ? document.getElementById('lhwTranscript').value.trim() : '';

    if (!title) { showErr(err, 'Mashq nomini kiriting.'); return; }
    if (mediaRaw && !safeUrl(mediaRaw)) { showErr(err, 'Havola http:// yoki https:// bilan boshlanishi kerak.'); return; }
    if (kind === 'dictation') {
      if (dictTokens(transcript).length < 3) { showErr(err, 'Asl matnni kiriting (kamida 3 so‘z).'); return; }
    } else if (!answers.length || answers.length > MAX_BLANKS) { showErr(err, 'Bo‘sh joylar soni 1 dan ' + MAX_BLANKS + ' gacha bo‘lishi kerak.'); return; }
    for (var i = 0; kind === 'blanks' && i < answers.length; i++) {
      if (!answers[i]) { showErr(err, (i + 1) + '-bo‘sh joy uchun javob kiritilmagan.'); return; }
    }
    var hoursRaw = document.getElementById('lhwHours').value.trim().replace(',', '.');
    var hours = hoursRaw === '' ? null : Number(hoursRaw);
    if (hours !== null && (!isFinite(hours) || hours <= 0 || hours > 1000)) {
      showErr(err, 'Muddat 0 dan katta son bo‘lishi kerak (soatda), yoki bo‘sh qoldiring.'); return;
    }
    if (err) err.hidden = true;

    var payload = {
      title: title,
      mediaUrl: safeUrl(mediaRaw),
      groupId: groupId,
      groupName: groupName,
      answers: kind === 'dictation' ? [] : answers,
      kind: kind,
      updatedAt: Date.now()
    };
    // Muddat: yangi mashqda yoki soat o‘zgarganda: hozirdan boshlab hisoblanadi; o‘zgarmasa avvalgisi saqlanadi
    var prevEx = A.editingId ? findAdminEx(A.editingId) : null;
    if (prevEx && isClosed(prevEx)) {
      // yopiq mashqda muddat qo‘yilmaydi: avval "Ochish" tugmasini bosing
    } else if (hours === null) {
      payload.durationHours = null;
      payload.deadlineAt = null;
    } else if (!prevEx || prevEx.durationHours !== hours || typeof prevEx.deadlineAt !== 'number') {
      payload.durationHours = hours;
      payload.deadlineAt = Date.now() + Math.round(hours * 3600000);
    }
    btn.disabled = true;
    var p = A.editingId
      ? db.collection(COL_EX).doc(A.editingId).update(payload).then(function () { return A.editingId; })
      : db.collection(COL_EX).add(Object.assign({ createdAt: Date.now() }, payload)).then(function (ref) { return ref.id; });
    p.then(function (exId) {
      if (kind !== 'dictation') return null;
      return saveTranscript(exId, transcript);
    }).then(function () {
      resetAdminForm();
    }).catch(function (er) {
      showErr(err, 'Saqlashda xatolik: ' + (er && er.message));
    }).then(function () {
      btn.disabled = false;
    });
  }

  // Mashq o'chirilganda talabalarning POINTI yo'qolmasligi uchun: o'chirishdan oldin har bir talabaning shu mashqdan
  // olgan balli (nechta to'g'ri topgani, 0–5) oquv_progress/{ID}/bonus ichiga source:'listening' bilan ko'chiriladi.
  // Hujjat ID = ls_{mashqId}_{uid}: qayta bosilsa ikki marta qo'shilmaydi; point sanasi: topshirilgan sana.
  function archiveSubmissions(ex, subDocs) {
    var by = {};
    subDocs.forEach(function (d) { var x = d.data(); if (x && x.studentId) by[x.studentId] = x; });
    var uids = Object.keys(by);
    return Promise.all(uids.map(function (uid) {
      return db.collection('students').doc(uid).get().then(function (st) {
        return { uid: uid, x: by[uid], code: st.exists ? (st.data().oquvProgressCode || '') : '' };
      }).catch(function () { return { uid: uid, x: by[uid], code: '' }; });
    })).then(function (list) {
      var batch = db.batch(), saved = 0, skipped = [];
      var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      list.forEach(function (it) {
        var pts = finalOf(it.x);
        if (!pts) return;   // 0 point: saqlash shart emas
        if (!it.code) { skipped.push(it.x.studentName || it.uid); return; }
        var d = new Date(tsMs(it.x.submittedAt));
        batch.set(db.collection('oquv_progress').doc(it.code).collection('bonus').doc('ls_' + ex.id + '_' + it.uid), {
          date: d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()),
          points: pts, reason: 'Listening: ' + (ex.title || 'mashq'), source: 'listening',
          exId: ex.id, uid: it.uid, max: subCount(it.x),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        saved++;
      });
      return (saved ? batch.commit() : Promise.resolve()).then(function () { return { saved: saved, skipped: skipped }; });
    });
  }

  function deleteExercise(ex) {
    var msg = '“' + ex.title + '” mashqini o‘chirmoqchimisiz?\n\n' +
      'Talabalarning bu mashqdan olgan POINTLARI saqlanib qoladi (profilidagi pointlarida ko‘rinaveradi). ' +
      'Faqat mashqning o‘zi va javoblari o‘chadi.';
    if (!confirm(msg)) return;
    var subsDocs = [];
    db.collection(COL_SUB).where('exerciseId', '==', ex.id).get().then(function (snap) {
      subsDocs = snap.docs;
      return archiveSubmissions(ex, subsDocs);
    }).then(function (r) {
      if (r.skipped.length && !confirm('Diqqat: quyidagi talabalarning pointi saqlanmaydi (ularga «O‘quv jarayoni» ID biriktirilmagan):\n\n' +
        r.skipped.join(', ') + '\n\nBaribir o‘chiraymi?')) return null;
      // Firestore batch: bir martada 500 tagacha yozuv (bitta mashq uchun yetarli)
      var batch = db.batch();
      subsDocs.forEach(function (d) { batch.delete(d.ref); });
      if (isDict(ex)) {
        subsDocs.forEach(function (d) { batch.delete(db.collection(COL_TXT).doc(d.id)); });
        batch.delete(db.collection(COL_KEY).doc(ex.id));
      }
      batch.delete(db.collection(COL_EX).doc(ex.id));
      return batch.commit().then(function () {
        if (A.lbId === ex.id) closeAdminLb();
        if (A.editingId === ex.id) resetAdminForm();
      });
    }).catch(function (er) {
      alert('O‘chirishda xatolik: ' + (er && er.message));
    });
  }

  global.ListeningHW = {
    openStudent: openStudent,
    openAdmin: openAdmin,
    grade: grade,
    norm: norm,
    leaderboardHTML: leaderboardHTML
  };
})(window);
