/* ============================================================
   English Folder — Global site settings loader
   Reads settings/site from Firestore (public read, admin write —
   see FIRESTORE_RULES.txt) and applies it to whichever page loads
   this script: brand colors, brand name, logo, nav labels, payment
   card details — and, on the homepage only, every section of text
   (hero, courses, feature grid, stats bar, blog, rating, footer).
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

  function renderHeroImage(url){
    if(!url) return;
    const safeUrl = url.replace(/"/g, '&quot;');
    document.querySelectorAll('[data-site-hero-visual]').forEach(el => {
      el.innerHTML = `<img src="${safeUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    });
  }

  // Top-of-page running banner (homepage + admin/student/parent panels) —
  // only shown when the admin has both written text AND left the toggle
  // on. marqueeEnabled defaults to "on" when the field hasn't been saved
  // yet (older settings docs), so existing text keeps showing as before.
  function applyMarquee(text, enabled){
    const wrap = document.querySelector('[data-site-marquee]');
    if(!wrap) return;
    const clean = (text || '').trim();
    if(clean && enabled !== false){
      document.querySelectorAll('[data-site-marquee-text]').forEach(el => { el.textContent = clean; });
      wrap.style.display = '';
    } else {
      wrap.style.display = 'none';
    }
  }

  // Rotating certificate gallery — shown instead of a single hero image
  // when the admin has added one or more certificate URLs. Cross-fades
  // through the list automatically; no controls needed.
  function renderCertificateCarousel(urls){
    if(!Array.isArray(urls) || urls.length === 0) return;
    const safeUrls = urls.map(u => String(u).replace(/"/g, '&quot;'));
    document.querySelectorAll('[data-site-hero-visual]').forEach(el => {
      el.innerHTML =
        `<div class="cert-carousel">` +
        safeUrls.map((u, i) => `<img src="${u}" alt="" class="cert-carousel-slide${i === 0 ? ' is-active' : ''}">`).join('') +
        (safeUrls.length > 1
          ? `<div class="cert-carousel-dots">${safeUrls.map((_, i) => `<span class="cert-carousel-dot${i === 0 ? ' is-active' : ''}"></span>`).join('')}</div>`
          : '') +
        `</div>`;

      if(safeUrls.length > 1){
        const slides = el.querySelectorAll('.cert-carousel-slide');
        const dots = el.querySelectorAll('.cert-carousel-dot');
        let idx = 0;
        setInterval(() => {
          slides[idx].classList.remove('is-active');
          dots[idx].classList.remove('is-active');
          idx = (idx + 1) % slides.length;
          slides[idx].classList.add('is-active');
          dots[idx].classList.add('is-active');
        }, 3500);
      }
    });
  }

  // Updates both the visible text and the href of a footer contact link
  // (phone / telegram), since these carry real link targets, not just text.
  // Keeps whatever leading icon/emoji is already in the markup.
  function applyFooterContact(selector, value, hrefBuilder){
    if(!value) return;
    document.querySelectorAll(selector).forEach(el => {
      const iconMatch = el.textContent.match(/^(\S+\s)/);
      const icon = iconMatch ? iconMatch[1] : '';
      el.textContent = icon + value;
      const href = hrefBuilder(value);
      if(href) el.setAttribute('href', href);
    });
  }

  // ---- Maintenance mode overlay — shown to all non-admin visitors when
  // maintenanceMode is true in the settings/site Firestore document.
  // The overlay covers the entire page and blocks interaction; the page
  // content is never removed so no data is lost. Admin pages are exempt.
  const IS_ADMIN_PAGE = (function(){
    const p = window.location.pathname;
    return p.indexOf('/admin/') !== -1;
  })();

  let maintenanceOverlayEl = null;

  function showMaintenanceOverlay(msg){
    if(IS_ADMIN_PAGE) return;
    if(maintenanceOverlayEl) return; // already shown
    const text = (msg && msg.trim()) ? msg.trim()
      : "Sayt takomillashtirilmoqda. Tez orada ishga tushadi!";
    const el = document.createElement('div');
    el.id = 'maintenanceModeOverlay';
    el.style.cssText = [
      'position:fixed','inset:0','z-index:99999',
      'display:flex','flex-direction:column',
      'align-items:center','justify-content:center',
      'background:var(--paper,#fff)',
      'padding:2rem','text-align:center',
      'font-family:var(--font-body,sans-serif)'
    ].join(';');
    el.innerHTML =
      '<div style="font-size:3rem;margin-bottom:1rem;">🔧</div>' +
      '<h2 style="margin:0 0 .6rem;font-size:1.4rem;color:var(--ink,#14213d);">' +
        escapeHtmlMaint(text) +
      '</h2>' +
      '<p style="margin:0;color:var(--gray,#6b7280);font-size:.9rem;">' +
        'Sabr-toqatli bo\'lganingiz uchun rahmat!' +
      '</p>';
    document.body.appendChild(el);
    maintenanceOverlayEl = el;
    // Prevent any scrolling / interaction beneath
    document.body.style.overflow = 'hidden';
  }

  function hideMaintenanceOverlay(){
    if(!maintenanceOverlayEl) return;
    maintenanceOverlayEl.remove();
    maintenanceOverlayEl = null;
    document.body.style.overflow = '';
  }

  function escapeHtmlMaint(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    if(data.footerBgColor){
      root.setProperty('--footer-bg', data.footerBgColor);
    }
    if(data.footerTextColor){
      root.setProperty('--footer-text', data.footerTextColor);
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

    setText('[data-site-teacher-name]', data.teacherName);

    // ---- Top nav (present on every page) ----
    setText('[data-site-nav-home]', data.navHomeLabel);
    setText('[data-site-nav-courses]', data.navCoursesLabel);
    setText('[data-site-nav-results]', data.navResultsLabel);
    setText('[data-site-nav-cta]', data.navCtaText);
    setText('[data-site-blog-link-text]', data.blogLinkText);
    setText('[data-site-home-admin-btn]', data.homeAdminBtnText);

    // ---- Payment card (shown on the student dashboard's payment pages) ----
    setText('[data-site-card-number]', data.cardNumber);
    setText('[data-site-card-holder]', data.cardHolderName);

    // ---- Footer (present on every page) ----
    setText('[data-site-footer-copyright]', data.footerCopyright);
    setText('[data-site-footer-tagline]', data.footerTagline);
    applyFooterContact('[data-site-footer-phone]', data.footerPhone, v => 'tel:+' + v.replace(/\D/g, ''));
    applyFooterContact('[data-site-footer-telegram]', data.footerTelegram, v => 'https://t.me/' + v.replace(/^@|^https?:\/\/t\.me\//i, ''));

    // ---- Homepage-only fields (elements simply won't exist on other pages) ----

    applyMarquee(data.marqueeText, data.marqueeEnabled);

    // Hero
    setText('[data-site-hero-eyebrow]', data.heroEyebrow);
    setText('[data-site-hero-title]', data.heroTitle);
    setText('[data-site-hero-lead]', data.heroLead);
    setText('[data-site-home-student-btn]', data.homeStudentBtnText);
    setText('[data-site-hero-results-btn]', data.heroResultsBtnText);
    setText('[data-site-hero-mini-number]', data.heroMiniNumber);
    setText('[data-site-hero-mini-label]', data.heroMiniLabel);
    if(Array.isArray(data.certificateImages) && data.certificateImages.length > 0){
      renderCertificateCarousel(data.certificateImages);
    } else {
      renderHeroImage(data.heroImageUrl);
    }

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

  const SETTINGS_CACHE_KEY = 'efSiteSettingsCache';

  // ---- Welcome loading overlay (#siteLoadingOverlay, if present on the
  // page) — kept up for a short minimum time so "Xush kelibsiz!" is
  // actually readable, and hidden as soon as branding is ready. If a
  // cached copy of the settings exists that happens almost instantly; on
  // a visitor's very first-ever visit (no cache yet) it stays up until
  // the real Firestore fetch below finishes, with a safety-net timeout so
  // it never gets stuck if the network is slow or offline. ----
  const OVERLAY_SHOWN_AT = Date.now();
  const MIN_OVERLAY_MS = 500;
  let overlayHidden = false;
  function hideLoadingOverlay(){
    if(overlayHidden) return;
    overlayHidden = true;
    const overlay = document.getElementById('siteLoadingOverlay');
    if(!overlay) return;
    const wait = Math.max(0, MIN_OVERLAY_MS - (Date.now() - OVERLAY_SHOWN_AT));
    setTimeout(() => {
      overlay.classList.add('is-hidden');
      setTimeout(() => overlay.remove(), 400);
    }, wait);
  }

  // Applies whatever settings we saved from the last successful Firestore
  // fetch, instantly, with no network wait — this is what removes the
  // few seconds of "default" colors/text flashing before the real branding
  // shows up. Called once, right when the page is ready. Returns true if
  // a cached copy was found and applied.
  function applyCachedSettings(){
    try{
      const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
      if(cached){ applySettings(JSON.parse(cached)); return true; }
    } catch(e){ /* corrupt cache or storage unavailable — just skip it */ }
    return false;
  }

  function init(){
    // Wait for firebase-config.js to have set up the global `db`.
    if(typeof db === 'undefined'){ setTimeout(init, 50); return; }
    db.collection('settings').doc('site').get()
      .then(doc => {
        if(doc.exists){
          const data = doc.data();
          // ---- Maintenance mode check ----
          if(data.maintenanceMode && !IS_ADMIN_PAGE){
            showMaintenanceOverlay(data.maintenanceMessage);
            // Still hide the loading overlay; the maintenance overlay takes over
            hideLoadingOverlay();
            // Keep listening for maintenance mode to be turned off in real-time
            db.collection('settings').doc('site').onSnapshot(snap => {
              if(!snap.exists) return;
              const d = snap.data();
              if(d.maintenanceMode){
                showMaintenanceOverlay(d.maintenanceMessage);
              } else {
                hideMaintenanceOverlay();
                applySettings(d);
              }
            });
            return; // Do not apply normal settings while maintenance is on
          }
          hideMaintenanceOverlay(); // in case it was on before and now turned off
          applySettings(data);
          try{ localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data)); } catch(e){ /* storage full/unavailable — not critical */ }
        }
        hideLoadingOverlay();
      })
      .catch(() => { hideLoadingOverlay(); /* settings doc not created yet, or offline — keep defaults */ });
  }

  function boot(){
    const hadCache = applyCachedSettings();
    init();
    if(hadCache) hideLoadingOverlay();
    setTimeout(hideLoadingOverlay, 4000); // safety net — never leave the overlay stuck up
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
