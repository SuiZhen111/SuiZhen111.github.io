(function () {
  'use strict';

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.side-nav a')
  );
  var yearEl = document.getElementById('year');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia &&
    window.matchMedia('(pointer: fine)').matches;

  /* ---------- 页脚年份 ---------- */
  yearEl.textContent = new Date().getFullYear();

  /* ---------- 错落浮现：同区块内的元素依次入场 ---------- */
  document.querySelectorAll('.sec').forEach(function (sec) {
    sec.querySelectorAll('.reveal').forEach(function (el, i) {
      if (i > 0) el.style.transitionDelay = Math.min((i - 1) * 90, 540) + 'ms';
    });
  });

  /* ---------- 滚动入场动画 ---------- */
  var items = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          el.classList.add('visible');
          // 入场动画结束后清掉延迟，避免影响悬停过渡
          setTimeout(function () { el.style.transitionDelay = ''; }, 1400);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.1 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 侧边导航高亮（跟随当前区块） ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('.sec[id]'));

  function setActive(id) {
    navLinks.forEach(function (link) {
      link.classList.toggle(
        'active',
        link.getAttribute('href') === '#' + id
      );
    });
  }

  if ('IntersectionObserver' in window && sections.length) {
    var current = sections[0].id;
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) current = entry.target.id;
      });
      setActive(current);
    }, { rootMargin: '-30% 0px -55% 0px' });
    sections.forEach(function (sec) { spy.observe(sec); });
  }

  /* ---------- 鼠标跟随的页面微光 ---------- */
  if (finePointer && !reduceMotion) {
    var mx = 50, my = 30, tx = 50, ty = 30, raf = null;

    function frame() {
      mx += (tx - mx) * 0.12;
      my += (ty - my) * 0.12;
      document.body.style.setProperty('--mx', mx + '%');
      document.body.style.setProperty('--my', my + '%');
      if (Math.abs(tx - mx) > 0.1 || Math.abs(ty - my) > 0.1) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = null;
      }
    }

    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth) * 100;
      ty = (e.clientY / window.innerHeight) * 100;
      document.body.classList.add('glow-on');
      if (!raf) raf = requestAnimationFrame(frame);
    });
  }

  /* ---------- 悬停波纹特效 ---------- */
  function spawnInk(el, e) {
    var rect = el.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 2.2;
    var x = e.clientX ? e.clientX - rect.left : rect.width / 2;
    var y = e.clientY ? e.clientY - rect.top : rect.height / 2;
    var ink = document.createElement('span');
    ink.className = 'ink';
    ink.style.width = ink.style.height = size + 'px';
    ink.style.left = x + 'px';
    ink.style.top = y + 'px';
    el.appendChild(ink);
    ink.addEventListener('animationend', function () { ink.remove(); });
  }

  if (!reduceMotion) {
    document.querySelectorAll('.btn, .cert-card, .entry, .dir-entry, .pills li, .side-social a')
      .forEach(function (el) {
        el.addEventListener('pointerenter', function (e) {
          if (e.pointerType === 'touch') return;
          spawnInk(el, e);
        });
      });
  }

  /* ---------- 探索方向：悬停展开，移开自动收起；触屏设备点按切换 ---------- */
  var canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;

  document.querySelectorAll('.dir-entry').forEach(function (panel) {
    function set(open) {
      panel.classList.toggle('open', open);
      panel.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function toggle() {
      set(!panel.classList.contains('open'));
    }

    if (canHover && !reduceMotion) {
      /* 支持悬停的设备：移入展开，移出收起 */
      panel.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'touch') set(true);
      });
      panel.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'touch') set(false);
      });
      panel.addEventListener('focus', function () { set(true); });
      panel.addEventListener('blur', function () { set(false); });
    } else {
      /* 触屏设备：点按切换 */
      panel.addEventListener('click', toggle);
    }

    /* 键盘兜底 */
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  /* ---------- 证书灯箱 ---------- */
  var lightbox = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbCap = document.getElementById('lbCap');
  var lbClose = document.getElementById('lbClose');

  function openLightbox(card) {
    var img = card.querySelector('img');
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = card.getAttribute('data-cap') || img.alt;
    lightbox.hidden = false;
    document.body.classList.add('lb-open');
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('lb-open');
  }

  document.querySelectorAll('.cert-card').forEach(function (card) {
    card.addEventListener('click', function () { openLightbox(card); });
  });

  lbClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
})();
