/* Sahifa pastida suzuvchi "Qo'ng'iroq" va "Telegram" tugmalari */
(function () {
  'use strict';
  var PHONE = '+998905506707';
  var TG = 'https://t.me/djamiteacher';
  if (document.getElementById('cfab')) return;

  var css =
    '#cfab{position:fixed;right:16px;bottom:calc(42px + env(safe-area-inset-bottom,0px));z-index:900;display:flex;flex-direction:column;gap:12px;}' +
    '#cfab a{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none;' +
      'box-shadow:0 6px 18px rgba(15,35,95,.22);transition:transform .15s ease,box-shadow .15s ease;-webkit-tap-highlight-color:transparent;}' +
    '#cfab a:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 10px 24px rgba(15,35,95,.28);}' +
    '#cfab a:active{transform:scale(.95);}' +
    '#cfab .cfab-call{background:#fff;color:#0B1B3F;}' +
    '#cfab .cfab-tg{background:#1558FF;color:#fff;}' +
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
