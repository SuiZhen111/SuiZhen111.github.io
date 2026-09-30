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
    document.querySelectorAll('.btn, .cert-card, .entry, .dir-entry, .skill-card, .stat, .pills li, .chips li, .side-social a, .side-stat')
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

  /* ---------- 卡片边缘流光（BorderGlow：跟随鼠标的光束） ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.dir-entry, .skill-card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var cx = rect.width / 2;
        var cy = rect.height / 2;
        var dx = x - cx;
        var dy = y - cy;
        var kx = dx !== 0 ? cx / Math.abs(dx) : Infinity;
        var ky = dy !== 0 ? cy / Math.abs(dy) : Infinity;
        /* 光标靠近边缘的程度 0~1 */
        var edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
        /* 光标相对卡片中心的角度 */
        var deg = (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx) * 180 / Math.PI + 90;
        if (deg < 0) deg += 360;
        card.style.setProperty('--edge-proximity', edge.toFixed(3));
        card.style.setProperty('--cursor-angle', deg.toFixed(3) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--edge-proximity', '0');
      });
    });
  }

  /* ---------- 回到顶部 + 滚动进度条 ---------- */
  var backTop = document.getElementById('backTop');
  var progressBar = document.getElementById('scrollProgress');
  var scrollTicking = false;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (progressBar) {
      progressBar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    }
    if (backTop) {
      backTop.classList.toggle('show', y > window.innerHeight * 0.6);
    }
    scrollTicking = false;
  }

  window.addEventListener('scroll', function () {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  onScroll();

  if (backTop) {
    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------- 头像彩蛋：触发光环爆发 ---------- */
  var avatar = document.querySelector('.side-avatar');
  if (avatar && !reduceMotion) {
    ['mouseenter', 'click'].forEach(function (evt) {
      avatar.addEventListener(evt, function () {
        document.dispatchEvent(new CustomEvent('avatar:burst'));
      });
    });
  }

  /* ---------- 证书灯箱（支持左右切换与键盘导航） ---------- */
  var lightbox = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbCap = document.getElementById('lbCap');
  var lbClose = document.getElementById('lbClose');
  var lbPrev = document.getElementById('lbPrev');
  var lbNext = document.getElementById('lbNext');
  var certCards = Array.prototype.slice.call(
    document.querySelectorAll('.cert-card')
  );
  var lbIndex = 0;

  function showCert(i) {
    if (!certCards.length) return;
    lbIndex = (i + certCards.length) % certCards.length;
    var card = certCards[lbIndex];
    var img = card.querySelector('img');
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = card.getAttribute('data-cap') || img.alt;
  }

  function openLightbox(card) {
    showCert(certCards.indexOf(card));
    lightbox.hidden = false;
    document.body.classList.add('lb-open');
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('lb-open');
  }

  certCards.forEach(function (card) {
    card.addEventListener('click', function () { openLightbox(card); });
  });

  if (lbPrev) lbPrev.addEventListener('click', function () { showCert(lbIndex - 1); });
  if (lbNext) lbNext.addEventListener('click', function () { showCert(lbIndex + 1); });
  lbClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showCert(lbIndex - 1);
    if (e.key === 'ArrowRight') showCert(lbIndex + 1);
  });

  /* ---------- 奖项条目 ↔ 证书联动：点击奖项直接打开对应证书 ---------- */
  document.querySelectorAll('.entry.has-cert').forEach(function (entry) {
    entry.addEventListener('click', function () {
      var file = entry.getAttribute('data-cert');
      var card = certCards.filter(function (c) {
        var img = c.querySelector('img');
        return img && img.src.slice(img.src.lastIndexOf('/') + 1) === file;
      })[0];
      if (card) openLightbox(card);
    });
  });
})();

/* ============================================================
   数字人助手（问答气泡）
   入口：3D 数字人右上角的聊天气泡
   纯前端实现：无网络请求、无第三方依赖、无需 API Key
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia &&
    window.matchMedia('(pointer: fine)').matches;

  var avatarRow = document.querySelector('.avatar-row');
  var buddy = document.getElementById('buddy');
  var chatBtn = document.getElementById('buddyChat');
  var heroAskBtn = document.getElementById('h3dAsk');
  var hero3d = document.getElementById('hero3d');
  var bubble = document.getElementById('h3dBubble');
  var panel = document.getElementById('assistant');
  var msgs = document.getElementById('asstMsgs');
  var form = document.getElementById('asstForm');
  var input = document.getElementById('asstInput');
  var statusEl = document.getElementById('asstStatus');
  var closeBtn = document.getElementById('asstClose');

  if (!avatarRow || !chatBtn || !panel || !msgs || !form || !input) return;

  var opened = false;
  var greeted = false;
  var talkTimer = null;
  var bubbleTimer = null;

  /* ---------- 知识库 + 全局人设：都在 qa-data.js（systemPrompt 那一段
       就是 3D 数字人的 System Prompt，想改人设 / 改回答只改那个文件） ---------- */
  var QA = window.QA_DATA || {};
  var WELCOME = QA.welcome ||
    '你好，我是邰穗江的 3D 数字分身。关于我本人、成绩、项目、跑步或者怎么联系，都可以直接问我。';
  var FALLBACK = QA.fallback ||
    '这个问题我暂时还没收录答案哦～你可以试试问我的基本信息、项目经历或者兴趣爱好~';
  var FAQ = QA.list || [];

  /* 人设规则 1 + 2：命中越多、越长的关键词越优先（只答题库收录的）；
     一条都没中就用兜底回答，绝不现编 */
  function answerFor(q) {
    var s = String(q || '').toLowerCase();
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < FAQ.length; i++) {
      var keys = (FAQ[i] && FAQ[i].keys) || [];
      var score = 0;
      for (var j = 0; j < keys.length; j++) {
        var k = String(keys[j] || '').toLowerCase();
        if (k && s.indexOf(k) !== -1) score += 1 + Math.min(k.length, 6);
      }
      if (score > bestScore) {
        bestScore = score;
        best = FAQ[i];
      }
    }
    return bestScore > 0 && best ? best.a : FALLBACK;
  }

  /* ---------- 消息渲染 ---------- */
  function scrollMsgs() { msgs.scrollTop = msgs.scrollHeight; }

  function addMsg(text, who) {
    var el = document.createElement('div');
    el.className = 'msg ' + who;
    el.textContent = text;
    msgs.appendChild(el);
    scrollMsgs();
    return el;
  }

  function addTyping() {
    var el = document.createElement('div');
    el.className = 'msg bot typing';
    el.innerHTML = '<i></i><i></i><i></i>';
    msgs.appendChild(el);
    scrollMsgs();
    return el;
  }

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.lastChild.nodeValue = text;
  }

  /* 数字人跟着“说话”：回答出现时，侧栏和正文的模型一起轻轻点头，
     正文舞台上同时把答案显示成一个气泡 */
  function talkFor(ms) {
    if (reduceMotion) return;
    if (buddy) buddy.classList.add('talking');
    if (hero3d) hero3d.classList.add('talking');
    clearTimeout(talkTimer);
    talkTimer = setTimeout(function () {
      if (buddy) buddy.classList.remove('talking');
      if (hero3d) hero3d.classList.remove('talking');
    }, ms);
  }

  function showBubble(text) {
    if (!bubble) return;
    /* 内层 span 承担截断：clamp 作用在内容上，文字就不会漏进气泡的下内边距里 */
    bubble.textContent = '';
    var inner = document.createElement('span');
    inner.textContent = text;
    bubble.appendChild(inner);
    bubble.classList.add('is-on');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      if (bubble) bubble.classList.remove('is-on');
    }, Math.min(16000, 7000 + text.length * 70));
  }

  function botSay(text) {
    var t = addTyping();
    setStatus('思考中…');
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
      addMsg(text, 'bot');
      setStatus('在线 · 可以提问');
      talkFor(Math.min(3200, 600 + text.length * 26));
      showBubble(text);
    }, reduceMotion ? 0 : 520);
  }

  function ask(q) {
    q = String(q || '').trim();
    if (!q) return;
    addMsg(q, 'user');
    botSay(answerFor(q));
  }

  /* ---------- 面板开合与定位 ---------- */
  function place() {
    if (window.innerWidth <= 960) {
      panel.style.left = panel.style.top = '';
      panel.style.right = panel.style.bottom = '';
      return;
    }
    var r = avatarRow.getBoundingClientRect();
    var w = panel.offsetWidth;
    var h = panel.offsetHeight;
    var left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    var top = r.bottom + 14;
    if (top + h > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - 12 - h);
    }
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  /* 两个入口（侧栏气泡、正文「向我提问」）的展开状态要一致 */
  function setExpanded(v) {
    var s = v ? 'true' : 'false';
    if (chatBtn) chatBtn.setAttribute('aria-expanded', s);
    if (heroAskBtn) heroAskBtn.setAttribute('aria-expanded', s);
  }

  function openPanel() {
    if (opened) return;
    opened = true;
    panel.hidden = false;
    place();
    document.body.classList.add('asst-open');
    setExpanded(true);
    document.dispatchEvent(new CustomEvent('avatar:burst'));
    if (!greeted) {
      greeted = true;
      botSay(WELCOME);
    }
    if (finePointer) setTimeout(function () { input.focus(); }, 60);
  }

  function closePanel(keepFocus) {
    if (!opened) return;
    opened = false;
    panel.hidden = true;
    document.body.classList.remove('asst-open');
    setExpanded(false);
    if (keepFocus) chatBtn.focus();
  }

  chatBtn.addEventListener('click', function () {
    opened ? closePanel(true) : openPanel();
  });

  /* 正文大舞台旁的「向我提问」：同一个面板，同一个数字人 */
  if (heroAskBtn) {
    heroAskBtn.addEventListener('click', function () {
      if (opened) input.focus();
      else openPanel();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () { closePanel(true); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
    input.value = '';
    input.focus();
  });

  document.querySelectorAll('.asst-quick button').forEach(function (b) {
    b.addEventListener('click', function () {
      ask(b.getAttribute('data-q') || b.textContent);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && opened) closePanel(true);
  });

  document.addEventListener('click', function (e) {
    if (!opened) return;
    if (panel.contains(e.target) || avatarRow.contains(e.target)) return;
    if (heroAskBtn && heroAskBtn.contains(e.target)) return;   // 开关按钮自己，别刚开就被点关
    closePanel(false);
  });

  window.addEventListener('resize', function () {
    if (opened) place();
  });
})();

/* ============================================================
   3D 数字人（侧栏头像旁）
   · 左右拖拽：正面 → 侧面 → 背面，模拟转身
   · 点击头部：在 8 个表情之间切换
   · 点击身体：回到正面全身
   · 键盘：← → 转身，Enter / 空格 换表情
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var stage = document.getElementById('buddyStage');
  if (!stage) return;

  /* 平面图已经下线：这里只管状态（当前视角 / 当前表情）和提示文字，
     画面本身由 viewer3d.js 的 3D 舞台渲染 */
  var N_VIEWS = 3;     // 正面 / 侧面 / 背面
  var N_MOODS = 8;     // 8 种表情

  var VIEW_LABEL = ['正面', '侧面', '背面'];
  var MOOD_LABEL = ['微笑', '大笑', '开怀', '偷笑', '得意', '惊讶', '委屈', '不爽'];
  /* 可访问名称必须包含舞台上可见的提示文字（axe: label-content-name-mismatch） */
  var HINT = '点击头部可更换表情 左右拖拽转身 · AI 生成';

  var vi = 0;      // 当前视角
  var mi = 0;      // 当前表情
  var mode = 'view';

  function sync() {
    stage.setAttribute(
      'aria-label',
      mode === 'view'
        ? HINT + '，当前为' + VIEW_LABEL[vi]
        : HINT + '，当前表情：' + MOOD_LABEL[mi]
    );
    /* 画面归 viewer3d.js 管：data-ready / data-mood 都由它来写 */
  }

  function fx(cls) {
    if (reduceMotion || stage.classList.contains(cls)) return;
    stage.classList.add(cls);
    setTimeout(function () { stage.classList.remove(cls); }, 360);
  }

  /* 3D 挂了：画面上什么都不会变，点击也就别再改状态了 */
  function dead3d() { return stage.getAttribute('data-state') === 'fail'; }

  function turn(step) {
    if (dead3d()) return;
    mode = 'view';
    vi = (vi + step + N_VIEWS) % N_VIEWS;
    sync();
    fx('turning');
  }

  function nextMood() {
    if (dead3d()) return;
    mi = mode === 'mood' ? (mi + 1) % N_MOODS : 0;
    mode = 'mood';
    sync();
    fx('pop');
    /* 通知 3D 查看器：有对应表情模型就换模型 */
    try {
      stage.dispatchEvent(new CustomEvent('buddymood', { detail: { index: mi } }));
    } catch (err) { /* 忽略 */ }
  }

  function backToView() {
    if (dead3d()) return;
    mode = 'view';
    vi = 0;
    sync();
    fx('turning');
    /* 通知 3D 查看器：回正面了，把还没加载完的表情模型作废（index:-1） */
    try {
      stage.dispatchEvent(new CustomEvent('buddymood', { detail: { index: -1 } }));
    } catch (err) { /* 忽略 */ }
  }

  /* ---------- 指针：拖拽转身 / 点击换表情 ---------- */
  var dragging = false;
  var moved = 0;
  var lastX = 0;
  var startX = 0;
  var startY = 0;
  var acc = 0;
  var TH = 34;   // 每拖过 34px 转一格

  stage.addEventListener('pointerdown', function (e) {
    dragging = true;
    moved = 0;
    acc = 0;
    lastX = startX = e.clientX;
    startY = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });

  stage.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX;
    lastX = e.clientX;
    moved = Math.max(moved, Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY));
    /* 3D 模式下旋转交给 viewer3d.js，这里只统计位移，免得拖拽被当成点击 */
    if (stage.getAttribute('data-three') === 'on') return;
    acc += dx;
    // 向左拖 = 往前转（正面 → 侧面 → 背面），向右拖则相反
    if (acc > TH) { acc = 0; turn(-1); }
    else if (acc < -TH) { acc = 0; turn(1); }
  });

  stage.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    if (moved > 8) return;                 // 拖拽已由 turn() 处理
    var r = stage.getBoundingClientRect();
    var y = (e.clientY - r.top) / r.height;
    if (y < 0.55) nextMood();    // 点头部 → 换表情
    else backToView();           // 点身体 → 回正面全身
  });

  stage.addEventListener('pointercancel', function () { dragging = false; });

  /* ---------- 键盘操作 ---------- */
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      /* 3D 模式：方向键转模型，由 viewer3d.js 处理 */
      if (stage.getAttribute('data-three') === 'on') return;
      e.preventDefault();
      turn(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      nextMood();
    }
  });

  sync();
})();
