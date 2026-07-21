/* ============================================================
   English Folder — Global site settings loader
   Reads settings/site from Firestore (public read, admin write —
   see FIRESTORE_RULES.txt) and applies it to whichever page loads
   this script: brand colors, brand name, logo, nav labels — and,
   on the homepage only, every section of text (hero, courses,
   feature grid, stats bar, blog, rating, footer).
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

  // Set textContent on every element matching a [data-site-x] selector, only if value is non-empty.
  function setText(selector, value){
    if(value === undefined || value === null || value === '') return;
    document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
  }

  function applySettings(data){
    if(!data) return;
    const root = document.documentElement.style;

    // ---- Colors ----
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
    if(data.buttonColor){
      root.setProperty('--btn-color', data.buttonColor);
      root.setProperty('--btn-color-deep', shade(data.buttonColor, -16));
    }

    // ---- Brand ----
    if(data.brandName){
      document.querySelectorAll('[data-site-brand-name]').forEach(el => {
        el.textContent = data.brandName;
      });
      document.title = document.title.replace(/Djami Lessons/g, data.brandName);
    }

    if(data.logoUrl){
      document.querySelectorAll('[data-site-logo]').forEach(el => {
        el.classList.add('brand-mark-custom');
        el.innerHTML = `<img src="${data.logoUrl.replace(/"/g, '&quot;')}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;">`;
      });
    }

    // ---- Top nav (present on every page) ----
    setText('[data-site-nav-home]', data.navHomeLabel);
    setText('[data-site-nav-courses]', data.navCoursesLabel);
    setText('[data-site-nav-results]', data.navResultsLabel);
    setText('[data-site-nav-cta]', data.navCtaText);
    setText('[data-site-blog-link-text]', data.blogLinkText);
    setText('[data-site-home-admin-btn]', data.homeAdminBtnText);

    // ---- Footer (present on every page) ----
    setText('[data-site-footer-copyright]', data.footerCopyright);

    // ---- Homepage-only fields (elements simply won't exist on other pages) ----

    // Hero
    setText('[data-site-hero-eyebrow]', data.heroEyebrow);
    setText('[data-site-hero-title]', data.heroTitle);
    setText('[data-site-hero-lead]', data.heroLead);
    setText('[data-site-home-student-btn]', data.homeStudentBtnText);
    setText('[data-site-hero-results-btn]', data.heroResultsBtnText);
    setText('[data-site-hero-mini-number]', data.heroMiniNumber);
    setText('[data-site-hero-mini-label]', data.heroMiniLabel);

    // "Nega biz" feature grid (4 icon + title + text cards)
    setText('[data-site-feature-1-title]', data.feature1Title);
    setText('[data-site-feature-1-text]', data.feature1Text);
    setText('[data-site-feature-2-title]', data.feature2Title);
    setText('[data-site-feature-2-text]', data.feature2Text);
    setText('[data-site-feature-3-title]', data.feature3Title);
    setText('[data-site-feature-3-text]', data.feature3Text);
    setText('[data-site-feature-4-title]', data.feature4Title);
    setText('[data-site-feature-4-text]', data.feature4Text);

    // Courses section (General English / IELTS / CEFR cards)
    setText('[data-site-courses-eyebrow]', data.coursesEyebrow);
    setText('[data-site-courses-heading]', data.coursesHeading);
    setText('[data-site-home-label-1]', data.homeLabel1);
    setText('[data-site-home-sub-1]', data.homeSub1);
    setText('[data-site-home-label-2]', data.homeLabel2);
    setText('[data-site-home-sub-2]', data.homeSub2);
    setText('[data-site-home-label-3]', data.homeLabel3);
    setText('[data-site-home-sub-3]', data.homeSub3);


    // Blog + rating
    setText('[data-site-blog-heading]', data.blogHeading);
    setText('[data-site-rating-label]', data.ratingLabel);
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
