/* ============================================================
   English Folder — Global site settings loader
   Reads settings/site from Firestore (public read, admin write —
   see FIRESTORE_RULES.txt) and applies it to whichever page loads
   this script: brand colors, brand name, logo, and — on the
   homepage only — hero/CTA text.
   Include AFTER firebase-config.js on every page that should react
   to admin-configured branding.
   ============================================================ */
(function(){

  function shade(hex, percent){
    if(!hex) return hex;
    hex = hex.replace('#', '');
    if(hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if(hex.length !== 6) return '#' + hex;
    const num = parseInt(hex, 16);
    const amt = Math.round(2.55 * percent);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0x00FF) + amt;
    let b = (num & 0x0000FF) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1).toUpperCase();
  }

  function applySettings(data){
    if(!data) return;
    const root = document.documentElement.style;

    if(data.colorPrimary){
      root.setProperty('--amber', data.colorPrimary);
      root.setProperty('--amber-deep', shade(data.colorPrimary, -16));
    }
    if(data.colorAccent){
      root.setProperty('--teal', data.colorAccent);
      root.setProperty('--teal-deep', shade(data.colorAccent, -16));
    }
    if(data.colorBackground){
      root.setProperty('--paper', data.colorBackground);
    }

    if(data.brandName){
      document.querySelectorAll('[data-site-brand-name]').forEach(el => {
        el.textContent = data.brandName;
      });
      document.title = document.title.replace(/English Folder/g, data.brandName);
    }

    if(data.logoUrl){
      document.querySelectorAll('[data-site-logo]').forEach(el => {
        el.classList.add('brand-mark-custom');
        el.innerHTML = `<img src="${data.logoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;">`;
      });
    }

    // Homepage-only fields (elements simply won't exist on other pages)
    if(data.heroTitle){
      const el = document.querySelector('[data-site-hero-title]');
      if(el) el.textContent = data.heroTitle;
    }
    if(data.heroLead){
      const el = document.querySelector('[data-site-hero-lead]');
      if(el) el.textContent = data.heroLead;
    }
    if(data.ctaTitle){
      const el = document.querySelector('[data-site-cta-title]');
      if(el) el.textContent = data.ctaTitle;
    }
    if(data.ctaText){
      const el = document.querySelector('[data-site-cta-text]');
      if(el) el.textContent = data.ctaText;
    }
  }

  function init(){
    // Wait for firebase-config.js to have set up the global `db`.
    if(typeof db === 'undefined'){ setTimeout(init, 50); return; }
    db.collection('settings').doc('site').get()
      .then(doc => { if(doc.exists) applySettings(doc.data()); })
      .catch(() => { /* settings doc not created yet, or offline — keep defaults */ });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
