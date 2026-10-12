/* Talaba profil rasmlari (avatarlar) — YAGONA ro'yxat.
   Yangisini qo'shish: rasmni assets/pepe/ papkasiga tashlang va pastga bitta qator qo'shing.
   key — Firestore'ga (students/{uid}.avatarImg) yoziladi, shuning uchun uni keyin o'zgartirmang.
   file — assets/ papkasiga nisbatan yo'l.
   group — 'pepe' guruhidagi rasmlar bitta "Profil rasmlari" kartochkasi ichida, bosilganda ochiladigan oynada chiqadi.
   hidden — tanlash oynasida ko'rinmaydi, lekin avval tanlagan talabalarda rasm ko'rinib turadi. */
window.AVATAR_LIST = [
  { key: 'qiz',    group: 'pepe', file: 'avatars/qiz.webp',  label: 'Lolo', hidden: true },
  { key: 'bola',   group: 'pepe', file: 'avatars/bola.webp', label: 'Pepe' },
  { key: 'pepe1',  group: 'pepe', file: 'pepe/pepe1.webp',   label: 'Sariq xudi' },
  { key: 'pepe2',  group: 'pepe', file: 'pepe/pepe2.webp',   label: 'Yashil xudi' },
  { key: 'pepe3',  group: 'pepe', file: 'pepe/pepe3.webp',   label: 'Kepkali' },
  { key: 'pepe4',  group: 'pepe', file: 'pepe/pepe4.webp',   label: 'Ko‘k ko‘ylak' },
  { key: 'pepe5',  group: 'pepe', file: 'pepe/pepe5.webp',   label: 'Galstukli' },
  { key: 'pepe6',  group: 'pepe', file: 'pepe/pepe6.webp',   label: 'Jigarrang' },
  { key: 'pepe7',  group: 'pepe', file: 'pepe/pepe7.webp',   label: 'Quvnoq' },
  { key: 'pepe8',  group: 'pepe', file: 'pepe/pepe8.webp',   label: 'To‘q sariq' },
  { key: 'pepe9',  group: 'pepe', file: 'pepe/pepe9.webp',   label: 'Ko‘k kurtka' },
  { key: 'pepe10', group: 'pepe', file: 'pepe/pepe10.webp',  label: 'Ko‘zoynakli' },
  { key: 'pepe11', group: 'pepe', file: 'pepe/pepe11.webp',  label: 'Kostyumli' },
  { key: 'pepe12', group: 'pepe', file: 'pepe/pepe12.webp',  label: 'Hijobli' },
  { key: 'pepe13', group: 'pepe', file: 'pepe/pepe13.webp',  label: 'Hijobli kostyum' },
  { key: 'pepe14', group: 'pepe', file: 'pepe/pepe14.webp',  label: 'Pushti fon' },
  { key: 'pepe13', group: 'pepe', file: 'pepe/pepe15.webp',  label: 'Qizil fon' }
];

/* Guruh ichidagi rasmlarni oynada ko'rsatadi.
   opts: { group:'pepe', base:'../assets/', selected:'pepe3', title:'...', onPick:(key, src)=>{} } */
window.openAvatarGallery = function(opts){
  opts = opts || {};
  var base = opts.base || '../assets/';
  var items = (window.AVATAR_LIST || []).filter(function(a){ return a.group === opts.group && !a.hidden; });
  if(!items.length) return;

  if(!document.getElementById('avgStyle')){
    var st = document.createElement('style');
    st.id = 'avgStyle';
    st.textContent =
      '.avg-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.avg-box{background:var(--white,#fff);color:var(--ink,#1c2333);border-radius:20px;padding:18px 18px 20px;width:100%;max-width:440px;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)}' +
      'body.dark .avg-box{background:#171d2c;color:#e8ecf5}' +
      '.avg-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;font-size:1.05rem}' +
      '.avg-x{border:0;background:transparent;font-size:1.7rem;line-height:1;cursor:pointer;color:inherit;padding:0 6px}' +
      '.avg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:12px;justify-items:center}' +
      '.avg-item{border:3px solid transparent;background:transparent;border-radius:50%;padding:0;cursor:pointer;width:80px;height:80px;transition:border-color .15s,transform .15s}' +
      '.avg-item img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}' +
      '.avg-item:hover{border-color:rgba(47,111,237,.45);transform:translateY(-1px)}' +
      '.avg-item.sel{border-color:#2f6fed;box-shadow:0 0 0 3px rgba(47,111,237,.18)}' +
      '.avg-item:focus-visible{outline:2px solid #2f6fed;outline-offset:2px}';
    document.head.appendChild(st);
  }

  var ov = document.createElement('div');
  ov.className = 'avg-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML =
    '<div class="avg-box"><div class="avg-head"><b>' + (opts.title || 'Rasmni tanlang') + '</b>' +
    '<button type="button" class="avg-x" aria-label="Yopish">&times;</button></div>' +
    '<div class="avg-grid">' +
    items.map(function(a){
      return '<button type="button" class="avg-item' + (a.key === opts.selected ? ' sel' : '') + '" data-key="' + a.key + '" title="' + a.label + '" aria-label="' + a.label + '">' +
             '<img alt="" src="' + base + a.file + '"></button>';
    }).join('') +
    '</div></div>';

  function close(){
    document.removeEventListener('keydown', onKey);
    if(ov.parentNode) ov.parentNode.removeChild(ov);
  }
  function onKey(e){ if(e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', function(e){
    if(e.target === ov || e.target.closest('.avg-x')){ close(); return; }
    var b = e.target.closest('.avg-item');
    if(!b) return;
    var item = items.filter(function(a){ return a.key === b.dataset.key; })[0];
    close();
    if(item && opts.onPick) opts.onPick(item.key, base + item.file);
  });
  document.body.appendChild(ov);
  var first = ov.querySelector('.avg-item.sel') || ov.querySelector('.avg-item');
  if(first) first.focus();
};
