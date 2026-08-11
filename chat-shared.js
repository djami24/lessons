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
