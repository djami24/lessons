/* Talabalar sahifasi uchun harf almashtirish (ekranda ko'rinadigan matn):
   sh -> ş, ch -> ç, o' -> ö, g' -> ğ  (bosh harflari bilan: Sh -> Ş, Ch -> Ç, O' -> Ö, G' -> Ğ)
   Faqat ko'rinadigan matn va placeholder/title/aria-label o'zgaradi. Kod, ID, havola, input ichidagi qiymat o'zgarmaydi.
   Inglizcha mazmunli va tekshiruvchi kod matnga bog'liq bo'lgan joylar o'zgartirilmaydi (SKIP ro'yxati). */
(function(){
  'use strict';
  var SKIP_SELECTOR = [
    '[data-no-translit]', '[lang="en"]', '[contenteditable]',
    '#wgPlayBox', '#ivPlayBox',                       // so'z o'yinlari: javob tugma matni bilan solishtiriladi
    '#view-placement-test', '#view-listening-hw', '#view-cefr-rl', '#view-reading-mocks',
    '#view-cefr-writing', '#view-cefr-speaking', '#view-my-essays',   // inglizcha mashq/test/insho
    '#view-chat', '#latestHwBox'                      // yozishma va o'qituvchi yozgan vazifa matni
  ].join(',');
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, CODE:1, PRE:1, SVG:0 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  // sh/ch bor inglizcha so'zlar (UI da uchrashi mumkin) o'zgarmaydi
  var EN = { english:1, teacher:1, teachers:1, speaking:0 };

  var APOS = "['\u2018\u2019\u02BB\u02BC`\u00B4]";
  var RE_OG = new RegExp('([OoGg])' + APOS, 'g');
  var OG = { O:'\u00D6', o:'\u00F6', G:'\u011E', g:'\u011F' };

  function conv(text){
    if(!text) return text;
    var t = text.replace(RE_OG, function(m, c){ return OG[c]; });
    t = t.replace(/[A-Za-z\u00C0-\u024F]+/g, function(w){
      if(EN[w.toLowerCase()]) return w;
      return w.replace(/SH/g, '\u015E').replace(/Sh/g, '\u015E').replace(/sh/g, '\u015F')
              .replace(/CH/g, '\u00C7').replace(/Ch/g, '\u00C7').replace(/ch/g, '\u00E7');
    });
    return t;
  }

  function skipped(el){
    for(var n = el; n && n.nodeType === 1; n = n.parentNode){
      if(SKIP_TAGS[n.tagName]) return true;
    }
    return !!(el && el.closest && el.closest(SKIP_SELECTOR));
  }

  function fixText(node){
    var v = node.nodeValue, nv = conv(v);
    if(nv !== v) node.nodeValue = nv;
  }
  function fixAttrs(el){
    for(var i = 0; i < ATTRS.length; i++){
      var a = ATTRS[i];
      if(el.hasAttribute && el.hasAttribute(a)){
        var v = el.getAttribute(a), nv = conv(v);
        if(nv !== v) el.setAttribute(a, nv);
      }
    }
  }
  function walk(root){
    if(!root) return;
    if(root.nodeType === 3){ if(!skipped(root.parentNode)) fixText(root); return; }
    if(root.nodeType !== 1 || skipped(root)) return;
    fixAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    var n;
    while((n = w.nextNode())){
      if(n.nodeType === 3){ if(!skipped(n.parentNode)) fixText(n); }
      else if(!skipped(n)) fixAttrs(n);
    }
  }

  var obs = null;
  function run(){
    document.title = conv(document.title);
    walk(document.body);
    obs = new MutationObserver(function(list){
      obs.disconnect();
      try{
        list.forEach(function(m){
          if(m.type === 'childList') m.addedNodes.forEach(walk);
          else if(m.type === 'characterData'){ if(!skipped(m.target.parentNode)) fixText(m.target); }
          else if(m.type === 'attributes'){ if(!skipped(m.target)) fixAttrs(m.target); }
        });
      } finally { observe(); }
    });
    observe();
  }
  function observe(){
    obs.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:ATTRS });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
