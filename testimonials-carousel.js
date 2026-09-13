// ===== TALABALAR FIKRI — Split-card carousel controller =====
// Har bir slaydning o'ng tomonida talaba rasmi ko'rinadi.
// Rasmlar admin panelda (Sayt sozlamalari) qo'yiladi:
//   testimonial1Photo, testimonial2Photo, testimonial3Photo, testimonial4Photo
// Role matni ✦ belgisi bo'yicha ikkiga bo'linib badgelarga qo'yiladi.
(function () {
  var track = document.getElementById('tslTrack');
  if (!track) return;

  var slides  = Array.prototype.slice.call(track.querySelectorAll('.tsl-slide'));
  var dotsWrap = document.getElementById('tslDots');
  var prevBtn  = document.getElementById('tslPrev');
  var nextBtn  = document.getElementById('tslNext');
  var wrap     = document.querySelector('.tsl-carousel-wrap');
  if (!slides.length) return;

  var AUTO_MS = 6000;
  var current = 0;
  var timer   = null;
  var dots    = [];

  // --- Dots qurish ---
  if (dotsWrap) {
    slides.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tsl-dot';
      b.setAttribute('aria-label', (i + 1) + '-fikr');
      b.addEventListener('click', function () { userGoTo(i); });
      dotsWrap.appendChild(b);
      dots.push(b);
    });
  }

  // --- Role matnidan badge matnlarini ajratish ---
  function deriveBadges(slide) {
    var roleEl = slide.querySelector('[class*="tsl-role"]');
    if (!roleEl) return;
    var raw   = (roleEl.textContent || '').trim();
    var parts = raw.split('✦').map(function (s) { return s.trim(); }).filter(Boolean);
    var idx   = slide.getAttribute('data-slide');
    if (!idx) return;
    var n = String(Number(idx) + 1);
    var certEl = slide.querySelector('[data-tsl-badge-' + n + '-cert]');
    var timeEl = slide.querySelector('[data-tsl-badge-' + n + '-time]');
    if (parts.length >= 2) {
      if (certEl) certEl.textContent = parts[0];
      if (timeEl) timeEl.textContent = parts[1];
    } else if (parts.length === 1) {
      if (certEl) certEl.textContent = parts[0];
    }
  }

  // --- Rasm holatini tekshirish ---
  function refreshPhoto(slide) {
    var img = slide.querySelector('.tsl-photo');
    var fallback = slide.querySelector('.tsl-photo-fallback');
    if (!img || !fallback) return;
    var src = img.getAttribute('src') || '';
    if (src && src !== '') {
      fallback.style.display = 'none';
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
      fallback.style.display = 'flex';
    }
  }

  function showSlide(idx) {
    idx = (idx + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === idx); });
    dots.forEach(function (d, i)   { d.classList.toggle('is-active', i === idx); });
    deriveBadges(slides[idx]);
    refreshPhoto(slides[idx]);
    current = idx;
  }

  function next() { showSlide(current + 1); }
  function prev() { showSlide(current - 1); }

  function startAuto() { stopAuto(); timer = setInterval(next, AUTO_MS); }
  function stopAuto()  { if (timer) { clearInterval(timer); timer = null; } }

  function userGoTo(idx) { showSlide(idx); startAuto(); }
  function userNext()    { next(); startAuto(); }
  function userPrev()    { prev(); startAuto(); }

  if (prevBtn) prevBtn.addEventListener('click', userPrev);
  if (nextBtn) nextBtn.addEventListener('click', userNext);

  if (wrap) {
    wrap.addEventListener('mouseenter', stopAuto);
    wrap.addEventListener('mouseleave', startAuto);
    wrap.addEventListener('focusin',  stopAuto);
    wrap.addEventListener('focusout', startAuto);

    var touchStartX = null;
    wrap.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].clientX;
      stopAuto();
    }, { passive: true });
    wrap.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
      touchStartX = null;
      startAuto();
    }, { passive: true });
  }

  // site-settings.js keyinroq matn va rasmlarni yuklaydi,
  // shuning uchun biroz kechikib badge va rasmni qayta tekshiramiz
  setTimeout(function () { deriveBadges(slides[current]); refreshPhoto(slides[current]); }, 800);
  setTimeout(function () { deriveBadges(slides[current]); refreshPhoto(slides[current]); }, 2000);
  setTimeout(function () { deriveBadges(slides[current]); refreshPhoto(slides[current]); }, 4000);

  showSlide(0);
  startAuto();
})();
