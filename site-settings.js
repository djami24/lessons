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
    el.innerHTML = `
<style>
#maintenanceModeOverlay {
  position:fixed; inset:0; z-index:99999;
  background: #f0f0ff;
  font-family: 'Inter', 'Segoe UI', sans-serif;
  overflow:hidden;
  display:flex; flex-direction:column;
}
#mnt-body {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  padding:1rem 1rem 0.5rem;
  text-align:center; position:relative;
  min-height:0;
}
/* decorative dots */
.mnt-dots {
  position:absolute; opacity:.35;
  display:grid; gap:7px;
}
.mnt-dots span {
  width:6px; height:6px; border-radius:50%;
  background:#8080cc; display:block;
}
.mnt-dot-tl { top:60px; left:60px; grid-template-columns:repeat(4,1fr); }
.mnt-dot-br { bottom:100px; right:60px; grid-template-columns:repeat(4,1fr); }
.mnt-circle-l {
  position:absolute; left:60px; bottom:140px;
  width:80px; height:80px; border-radius:50%;
  background:#d8d8f8; opacity:.7;
}
.mnt-circle-r {
  position:absolute; right:50px; top:120px;
  width:40px; height:40px; border-radius:50%;
  border:2px solid #c8c8ee; background:transparent;
}
/* illustration */
.mnt-illus {
  position:relative; width:240px; max-width:70vw; margin-bottom:1rem;
}
.mnt-laptop {
  width:100%; filter:drop-shadow(0 20px 40px rgba(100,100,200,.18));
}
/* cone left */
.mnt-cone-l {
  position:absolute; left:-10px; bottom:28px;
  width:52px;
}
/* barrier right */
.mnt-barrier {
  position:absolute; right:-14px; bottom:20px;
  width:68px;
}
/* heading */
.mnt-h1 {
  margin:0 0 .2rem; font-size:clamp(1.1rem,3vw,1.6rem);
  font-weight:800; color:#1a1a3e; line-height:1.2;
}
.mnt-h2 {
  margin:0 0 .4rem; font-size:clamp(1.1rem,3vw,1.55rem);
  font-weight:800; color:#4040cc; line-height:1.2;
}
.mnt-sub {
  margin:0 0 1rem; color:#7070aa; font-size:.88rem;
}
/* progress card */
.mnt-card {
  background:#fff; border-radius:16px;
  padding:10px 18px; display:flex; align-items:center; gap:14px;
  box-shadow:0 4px 20px rgba(100,100,200,.1);
  width:100%; max-width:420px; margin-bottom:0;
}
.mnt-wrench { font-size:1.5rem; flex-shrink:0; }
.mnt-progress-wrap { flex:1; }
.mnt-progress-label { font-size:.82rem; color:#9090bb; margin-bottom:6px; text-align:left; }
.mnt-bar-row { display:flex; align-items:center; gap:10px; }
.mnt-bar-bg {
  flex:1; height:7px; border-radius:99px;
  background:#e8e8f8; overflow:hidden;
}
.mnt-bar-fill {
  height:100%; border-radius:99px;
  background:linear-gradient(90deg,#5555dd,#7777ff);
  width:0%; transition:width 1.2s cubic-bezier(.4,0,.2,1);
}
.mnt-pct { font-size:.82rem; font-weight:700; color:#5555dd; white-space:nowrap; }
/* bottom wave + notify bar */
.mnt-bottom {
  flex-shrink:0; width:100%; background:#f0f0ff;
}
/* social */
.mnt-social {
  text-align:center; padding:8px 0 16px; font-size:.78rem; color:#9090bb;
  background:#ddddf8;
}
.mnt-social-icons { display:flex; gap:12px; justify-content:center; margin-top:8px; }
.mnt-social-icon {
  width:52px; height:52px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  text-decoration:none; transition:transform .2s, box-shadow .2s;
  overflow:hidden;
}
.mnt-social-icon:hover { transform:scale(1.1); box-shadow:0 4px 16px rgba(41,182,246,.4); }
@media(max-width:560px){
  .mnt-dot-tl { display:none; } .mnt-dot-br { display:none; }
  .mnt-circle-l { display:none; } .mnt-circle-r { display:none; }
}
</style>
<div id="mnt-body">
  <!-- decorative dots -->
  <div class="mnt-dots mnt-dot-tl">
    ${Array(12).fill('<span></span>').join('')}
  </div>
  <div class="mnt-dots mnt-dot-br">
    ${Array(12).fill('<span></span>').join('')}
  </div>
  <div class="mnt-circle-l"></div>
  <div class="mnt-circle-r"></div>

  <!-- illustration -->
  <div class="mnt-illus">
    <svg class="mnt-laptop" viewBox="0 0 340 220" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- laptop base -->
      <rect x="30" y="170" width="280" height="14" rx="7" fill="#c8c8e8"/>
      <!-- screen body -->
      <rect x="55" y="18" width="230" height="158" rx="12" fill="#2a2a5e"/>
      <!-- screen glass -->
      <rect x="65" y="30" width="210" height="136" rx="6" fill="#e8e8ff"/>
      <!-- browser bar -->
      <rect x="65" y="30" width="210" height="26" rx="6" fill="#5555cc"/>
      <circle cx="82" cy="43" r="5" fill="#fff" opacity=".5"/>
      <circle cx="97" cy="43" r="5" fill="#fff" opacity=".5"/>
      <circle cx="112" cy="43" r="5" fill="#fff" opacity=".5"/>
      <!-- gear icon centered -->
      <g transform="translate(170,108)">
        <circle r="22" fill="#6666dd" opacity=".15"/>
        <path d="M0-24v6M0 18v6M24 0h-6M-18 0h-6M17-17l-4.2 4.2M-12.8 12.8l-4.2 4.2M17 17l-4.2-4.2M-12.8-12.8l-4.2-4.2" stroke="#5555cc" stroke-width="3" stroke-linecap="round"/>
        <circle r="10" fill="none" stroke="#5555cc" stroke-width="3"/>
        <circle r="4" fill="#5555cc"/>
      </g>
      <!-- small image placeholders -->
      <rect x="80" y="62" width="44" height="34" rx="5" fill="#c8c8ee" opacity=".6"/>
      <rect x="216" y="62" width="44" height="34" rx="5" fill="#c8c8ee" opacity=".6"/>
    </svg>
    <!-- cone left (SVG inline) -->
    <svg class="mnt-cone-l" viewBox="0 0 52 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="26" cy="72" rx="22" ry="6" fill="#7070cc" opacity=".3"/>
      <path d="M26 4 L48 68 H4 Z" fill="#5555cc"/>
      <path d="M10 52 L42 52" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <path d="M16 38 L36 38" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    </svg>
    <!-- barrier right -->
    <svg class="mnt-barrier" viewBox="0 0 68 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- legs -->
      <rect x="10" y="52" width="6" height="26" rx="3" fill="#aaaacc"/>
      <rect x="52" y="52" width="6" height="26" rx="3" fill="#aaaacc"/>
      <!-- board -->
      <rect x="2" y="30" width="64" height="26" rx="5" fill="#f0f0ff"/>
      <path d="M2 35 L66 35" stroke="#5555cc" stroke-width="0"/>
      <!-- stripes -->
      <clipPath id="bc"><rect x="2" y="30" width="64" height="26" rx="5"/></clipPath>
      <g clip-path="url(#bc)">
        <path d="M2 56 L22 30" stroke="#5555cc" stroke-width="9"/>
        <path d="M20 56 L40 30" stroke="#5555cc" stroke-width="9"/>
        <path d="M38 56 L58 30" stroke="#5555cc" stroke-width="9"/>
        <path d="M56 56 L76 30" stroke="#5555cc" stroke-width="9"/>
      </g>
      <!-- top bar -->
      <rect x="2" y="22" width="64" height="10" rx="5" fill="#5555cc"/>
    </svg>
  </div>

  <!-- text -->
  <h2 class="mnt-h1">Sayt takomillashtirilmoqda.</h2>
  <h2 class="mnt-h2">Tez orada ishga tushadi!</h2>
  <p class="mnt-sub">Sabr-toqatli bo'lganingiz uchun rahmat!</p>

  <!-- progress card -->
  <div class="mnt-card">
    <span class="mnt-wrench">🔧</span>
    <div class="mnt-progress-wrap">
      <div class="mnt-progress-label">Ish jarayoni davom etmoqda...</div>
      <div class="mnt-bar-row">
        <div class="mnt-bar-bg"><div class="mnt-bar-fill" id="mntBarFill"></div></div>
        <span class="mnt-pct" id="mntPct">0%</span>
      </div>
    </div>
  </div>
</div>

<div class="mnt-bottom">
  <svg viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:50px;flex-shrink:0;">
    <path d="M0,50 C360,80 1080,10 1440,40 L1440,80 L0,80 Z" fill="#ddddf8"/>
  </svg>
  <div class="mnt-social">
    Bizni Telegramda kuzating:
    <div class="mnt-social-icons">
      <a class="mnt-social-icon mnt-tg-icon" href="https://t.me/djamiteacher" target="_blank" rel="noopener" aria-label="Telegram">
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36">
          <circle cx="24" cy="24" r="24" fill="#29B6F6"/>
          <path d="M10.5 23.5l22-9c1-.4 1.9.2 1.6 1.4l-3.7 17.4c-.3 1.2-1 1.5-2 .9l-5.5-4-2.6 2.5c-.3.3-.6.4-.9.3l.4-5.7 10.2-9.2c.4-.4 0-.6-.5-.2L15.5 27.3l-5-1.6c-1-.3-1-.9.5-1.4z" fill="white"/>
        </svg>
      </a>
    </div>
  </div>
</div>
<script>
(function(){
  // animate progress bar to 65%
  var target = 65;
  var fill = document.getElementById('mntBarFill');
  var pct  = document.getElementById('mntPct');
  if(!fill) return;
  setTimeout(function(){
    fill.style.width = target + '%';
    var start = Date.now(), dur = 1200, from = 0;
    function tick(){
      var p = Math.min((Date.now()-start)/dur, 1);
      var ease = 1-Math.pow(1-p,3);
      var v = Math.round(from + (target-from)*ease);
      if(pct) pct.textContent = v + '%';
      if(p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, 200);


})();
</script>`;

    document.body.appendChild(el);
    maintenanceOverlayEl = el;
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

    // Talabalar fikri — testimonials
    setText('[data-testimonial-1-name]', data.testimonial1Name);
    setText('[data-testimonial-1-role]', data.testimonial1Role);
    setText('[data-testimonial-1-text]', data.testimonial1Text);
    setText('[data-testimonial-2-name]', data.testimonial2Name);
    setText('[data-testimonial-2-role]', data.testimonial2Role);
    setText('[data-testimonial-2-text]', data.testimonial2Text);
    setText('[data-testimonial-3-name]', data.testimonial3Name);
    setText('[data-testimonial-3-role]', data.testimonial3Role);
    setText('[data-testimonial-3-text]', data.testimonial3Text);
    setText('[data-testimonial-4-name]', data.testimonial4Name);
    setText('[data-testimonial-4-role]', data.testimonial4Role);
    setText('[data-testimonial-4-text]', data.testimonial4Text);
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
