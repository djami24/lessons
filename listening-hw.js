/* ============================================================
   Listening uy vazifalari — talaba va admin uchun umumiy modul
   ------------------------------------------------------------
   Firestore:
     listening_exercises/{exId}
       { title, mediaUrl, answers:[5 ta matn], createdAt, updatedAt }
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
    var marks = [], score = 0;
    for (var i = 0; i < BLANKS; i++) {
      var ok = acceptedVariants((keyAnswers || [])[i]).indexOf(norm((studentAnswers || [])[i])) !== -1;
      marks.push(ok);
      if (ok) score++;
    }
    return { score: score, marks: marks };
  }

  function tsMs(t) {
    if (typeof t === 'number') return t;
    return t && typeof t.toMillis === 'function' ? t.toMillis() : Date.now();
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
      return (b.score || 0) - (a.score || 0) || tsMs(a.submittedAt) - tsMs(b.submittedAt);
    });
    var rank = 0, prev = null;
    return sorted.map(function (r, idx) {
      if (r.score !== prev) { rank = idx + 1; prev = r.score; }
      return { rank: rank, row: r };
    });
  }

  function leaderboardHTML(rows, myUid) {
    if (rows === null) return '<p class="lhw-muted">Natijalarni yuklab bo‘lmadi.</p>';
    if (!rows.length) return '<p class="lhw-muted">Hali hech kim topshirmagan. Birinchi bo‘lib toping!</p>';
    return '<ol class="lhw-board">' + rankRows(rows).map(function (x) {
      var r = x.row, me = !!myUid && r.studentId === myUid;
      return '<li class="lhw-row' + (me ? ' me' : '') + '">' +
        '<span class="lhw-rank">' + x.rank + '</span>' +
        '<span class="lhw-name">' + esc(r.studentName || 'Talaba') + (me ? ' <em>(siz)</em>' : '') + '</span>' +
        '<span class="lhw-score">' + (r.score || 0) + '/' + BLANKS + '</span>' +
        '</li>';
    }).join('') + '</ol>';
  }

  // Mashq guruhga biriktirilgan bo‘lsa, reytingda faqat shu guruh talabalari ko‘rinadi
  function watchLeaderboard(exId, groupId, cb) {
    return db.collection(COL_SUB).where('exerciseId', '==', exId).onSnapshot(
      function (snap) {
        var rows = snap.docs.map(function (d) { return d.data(); });
        if (groupId) rows = rows.filter(function (r) { return r.groupId === groupId; });
        cb(rows);
      },
      function () { cb(null); }
    );
  }

  /* ============================================================
     TALABA
     ============================================================ */
  var S = { uid: null, name: 'Talaba', groupId: '', exercises: [], subs: {}, unsubs: [], lbUnsub: null, activeId: null };

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
    S.activeId = null;
    S.uid = (opts && opts.uid) || null;
    S.name = (opts && opts.name) || 'Talaba';
    S.groupId = (opts && opts.groupId) || '';
    root.innerHTML =
      '<div class="lhw-head"><div>' +
        '<h1>Listening uy vazifalari</h1>' +
        '<p>Mashqni oching, bo‘sh joylarni to‘ldiring va topshiring. Har bir to‘g‘ri javob — 1 ball.</p>' +
      '</div></div>' +
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
    body.innerHTML = '<div class="lhw-list">' + visibleList.map(function (ex, i) {
      var sub = S.subs[ex.id];
      var badge = sub
        ? '<span class="lhw-badge done">' + (sub.score || 0) + '/' + BLANKS + ' ball</span>'
        : '<span class="lhw-badge todo">Topshirilmagan</span>';
      return '<button type="button" class="lhw-card" data-id="' + esc(ex.id) + '">' +
        '<span class="lhw-num">' + (i + 1) + '</span>' +
        '<span class="lhw-card-title">' + esc(ex.title) + '</span>' + badge +
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
      '<button type="button" class="lhw-back" id="lhwBack">← Ro‘yxatga qaytish</button>' +
      '<div class="lhw-detail">' +
        '<h2>' + esc(ex.title) + '</h2>' +
        (media ? '<a class="lhw-media" href="' + esc(media) + '" target="_blank" rel="noopener noreferrer">🎧 Audio / materialni ochish</a>' : '') +
        '<div id="lhwFormArea"></div>' +
      '</div>' +
      '<h3 class="lhw-sub-title">Jonli reyting</h3>' +
      '<div id="lhwLeaderboard" class="lhw-lb"><p class="lhw-muted">Yuklanmoqda…</p></div>';

    document.getElementById('lhwBack').addEventListener('click', function () {
      stopStudentLb();
      S.activeId = null;
      renderStudentList();
    });

    var sub = S.subs[id];
    if (sub) renderResult(ex, sub); else renderForm(ex);

    S.lbUnsub = watchLeaderboard(id, ex.groupId || '', function (rows) {
      var lb = document.getElementById('lhwLeaderboard');
      if (lb) lb.innerHTML = leaderboardHTML(rows, S.uid);
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
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      return ref.set(data).then(function () { return data; });
    }).then(function (data) {
      S.subs[ex.id] = data;
      if (S.activeId === ex.id) renderResult(ex, data); // talaba boshqa mashqqa o‘tib ketmagan bo‘lsa
    }).catch(function (e) {
      btn.disabled = false;
      showErr(err, 'Xatolik: ' + (e && e.message ? e.message : 'topshirib bo‘lmadi'));
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
      var correct = String((ex.answers || [])[i] || '').split('|')[0].trim();
      rows += '<li class="lhw-res ' + (ok ? 'ok' : 'bad') + '">' +
        '<span class="lhw-blank-no">' + (i + 1) + '</span>' +
        '<span class="lhw-res-yours">' + esc(answers[i] || '—') + '</span>' +
        (ok
          ? '<span class="lhw-res-mark">✓</span>'
          : '<span class="lhw-res-mark">✗ <small>to‘g‘ri: ' + esc(correct) + '</small></span>') +
        '</li>';
    }
    var score = sub.score || 0;
    area.innerHTML =
      '<div class="lhw-result">' +
        '<div class="lhw-score-big">' + score + '<span>/' + BLANKS + '</span></div>' +
        '<p class="lhw-muted">Siz ' + BLANKS + ' ta bo‘shliqdan ' + score + 'tasini to‘g‘ri topdingiz. Natija topshirilgan — o‘zgartirib bo‘lmaydi.</p>' +
        '<ol class="lhw-res-list">' + rows + '</ol>' +
      '</div>';
  }

  /* ============================================================
     ADMIN
     ============================================================ */
  var A = { exercises: [], unsubs: [], lbUnsub: null, editingId: null, lbId: null };

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
      '<div class="lhw-admin-grid">' +
        '<form id="lhwAdminForm" class="lhw-form">' +
          '<h3 id="lhwFormTitle">Yangi mashq qo‘shish</h3>' +
          '<label class="lhw-field"><span>Mashq nomi *</span><input type="text" id="lhwTitle" maxlength="120" placeholder="Masalan: 1-mashq"></label>' +
          '<label class="lhw-field"><span>Guruh</span><select id="lhwGroup"><option value="">Barcha guruhlar</option></select></label>' +
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

    A.unsubs.push(db.collection(COL_EX).onSnapshot(function (snap) {
      A.exercises = sortByCreated(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
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
        sel.appendChild(o);
      });
      sel.value = keep;
    }).catch(function () { /* guruhlar yuklanmasa ham "Barcha guruhlar" ishlaydi */ });
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
      return '<div class="lhw-admin-row" data-id="' + esc(ex.id) + '">' +
        '<div class="lhw-admin-info">' +
          '<div class="lhw-admin-title"><span class="lhw-num">' + (i + 1) + '</span> ' + esc(ex.title) +
            ' <span class="lhw-badge todo">' + esc(ex.groupName || 'Barcha guruhlar') + '</span></div>' +
          '<div class="lhw-muted lhw-preview">' + esc(preview) + '</div>' +
        '</div>' +
        '<div class="lhw-admin-btns">' +
          '<button type="button" class="lhw-btn sm" data-act="lb">Natijalar</button>' +
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
    else if (act === 'del') deleteExercise(ex);
  }

  function openAdminLb(ex) {
    stopAdminLb();
    A.lbId = ex.id;
    var panel = document.getElementById('lhwAdminLb');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML =
      '<div class="lhw-lb-head"><h3>Jonli natijalar — ' + esc(ex.title) + '</h3>' +
        '<button type="button" class="lhw-btn sm" id="lhwLbClose">Yopish</button></div>' +
      '<div id="lhwAdminLbBody"><p class="lhw-muted">Yuklanmoqda…</p></div>';
    document.getElementById('lhwLbClose').addEventListener('click', closeAdminLb);
    A.lbUnsub = watchLeaderboard(ex.id, ex.groupId || '', function (rows) {
      var body = document.getElementById('lhwAdminLbBody');
      if (!body) return;
      body.innerHTML = leaderboardHTML(rows, null) +
        (rows ? '<p class="lhw-muted">Topshirganlar: ' + rows.length + ' ta</p>' : '');
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeAdminLb() {
    stopAdminLb();
    A.lbId = null;
    var panel = document.getElementById('lhwAdminLb');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
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
    if (err) err.hidden = true;

    var payload = {
      title: title,
      mediaUrl: safeUrl(mediaRaw),
      groupId: groupId,
      groupName: groupName,
      answers: answers,
      updatedAt: Date.now()
    };
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
