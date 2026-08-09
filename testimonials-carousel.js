// ===== TALABALAR FIKRI — Carousel controller =====
// Har bir slayd ichidagi "Daraja / natija" matni (masalan
// "CEFR — B2 sertifikati ✦ Qisqa muddat") ✦ belgisi bo'yicha ikkiga bo'linib,
// yuqoridagi ikkita nishonchaga (badge) qo'yiladi. Bu matn admin panelda
// (Sayt sozlamalari) tahrirlansa, nishonchalar ham avtomatik yangilanadi.
(function () {
  var track = document.getElementById('testimonialTrack');
  if (!track) return;

  var slides = Array.prototype.slice.call(track.querySelectorAll('.testimonial-slide'));
  var dotsWrap = document.getElementById('testimonialDots');
  var prevBtn = document.getElementById('testimonialPrev');
  var nextBtn = document.getElementById('testimonialNext');
  var carousel = document.getElementById('testimonialsCarousel');
  if (!slides.length) return;

  var AUTO_MS = 6000;
  var current = 0;
  var timer = null;

  // --- Build dots ---
  var dots = [];
  if (dotsWrap) {
    slides.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'testimonial-dot';
      b.setAttribute('aria-label', (i + 1) + '-fikr');
      b.addEventListener('click', function () { userGoTo(i); });
      dotsWrap.appendChild(b);
      dots.push(b);
    });
  }

  function deriveBadges(slide) {
    var roleEl = slide.querySelector('.testimonial-role');
    if (!roleEl) return;
    var raw = (roleEl.textContent || '').trim();
    var parts = raw.split('✦').map(function (s) { return s.trim(); }).filter(Boolean);
    var beforeEl = slide.querySelector('.t-badge-before .t-badge-text');
    var afterEl = slide.querySelector('.t-badge-after .t-badge-text');
    if (parts.length >= 2) {
      if (afterEl) afterEl.textContent = parts[0];
      if (beforeEl) beforeEl.textContent = parts[1];
    } else if (parts.length === 1) {
      if (afterEl) afterEl.textContent = parts[0];
    }
  }

  function showSlide(idx) {
    idx = (idx + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === idx); });
    dots.forEach(function (d, i) { d.classList.toggle('is-active', i === idx); });
    deriveBadges(slides[idx]);
    current = idx;
  }

  function next() { showSlide(current + 1); }
  function prev() { showSlide(current - 1); }

  function startAuto() {
    stopAuto();
    timer = setInterval(next, AUTO_MS);
  }
  function stopAuto() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  // Foydalanuvchi qo'lda boshqarganda avto-almashish vaqti qaytadan boshlanadi
  function userGoTo(idx) { showSlide(idx); startAuto(); }
  function userNext() { next(); startAuto(); }
  function userPrev() { prev(); startAuto(); }

  if (prevBtn) prevBtn.addEventListener('click', userPrev);
  if (nextBtn) nextBtn.addEventListener('click', userNext);

  // Sichqoncha ustida turganda yoki fokusda vaqtincha to'xtatish
  if (carousel) {
    carousel.addEventListener('mouseenter', stopAuto);
    carousel.addEventListener('mouseleave', startAuto);
    carousel.addEventListener('focusin', stopAuto);
    carousel.addEventListener('focusout', startAuto);

    // Mobil qurilmalarda barmoq bilan surish (swipe)
    var touchStartX = null;
    carousel.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].clientX;
      stopAuto();
    }, { passive: true });
    carousel.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
      touchStartX = null;
      startAuto();
    }, { passive: true });
  }

  // Admin panelda matn keyinroq (Firestore'dan) yangilansa, nishonchalar ham yangilanib tursin
  setTimeout(function () { deriveBadges(slides[current]); }, 1200);
  setTimeout(function () { deriveBadges(slides[current]); }, 2500);

  showSlide(0);
  startAuto();
})();
