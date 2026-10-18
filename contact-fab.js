/* Sahifa pastida suzuvchi "Qo'ng'iroq" va "Telegram" tugmalari */
(function () {
  'use strict';
  var PHONE = '+998905506707';
  var TG = 'https://t.me/djamiteacher';
  if (document.getElementById('cfab')) return;

  var css =
    '#cfab{position:fixed;right:16px;bottom:calc(42px + env(safe-area-inset-bottom,0px));z-index:900;display:flex;flex-direction:column;gap:12px;}' +
    '#cfab a{position:relative;overflow:hidden;isolation:isolate;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none;' +
      '-webkit-backdrop-filter:blur(14px) saturate(180%);backdrop-filter:blur(14px) saturate(180%);' +
      'transition:transform .15s ease,box-shadow .15s ease,background .15s ease;-webkit-tap-highlight-color:transparent;}' +
    '#cfab a::before{content:"";position:absolute;z-index:-1;left:0;right:0;top:0;height:52%;background:linear-gradient(180deg,rgba(255,255,255,.45),rgba(255,255,255,0));border-radius:50% 50% 60% 60% / 70% 70% 40% 40%;pointer-events:none;}' +
    '#cfab a:hover{transform:translateY(-2px) scale(1.05);}' +
    '#cfab a:active{transform:scale(.95);}' +
    '#cfab .cfab-call{color:#1d4fd1;background:linear-gradient(135deg,rgba(255,255,255,.72) 0%,rgba(170,200,255,.42) 100%);border:1px solid rgba(255,255,255,.85);' +
      'box-shadow:0 10px 24px -8px rgba(36,92,230,.40),inset 0 1px 0 rgba(255,255,255,.9),inset 0 0 0 1px rgba(46,111,237,.20);}' +
    '#cfab .cfab-call:hover{box-shadow:0 14px 28px -8px rgba(36,92,230,.50),inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(46,111,237,.28);}' +
    '#cfab .cfab-tg{color:#fff;background:linear-gradient(135deg,rgba(60,125,255,.80) 0%,rgba(24,72,205,.85) 100%);border:1px solid rgba(255,255,255,.55);' +
      'box-shadow:0 12px 26px -8px rgba(36,92,230,.60),inset 0 1px 0 rgba(255,255,255,.65),inset 0 -1px 0 rgba(255,255,255,.12);}' +
    '#cfab .cfab-tg:hover{background:linear-gradient(135deg,rgba(72,137,255,.90) 0%,rgba(30,82,220,.94) 100%);box-shadow:0 16px 32px -8px rgba(36,92,230,.70),inset 0 1px 0 rgba(255,255,255,.75);}' +
    '#cfab svg{width:24px;height:24px;display:block;}' +
    '@media (max-width:600px){#cfab{right:12px;gap:10px;}#cfab a{width:50px;height:50px;}}' +
    '@media print{#cfab{display:none;}}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var box = document.createElement('div');
  box.id = 'cfab';
  box.innerHTML =
    '<a class="cfab-call" href="tel:' + PHONE + '" aria-label="Qo‘ng‘iroq qilish" title="Qo‘ng‘iroq qilish">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.46-1.19a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"/></svg></a>' +
    '<a class="cfab-tg" href="' + TG + '" target="_blank" rel="noopener noreferrer" aria-label="Telegram orqali yozish" title="Telegram orqali yozish">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></a>';
  document.body.appendChild(box);
})();
