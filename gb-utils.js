/* ============================================================
   Djami Lessons — gb-utils.js
   ------------------------------------------------------------
   Test natijalari (gradebook) uchun umumiy yordamchi kutubxona.
   Ishlatiladi: student/dashboard.html va natijalar.html

   Ma'lumot shakli (gradebook/gradebook hujjati):
     { unitsByGroup: { "guruh": ["Unit 1", ...] },
       students: [{ id, name, group, progressId?,
                    scores:{unit:ball}, scoreTimestamps:{unit:ms},
                    notes:{unit:"ustoz izohi"} }] }

   Sahifa o'z ranglarini quyidagi CSS o'zgaruvchilari bilan beradi
   (berilmasa — standart yorug' ranglar):
     --gb-ink, --gb-dim, --gb-line, --gb-panel, --gb-accent
   ============================================================ */
(function(){
  'use strict';
  const GB = window.GB = {};

  /* ---------- sozlamalar (bitta joyda o'zgartiriladi) ---------- */
  GB.RETAKE_BELOW = 65;  // shu balldan past unit — qayta topshirish kerak
  GB.RED_BELOW    = 60;  // 60 dan past — qizil
  GB.GREEN_FROM   = 85;  // shundan yuqori — yashil, oraliq — sariq

  /* ---------- kichik yordamchilar ---------- */
  GB.esc = function(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  GB.normId = function(s){ return String(s || '').trim().toLowerCase(); };
  GB.normName = function(s){
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
      .replace(/[ʻʼ’‘`´]/g, "'");
  };
  // "Karimova Aziza" va "Aziza Karimova" bir xil hisoblanadi
  GB.nameKey = function(s){
    return GB.normName(s).split(' ').filter(Boolean).sort().join(' ');
  };
  GB.num = function(v){
    if(v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  GB.fmtNum = function(n){
    if(n === null || n === undefined || isNaN(n)) return '—';
    return String(Math.round(n * 10) / 10);
  };
  GB.fmtDate = function(ts){
    if(typeof ts !== 'number' || !isFinite(ts)) return '—';
    const d = new Date(ts);
    const p = x => String(x).padStart(2, '0');
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  };
  GB.slug = function(s){
    const t = String(s || 'talaba').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return t || 'talaba';
  };

  /* ---------- ma'lumotni o'qish ---------- */
  GB.parse = function(d){
    d = d || {};
    const students = Array.isArray(d.students) ? d.students : [];
    let unitsByGroup = {};
    if(d.unitsByGroup && typeof d.unitsByGroup === 'object' && !Array.isArray(d.unitsByGroup)){
      unitsByGroup = d.unitsByGroup;
    } else if(Array.isArray(d.units) && d.units.length){
      [...new Set(students.map(s => s.group))].forEach(g => { unitsByGroup[g] = [...d.units]; });
    }
    return { unitsByGroup, students };
  };
  GB.unitsFor = function(data, group){
    return (data && data.unitsByGroup && data.unitsByGroup[group]) || [];
  };

  /* ---------- hisob-kitob ---------- */
  // Ball qo'yilgan unitlar, kiritilgan vaqt bo'yicha eskidan yangiga.
  // Vaqti yo'q (eski) ballar ro'yxat tartibida eng boshiga qo'yiladi.
  GB.series = function(student, units){
    const stamps = (student && student.scoreTimestamps) || {};
    const notes = (student && student.notes) || {};
    const arr = [];
    (units || []).forEach((unit, idx) => {
      const sc = GB.num(student && student.scores ? student.scores[unit] : undefined);
      if(sc === null) return;
      const ts = (typeof stamps[unit] === 'number') ? stamps[unit] : null;
      arr.push({ unit, score: sc, ts, idx, note: notes[unit] ? String(notes[unit]) : '' });
    });
    arr.sort((a, b) => {
      const ta = a.ts === null ? -1 : a.ts;
      const tb = b.ts === null ? -1 : b.ts;
      return ta !== tb ? ta - tb : a.idx - b.idx;
    });
    return arr;
  };

  GB.summarize = function(student, units){
    const series = GB.series(student, units);
    const count = series.length;
    const total = series.reduce((a, p) => a + p.score, 0);
    const avg = count ? total / count : null;
    const latest = count ? series[count - 1] : null;
    const prev = count > 1 ? series[count - 2] : null;
    const delta = (latest && prev) ? latest.score - prev.score : null;
    let best = null, worst = null;
    series.forEach(p => {
      if(!best || p.score > best.score) best = p;
      if(!worst || p.score < worst.score) worst = p;
    });
    const retake = series.filter(p => p.score < GB.RETAKE_BELOW);
    return {
      series, count, avg, latest, prev, delta, best, worst, retake,
      passed: count - retake.length,
      unitsTotal: (units || []).length
    };
  };

  // Faqat talabaning o'z o'rni (boshqalarning ismi qaytarilmaydi)
  GB.groupRank = function(data, student){
    const rows = [];
    (data.students || []).forEach(s => {
      if(s.group !== student.group) return;
      const sm = GB.summarize(s, GB.unitsFor(data, s.group));
      if(sm.avg !== null) rows.push({ s, avg: sm.avg });
    });
    const me = rows.find(r => r.s === student || (r.s.id && r.s.id === student.id));
    if(!me) return null;
    const rank = 1 + rows.filter(r => r.avg > me.avg + 1e-9).length;
    return { rank, total: rows.length };
  };

  GB.tier = function(score){
    const n = Number(score);
    if(n < GB.RED_BELOW)  return { key: 'red',    color: '#e0455a', message: "Yaxshi o'qimayapsiz" };
    if(n < GB.GREEN_FROM) return { key: 'yellow', color: '#d99a00', message: "Harakatni to'xtatmang" };
    return                       { key: 'green',  color: '#1fa971', message: "A'lochi o'quvchi" };
  };

  GB.deltaText = function(delta){
    if(delta === null || delta === undefined) return '';
    if(delta > 0) return '+' + delta + ' oldingisidan';
    if(delta < 0) return '\u2212' + Math.abs(delta) + ' oldingisidan';
    return "o'zgarmagan";
  };

  /* ---------- SVG ikonlar (emoji o'rniga) ---------- */
  const ICONS = {
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3"/>',
    moon:   '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
    sun:    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    image:  '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    pdf:    '<path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v4h4M8.5 14h7M8.5 17.5h4"/>',
    up:     '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down:   '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    close:  '<path d="M6 6l12 12M18 6L6 18"/>',
    table:  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>'
  };
  GB.icon = function(name, size){
    size = size || 18;
    return '<svg class="gb-ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  };
  // 1-3 o'rin uchun medal (SVG), qolganlari uchun raqam
  GB.medal = function(rank, size){
    size = size || 22;
    const colors = { 1: '#d4af37', 2: '#9aa3b2', 3: '#c98a4b' };
    const c = colors[rank];
    if(!c) return '<span class="gb-rank-num">' + GB.esc(rank) + '</span>';
    return '<svg class="gb-ic gb-medal" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" role="img" aria-label="' + rank + '-o\'rin">' +
      '<path d="M8 2l4 6 4-6" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="15" r="6.5" fill="' + c + '"/>' +
      '<text x="12" y="18" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="Arial,sans-serif">' + rank + '</text></svg>';
  };

  /* ---------- mini chiziqli grafik (SVG) ---------- */
  GB.sparkline = function(series, opts){
    opts = opts || {};
    if(!series || series.length < 2) return '';
    const W = 320, H = 72, pad = 14;
    const scores = series.map(p => p.score);
    const mn = Math.min.apply(null, scores), mx = Math.max.apply(null, scores);
    // chiziq bir xil bo'lsa ham o'rtada turadi, chetga yopishmaydi
    const span = Math.max(mx - mn, 20), mid = (mn + mx) / 2;
    const lo = mid - span / 2 - span * 0.25, hi = mid + span / 2 + span * 0.25;
    const x = i => pad + (W - 2 * pad) * (i / (series.length - 1));
    const y = v => pad + (H - 2 * pad) * (1 - (v - lo) / (hi - lo));
    const pts = series.map((p, i) => [x(i), y(p.score)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z';
    const gid = 'gbg' + Math.random().toString(36).slice(2, 8);
    let th = '';
    if(lo < GB.RETAKE_BELOW && GB.RETAKE_BELOW < hi){
      const ty = y(GB.RETAKE_BELOW).toFixed(1);
      th = '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + ty + '" y2="' + ty + '" stroke="currentColor" stroke-opacity=".28" stroke-dasharray="3 4"/>';
    }
    const dots = pts.map((p, i) => {
      const last = i === pts.length - 1;
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (last ? 4.5 : 3) + '" fill="' + (last ? 'currentColor' : 'var(--gb-panel, #fff)') + '" stroke="currentColor" stroke-width="2"><title>' + GB.esc(series[i].unit) + ': ' + series[i].score + '</title></circle>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ballar dinamikasi grafigi">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      th +
      '<path d="' + line + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + '</svg>';
  };

  /* ---------- umumiy CSS ---------- */
  GB.injectCss = function(){
    if(document.getElementById('gb-utils-css')) return;
    const st = document.createElement('style');
    st.id = 'gb-utils-css';
    st.textContent = [
      '.gb-ic{flex:none;vertical-align:middle}',
      '.gb-rank-num{font-weight:700}',
      '.gb-delta{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;white-space:nowrap}',
      '.gb-delta.up{background:rgba(31,169,113,.16);color:#1fa971}',
      '.gb-delta.down{background:rgba(224,69,90,.16);color:#e0455a}',
      '.gb-delta.flat{background:rgba(125,136,160,.18);color:var(--gb-dim,#6b7484)}',
      '.gb-spark{color:var(--gb-accent,#2f5fd8);margin:10px 0 4px}',
      '.gb-spark svg{display:block;width:100%;height:auto;max-height:84px}',
      '.gb-spark.big svg{max-height:110px}',
      '.gb-spark.big{background:var(--gb-panel,#fff);border:1px solid var(--gb-line,#e2e5ec);border-radius:14px;padding:10px 12px;margin:0 0 4px}',
      '.gb-spark-cap{font-size:11px;color:var(--gb-dim,#6b7484);margin:0 0 8px}',
      '.gb-avgline{font-size:13px;font-weight:700;color:var(--gb-ink,#1c212e);margin:6px 0 8px}',
      '.gb-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}',
      '.gb-chip{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(125,136,160,.15);color:var(--gb-ink,#1c212e)}',
      '.gb-chip.pass{background:rgba(31,169,113,.16);color:#1fa971}',
      '.gb-chip.fail{background:rgba(224,69,90,.16);color:#e0455a}',
      '.gb-bw{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 10px}',
      '.gb-bw>div{border:1px solid var(--gb-line,#e2e5ec);border-radius:10px;padding:8px 10px;background:var(--gb-panel,#fff);min-width:0}',
      '.gb-bw small{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--gb-dim,#6b7484)}',
      '.gb-bw b{display:block;font-size:18px;margin-top:2px}',
      '.gb-bw span.u{display:block;font-size:12px;color:var(--gb-dim,#6b7484);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gb-retake{border:1px dashed rgba(224,69,90,.5);border-radius:10px;padding:8px 10px;margin:0 0 10px;font-size:12.5px;color:var(--gb-ink,#1c212e)}',
      '.gb-retake b{color:#e0455a}',
      '.gb-retake ul{margin:6px 0 0;padding-left:18px}',
      '.gb-note{border-left:3px solid var(--gb-accent,#2f5fd8);background:rgba(125,136,160,.12);border-radius:6px;padding:7px 10px;margin:0 0 10px;font-size:12.5px;line-height:1.45;color:var(--gb-ink,#1c212e)}',
      '.gb-note small{display:block;font-size:11px;color:var(--gb-dim,#6b7484);margin-bottom:2px}',
      '.gb-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 12px}',
      '.gb-tools select{font:inherit;font-size:12.5px;padding:6px 8px;border-radius:8px;border:1px solid var(--gb-line,#e2e5ec);background:var(--gb-panel,#fff);color:var(--gb-ink,#1c212e)}',
      '.gb-tools label{flex:1 1 100%;display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--gb-dim,#6b7484)}',
      '.gb-tools label select{flex:1;min-width:0}',
      '.gb-btn{flex:1;justify-content:center;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;font-weight:700;padding:7px 12px;border-radius:999px;border:1px solid var(--gb-line,#e2e5ec);background:transparent;color:var(--gb-ink,#1c212e);cursor:pointer}',
      '.gb-btn:hover{border-color:var(--gb-accent,#2f5fd8);color:var(--gb-accent,#2f5fd8)}',
      '.gb-btn:disabled{opacity:.5;cursor:wait}',
      '.gb-status{flex:1 1 100%;text-align:center;font-size:12px;color:var(--gb-dim,#6b7484)}',
      '.gb-status:empty{display:none}',
      '.gb-list{display:flex;flex-direction:column;gap:8px}',
      '.gb-row{display:flex;gap:12px;align-items:flex-start;padding:10px;border:1px solid var(--gb-line,#e2e5ec);border-radius:14px;background:var(--gb-panel,#fff)}',
      '.gb-sc{flex:none;width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;background:rgba(125,136,160,.14);color:var(--gb-dim,#6b7484)}',
      '.gb-s-red{background:rgba(224,69,90,.16);color:#e0455a}',
      '.gb-s-yellow{background:rgba(245,179,1,.2);color:#b87f00}',
      '.gb-s-green{background:rgba(31,169,113,.16);color:#1fa971}',
      '.gb-rmain{flex:1;min-width:0}',
      '.gb-rtop{display:flex;justify-content:space-between;align-items:center;gap:8px}',
      '.gb-rtop b{font-size:14px;color:var(--gb-ink,#1c212e);overflow-wrap:anywhere}',
      '.gb-rsub{font-size:12px;color:var(--gb-dim,#6b7484);margin-top:3px}',
      '.gb-rnote{margin-top:7px;font-size:12.5px;line-height:1.4;color:var(--gb-ink,#1c212e);border-left:3px solid var(--gb-accent,#2f5fd8);padding-left:8px}',
      '.gb-st{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}',
      '.gb-st.pass{background:rgba(31,169,113,.16);color:#1fa971}',
      '.gb-st.fail{background:rgba(224,69,90,.16);color:#e0455a}',
      '.gb-empty{color:var(--gb-dim,#6b7484)}'
    ].join('\n');
    document.head.appendChild(st);
  };

  /* ---------- kartaning qo'shimcha bloklari ---------- */
  GB.deltaHtml = function(sum){
    if(sum.delta === null) return '';
    const cls = sum.delta > 0 ? 'up' : sum.delta < 0 ? 'down' : 'flat';
    const ic = sum.delta > 0 ? GB.icon('up', 12) : sum.delta < 0 ? GB.icon('down', 12) : '';
    return '<span class="gb-delta ' + cls + '">' + ic + GB.esc(GB.deltaText(sum.delta)) + '</span>';
  };

  // Mini grafik, o'rtacha/o'rin, o'tgan/qayta, eng yaxshi-eng past, qayta ro'yxati, ustoz izohi
  GB.extraHtml = function(sum, rank){
    if(!sum.count) return '';
    let h = '';
    const sp = GB.sparkline(sum.series);
    if(sp){
      h += '<div class="gb-spark">' + sp + '</div><p class="gb-spark-cap">Barcha unitlar bo\'yicha ballar dinamikasi (' + sum.count + ' ta)</p>';
    }
    h += '<div class="gb-avgline">O\'rtacha ' + GB.esc(GB.fmtNum(sum.avg)) +
      (rank ? ' \u00b7 guruhda ' + rank.rank + '-o\'rin <span style="font-weight:500;opacity:.7">(' + rank.total + ' tadan)</span>' : '') + '</div>';
    h += '<div class="gb-chips"><span class="gb-chip pass">O\'tgan: ' + sum.passed + '</span><span class="gb-chip fail">Qayta: ' + sum.retake.length + '</span></div>';
    if(sum.count >= 2 && sum.best && sum.worst && sum.best !== sum.worst){
      h += '<div class="gb-bw">' +
        '<div><small>' + GB.icon('up', 12) + 'Eng yaxshi</small><b style="color:' + GB.tier(sum.best.score).color + '">' + sum.best.score + '</b><span class="u">' + GB.esc(sum.best.unit) + '</span></div>' +
        '<div><small>' + GB.icon('down', 12) + 'Eng past</small><b style="color:' + GB.tier(sum.worst.score).color + '">' + sum.worst.score + '</b><span class="u">' + GB.esc(sum.worst.unit) + '</span></div>' +
        '</div>';
    }
    if(sum.retake.length){
      h += '<div class="gb-retake"><b>Qayta topshirish kerak: ' + sum.retake.length + ' ta unit</b> (' + GB.RETAKE_BELOW + ' balldan past)<ul>' +
        sum.retake.map(p => '<li>' + GB.esc(p.unit) + ' \u2014 ' + p.score + '</li>').join('') + '</ul></div>';
    }
    const noteRow = sum.latest && sum.latest.note ? sum.latest : null;
    if(noteRow){
      h += '<div class="gb-note"><small>Ustoz izohi \u00b7 ' + GB.esc(noteRow.unit) + '</small>' + GB.esc(noteRow.note) + '</div>';
    }
    return h;
  };

  /* ---------- batafsil jadval (modal yoki sahifa ichida) ---------- */
  function sortedRows(student, units, sum, mode){
    const bySc = {};
    sum.series.forEach(p => { bySc[p.unit] = p; });
    const rows = units.map((u, idx) => ({ unit: u, idx, p: bySc[u] || null }));
    if(mode === 'date'){
      rows.sort((a, b) => ((b.p && b.p.ts) || -1) - ((a.p && a.p.ts) || -1) || a.idx - b.idx);
    } else if(mode === 'score_desc'){
      rows.sort((a, b) => (b.p ? b.p.score : -1) - (a.p ? a.p.score : -1) || a.idx - b.idx);
    } else if(mode === 'score_asc'){
      rows.sort((a, b) => (a.p ? a.p.score : 1e9) - (b.p ? b.p.score : 1e9) || a.idx - b.idx);
    }
    return rows;
  }
  function tableBody(student, units, sum, mode){
    if(!units.length) return '<div class="gb-empty">Hali unitlar qo\'shilmagan.</div>';
    return sortedRows(student, units, sum, mode).map(r => {
      if(!r.p){
        return '<div class="gb-row"><div class="gb-sc">\u2014</div><div class="gb-rmain"><div class="gb-rtop"><b>' + GB.esc(r.unit) + '</b></div><div class="gb-rsub">Hali natija kiritilmagan</div></div></div>';
      }
      const pass = r.p.score >= GB.RETAKE_BELOW;
      return '<div class="gb-row"><div class="gb-sc gb-s-' + GB.tier(r.p.score).key + '">' + r.p.score + '</div>' +
        '<div class="gb-rmain"><div class="gb-rtop"><b>' + GB.esc(r.unit) + '</b><span class="gb-st ' + (pass ? 'pass' : 'fail') + '">' + (pass ? "O'TDI" : 'QAYTA') + '</span></div>' +
        '<div class="gb-rsub">' + GB.esc(GB.fmtDate(r.p.ts)) + '</div>' +
        (r.p.note ? '<div class="gb-rnote">' + GB.esc(r.p.note) + '</div>' : '') + '</div></div>';
    }).join('');
  }

  // el ichiga talabaning to'liq jadvalini chizadi va tugmalarni ulaydi.
  // ctx: { student, units, sum, rank }
  GB.mountDetail = function(el, ctx){
    GB.injectCss();
    const { student, units, sum, rank } = ctx;
    const sp = GB.sparkline(sum.series);
    const compact = !!ctx.compact; // true bo'lsa — yuqoridagi o'rtacha/grafik takrorlanmaydi
    el.innerHTML =
      (compact ? '' :
        '<div class="gb-chips">' +
          '<span class="gb-chip">O\'rtacha ' + GB.esc(GB.fmtNum(sum.avg)) + '</span>' +
          (rank ? '<span class="gb-chip">Guruhda ' + rank.rank + '-o\'rin</span>' : '') +
          '<span class="gb-chip pass">O\'tgan: ' + sum.passed + '</span>' +
          '<span class="gb-chip fail">Qayta: ' + sum.retake.length + '</span>' +
        '</div>' +
        (sp ? '<div class="gb-spark big">' + sp + '</div>' : '')) +
      '<div class="gb-tools">' +
        '<label>Saralash<select class="gb-sort">' +
          '<option value="list">Unit tartibi</option>' +
          '<option value="date">Sana (yangisi birinchi)</option>' +
          '<option value="score_desc">Ball (yuqoridan pastga)</option>' +
          '<option value="score_asc">Ball (pastdan yuqoriga)</option>' +
        '</select></label>' +
        '<button type="button" class="gb-btn" data-gb-share="image">' + GB.icon('image', 15) + 'Rasm</button>' +
        '<button type="button" class="gb-btn" data-gb-share="pdf">' + GB.icon('pdf', 15) + 'PDF</button>' +
        '<span class="gb-status" aria-live="polite"></span>' +
      '</div>' +
      '<div class="gb-list">' + tableBody(student, units, sum, 'list') + '</div>';

    const listEl = el.querySelector('.gb-list');
    el.querySelector('.gb-sort').addEventListener('change', e => {
      listEl.innerHTML = tableBody(student, units, sum, e.target.value);
    });
    const status = el.querySelector('.gb-status');
    el.querySelectorAll('[data-gb-share]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const all = el.querySelectorAll('[data-gb-share]');
        all.forEach(b => b.disabled = true);
        status.textContent = 'Tayyorlanmoqda\u2026';
        try{
          const r = await GB.share(btn.dataset.gbShare, ctx);
          status.textContent = r === 'shared' ? 'Yuborildi' : r === 'cancelled' ? '' : 'Yuklab olindi';
        } catch(err){
          console.error('Share failed:', err);
          status.textContent = 'Xatolik, qayta urinib ko\'ring.';
        }
        all.forEach(b => b.disabled = false);
        if(status.textContent) setTimeout(() => { status.textContent = ''; }, 3500);
      });
    });
  };

  /* ---------- rasm / PDF yaratish va ulashish ---------- */
  function rrect(c, x, y, w, h, r){
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function wrapText(c, text, x, y, maxW, lh, maxLines){
    const words = String(text).split(/\s+/);
    let line = '', n = 0;
    for(let i = 0; i < words.length; i++){
      const t = line ? line + ' ' + words[i] : words[i];
      if(c.measureText(t).width > maxW && line){
        c.fillText(line, x, y); y += lh; n++; line = words[i];
        if(n >= maxLines - 1){
          const rest = words.slice(i).join(' ');
          c.fillText(rest.length > 60 ? rest.slice(0, 58) + '\u2026' : rest, x, y);
          return y + lh;
        }
      } else line = t;
    }
    if(line){ c.fillText(line, x, y); y += lh; }
    return y;
  }

  GB.renderCardCanvas = function(ctx){
    const { student, sum, rank } = ctx;
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const FONT = '"Inter","Segoe UI",Roboto,Arial,sans-serif';

    c.fillStyle = '#eef1f8'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffffff'; rrect(c, 50, 50, W - 100, H - 100, 36); c.fill();

    // sarlavha
    const g = c.createLinearGradient(50, 50, W - 50, 250);
    g.addColorStop(0, '#1a3766'); g.addColorStop(1, '#2f5fd8');
    c.save(); rrect(c, 50, 50, W - 100, 190, 36); c.clip();
    c.fillStyle = g; c.fillRect(50, 50, W - 100, 190); c.restore();
    c.fillStyle = '#ffffff'; c.textBaseline = 'alphabetic';
    c.font = '800 48px ' + FONT; c.fillText('Djami Lessons', 100, 140);
    c.font = '500 28px ' + FONT; c.globalAlpha = .85; c.fillText('Test natijalari', 100, 185); c.globalAlpha = 1;

    // ism, guruh
    c.fillStyle = '#1c212e'; c.font = '800 60px ' + FONT;
    let nm = String(student.name || ''); while(c.measureText(nm).width > W - 200 && nm.length > 4) nm = nm.slice(0, -2);
    if(nm !== student.name) nm += '\u2026';
    c.fillText(nm, 100, 330);
    c.fillStyle = '#6b7484'; c.font = '500 32px ' + FONT; c.fillText(student.group || '', 100, 378);

    // o'rtacha
    const tr = sum.avg !== null ? GB.tier(sum.avg) : { color: '#6b7484' };
    c.fillStyle = '#6b7484'; c.font = '600 28px ' + FONT; c.fillText("O'rtacha ball", 100, 460);
    c.fillStyle = tr.color; c.font = '800 130px ' + FONT; c.fillText(GB.fmtNum(sum.avg), 100, 580);
    if(rank){
      c.fillStyle = '#1c212e'; c.font = '700 40px ' + FONT; c.textAlign = 'right';
      c.fillText('Guruhda ' + rank.rank + '-o\'rin', W - 100, 530);
      c.fillStyle = '#6b7484'; c.font = '500 28px ' + FONT; c.fillText(rank.total + ' talabadan', W - 100, 570);
      c.textAlign = 'left';
    }
    if(sum.latest){
      c.fillStyle = '#6b7484'; c.font = '500 28px ' + FONT;
      let t = "So'nggi: " + sum.latest.unit + ' \u2014 ' + sum.latest.score;
      if(sum.delta !== null) t += '  (' + GB.deltaText(sum.delta) + ')';
      wrapText(c, t, 100, 640, W - 200, 36, 2);
    }

    // grafik
    const gx = 100, gy = 700, gw = W - 200, gh = 160;
    c.fillStyle = '#f6f7fb'; rrect(c, gx - 20, gy - 20, gw + 40, gh + 40, 20); c.fill();
    if(sum.series.length >= 2){
      const sc = sum.series.map(p => p.score);
      const mn = Math.min.apply(null, sc), mx = Math.max.apply(null, sc);
      const span = Math.max(mx - mn, 20), mid = (mn + mx) / 2;
      const lo = mid - span / 2 - span * 0.25, hi = mid + span / 2 + span * 0.25;
      const X = i => gx + gw * (i / (sum.series.length - 1));
      const Y = v => gy + gh * (1 - (v - lo) / (hi - lo));
      c.strokeStyle = '#2f5fd8'; c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); sum.series.forEach((p, i) => { i ? c.lineTo(X(i), Y(p.score)) : c.moveTo(X(i), Y(p.score)); }); c.stroke();
      sum.series.forEach((p, i) => {
        const last = i === sum.series.length - 1;
        c.beginPath(); c.arc(X(i), Y(p.score), last ? 11 : 8, 0, Math.PI * 2);
        c.fillStyle = last ? '#2f5fd8' : '#ffffff'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#2f5fd8'; c.stroke();
      });
    } else {
      c.fillStyle = '#9aa2b1'; c.font = '500 28px ' + FONT; c.textAlign = 'center';
      c.fillText('Grafik uchun kamida 2 ta natija kerak', W / 2, gy + gh / 2 + 10); c.textAlign = 'left';
    }

    // o'tgan / qayta
    let y = 940;
    c.font = '800 34px ' + FONT;
    c.fillStyle = '#1fa971'; c.fillText("O'tgan: " + sum.passed, 100, y);
    c.fillStyle = '#e0455a'; c.fillText('Qayta: ' + sum.retake.length, 420, y);

    // eng yaxshi / eng past
    if(sum.count >= 2 && sum.best && sum.worst && sum.best !== sum.worst){
      y += 40;
      [[sum.best, 'Eng yaxshi', 100], [sum.worst, 'Eng past', 560]].forEach(b => {
        c.fillStyle = '#f6f7fb'; rrect(c, b[2], y, 420, 120, 18); c.fill();
        c.fillStyle = '#6b7484'; c.font = '600 24px ' + FONT; c.fillText(b[1], b[2] + 22, y + 36);
        c.fillStyle = GB.tier(b[0].score).color; c.font = '800 48px ' + FONT; c.fillText(String(b[0].score), b[2] + 22, y + 92);
        c.fillStyle = '#6b7484'; c.font = '500 24px ' + FONT;
        let u = b[0].unit; while(c.measureText(u).width > 240 && u.length > 4) u = u.slice(0, -2);
        c.fillText(u === b[0].unit ? u : u + '\u2026', b[2] + 150, y + 90);
      });
      y += 120;
    }

    // qayta topshiriladigan unitlar
    if(sum.retake.length){
      y += 56;
      c.fillStyle = '#e0455a'; c.font = '700 28px ' + FONT;
      c.fillText('Qayta topshirish kerak (' + GB.RETAKE_BELOW + ' dan past):', 100, y);
      c.fillStyle = '#1c212e'; c.font = '500 28px ' + FONT;
      y = wrapText(c, sum.retake.map(p => p.unit + ' (' + p.score + ')').join(', '), 100, y + 42, W - 200, 38, 2);
    }

    // pastki qism
    c.fillStyle = '#9aa2b1'; c.font = '500 26px ' + FONT;
    c.fillText(GB.fmtDate(Date.now()) + ' \u00b7 Djami Lessons', 100, H - 72);
    return cv;
  };

  GB.makePdf = function(canvas){
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const bin = atob(dataUrl.split(',')[1]);
    const jpg = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) jpg[i] = bin.charCodeAt(i);

    const enc = new TextEncoder();
    const PW = 595, PH = 842, M = 30;
    const scale = Math.min((PW - 2 * M) / canvas.width, (PH - 2 * M) / canvas.height);
    const w = canvas.width * scale, h = canvas.height * scale;
    const x = (PW - w) / 2, y = PH - M - h;
    const content = 'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm /Im0 Do Q';

    const parts = [], offsets = [];
    let len = 0;
    const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
    push('%PDF-1.4\n');
    offsets[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offsets[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    offsets[3] = len; push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    offsets[4] = len;
    push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
    push(jpg); push('\nendstream\nendobj\n');
    offsets[5] = len; push('5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
    const xref = len;
    let x1 = 'xref\n0 6\n0000000000 65535 f \n';
    for(let i = 1; i <= 5; i++) x1 += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    x1 += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    push(x1);
    return new Blob(parts, { type: 'application/pdf' });
  };

  GB.share = async function(kind, ctx){
    const canvas = GB.renderCardCanvas(ctx);
    const slug = GB.slug(ctx.student.name);
    let blob, filename, mime;
    if(kind === 'pdf'){
      blob = GB.makePdf(canvas); filename = 'natija-' + slug + '.pdf'; mime = 'application/pdf';
    } else {
      blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      filename = 'natija-' + slug + '.png'; mime = 'image/png';
    }
    if(!blob) throw new Error('Fayl yaratib bo\'lmadi');
    const file = new File([blob], filename, { type: mime });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      try{
        await navigator.share({ files: [file], title: 'Test natijasi' });
        return 'shared';
      } catch(e){
        if(e && e.name === 'AbortError') return 'cancelled';
        // boshqa xatoda — oddiy yuklab olishga o'tamiz
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  };
})();
