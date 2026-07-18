/* ============================================================
   English Folder — Global site settings loader
   Reads settings/site from Firestore (public read, admin write —
   see FIRESTORE_RULES.txt) and applies it to whichever page loads
   this script: brand colors, brand name, logo — and, on the
   homepage only, every section of text (hero, process, programs,
   testimonials, CTA, footer) plus an optional hero photo.
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

  function escapeHtml(str){
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Set textContent on every element matching a [data-site-x] selector, only if value is non-empty.
  function setText(selector, value){
    if(value === undefined || value === null || value === '') return;
    document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
  }

  function setHref(selector, value){
    if(!value) return;
    document.querySelectorAll(selector).forEach(el => { el.setAttribute('href', value); });
  }

  function renderPrograms(list){
    const container = document.querySelector('[data-site-programs-container]');
    if(!container || !Array.isArray(list) || list.length === 0) return;
    container.innerHTML = list.map(item => `
      <article class="folder" style="--tab-color:${escapeHtml(item.color || '#D98E3F')}">
        <div class="folder-tab"></div>
        <div class="folder-body">
          <span class="tag">${escapeHtml(item.tag || '')}</span>
          <h3>${escapeHtml(item.title || '')}</h3>
          <p>${escapeHtml(item.text || '')}</p>
          <span class="folder-meta">${escapeHtml(item.meta || '')}</span>
        </div>
      </article>
    `).join('');
  }

  function renderTestimonials(list){
    const container = document.querySelector('[data-site-testimonials-container]');
    if(!container || !Array.isArray(list) || list.length === 0) return;
    container.innerHTML = list.map(item => `
      <blockquote>
        <p>"${escapeHtml(item.quote || '')}"</p>
        <cite>— ${escapeHtml(item.author || '')}</cite>
      </blockquote>
    `).join('');
  }

  function renderHeroImage(url){
    if(!url) return;
    const visual = document.querySelector('[data-site-hero-visual]');
    if(!visual) return;
    visual.innerHTML = `<img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-m);box-shadow:var(--shadow-pop);">`;
  }

  function applySettings(data){
    if(!data) return;
    const root = document.documentElement.style;

     function applySettings(data) {
  // ... boshqa kodlar ...
  
  // Kurslar haqida ma'lumotni yuklash
  const coursesEl = document.getElementById('coursesInfoContent');
  if(coursesEl && data.coursesInfo) {
    coursesEl.innerHTML = data.coursesInfo;
  }
}

    // ---- Brand & colors ----
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
    if(data.colorDark){
      root.setProperty('--dark-bg', data.colorDark);
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
        el.innerHTML = `<img src="${escapeHtml(data.logoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;">`;
      });
    }

    // Navigation (top nav + duplicate footer "Sahifa" links share the same labels)
    setText('[data-site-nav-programs]', data.navProgramsLabel);
    setText('[data-site-nav-process]', data.navProcessLabel);
    setText('[data-site-nav-results]', data.navResultsLabel);
    setText('[data-site-nav-contact]', data.navContactLabel);
    setText('[data-site-nav-login]', data.navLoginLabel);
    setText('[data-site-nav-register]', data.navRegisterLabel);

    // ---- Homepage-only fields (elements simply won't exist on other pages) ----

    // Hero
    setText('[data-site-hero-eyebrow]', data.heroEyebrow);
    setText('[data-site-hero-title]', data.heroTitle);
    setText('[data-site-hero-lead]', data.heroLead);
    setText('[data-site-hero-cta-primary]', data.heroCtaPrimaryText);
    setText('[data-site-hero-cta-ghost]', data.heroCtaGhostText);
    setText('[data-site-stat-1-number]', data.heroStat1Number);
    setText('[data-site-stat-1-label]', data.heroStat1Label);
    setText('[data-site-stat-2-number]', data.heroStat2Number);
    setText('[data-site-stat-2-label]', data.heroStat2Label);
    setText('[data-site-stat-3-number]', data.heroStat3Number);
    setText('[data-site-stat-3-label]', data.heroStat3Label);
    renderHeroImage(data.heroImageUrl);

    // Process ("Qanday ishlaydi")
    setText('[data-site-process-eyebrow]', data.processEyebrow);
    setText('[data-site-process-heading]', data.processHeading);
    setText('[data-site-process-1-title]', data.process1Title);
    setText('[data-site-process-1-text]', data.process1Text);
    setText('[data-site-process-2-title]', data.process2Title);
    setText('[data-site-process-2-text]', data.process2Text);
    setText('[data-site-process-3-title]', data.process3Title);
    setText('[data-site-process-3-text]', data.process3Text);

    // Programs ("Dastur papkalari") — dynamic list
    setText('[data-site-programs-eyebrow]', data.programsEyebrow);
    setText('[data-site-programs-heading]', data.programsHeading);
    setText('[data-site-programs-lead]', data.programsLead);
    renderPrograms(data.programs);

    // Results / testimonials — dynamic list
    setText('[data-site-results-eyebrow]', data.resultsEyebrow);
    setText('[data-site-results-heading]', data.resultsHeading);
    setText('[data-site-results-lead]', data.resultsLead);
    renderTestimonials(data.testimonials);

    // CTA
    setText('[data-site-cta-title]', data.ctaTitle);
    setText('[data-site-cta-text]', data.ctaText);
    setText('[data-site-cta-note]', data.ctaNoteText);

    // Footer
    setText('[data-site-footer-description]', data.footerDescription);
    setText('[data-site-footer-address]', data.footerAddress);
    setText('[data-site-footer-copyright]', data.footerCopyright);
    setText('[data-site-footer-nav-title]', data.footerNavTitle);
    setText('[data-site-footer-contact-title]', data.footerContactTitle);
    if(data.footerPhone){
      setText('[data-site-footer-phone]', data.footerPhone);
      setHref('[data-site-footer-phone]', 'tel:' + data.footerPhone.replace(/[^\d+]/g, ''));
    }
    if(data.footerEmail){
      setText('[data-site-footer-email]', data.footerEmail);
      setHref('[data-site-footer-email]', 'mailto:' + data.footerEmail);
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
