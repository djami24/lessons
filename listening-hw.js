/* ============================================================
   Listening uy vazifalari — talaba va admin uchun umumiy modul
   ------------------------------------------------------------
   Firestore:
     listening_exercises/{exId}
       { title, mediaUrl, answers:[5 ta matn], createdAt, updatedAt,
         durationHours, deadlineAt }   // deadlineAt — topshirish tugaydigan vaqt (ms); null — cheksiz
       answers[i] — i-bo‘sh joy uchun to‘g‘ri javob.
       Bir nechta to‘g‘ri variant bo‘lsa "|" bilan ajrating: "color | colour"
     listening_submissions/{exId_uid}
       { exerciseId, studentId, studentName, answers:[5], score, total, marks, submittedAt }
       Talaba har mashqni faqat bir marta topshiradi (hujjat ID = exId_uid).

   Ishlatish:
     ListeningHW.openStudent({ uid, name })  — talaba paneli (#lhwStudentRoot)
     ListeningHW.openAdmin()                 — admin paneli  (#lhwAdminRoot)
   Talab qilinadi: firebase-config.js (global `db`, `firebase`).
   ============================================================ */
(function (global) {
  'use strict';

  var COL_EX = 'listening_exercises';
  var COL_SUB = 'listening_submissions';
  var BLANKS = 5;
  var MAX_ANSWER_LEN = 200;
  // Taxmin qoidasi: bo‘shliqlarning FLAG_WRONG tasi yoki undan ko‘pi noto‘g‘ri bo‘lsa —
  // mashq uchun 0 ball beriladi, PENALTY ta jazo qayd etiladi (balldan ayrilmaydi), natija domlaga taqdim etiladi.
  var FLAG_WRONG = 5;
  var PENALTY = 100;
  // Marafonning umumiy soni: har bir kiritilgan mashq — bitta marafon (qolganini shundan hisoblaydi)
  var MARATHON_TOTAL = 12;

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

  function acceptedVariants(key) {
    return String(key == null ? '' : key).split('|').map(norm).filter(Boolean);
  }

  function grade(keyAnswers, studentAnswers) {
    var marks = [], correct = 0;
    for (var i = 0; i < BLANKS; i++) {
      var ok = acceptedVariants((keyAnswers || [])[i]).indexOf(norm((studentAnswers || [])[i])) !== -1;
      marks.push(ok);
      if (ok) correct++;
    }
    var flagged = (BLANKS - correct) >= FLAG_WRONG;
    var score = flagged ? 0 : correct;
    var penalty = flagged ? PENALTY : 0;
    return { score: score, marks: marks, flagged: flagged, penalty: penalty, finalScore: score };
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

  // Ball bo‘yicha o‘rin: teng ball — bir xil o‘rin; tengda kim oldin topshirgan bo‘lsa, yuqorida
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
      var score = r.penalty
        ? '<span class="lhw-score">' + fin + ' ball</span><small class="lhw-pen">' + r.penalty + ' ta jazo</small>'
        : '<span class="lhw-score">' + (r.score || 0) + '/' + BLANKS + '</span>';
      var flag = (adminView && r.flagged) ? ' <span class="lhw-flag">⚠ Domlaga</span>' : '';
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
  var S = { uid: null, name: 'Talaba', groupId: '', exercises: [], subs: {}, allTotals: {}, unsubs: [], lbUnsub: null, activeId: null, timerId: null };

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
        '<h1>Listening marafon</h1>' +
        '<p>Mashqni oching, bo‘sh joylarni to‘ldiring va topshiring. Har bir to‘g‘ri javob — 1 ball.</p>' +
      '</div></div>' +
      '<div class="lhw-banner"><span class="lhw-banner-ico">🏆</span><div>Jami <b>12 ta marafon</b> bo‘ladi. Oxirida eng yuqori ball to‘plagan talabaga <b>sovg‘a</b> beriladi!</div></div>' +
      '<div id="lhwStudentBody"><p class="lhw-muted">Yuklanmoqda…</p></div>';
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

  // Har soniyada: qolgan vaqtni yangilaydi; muddat tugasa — forma yopiladi
  function tick() {
    var root = document.getElementById('lhwStudentRoot');
    if (!root || !document.body.contains(root)) return;
    var now = Date.now(), listExpired = false;
    root.querySelectorAll('[data-dl]').forEach(function (el) {
      var left = +el.getAttribute('data-dl') - now;
      el.textContent = left > 0 ? '⏳ Qoldi: ' + fmtLeft(left) : '⛔ Vaqt tugadi';
      el.style.color = timerColor(left);
      if (left <= 0 && el.closest('.lhw-card')) listExpired = true;
    });
    if (S.activeId) {
      var ex = S.exercises.find(function (e) { return e.id === S.activeId; });
      if (ex && isLocked(ex) && !S.subs[ex.id] && document.getElementById('lhwSubmitForm')) renderExpired(ex);
    } else if (listExpired) {
      renderStudentList();
    }
  }

  function renderExpired(ex) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    area.innerHTML = isClosed(ex)
      ? '<div class="lhw-warn">🔒 Bu mashq yopilgan — hozircha javob kiritib bo‘lmaydi.</div>'
      : '<div class="lhw-warn">⛔ Bu mashq uchun vaqt tugagan — javob kiritib bo‘lmaydi.</div>';
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
        '<div class="lhw-modal-emoji">🎉</div>' +
        '<h2>Tabriklayman, ' + esc(first) + '!</h2>' +
        '<p>Siz <b>Listening marafon</b>ga qo‘shildingiz!</p>' +
        '<p>Jami <b>12 ta marafon</b> bo‘ladi. Har bir mashqda 5 ta bo‘shliq bor — har bir to‘g‘ri javob <b>1 ball</b>.</p>' +
        '<div class="lhw-modal-prize">🏆 Marafon oxirida eng yuqori ball to‘plagan talabaga <b>sovg‘a</b> beriladi!</div>' +
        '<p class="lhw-modal-warn">⚠️ Eslatma: 5 ta bo‘shliqning hammasi noto‘g‘ri bo‘lsa, bu taxmin deb hisoblanadi — 0 ball, <b>100 ta jazo</b> qayd etiladi va natija domlaga taqdim etiladi.</p>' +
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
      '<div class="lhw-total-meta">🎯 Qolgan marafon: ' + Math.max(0, MARATHON_TOTAL - S.exercises.length) + ' ta</div>' +
      (function () {
        var o = overallRank();
        return o ? '<div class="lhw-total-meta">🏅 Umumiy o‘rin: ' + o.rank + '-o‘rin / ' + o.of + '</div>' : '';
      })() + '</div>';
    body.innerHTML = summary + '<div class="lhw-list">' + visibleList.map(function (ex, i) {
      var sub = S.subs[ex.id];
      var dl = isClosed(ex) ? null : deadlineOf(ex), expired = isLocked(ex);
      var timer = '';
      if (isClosed(ex) && !sub) {
        timer = '<small class="lhw-timer" style="display:block;font-weight:700;color:#6B7280;">🔒 Yopiq</small>';
      } else if (dl !== null && !sub) {
        timer = expired
          ? '<small class="lhw-timer" style="display:block;font-weight:700;color:#E5484D;">⛔ Vaqt tugadi</small>'
          : '<small class="lhw-timer" data-dl="' + dl + '" style="display:block;font-weight:700;color:' + timerColor(dl - Date.now()) + ';">⏳ Qoldi: ' + fmtLeft(dl - Date.now()) + '</small>';
      }
      var badge = sub
        ? (sub.penalty
            ? '<span class="lhw-badge bad" style="background:rgba(229,72,77,.12);color:#E5484D;">Taxmin: ' + sub.penalty + ' ta jazo</span>'
            : '<span class="lhw-badge done" style="background:rgba(31,174,122,.14);color:#1FAE7A;">' + (sub.score || 0) + '/' + BLANKS + ' ball</span>')
        : (expired
            ? '<span class="lhw-badge todo" style="background:rgba(120,120,130,.18);color:#6B7280;">Yopilgan</span>'
            : '<span class="lhw-badge todo" style="background:rgba(229,72,77,.12);color:#E5484D;">Topshirilmagan</span>');
      return '<button type="button" class="lhw-card" data-id="' + esc(ex.id) + '">' +
        '<span class="lhw-num">' + (i + 1) + '</span>' +
        '<span class="lhw-card-title">' + esc(ex.title) + timer + '</span>' + badge +
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
      '<div class="lhw-detail">' +
        '<h2>' + esc(ex.title) + '</h2>' +
        (media ? '<a class="lhw-media" href="' + esc(media) + '" target="_blank" rel="noopener noreferrer">🎧 Audio / materialni ochish</a>' : '') +
        (!isClosed(ex) && deadlineOf(ex) !== null && !S.subs[id]
          ? '<p class="lhw-deadline" data-dl="' + deadlineOf(ex) + '" style="font-weight:700;margin:8px 0;"></p>'
          : '') +
        '<div id="lhwFormArea"></div>' +
      '</div>' +
      '<div class="lhw-lb-wrap">' +
        '<h3 class="lhw-sub-title">Reyting</h3>' +
        '<button type="button" class="lhw-btn primary lhw-lb-btn" id="lhwLbBtn">📊 Jonli reytingni ko‘rish</button>' +
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
    if (sub) renderResult(ex, sub);
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
    lb.innerHTML = '<p class="lhw-live"><span class="lhw-dot"></span> Jonli yangilanmoqda</p><p class="lhw-muted">Yuklanmoqda…</p>';
    S.lbUnsub = watchLeaderboard(ex.id, ex.groupId || '', function (rows) {
      var el = document.getElementById('lhwLeaderboard');
      if (el) el.innerHTML = '<p class="lhw-live"><span class="lhw-dot"></span> Jonli yangilanmoqda</p>' + leaderboardHTML(rows, S.uid, false);
    });
  }

  function renderForm(ex) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    var inputs = '';
    for (var i = 0; i < BLANKS; i++) {
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
    for (var i = 0; i < BLANKS; i++) {
      if (!answers[i]) { showErr(err, 'Barcha 5 ta bo‘sh joyni to‘ldiring.'); return; }
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
        total: BLANKS,
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
        ? (isClosed(ex) ? 'Mashq yopilgan — javob qabul qilinmaydi.' : 'Vaqt tugagan — javob qabul qilinmaydi.')
        : 'Xatolik: ' + (e && e.message ? e.message : 'topshirib bo‘lmadi'));
    });
  }

  function renderResult(ex, sub) {
    var area = document.getElementById('lhwFormArea');
    if (!area) return;
    var marks = sub.marks || [];
    var answers = sub.answers || [];
    var rows = '';
    for (var i = 0; i < BLANKS; i++) {
      var ok = !!marks[i];
      // To‘g‘ri javoblar talabaga ko‘rsatilmaydi — faqat o‘z javobi va belgisi
      rows += '<li class="lhw-res ' + (ok ? 'ok' : 'bad') + '">' +
        '<span class="lhw-blank-no">' + (i + 1) + '</span>' +
        '<span class="lhw-res-yours">' + esc(answers[i] || '—') + '</span>' +
        '<span class="lhw-res-mark">' + (ok ? '✓' : '✗') + '</span>' +
        '</li>';
    }
    var score = sub.score || 0;
    area.innerHTML =
      '<div class="lhw-result">' +
        '<div class="lhw-score-big">' + score + '<span>/' + BLANKS + '</span></div>' +
        '<p class="lhw-muted">Siz ' + BLANKS + ' ta bo‘shliqdan ' + score + 'tasini to‘g‘ri topdingiz. Natija topshirilgan — o‘zgartirib bo‘lmaydi.</p>' +
        (sub.penalty ? '<div class="lhw-warn">⚠️ Taxmin aniqlandi: 0 ball, ' + sub.penalty + ' ta jazo qayd etildi. Natija domlaga taqdim etildi.</div>' : '') +
        '<ol class="lhw-res-list">' + rows + '</ol>' +
        '<p class="lhw-hint lhw-ask-teacher">📩 To‘g‘ri javoblarni o‘qituvchingizdan oling.</p>' +
      '</div>';
  }

  /* ============================================================
     ADMIN
     ============================================================ */
  var A = { exercises: [], unsubs: [], lbUnsub: null, editingId: null, lbId: null, detailSid: null, lastRows: [], allSubs: [], groupNames: {} };

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

    var blanks = '';
    for (var i = 1; i <= BLANKS; i++) {
      blanks += '<label class="lhw-field"><span>' + i + '-bo‘sh joy javobi *</span>' +
        '<input type="text" data-ans="' + (i - 1) + '" maxlength="' + MAX_ANSWER_LEN + '" autocomplete="off" placeholder="Masalan: apple  (yoki: apple | apples)"></label>';
    }

    root.innerHTML =
      '<div class="lhw-head"><div>' +
        '<h1>Listening uy vazifalari</h1>' +
        '<p>Har bir mashq uchun 5 ta to‘g‘ri javob kiriting. Talaba bo‘sh joylarni to‘ldiradi; har bir to‘g‘ri javob — 1 ball. Bir nechta to‘g‘ri variant uchun "|" belgisidan foydalaning.</p>' +
      '</div></div>' +
      '<div id="lhwOverall" class="lhw-overall"></div>' +
      '<div class="lhw-admin-grid">' +
        '<form id="lhwAdminForm" class="lhw-form">' +
          '<h3 id="lhwFormTitle">Yangi mashq qo‘shish</h3>' +
          '<label class="lhw-field"><span>Mashq nomi *</span><input type="text" id="lhwTitle" maxlength="120" placeholder="Masalan: 1-mashq"></label>' +
          '<label class="lhw-field"><span>Guruh</span><select id="lhwGroup"><option value="">Barcha guruhlar</option></select></label>' +
          '<label class="lhw-field"><span>Topshirish muddati, soat (ixtiyoriy)</span>' +
            '<input type="number" id="lhwHours" min="0.1" max="1000" step="any" placeholder="Masalan: 24 yoki 30 (bo‘sh — cheklanmagan)"></label>' +
          '<p class="lhw-hint">Muddat saqlangan paytdan boshlab hisoblanadi. Tahrirlashda soatni o‘zgartirsangiz, muddat qaytadan hozirdan boshlanadi. Vaqt tugagach talabalar javob kirita olmaydi.</p>' +
          '<label class="lhw-field"><span>Audio / material havolasi (ixtiyoriy)</span><input type="text" id="lhwMedia" placeholder="https://..."></label>' +
          '<div class="lhw-answers">' + blanks + '</div>' +
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
      var grp = r.groupId ? (A.groupNames[r.groupId] || '—') : 'Guruhsiz';
      return '<tr>' +
        '<td class="lhw-t-rank">' + rank + '</td>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td class="lhw-muted">' + esc(grp) + '</td>' +
        '<td class="lhw-t-total">' + r.total + '</td>' +
        '<td>' + r.done + ' / ' + A.exercises.length + '</td>' +
        '<td>' + fmtDT(r.last) + '</td>' +
        '<td>' + (r.flagged ? '<span class="lhw-flag">⚠ ' + r.flagged + '</span>' : '—') + '</td>' +
        '</tr>';
    }).join('');
    box.innerHTML =
      '<div class="lhw-overall-card">' +
        '<div class="lhw-lb-head"><h3>Umumiy reyting</h3>' +
          '<div class="lhw-lb-tools"><span class="lhw-muted">Mashqlar: ' + A.exercises.length + ' ta · Ishtirokchilar: ' + list.length + ' ta</span>' +
          '<button type="button" class="lhw-btn sm" id="lhwOverallRefresh">🔄 Yangilash</button></div></div>' +
        (list.length
          ? '<div class="lhw-overall-wrap"><table class="lhw-table"><thead><tr>' +
              '<th>O‘rin</th><th>Talaba</th><th>Guruh</th><th>Jami ball</th><th>Topshirgan</th><th>Oxirgi topshirgan vaqti</th><th>Taxmin</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
          : '<p class="lhw-muted">Hali hech kim topshirmagan.</p>') +
      '</div>';
    var btn = document.getElementById('lhwOverallRefresh');
    if (btn) btn.addEventListener('click', refreshOverall);
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
        dlTxt = ' <span class="lhw-badge todo" style="background:rgba(120,120,130,.18);color:#6B7280;">🔒 Yopiq</span>';
      } else if (deadlineOf(ex) !== null) {
        dlTxt = isExpired(ex)
          ? ' <span class="lhw-badge todo" style="background:rgba(229,72,77,.12);color:#E5484D;">⛔ Muddat tugagan: ' + fmtDT(ex.deadlineAt) + '</span>'
          : ' <span class="lhw-badge done" style="background:rgba(31,174,122,.14);color:#1FAE7A;">⏳ Muddat: ' + fmtDT(ex.deadlineAt) + '</span>';
      }
      return '<div class="lhw-admin-row" data-id="' + esc(ex.id) + '">' +
        '<div class="lhw-admin-info" style="flex:1 1 220px;min-width:0;">' +
          '<div class="lhw-admin-title"><span class="lhw-num">' + (i + 1) + '</span>' +
            '<span style="min-width:0;overflow-wrap:anywhere;">' + esc(ex.title) + '</span></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px;">' +
            '<span class="lhw-badge todo">' + esc(ex.groupName || 'Barcha guruhlar') + '</span>' + dlTxt + '</div>' +
          '<div class="lhw-muted lhw-preview">' + esc(preview) + '</div>' +
        '</div>' +
        '<div class="lhw-admin-btns">' +
          '<button type="button" class="lhw-btn sm" data-act="lb">Natijalar</button>' +
          (isClosed(ex)
            ? '<button type="button" class="lhw-btn sm" data-act="open">🔓 Ochish</button>'
            : '<button type="button" class="lhw-btn sm" data-act="close">🔒 Yopish</button>') +
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
    else if (act === 'del') deleteExercise(ex);
  }

  // Yopish: talabalar javob kirita olmaydi; vaqt olib tashlanadi (ochilganda qaytadan qo‘yiladi)
  function closeExercise(ex) {
    if (!confirm('“' + ex.title + '” mashqini yopasizmi?\n\nTalabalar javob kirita olmaydi. Muddat olib tashlanadi.')) return;
    db.collection(COL_EX).doc(ex.id).update({ closed: true, deadlineAt: null, durationHours: null, updatedAt: Date.now() })
      .catch(function (er) { alert('Yopishda xatolik: ' + (er && er.message)); });
  }

  // Ochish: yangi muddat (soat) so‘raladi; bo‘sh qoldirilsa — cheklanmagan
  function openExerciseAdmin(ex) {
    var v = prompt('“' + ex.title + '” ochiladi.\nNecha soat ochiq bo‘lsin? (masalan 24 yoki 30; bo‘sh qoldirsangiz — cheklanmagan)', '24');
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
      '<div class="lhw-lb-head"><h3>Jonli natijalar — ' + esc(ex.title) + '</h3>' +
        '<button type="button" class="lhw-btn sm" id="lhwLbClose">Yopish</button></div>' +
      '<div id="lhwAdminLbBody"><p class="lhw-muted">Yuklanmoqda…</p></div>' +
      '<div id="lhwAdminDetail"></div>';
    document.getElementById('lhwLbClose').addEventListener('click', closeAdminLb);
    // Talabaning qatoriga bosilsa — uning javoblari pastda ochiladi (qayta bossa yopiladi)
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
        (rows ? '<p class="lhw-muted">Topshirganlar: ' + rows.length + ' ta — qatorga bosing, javoblarini ko‘ring</p>' : '') +
        (flagged.length ? '<div class="lhw-warn">Domlaga taqdim etilgan taxminchilar (' + PENALTY + ' ta jazo): ' +
          flagged.map(function (r) { return esc(r.studentName || 'Talaba'); }).join(', ') + '</div>' : '');
      if (A.detailSid) showAdminDetail(A.detailSid);
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Tanlangan talabaning javoblari: qaysi bo‘shliq to‘g‘ri/noto‘g‘ri, to‘g‘ri javob qanday
  function showAdminDetail(sid) {
    var box = document.getElementById('lhwAdminDetail');
    if (!box) return;
    var sub = sid ? (A.lastRows || []).find(function (r) { return r._id === sid; }) : null;
    var ex = A.lbId ? findAdminEx(A.lbId) : null;
    if (!sub || !ex) { box.innerHTML = ''; return; }
    var answers = sub.answers || [];
    var marks = (sub.marks && sub.marks.length) ? sub.marks : grade(ex.answers, answers).marks;
    var items = '';
    for (var i = 0; i < BLANKS; i++) {
      var ok = !!marks[i];
      var correct = String((ex.answers || [])[i] || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean).join(' / ') || '—';
      items += '<li class="lhw-res ' + (ok ? 'ok' : 'bad') + '">' +
        '<span class="lhw-blank-no">' + (i + 1) + '</span>' +
        '<span class="lhw-res-yours">' + esc(answers[i] || '—') + '</span>' +
        (ok ? '<span class="lhw-res-mark">✓</span>'
            : '<span class="lhw-res-mark">✗ <small>to‘g‘ri: ' + esc(correct) + '</small></span>') +
        '</li>';
    }
    var summary = (sub.penalty
      ? 'Taxmin: 0 ball, ' + sub.penalty + ' ta jazo'
      : 'Ball: ' + (sub.score || 0) + '/' + BLANKS) + ' · Topshirgan: ' + fmtDT(tsMs(sub.submittedAt));
    box.innerHTML = '<div class="lhw-admin-detail">' +
      '<div class="lhw-lb-head"><h3>' + esc(sub.studentName || 'Talaba') + ' — javoblari</h3>' +
      '<span class="lhw-muted">' + esc(summary) + '</span></div>' +
      '<ol class="lhw-res-list">' + items + '</ol></div>';
  }

  function closeAdminLb() {
    stopAdminLb();
    A.lbId = null;
    A.detailSid = null;
    A.lastRows = [];
    var panel = document.getElementById('lhwAdminLb');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; panel.onclick = null; }
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
    document.querySelectorAll('#lhwAdminForm input[data-ans]').forEach(function (inp) {
      inp.value = (ex.answers || [])[+inp.getAttribute('data-ans')] || '';
    });
    setFormMode(true);
    document.getElementById('lhwAdminForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetAdminForm() {
    A.editingId = null;
    var form = document.getElementById('lhwAdminForm');
    if (form) form.reset();
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
    var answers = [];
    document.querySelectorAll('#lhwAdminForm input[data-ans]').forEach(function (inp) {
      answers[+inp.getAttribute('data-ans')] = inp.value.trim();
    });

    if (!title) { showErr(err, 'Mashq nomini kiriting.'); return; }
    if (mediaRaw && !safeUrl(mediaRaw)) { showErr(err, 'Havola http:// yoki https:// bilan boshlanishi kerak.'); return; }
    for (var i = 0; i < BLANKS; i++) {
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
      answers: answers,
      updatedAt: Date.now()
    };
    // Muddat: yangi mashqda yoki soat o‘zgarganda — hozirdan boshlab hisoblanadi; o‘zgarmasa avvalgisi saqlanadi
    var prevEx = A.editingId ? findAdminEx(A.editingId) : null;
    if (prevEx && isClosed(prevEx)) {
      // yopiq mashqda muddat qo‘yilmaydi — avval "Ochish" tugmasini bosing
    } else if (hours === null) {
      payload.durationHours = null;
      payload.deadlineAt = null;
    } else if (!prevEx || prevEx.durationHours !== hours || typeof prevEx.deadlineAt !== 'number') {
      payload.durationHours = hours;
      payload.deadlineAt = Date.now() + Math.round(hours * 3600000);
    }
    btn.disabled = true;
    var p = A.editingId
      ? db.collection(COL_EX).doc(A.editingId).update(payload)
      : db.collection(COL_EX).add(Object.assign({ createdAt: Date.now() }, payload));
    p.then(function () {
      resetAdminForm();
    }).catch(function (er) {
      showErr(err, 'Saqlashda xatolik: ' + (er && er.message));
    }).then(function () {
      btn.disabled = false;
    });
  }

  function deleteExercise(ex) {
    var msg = '“' + ex.title + '” mashqini o‘chirmoqchimisiz?\n\n' +
      'Shu mashq bo‘yicha barcha talabalarning natijalari ham o‘chadi.';
    if (!confirm(msg)) return;
    db.collection(COL_SUB).where('exerciseId', '==', ex.id).get().then(function (snap) {
      // Firestore batch — bir martada 500 tagacha yozuv (bitta mashq uchun yetarli)
      var batch = db.batch();
      snap.docs.forEach(function (d) { batch.delete(d.ref); });
      batch.delete(db.collection(COL_EX).doc(ex.id));
      return batch.commit();
    }).then(function () {
      if (A.lbId === ex.id) closeAdminLb();
      if (A.editingId === ex.id) resetAdminForm();
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
