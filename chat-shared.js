/* ============================================================
   Djami Lessons — Chat shared helpers
   ------------------------------------------------------------
   Used by student/dashboard.html and admin/dashboard_a.html for
   the student <-> teacher chat:
     - Presence (online / last seen)
     - "Yozmoqda..." (typing) indicator
     - Emoji picker
     - Reply-to-message helpers
   Requires firebase-config.js (globals: firebase, db) to be
   loaded first.
   ============================================================ */

/* ---------- PRESENCE (online / last seen) ---------- */

const PRESENCE_FRESH_MS = 25000;   // heartbeat is every 20s — 25s = considered stale
const PRESENCE_HEARTBEAT_MS = 20000;

// Call once per session (student or admin) after login. Keeps
// presence/{uid} fresh while the tab is open/visible, and marks the
// user offline as soon as they leave the tab or close it.
// Returns a stop() function you can call on sign-out.
function startPresenceHeartbeat(uid, role){
  if(!uid) return function(){};
  const ref = db.collection('presence').doc(uid);
  let timer = null;

  function beat(){
    ref.set({
      role: role,
      online: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(()=>{});
  }
  function goOffline(){
    ref.set({
      role: role,
      online: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(()=>{});
  }
  function onVisibility(){
    if(document.hidden){
      goOffline();
      if(timer){ clearInterval(timer); timer = null; }
    } else {
      beat();
      if(!timer) timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    }
  }

  beat();
  timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', goOffline);
  window.addEventListener('pagehide', goOffline);

  return function stop(){
    if(timer){ clearInterval(timer); timer = null; }
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', goOffline);
    window.removeEventListener('pagehide', goOffline);
    goOffline();
  };
}

// Watches presence/{uid} and calls onUpdate({online, lastSeenDate})
// whenever it changes, and also re-checks every 15s so "3 daqiqa oldin"
// style staleness updates even without a new write.
// Returns an unsubscribe function.
function watchPresenceStatus(uid, onUpdate){
  if(!uid) return function(){};
  let latest = null;
  const unsubSnap = db.collection('presence').doc(uid).onSnapshot(doc => {
    latest = doc.exists ? doc.data() : null;
    tick();
  }, () => { onUpdate({ online:false, lastSeenDate:null }); });

  function tick(){
    if(!latest){ onUpdate({ online:false, lastSeenDate:null }); return; }
    const ts = latest.lastSeen && latest.lastSeen.toDate ? latest.lastSeen.toDate() : null;
    const fresh = ts ? (Date.now() - ts.getTime()) < PRESENCE_FRESH_MS : false;
    onUpdate({ online: !!latest.online && fresh, lastSeenDate: ts });
  }

  const interval = setInterval(tick, 15000);
  return function unsub(){ unsubSnap(); clearInterval(interval); };
}

// Formats a "last seen" timestamp in Uzbek, e.g. "bugun, 14:32".
function formatLastSeen(date){
  if(!date) return 'onlayn holati mavjud emas';
  const now = new Date();
  const time = date.toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit' });
  if(date.toDateString() === now.toDateString()) return 'bugun, ' + time;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if(date.toDateString() === yest.toDateString()) return 'kecha, ' + time;
  const dateStr = date.toLocaleDateString('uz-UZ', { day:'numeric', month:'long' });
  return dateStr + ', ' + time;
}

// Applies an {online, lastSeenDate} status onto a dot + text element pair.
// fallbackDate: used when there's no real presence record yet (e.g. this
// person used the chat before the presence feature existed) — we fall
// back to the chat's last-activity timestamp so we still show a real
// time instead of the generic "onlayn holati mavjud emas" placeholder.
function renderPresenceStatus(dotEl, textEl, status, onlineLabel, fallbackDate){
  if(!dotEl || !textEl) return;
  dotEl.classList.toggle('is-online', !!status.online);
  const seenDate = status.lastSeenDate || fallbackDate || null;
  textEl.textContent = status.online ? (onlineLabel || 'Onlayn') : ('Oxirgi marta: ' + formatLastSeen(seenDate));
}

/* ---------- TYPING INDICATOR ---------- */

const TYPING_FRESH_MS = 4000;
const TYPING_WRITE_THROTTLE_MS = 2000;
const TYPING_IDLE_MS = 2500;

// Creates a controller you call notifyTyping() on every keystroke and
// notifyStopped() on send/blur. Writes {field:true/false, field+'At':ts}
// onto the given Firestore doc ref, throttled so it isn't spammed.
function makeTypingController(docRef, field){
  let lastSentAt = 0;
  let idleTimer = null;

  function writeTyping(isTyping){
    const update = {};
    update[field] = isTyping;
    update[field + 'At'] = firebase.firestore.FieldValue.serverTimestamp();
    docRef.set(update, { merge:true }).catch(()=>{});
  }
  function notifyTyping(){
    const now = Date.now();
    if(now - lastSentAt > TYPING_WRITE_THROTTLE_MS){
      lastSentAt = now;
      writeTyping(true);
    }
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(notifyStopped, TYPING_IDLE_MS);
  }
  function notifyStopped(){
    if(idleTimer){ clearTimeout(idleTimer); idleTimer = null; }
    lastSentAt = 0;
    writeTyping(false);
  }
  return { notifyTyping, notifyStopped };
}

// Watches a chat doc for a typing field + freshness, calls onChange(bool).
function watchTyping(docRef, field, onChange){
  return docRef.onSnapshot(doc => {
    const d = doc.exists ? doc.data() : {};
    const flag = !!d[field];
    const ts = d[field + 'At'] && d[field + 'At'].toDate ? d[field + 'At'].toDate() : null;
    const fresh = ts ? (Date.now() - ts.getTime()) < TYPING_FRESH_MS : flag;
    onChange(flag && fresh);
  }, () => onChange(false));
}

/* ---------- REPLY-TO-MESSAGE ---------- */

// Shortens a message for use as a quoted reply preview.
function truncateForReply(text, max){
  max = max || 90;
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

/* ---------- EMOJI PICKER ---------- */

const CHAT_EMOJI_CATEGORIES = [
  { icon:'😀', emojis:['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','😘','😙','😋','😛','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒','😔','😟','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤯','😳','🥵','🥶','😱','😨','😰','😥','🤗','🤔','🤭','🤫','🤥','😐','🙄','😯','😴','🤤','😵','🥴','🤢','🤒','😷'] },
  { icon:'👍', emojis:['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🖐️','👋','🤝','🙏','✊','👊','👏','🙌','👐','💪'] },
  { icon:'❤️', emojis:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','😻','💌'] },
  { icon:'🐶', emojis:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦉','🐺','🐴','🦄','🐝','🦋','🐢','🐍'] },
  { icon:'🍎', emojis:['🍎','🍏','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥭','🍍','🥝','🍅','🥑','🥕','🌽','🍞','🥐','🧀','🍔','🍟','🍕','🌭','🍜','🍣','🍰','🎂','🍩','🍫','☕','🍵'] },
  { icon:'⚽', emojis:['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🏸','🎯','🎮','🎲','🧩','📚','✏️','📝','🎓','🏆','🥇','🎨','🎵','🎧','🎤','🚀','✈️','🚗','⏰','💡','🔥','⭐','✨','🎉','🎁'] },
  { icon:'✅', emojis:['✅','❌','❗','❓','💯','🔴','🟢','🟡','🔵','⚪','⚫','🔺','🔻','⚠️','🚫','🆗','🆕','🔝','🔒','🔓'] }
];

// Wires an emoji button + hidden panel container to insert emoji into a
// textarea, phone-keyboard style (tap category, tap emoji, panel stays
// open for multiple picks). opts: { btn, panel, textarea, onInsert }
function initChatEmojiPicker(opts){
  const btn = opts.btn, panel = opts.panel, textarea = opts.textarea;
  if(!btn || !panel || !textarea) return;
  let built = false;

  function build(){
    if(built) return;
    built = true;
    const tabs = document.createElement('div');
    tabs.className = 'chat-emoji-tabs';
    const grid = document.createElement('div');
    grid.className = 'chat-emoji-grid';
    CHAT_EMOJI_CATEGORIES.forEach((cat, i) => {
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'chat-emoji-tab' + (i === 0 ? ' is-active' : '');
      tabBtn.textContent = cat.icon;
      tabBtn.addEventListener('click', () => selectCat(i));
      tabs.appendChild(tabBtn);
    });
    panel.appendChild(tabs);
    panel.appendChild(grid);
    selectCat(0);
  }

  function selectCat(i){
    panel.querySelectorAll('.chat-emoji-tab').forEach((t, idx) => t.classList.toggle('is-active', idx === i));
    const grid = panel.querySelector('.chat-emoji-grid');
    grid.innerHTML = '';
    CHAT_EMOJI_CATEGORIES[i].emojis.forEach(em => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-emoji-item';
      b.textContent = em;
      b.addEventListener('click', () => insertEmoji(em));
      grid.appendChild(b);
    });
  }

  function insertEmoji(em){
    const start = textarea.selectionStart != null ? textarea.selectionStart : textarea.value.length;
    const end = textarea.selectionEnd != null ? textarea.selectionEnd : textarea.value.length;
    const val = textarea.value;
    textarea.value = val.slice(0, start) + em + val.slice(end);
    const pos = start + em.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    if(typeof opts.onInsert === 'function') opts.onInsert(em);
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    build();
    panel.hidden = !panel.hidden;
  });
  document.addEventListener('click', e => {
    if(!panel.hidden && !panel.contains(e.target) && e.target !== btn){
      panel.hidden = true;
    }
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape') panel.hidden = true;
  });
}

/* ============================================================
   CHAT CONTROLLER (student va o'qituvchi uchun umumiy)
   ------------------------------------------------------------
   Imkoniyatlar: sahifalash (50 tadan), aqlli skroll + "Yangi xabar"
   tugmasi, bitta batch bilan yuborish, "yuborilmoqda" holati,
   tahrirlash / o'chirish, reaksiyalar, havolalar, qidiruv,
   qadash (pin), javobdan asl xabarga o'tish, tayyor javoblar
   (faqat o'qituvchi), ish vaqti eslatmasi (faqat talaba).
   ============================================================ */

// Ish vaqti (Toshkent vaqti bilan). Talaba chatida eslatma sifatida ko'rinadi.
const CHAT_WORK_HOURS = { from: 9, to: 21 };
const CHAT_REACTIONS = ['👍','❤️','😂','😮','🙏'];
const CHAT_QUICK_DEFAULT = ['Salom! 👋', 'Rahmat, qabul qilindi ✅', 'Uy vazifasini yuboring, iltimos', 'Dars o‘z vaqtida boshlanadi'];

(function injectChatCss(){
  if(document.getElementById('chatSharedCss')) return;
  const st = document.createElement('style');
  st.id = 'chatSharedCss';
  st.textContent = `
  .chat-toolbar{padding:6px 12px 0;font-size:12px;color:var(--gray,#777)}
  .chat-toolbar-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .chat-tb-btn{background:none;border:0;cursor:pointer;font-size:15px;padding:2px 6px;border-radius:6px}
  .chat-tb-btn:hover{background:rgba(127,127,127,.15)}
  .chat-search-input{width:100%;box-sizing:border-box;margin:6px 0;padding:6px 10px;border:1px solid rgba(127,127,127,.35);border-radius:8px;background:transparent;color:inherit;font:inherit}
  .chat-pinned{display:flex;align-items:center;gap:6px;margin:6px 0;padding:6px 10px;border-radius:8px;background:rgba(127,127,127,.12);cursor:pointer}
  .chat-pinned span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .chat-pinned button{background:none;border:0;cursor:pointer;color:inherit}
  .chat-older-btn{display:block;margin:6px auto 10px;padding:5px 14px;border-radius:999px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;font-size:12px}
  .chat-jump-btn{position:sticky;bottom:8px;display:block;margin-left:auto;padding:6px 12px;border:0;border-radius:999px;background:var(--teal,#0f9d8a);color:#fff;cursor:pointer;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
  .chat-msg-bubble a{color:inherit;text-decoration:underline;word-break:break-all}
  .chat-msg-bubble mark{background:#ffe066;color:#222;border-radius:3px}
  .chat-msg-bubble .is-deleted{font-style:italic;opacity:.65}
  .chat-msg-edited,.chat-msg-pending{font-size:11px;opacity:.7}
  .chat-react-row{display:flex;gap:3px;margin-top:3px;flex-wrap:wrap}
  .chat-react-chip{font-size:13px;padding:0 6px;border-radius:999px;background:rgba(127,127,127,.18)}
  .chat-react-bar{position:fixed;z-index:9999;display:flex;gap:2px;padding:4px 6px;border-radius:999px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25)}
  .chat-react-bar button{border:0;background:none;font-size:20px;cursor:pointer;padding:2px 4px;border-radius:8px}
  .chat-react-bar button:hover{background:rgba(0,0,0,.08)}
  .chat-msg-row{position:relative}
  .chat-msg-actions{position:absolute;top:-14px;z-index:3;gap:2px;padding:2px 4px;border-radius:999px;background:var(--white,#fff);box-shadow:0 2px 10px -2px rgba(20,33,61,.35);pointer-events:none;flex:none}
  .chat-msg-row.is-mine .chat-msg-actions{right:4px}
  .chat-msg-row:not(.is-mine) .chat-msg-actions{left:44px}
  .chat-msg-row:hover .chat-msg-actions,.chat-msg-row.is-open .chat-msg-actions{opacity:1;pointer-events:auto}
  .chat-msg-actions:empty{display:none}
  .chat-msg-actions .chat-msg-action-btn{width:26px;height:26px;font-size:13px;line-height:1;padding:0;box-shadow:none}
  @media (hover:none){.chat-msg-actions{opacity:0}}
  .chat-quick{width:100%;box-sizing:border-box;flex:none;max-height:80px;overflow-y:auto}
  .chat-msg-row.is-flash .chat-msg-bubble{outline:2px solid #ffb703;outline-offset:2px}
  .chat-msg-quote[data-jump]{cursor:pointer}
  .chat-quick{display:flex;gap:6px;flex-wrap:wrap;padding:6px 12px 0}
  .chat-quick button{border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer}
  .chat-filter-chips{display:flex;gap:6px;padding:6px 10px;flex-wrap:wrap}
  .chat-filter-chips button{border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer}
  .chat-filter-chips button.is-active{background:var(--teal,#0f9d8a);color:#fff;border-color:transparent}
  body.dark.admin-theme .chat-messages{background:#0d1322 !important}
  body.dark.admin-theme .chat-msg-teacher .chat-msg-bubble{background:#1d2740 !important;color:#e6ebf5 !important}
  body.dark.admin-theme .chat-date-sep span{background:#1d2740 !important;color:#c3cada !important}
  body.dark.admin-theme .chat-msg-meta{color:#8e9ab3}
  body.dark .chat-react-bar{background:#1d2740}
  body.dark .chat-react-bar button:hover{background:rgba(255,255,255,.1)}
  body.dark .chat-msg-actions{background:#1d2740}
  body.dark .chat-msg-bubble mark{background:#b58900;color:#fff}
  .chat-filter-chips button.is-active,.chat-jump-btn{background:var(--adm-blue,var(--teal,#0f9d8a))}
  /* Talaba chati: butun ekranli (Telegram kabi) */
  #view-chat:not([hidden]){position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:var(--white,#fff);margin:0;padding:0;overflow:hidden}
  body.dark #view-chat:not([hidden]){background:#171d2c}
  #view-chat:not([hidden]) .chat-page-header{display:none}
  #view-chat:not([hidden]) .back-link{display:none}
  #view-chat:not([hidden]) .chat-detail-header{padding:.6em 1em;flex:none}
  .chat-back-btn{background:none;border:0;color:inherit;font-size:26px;line-height:1;cursor:pointer;padding:0 8px 0 0;flex:none}
  #view-chat:not([hidden]) .chat-panel-solo{flex:1;min-height:0;height:auto !important;border:0;border-radius:0;box-shadow:none}
  #view-chat:not([hidden]) .chat-messages{padding:1em 5%}
  #view-chat:not([hidden]) .chat-textarea{font-size:16px}
  @media (min-width:900px){ #view-chat:not([hidden]) .chat-messages{padding:1.2em 12%} }
  /* Javob (reply) iqtibosi — o'qiladigan kontrast */
  .chat-msg-student .chat-msg-quote{background:rgba(255,255,255,.2) !important;color:#fff !important;border-left-color:#fff !important}
  .chat-msg-student .chat-msg-quote .chat-msg-quote-name{color:#fff !important;opacity:.95}
  .chat-msg-teacher .chat-msg-quote{background:rgba(0,0,0,.07);color:var(--ink,#1f2937)}
  body.dark .chat-msg-teacher .chat-msg-quote{background:rgba(255,255,255,.1) !important;color:#dbe2f0 !important}
  .chat-msg-quote{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:.84rem}
  `;
  document.head.appendChild(st);
})();

function chatEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Matnni xavfsiz HTML ga aylantiradi, havolalarni bosiladigan qiladi va
// qidiruv so'zini ajratib ko'rsatadi.
function chatLinkify(text, query){
  let h = chatEsc(text).replace(/\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, u => {
    const clean = u.replace(/[.,!?)]+$/, '');
    const tail = u.slice(clean.length);
    const href = /^www\./.test(clean) ? 'https://' + clean : clean;
    return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + clean + '</a>' + tail;
  });
  if(query){
    const q = chatEsc(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    h = h.replace(new RegExp('(' + q + ')(?![^<]*>)', 'gi'), '<mark>$1</mark>');
  }
  return h;
}

function chatInWorkHours(){
  const hr = parseInt(new Date().toLocaleString('en-US', { timeZone:'Asia/Tashkent', hour:'numeric', hour12:false }), 10) % 24;
  return hr >= CHAT_WORK_HOURS.from && hr < CHAT_WORK_HOURS.to;
}

/* cfg: { role:'student'|'teacher', listEl, inputEl, sendBtn,
          replyBox:{wrap,name,text,close},
          otherName:()=>string, otherAvatarHtml:()=>string,
          tickHtml:(read)=>string, studentName:()=>string,
          afterRender:(listEl,isEmpty)=>void, onSent:()=>void,
          quickReplies:bool, workHours:bool } */
function createChatController(cfg){
  const role = cfg.role;
  const PAGE = 50, BIG = 1000;
  const listEl = cfg.listEl, inputEl = cfg.inputEl;
  let chatRef = null, unsub = null, unsubMeta = null;
  let limit = PAGE, docs = [], first = true, loadingOlder = false;
  let replyTarget = null, editTarget = null, query = '', pinned = null;
  let missed = 0, lastId = null, pendingJump = null, ctx = {};

  const host = listEl.parentNode;
  const bar = document.createElement('div');
  bar.className = 'chat-toolbar';
  bar.innerHTML = '<div class="chat-toolbar-row"><span class="chat-hours"></span><button type="button" class="chat-tb-btn" title="Chatdan qidirish">🔍</button></div>' +
    '<input type="search" class="chat-search-input" placeholder="Chatdan qidirish..." hidden><div class="chat-pinned" hidden></div>';
  host.insertBefore(bar, listEl);
  const searchBtn = bar.querySelector('.chat-tb-btn');
  const searchInput = bar.querySelector('.chat-search-input');
  const pinEl = bar.querySelector('.chat-pinned');
  const hoursEl = bar.querySelector('.chat-hours');

  const olderBtn = document.createElement('button');
  olderBtn.type = 'button'; olderBtn.className = 'chat-older-btn'; olderBtn.textContent = '↑ Oldingi xabarlar';
  const jumpBtn = document.createElement('button');
  jumpBtn.type = 'button'; jumpBtn.className = 'chat-jump-btn'; jumpBtn.hidden = true;

  function uid(){ const u = firebase.auth().currentUser; return u ? u.uid : null; }
  function otherName(){ return cfg.otherName ? cfg.otherName() : ''; }
  function nearBottom(){ return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120; }
  function toBottom(){ listEl.scrollTop = listEl.scrollHeight; missed = 0; jumpBtn.hidden = true; }

  function subscribe(){
    if(unsub) unsub();
    unsub = chatRef.collection('messages').orderBy('createdAt', 'desc').limit(limit)
      .onSnapshot({ includeMetadataChanges:true }, snap => {
        docs = snap.docs.slice().reverse();
        render();
        markRead();
      }, () => {});
  }

  function markRead(){
    if(document.hidden || !chatRef) return;
    const unread = docs.filter(doc => { const d = doc.data(); return d.senderRole !== role && d.read !== true && !doc.metadata.hasPendingWrites; });
    if(!unread.length) return;
    const b = db.batch();
    unread.forEach(doc => b.update(doc.ref, { read:true }));
    b.commit().catch(() => {});
  }
  document.addEventListener('visibilitychange', markRead);

  function render(){
    const wasNear = first || nearBottom();
    const prevH = listEl.scrollHeight, prevTop = listEl.scrollTop;
    const q = query.toLowerCase();
    const me = uid();
    let lastKey = '', parts = [], shown = 0;
    docs.forEach(doc => {
      const d = doc.data({ serverTimestamps:'estimate' });
      if(q && !(d.text || '').toLowerCase().includes(q)) return;
      shown++;
      const dt = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : null;
      if(dt){
        const key = dt.toDateString();
        if(key !== lastKey){
          lastKey = key;
          parts.push('<div class="chat-date-sep"><span>' + dt.toLocaleDateString('uz-UZ', { day:'numeric', month:'long', year:'numeric' }) + '</span></div>');
        }
      }
      const mine = d.senderRole === role;
      const time = dt ? dt.toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit' }) : '';
      const pending = doc.metadata.hasPendingWrites;
      const tick = mine ? (pending ? '<span class="chat-msg-pending">🕓</span>' : cfg.tickHtml(d.read === true)) : '';
      const quote = d.replyTo
        ? '<div class="chat-msg-quote"' + (d.replyTo.id ? ' data-jump="' + chatEsc(d.replyTo.id) + '"' : '') + '><span class="chat-msg-quote-name">' +
          chatEsc(d.replyTo.senderRole === role ? 'Siz' : otherName()) + '</span>' + chatEsc(d.replyTo.text || '') + '</div>'
        : '';
      const body = d.deleted ? '<span class="is-deleted">Xabar o‘chirildi</span>' : chatLinkify(d.text || '', q);
      const rx = d.reactions ? Object.keys(d.reactions).filter(k => d.reactions[k]).map(k => '<span class="chat-react-chip" title="' + (k === role ? 'Siz' : otherName()) + '">' + chatEsc(d.reactions[k]) + '</span>').join('') : '';
      let acts = '';
      if(!d.deleted && !pending){
        acts = '<button type="button" class="chat-msg-action-btn" data-act="reply" title="Javob berish">↩</button>' +
               '<button type="button" class="chat-msg-action-btn" data-act="react" title="Reaksiya">☺</button>';
        if(role === 'teacher') acts += '<button type="button" class="chat-msg-action-btn" data-act="pin" title="Qadash">📌</button>';
        if(mine && (role === 'teacher' || d.senderUid === me)){
          acts += '<button type="button" class="chat-msg-action-btn" data-act="edit" title="Tahrirlash">✎</button>' +
                  '<button type="button" class="chat-msg-action-btn" data-act="del" title="O‘chirish">🗑</button>';
        }
      }
      parts.push('<div class="chat-msg-row' + (mine ? ' is-mine' : '') + '" data-msg-id="' + doc.id + '">' +
        (mine ? '' : cfg.otherAvatarHtml()) +
        '<div class="chat-msg ' + (mine ? 'chat-msg-student' : 'chat-msg-teacher') + '">' +
        '<div class="chat-msg-bubble">' + quote + body + '</div>' +
        (rx ? '<div class="chat-react-row">' + rx + '</div>' : '') +
        '<div class="chat-msg-meta">' + (d.edited && !d.deleted ? '<span class="chat-msg-edited">tahrirlangan</span> ' : '') + time + ' ' + tick + '</div></div>' +
        '<div class="chat-msg-actions">' + acts + '</div></div>');
    });
    if(q && !shown) parts.push('<p style="text-align:center;color:var(--gray,#777);padding:1.5em 0">Hech narsa topilmadi.</p>');
    listEl.innerHTML = parts.join('');
    if(docs.length >= limit && !q){ listEl.prepend(olderBtn); }
    if(cfg.afterRender) cfg.afterRender(listEl, docs.length === 0);
    listEl.appendChild(jumpBtn);

    const last = docs.length ? docs[docs.length - 1] : null;
    const lastMine = last && last.data().senderRole === role;
    const isNew = last && last.id !== lastId && lastId !== null;
    lastId = last ? last.id : null;
    if(loadingOlder){ listEl.scrollTop = prevTop + (listEl.scrollHeight - prevH); loadingOlder = false; }
    else if(first || (isNew && (wasNear || lastMine)) || (!isNew && wasNear)){ toBottom(); }
    else {
      listEl.scrollTop = prevTop;
      if(isNew){ missed++; jumpBtn.textContent = '↓ Yangi xabar' + (missed > 1 ? ' (' + missed + ')' : ''); jumpBtn.hidden = false; }
    }
    if(docs.length) first = false;
    if(pendingJump){ const id = pendingJump; pendingJump = null; jumpTo(id); }
  }

  function jumpTo(id){
    const el = listEl.querySelector('[data-msg-id="' + id + '"]');
    if(!el){
      if(limit < BIG){ pendingJump = id; limit = BIG; subscribe(); }
      return;
    }
    el.scrollIntoView({ block:'center', behavior:'smooth' });
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 1600);
  }

  function showReplyBox(name, text){
    const r = cfg.replyBox;
    r.name.textContent = name; r.text.textContent = text; r.wrap.hidden = false;
  }
  function cancel(){
    replyTarget = null; editTarget = null;
    cfg.replyBox.wrap.hidden = true;
  }

  function closeReactBar(){ const b = document.querySelector('.chat-react-bar'); if(b) b.remove(); }
  function openReactBar(btn, id, d){
    closeReactBar();
    const rect = btn.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'chat-react-bar';
    CHAT_REACTIONS.forEach(em => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = em;
      b.addEventListener('click', ev => {
        ev.stopPropagation();
        const cur = d.reactions && d.reactions[role];
        const upd = {};
        upd['reactions.' + role] = cur === em ? firebase.firestore.FieldValue.delete() : em;
        chatRef.collection('messages').doc(id).update(upd).catch(() => {});
        closeReactBar();
      });
      el.appendChild(b);
    });
    document.body.appendChild(el);
    el.style.top = Math.max(8, rect.top - 46) + 'px';
    el.style.left = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, rect.left - 40)) + 'px';
  }
  document.addEventListener('click', closeReactBar);

  listEl.addEventListener('click', e => {
    const jq = e.target.closest('[data-jump]');
    if(jq){ jumpTo(jq.dataset.jump); return; }
    if(e.target === olderBtn){ loadingOlder = true; limit += PAGE; subscribe(); return; }
    if(e.target === jumpBtn){ toBottom(); return; }
    const btn = e.target.closest('[data-act]');
    if(!btn){
      const r = e.target.closest('.chat-msg-row');
      if(r && !e.target.closest('a')){
        const open = r.classList.contains('is-open');
        listEl.querySelectorAll('.chat-msg-row.is-open').forEach(x => x.classList.remove('is-open'));
        if(!open) r.classList.add('is-open');
      }
      return;
    }
    const row = btn.closest('.chat-msg-row');
    if(!row) return;
    e.stopPropagation();
    const id = row.dataset.msgId;
    const doc = docs.find(x => x.id === id);
    if(!doc) return;
    const d = doc.data();
    const act = btn.dataset.act;
    if(act === 'reply'){
      cancel();
      replyTarget = { id:id, text:truncateForReply(d.text), senderRole:d.senderRole };
      showReplyBox(d.senderRole === role ? 'Siz' : otherName(), replyTarget.text);
      inputEl.focus();
    } else if(act === 'react'){
      openReactBar(btn, id, d);
    } else if(act === 'edit'){
      cancel();
      editTarget = { id:id };
      showReplyBox('Tahrirlash', truncateForReply(d.text));
      inputEl.value = d.text || '';
      inputEl.focus();
    } else if(act === 'del'){
      if(confirm('Bu xabar o‘chirilsinmi?')){
        chatRef.collection('messages').doc(id).update({ deleted:true, text:'', edited:false, reactions:firebase.firestore.FieldValue.delete() }).catch(() => alert('O‘chirib bo‘lmadi.'));
      }
    } else if(act === 'pin'){
      chatRef.set({ pinned:{ id:id, text:truncateForReply(d.text, 120) } }, { merge:true }).catch(() => {});
    }
  });
  cfg.replyBox.close.addEventListener('click', cancel);

  // ----- Qidiruv -----
  searchBtn.addEventListener('click', () => {
    searchInput.hidden = !searchInput.hidden;
    if(searchInput.hidden){ searchInput.value = ''; query = ''; render(); }
    else searchInput.focus();
  });
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = searchInput.value.trim();
      if(query && limit < BIG){ limit = BIG; subscribe(); } else render();
    }, 250);
  });

  // ----- Qadalgan xabar -----
  pinEl.addEventListener('click', e => {
    if(e.target.closest('button')){ chatRef.update({ pinned:firebase.firestore.FieldValue.delete() }).catch(() => {}); return; }
    if(pinned && pinned.id) jumpTo(pinned.id);
  });
  function renderPinned(){
    if(!pinned){ pinEl.hidden = true; return; }
    pinEl.hidden = false;
    pinEl.innerHTML = '<span>📌 ' + chatEsc(pinned.text || '') + '</span>' + (role === 'teacher' ? '<button type="button" title="Qadashni olib tashlash">✕</button>' : '');
  }

  // ----- Yuborish -----
  async function send(){
    const text = inputEl.value.trim();
    if(!text || !chatRef) return;
    const ref = chatRef;
    const edit = editTarget, reply = replyTarget;
    inputEl.value = '';
    cancel();
    if(cfg.onSent) cfg.onSent();
    inputEl.focus();
    try{
      if(edit){
        await ref.collection('messages').doc(edit.id).update({ text:text, edited:true, editedAt:firebase.firestore.FieldValue.serverTimestamp() });
        return;
      }
      const msg = {
        text: text, senderRole: role, senderUid: uid(),
        senderName: role === 'student' ? cfg.studentName() : 'O‘qituvchi',
        read: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if(reply) msg.replyTo = reply;
      const ts = firebase.firestore.FieldValue.serverTimestamp();
      const inc = firebase.firestore.FieldValue.increment(1);
      const meta = role === 'student'
        ? { studentId:uid(), studentName:cfg.studentName(), lastMessage:text, lastAt:ts, lastSenderRole:'student', unreadByTeacher:inc, unreadByStudent:0 }
        : { studentName:ctx.otherName || '', lastMessage:text, lastAt:ts, lastSenderRole:'teacher', unreadByStudent:inc };
      const b = db.batch();
      b.set(ref.collection('messages').doc(), msg);
      b.set(ref, meta, { merge:true });
      await b.commit();
    } catch(err){
      if(!inputEl.value) inputEl.value = text;
      alert('Xabar yuborilmadi. Internetni tekshirib, qayta urinib ko‘ring.');
    }
  }
  cfg.sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    if(e.key === 'Escape') cancel();
  });

  // ----- Tayyor javoblar (o'qituvchi) -----
  if(cfg.quickReplies){
    const KEY = 'djamiQuickReplies';
    const qbar = document.createElement('div');
    qbar.className = 'chat-quick';
    const inputRow = inputEl.closest('.chat-input-row');
    inputRow.parentNode.insertBefore(qbar, inputRow);
    const load = () => { try{ const v = JSON.parse(localStorage.getItem(KEY)); if(Array.isArray(v)) return v; }catch(e){} return CHAT_QUICK_DEFAULT.slice(); };
    const save = list => { try{ localStorage.setItem(KEY, JSON.stringify(list)); }catch(e){} };
    const draw = () => {
      qbar.innerHTML = '';
      load().forEach(t => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = t; b.title = t;
        b.addEventListener('click', () => {
          inputEl.value = inputEl.value ? inputEl.value + ' ' + t : t;
          inputEl.focus(); inputEl.dispatchEvent(new Event('input', { bubbles:true }));
        });
        qbar.appendChild(b);
      });
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = '✎ Tahrirlash';
      edit.addEventListener('click', () => {
        const v = prompt('Tayyor javoblar. Har birini yangi qatordan yozing (| bilan ajrating):', load().join(' | '));
        if(v === null) return;
        save(v.split('|').map(x => x.trim()).filter(Boolean));
        draw();
      });
      qbar.appendChild(edit);
    };
    draw();
  }

  function updateHours(){
    if(!cfg.workHours){ hoursEl.hidden = true; return; }
    const pad = n => String(n).padStart(2, '0');
    hoursEl.textContent = '🕘 O‘qituvchi odatda ' + pad(CHAT_WORK_HOURS.from) + ':00–' + pad(CHAT_WORK_HOURS.to) + ':00 oralig‘ida javob beradi' +
      (chatInWorkHours() ? '' : '. Hozir ish vaqtidan tashqari — javob ertaroq kelmasligi mumkin.');
  }

  return {
    open(chatId, c){
      close();
      ctx = c || {};
      chatRef = db.collection('chats').doc(chatId);
      limit = PAGE; docs = []; first = true; missed = 0; lastId = null; query = ''; pinned = null;
      searchInput.value = ''; searchInput.hidden = true;
      cancel(); updateHours(); renderPinned();
      subscribe();
      unsubMeta = chatRef.onSnapshot(doc => { pinned = doc.exists ? (doc.data().pinned || null) : null; renderPinned(); }, () => {});
    },
    close, send, cancel
  };

  function close(){
    if(unsub){ unsub(); unsub = null; }
    if(unsubMeta){ unsubMeta(); unsubMeta = null; }
  }
}


// Talaba chati: "Bosh sahifaga" tugmasi o'rniga chat sarlavhasida ← tugma
(function addStudentChatBackBtn(){
  function init(){
    const back = document.getElementById('backToHomeFromChat');
    const header = document.querySelector('#view-chat .chat-detail-header');
    if(!back || !header || header.querySelector('.chat-back-btn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chat-back-btn'; b.title = 'Orqaga'; b.setAttribute('aria-label', 'Orqaga');
    b.textContent = '←';
    b.addEventListener('click', () => back.click());
    header.insertBefore(b, header.firstChild);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
