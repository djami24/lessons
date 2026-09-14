// ===== TALABALAR FIKRI — Split-card carousel controller =====
// site-settings.js Firestore dan testimonials massivini yuklab,
// tslTrack ga slaydlarni qo'shgach window._tslInit() ni chaqiradi —
// shu funksiya carousel ni (qayta) ishga tushiradi.
(function () {

  function init() {
    var track   = document.getElementById('tslTrack');
    var dotsWrap = document.getElementById('tslDots');
    var prevBtn  = document.getElementById('tslPrev');
    var nextBtn  = document.getElementById('tslNext');
    var wrap     = document.querySelector('.tsl-carousel-wrap');

    if (!track) return;

    var slides = Array.prototype.slice.call(track.querySelectorAll('.tsl-slide'));
    if (!slides.length) return;

    var AUTO_MS = 6000;
    var current = 0;
    var timer   = null;
    var dots    = [];

    // Dots tozalab qayta quramiz
    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      slides.forEach(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tsl-dot' + (i === 0 ? ' is-active' : '');
        b.setAttribute('aria-label', (i + 1) + '-fikr');
        b.addEventListener('click', function () { userGoTo(i); });
        dotsWrap.appendChild(b);
        dots.push(b);
      });
    }

    function showSlide(idx) {
      idx = (idx + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle('is-active', i === idx); });
      dots.forEach(function (d, i)   { d.classList.toggle('is-active', i === idx); });
      current = idx;
    }

    function next() { showSlide(current + 1); }
    function prev() { showSlide(current - 1); }

    function startAuto() { stopAuto(); timer = setInterval(next, AUTO_MS); }
    function stopAuto()  { if (timer) { clearInterval(timer); timer = null; } }

    function userGoTo(idx) { showSlide(idx); startAuto(); }
    function userNext()    { next(); startAuto(); }
    function userPrev()    { prev(); startAuto(); }

    // Tugmalarni qayta bog'laymiz (clone = eski listenerlarni tozalash)
    if (prevBtn) {
      var newPrev = prevBtn.cloneNode(true);
      prevBtn.parentNode.replaceChild(newPrev, prevBtn);
      newPrev.addEventListener('click', userPrev);
    }
    if (nextBtn) {
      var newNext = nextBtn.cloneNode(true);
      nextBtn.parentNode.replaceChild(newNext, nextBtn);
      newNext.addEventListener('click', userNext);
    }

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

    showSlide(0);
    startAuto();
  }

  // site-settings.js slaydlarni qo'shgach shu funksiyani chaqiradi
  window._tslInit = init;

  // Sahifa birinchi yuklanayotganda HTML da slayd bo'lsa (fallback)
  init();
})();
