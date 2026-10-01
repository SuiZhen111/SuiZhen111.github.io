/* ============================================================
   viewer3d.js · 3D 数字人查看器
   ------------------------------------------------------------
   · 页面空闲后再动态加载 three.js，不阻塞首屏
   · 侧栏小舞台 + 正文大舞台共用一次模型下载，各自解析一份
   · 默认取景为“胸部以上”的半身特写，表情看得清楚
   · 换表情 = 换掉整个模型：8 个表情模型和身体一样都是完整的全身像，
     直接整模替换，不拼接就没有接缝；摆位一致，取景和缩放都不变，
     所以换完表情照样能看到全身，也能继续放大缩小
   · 交互：拖拽旋转（带惯性）、空闲自转、滚轮 / 双指捏合缩放
   · 没有 WebGL / 下载失败 → 只用文字提示，不再放静态图兜底
   ============================================================ */
(function () {
  'use strict';

  var VER = '?v=20260930a';   // 模型换代时同步升级，免得吃旧缓存
  var MODEL_URL = 'images/avatar3d/model.glb' + VER;
  /* 8 个表情模型（混元3D 按表情图生成的全身像，压缩后每个约 1.2MB，点到才加载）。
     挂上去 = 整模替换（见 swapMood），加载失败就保持当前形象。 */
  var MOOD_MODELS = [
    'images/avatar3d/mood-01.glb' + VER,
    'images/avatar3d/mood-02.glb' + VER,
    'images/avatar3d/mood-03.glb' + VER,
    'images/avatar3d/mood-04.glb' + VER,
    'images/avatar3d/mood-05.glb' + VER,
    'images/avatar3d/mood-06.glb' + VER,
    'images/avatar3d/mood-07.glb' + VER,
    'images/avatar3d/mood-08.glb' + VER
  ];
  var MOOD_LABEL = ['微笑', '大笑', '开怀', '偷笑', '得意', '惊讶', '委屈', '不爽'];

  /* 表情模型和身体是各自独立生成的两张“照片”，但都是同一角色的完整全身像，
     所以换表情不搞“脖子处换头”的拼接 —— 整个模型直接换掉：
     拼接才需要对齐和裁切（必然留接缝），整模替换没有拼缝，
     两件又用同一套 normalize 落地、居中、等高，取景缩放自然不动。 */
  /* 基准取景：胸口往上的半身特写；换表情不改取景，脸的位置本来就不动 */
  var FOCUS_CHEST = 0.9077; // 基准取景：焦点 = 身高 × 0.9077
  var FOCUS_FULL = 0.5;     // 缩到最远时焦点落到身高 × 0.5（身体正中 → 完整全身）
  var VIEWH_CHEST = 0.50;   // 基准取景：视野高 = 身高 × 0.50 → 胸口往上
  var ZOOM_MIN = 0.45;      // 缩放夹紧（数值越小离得越近）
  var ZOOM_MAX = 2.4;

  var buddyStage = document.getElementById('buddyStage');
  var heroStage = document.getElementById('h3dStage');
  var statusEl = document.getElementById('h3dStatus');
  var buddyFailEl = document.getElementById('buddyFail');
  var rotBtn = document.getElementById('h3dRot');
  var moodsEl = document.getElementById('h3dMoods');
  var noteEl = document.getElementById('h3dNote');
  var zoomInBtn = document.getElementById('h3dZoomIn');
  var zoomOutBtn = document.getElementById('h3dZoomOut');

  if (!buddyStage && !heroStage) return;

  var NOTE_OK = '模型由混元3D 生成 · 约 1.2MB · 进入页面后才加载';
  var NOTE_FAIL = '3D 暂不可用 · 这里需要浏览器支持 WebGL';

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var loaderRef = null;
  var stages = [];
  var failed = false;      // 3D 不可用：藏起旋转/缩放/表情按钮，只留文字说明

  /* ---------------- 小工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function setStatus(text, state) {
    if (statusEl) statusEl.textContent = text || '';
    if (state === 'fail') failed = true;
    if (heroStage && state) heroStage.setAttribute('data-state', state);
    if (buddyStage && state) buddyStage.setAttribute('data-state', state);
    if (buddyFailEl) {
      buddyFailEl.textContent = failed ? '3D 暂不可用' : '3D 加载中…';
    }
    if (noteEl) noteEl.textContent = failed ? NOTE_FAIL : NOTE_OK;
  }

  function logWarn(err) {
    if (window.console && console.warn) console.warn('[viewer3d]', err);
  }

  function webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  function disposeObj(root) {
    root.traverse(function (n) {
      if (n.geometry) n.geometry.dispose();
      var mats = n.material;
      if (!mats) return;
      (Array.isArray(mats) ? mats : [mats]).forEach(function (m) {
        Object.keys(m).forEach(function (k) {
          var v = m[k];
          if (v && v.isTexture) v.dispose();
        });
        m.dispose();
      });
    });
  }

  function getBuffer(url) {
    if (!getBuffer.cache[url]) {
      /* priority:low —— 模型是锦上添花，别跟首屏的 CSS/字体/正文抢带宽 */
      getBuffer.cache[url] = fetch(url, { cache: 'force-cache', priority: 'low' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        }).catch(function (e) {
          delete getBuffer.cache[url];
          throw e;
        });
    }
    return getBuffer.cache[url];
  }
  getBuffer.cache = Object.create(null);

  /* ---------------- 能力检测 / 启动 ---------------- */
  if (!webglOK()) {
    setStatus('当前浏览器不支持 3D', 'fail');
    return;
  }

  function boot() {
    Promise.all([
      import('./vendor/three/build/three.module.min.js'),
      import('./vendor/three/examples/jsm/loaders/GLTFLoader.js'),
      import('./vendor/three/examples/jsm/libs/meshopt_decoder.module.js')
    ]).then(function (m) {
      run(m[0], m[1].GLTFLoader, m[2].MeshoptDecoder);
    }).catch(function (err) {
      logWarn(err);
      setStatus('3D 暂时不可用', 'fail');
    });
  }

  /* 3D 是增强不是刚需：先让页面把 load 走完，再挑浏览器空闲时加载，
     免得 three.js 和 1.2MB 模型跟首屏抢主线程和带宽。 */
  var booted = false;
  function scheduleBoot() {
    if (booted) return;
    booted = true;
    if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 2500 });
    else setTimeout(boot, 900);
  }

  if (document.readyState === 'complete') scheduleBoot();
  else {
    window.addEventListener('load', scheduleBoot, { once: true });
    /* 兜底：万一 load 迟迟不来，10 秒后也照常启动 */
    setTimeout(scheduleBoot, 10000);
  }

  /* ---------------- 主流程 ---------------- */
  function run(THREE, GLTFLoader, MeshoptDecoder) {
    loaderRef = new GLTFLoader();
    loaderRef.setMeshoptDecoder(MeshoptDecoder);
    setStatus('正在加载 3D 模型…', 'loading');

    getBuffer(MODEL_URL).then(function (buf) {
      /* 两个舞台各自 parse 一份：避免共享几何/材质带来的克隆问题 */
      var jobs = [];
      if (buddyStage) {
        jobs.push(buildStage(THREE, buf, buddyStage,
          document.getElementById('buddyCanvas')));
      }
      if (heroStage) {
        jobs.push(buildStage(THREE, buf, heroStage,
          document.getElementById('h3dCanvas')));
      }
      return Promise.all(jobs.map(function (p) {
        return p.catch(function (err) { logWarn(err); return null; });
      }));
    }).then(function (list) {
      var ok = list.filter(Boolean);
      if (!ok.length) throw new Error('没有可用的 3D 舞台');
      stages = ok;
      startLoop();
      /* 正文大舞台单独失败时，也要关掉它那侧的旋转按钮 */
      var heroOk = !heroStage || ok.some(function (s) { return s.host === heroStage; });
      setStatus(heroOk ? '3D 已就绪 · 拖拽旋转 · 滚轮缩放' : '3D 加载失败',
                heroOk ? 'ok' : 'fail');
    }).catch(function (err) {
      logWarn(err);
      setStatus('3D 加载失败', 'fail');
    });
  }

  /* ---------------- 单个舞台 ---------------- */
  function buildStage(THREE, buf, host, canvas) {
    return new Promise(function (resolve, reject) {
      if (!canvas) { reject(new Error('缺少 canvas')); return; }

      loaderRef.parse(buf, '', function (gltf) {
        var st;
        try {
          st = createStage(THREE, host, canvas);
          var obj = (gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]))) || null;
          if (!obj) throw new Error('模型内容为空');
          st.holder = normalize(st, obj);
          st.pivot.add(st.holder);
          resize(st);
          updateCamera(st);
          st.renderer.render(st.scene, st.camera);
        } catch (e) {
          reject(e);
          return;
        }
        st.ready = true;
        host.setAttribute('data-ready', '1');
        /* 侧栏舞台进入 3D 模式：script.js 会据此让出旋转控制权 */
        if (host === buddyStage) host.setAttribute('data-three', 'on');
        bind(st, host);
        resolve(st);
      }, function (err) {
        reject(err || new Error('模型解析失败'));
      });
    });
  }

  function createStage(THREE, host, canvas) {
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power'
      });
    } catch (e) { throw new Error('WebGL 初始化失败'); }

    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

    /* 白色主光 + 薄荷绿轮廓光 + 靛紫补光（与全站强调色一致） */
    var key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2.4, 3.4, 4.2);
    var rim = new THREE.DirectionalLight(0x64ffda, 2.0);
    rim.position.set(-3.2, 1.8, -3.4);
    var fill = new THREE.DirectionalLight(0xa5b4fc, 0.9);
    fill.position.set(-2.8, 0.8, 2.6);
    var hemi = new THREE.HemisphereLight(0xe6f6ff, 0x0a1730, 0.85);
    scene.add(key, rim, fill, hemi);

    var pivot = new THREE.Group();
    scene.add(pivot);

    host.setAttribute('data-zoom', '1.00');

    return {
      THREE: THREE,
      host: host,
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: camera,
      pivot: pivot,
      holder: null,        // 身体模型（默认在场）
      moodHolder: null,    // 表情模型（挂着表情时才在场，和身体二选一显示）
      modelH: 0,          // 首个模型定基准，后续表情模型对齐同一高度
      viewH: 1.4,
      viewHTo: 1.4,       // 目标视野高（取景平滑过渡用）
      needW: 0.5,
      focus: new THREE.Vector3(0, 0.6, 0),
      focusTo: new THREE.Vector3(0, 0.6, 0),
      isMood: false,      // 是否正显示表情模型（整模替换，二选一）
      moodIndex: -1,      // 正在显示第几个表情（-1 = 全身正面）
      az: 0.1, el: 0.05, zoom: 1, dist: 3,
      busy: 0,            // 正在换表情模型：暂停本舞台渲染，给解析让路
      vel: 0, resumeAt: 0,
      dragging: false,
      px: 0, py: 0, moved: 0, lastT: 0,
      ready: false, visible: true
    };
  }

  /* 统一落地 + 居中 + 统一高度：身体和表情模型都走这一套，
     两件摆位完全一致，整模替换时画面不跳、取景不动。 */
  function normalize(st, obj) {
    var THREE = st.THREE;
    var holder = new THREE.Group();
    holder.add(obj);

    var box = new THREE.Box3().setFromObject(holder);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    if (!(size.y > 0)) throw new Error('模型尺寸异常');

    if (!st.modelH) st.modelH = size.y;
    var s = st.modelH / size.y;                       // 表情模型和身体等高
    var oy = -box.min.y * s;                          // 落地

    /* 基准取景：胸口往上的半身特写，两个舞台一致；
       换表情时重算出来还是这几个值（同一角色、同一摆位），画面纹丝不动。
       needW 只留一点余量——窄画布时宁可让肩膀贴边，也别把纵向取景拉宽 */
    st.focusTo.set(0, st.modelH * FOCUS_CHEST, 0);
    st.viewHTo = st.modelH * VIEWH_CHEST;
    st.needW = Math.max(size.x, size.z) * s * 1.15;

    holder.scale.setScalar(s);
    holder.position.set(-center.x * s, oy, -center.z * s);

    if (!st.ready) {                                  // 首次建台直接就位，不做过渡
      st.focus.copy(st.focusTo);
      st.viewH = st.viewHTo;
    }
    return holder;
  }

  /* 取景过渡（建台、焦点随缩放下移），避免画面硬跳；
     用户开了“减少动态效果”就直接就位 */
  function smoothFraming(st, dt) {
    var moved = st.focus.distanceToSquared(st.focusTo) > 1e-8 ||
                Math.abs(st.viewH - st.viewHTo) > 1e-4;
    if (!moved) return;
    if (reduceMotion) {
      st.focus.copy(st.focusTo);
      st.viewH = st.viewHTo;
      computeDist(st, st.camera.aspect);
      return;
    }
    var k = 1 - Math.exp(-dt * 7);
    st.focus.lerp(st.focusTo, k);
    st.viewH += (st.viewHTo - st.viewH) * k;
    computeDist(st, st.camera.aspect);
  }

  function computeDist(st, aspect) {
    var vFov = st.camera.fov * Math.PI / 180;
    var d = (st.viewH / 2) / Math.tan(vFov / 2);
    var visW = st.viewH * aspect;
    if (visW > 0 && visW < st.needW) d *= st.needW / visW;
    st.dist = d;
  }

  /* 缩放统一走这里：数值越小离得越近。
     换表情是整模替换，身体和取景都没动，
     所以表情状态下缩放规则完全一样：缩到最远照样是完整全身（表情还在脸上）。 */
  function setZoom(st, z) {
    st.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
    /* 把当前缩放写到舞台上（1.00 = 默认取景），调试和测试都能直接看 */
    if (st.host) st.host.setAttribute('data-zoom', st.zoom.toFixed(2));
  }

  function resize(st) {
    var w = st.canvas.clientWidth;
    var h = st.canvas.clientHeight;
    if (!w || !h) return;
    st.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    st.renderer.setSize(w, h, false);
    var aspect = w / h;
    if (st.camera.aspect !== aspect) {
      st.camera.aspect = aspect;
      st.camera.updateProjectionMatrix();
    }
    computeDist(st, aspect);
  }

  /* 缩小（zoom > 1）时把镜头焦点顺着往下挪：
     否则画面只会“头顶越来越大片空背景”，腿脚永远进不来；
     缩到最远（ZOOM_MAX）正好是完整全身。表情状态下同样适用。 */
  function zoomFocusY(st) {
    if (!(st.zoom > 1)) return st.focus.y;
    var t = Math.min((st.zoom - 1) / (ZOOM_MAX - 1), 1);
    return st.focus.y - (FOCUS_CHEST - FOCUS_FULL) * st.modelH * t;
  }

  function updateCamera(st) {
    var d = st.dist * st.zoom;
    var ce = Math.cos(st.el);
    var se = Math.sin(st.el);
    var fy = zoomFocusY(st);
    st.camera.position.set(
      st.focus.x + d * ce * Math.sin(st.az),
      fy + d * se,
      st.focus.z + d * ce * Math.cos(st.az)
    );
    st.camera.lookAt(st.focus.x, fy, st.focus.z);
  }

  /* ---------------- 渲染循环（两个舞台共用一个 RAF） ---------------- */
  function startLoop() {
    var prev = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (document.hidden) return;

      for (var i = 0; i < stages.length; i++) {
        var st = stages[i];
        if (!st.ready || !st.visible || st.busy) continue;   // 换装中：这一格先不画，给解析让路

        if (st.dragging) {
          /* 拖拽中，姿态由事件处理 */
        } else if (Math.abs(st.vel) > 0.002) {
          st.az += st.vel * dt;
          st.vel *= Math.exp(-3.4 * dt);
          if (Math.abs(st.vel) < 0.01) st.vel = 0;
        } else if (!reduceMotion && now > st.resumeAt) {
          st.az += 0.16 * dt;        // 空闲自转
        }

        smoothFraming(st, dt);
        updateCamera(st);
        st.renderer.render(st.scene, st.camera);
      }
    }
    requestAnimationFrame(loop);
  }

  /* ---------------- 交互 ---------------- */
  function bind(st, host) {
    var pointers = Object.create(null);
    var pinch0 = 0;
    var zoom0 = 1;

    function count() { return Object.keys(pointers).length; }

    function pinchDist() {
      var ids = Object.keys(pointers);
      if (ids.length < 2) return 0;
      var a = pointers[ids[0]];
      var b = pointers[ids[1]];
      return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }

    host.addEventListener('pointerdown', function (e) {
      if (!st.ready) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() === 2) {
        pinch0 = pinchDist();
        zoom0 = st.zoom;
        st.dragging = false;
        return;
      }
      st.dragging = true;
      st.moved = 0;
      st.vel = 0;
      st.px = e.clientX;
      st.py = e.clientY;
      st.lastT = performance.now();
      try { host.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });

    host.addEventListener('pointermove', function (e) {
      if (!st.ready) return;
      var p = pointers[e.pointerId];
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;

      if (count() >= 2) {
        if (pinch0 > 0) {
          var d1 = pinchDist();
          if (d1 > 0) setZoom(st, zoom0 * pinch0 / d1);
        }
        return;
      }
      if (!st.dragging) return;

      var now = performance.now();
      var dx = e.clientX - st.px;
      var dy = e.clientY - st.py;
      var dt = Math.max((now - st.lastT) / 1000, 0.008);
      st.px = e.clientX;
      st.py = e.clientY;
      st.lastT = now;

      st.moved += Math.abs(dx) + Math.abs(dy);
      st.az -= dx * 0.008;                                  // 向右拖 = 正面往右转
      st.el = clamp(st.el + dy * 0.005, -0.3, 0.5);

      var inst = clamp((-dx * 0.008) / dt, -8, 8);
      st.vel = st.vel * 0.55 + inst * 0.45;
      st.resumeAt = now + 2400;
    });

    function endPointer(e) {
      delete pointers[e.pointerId];
      if (count() < 2) pinch0 = 0;
      if (!st.dragging) return;
      st.dragging = false;
      try { host.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (st.moved < 6) st.vel = 0;      // 点一下不该甩起来
      st.resumeAt = performance.now() + 2400;

      /* 正文：点身体（没拖动）→ 摘掉表情头回到正面 */
      if (st.moved < 6 && host === heroStage &&
          heroStage.getAttribute('data-mood') === 'model') {
        var rect = host.getBoundingClientRect();
        if ((e.clientY - rect.top) / rect.height > 0.45) clearHeroMood();
      }
    }

    host.addEventListener('pointerup', endPointer);
    host.addEventListener('pointercancel', endPointer);

    /* 滚轮缩放：只有指针落在舞台上时才接管页面滚动 */
    host.addEventListener('wheel', function (e) {
      if (!st.ready) return;
      e.preventDefault();
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;         // 行模式
      else if (e.deltaMode === 2) dy *= 400;   // 页模式
      setZoom(st, st.zoom * Math.exp(dy * 0.0015));
      st.resumeAt = performance.now() + 1400;
    }, { passive: false });

    /* 键盘：左右方向键转模型（平面模式下交给 script.js） */
    host.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (host.getAttribute('data-three') !== 'on') return;
      e.preventDefault();
      st.vel = e.key === 'ArrowLeft' ? 5.1 : -5.1;
      st.resumeAt = performance.now() + 1600;
    });

    canvasLost(st);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        st.visible = entries[0].isIntersecting;
      }, { rootMargin: '160px' }).observe(host);
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { resize(st); }).observe(host);
    } else {
      window.addEventListener('resize', function () { resize(st); });
    }
  }

  function canvasLost(st) {
    st.canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      st.ready = false;
      st.host.removeAttribute('data-ready');
      st.host.removeAttribute('data-three');   // 退回平面图交互
      setStatus('3D 已暂停', 'fail');
    });
  }

  /* 让在途的表情模型切换作废：用户已经改主意了，旧的别再落地 */
  function bumpSeq(st) { if (st) st.swapSeq = (st.swapSeq || 0) + 1; }

  /* ---------------- 表情（整模替换，不拼接所以没有接缝） ---------------- */
  function findStage(host) {
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].host === host) return stages[i];
    }
    return null;
  }

  /* 载入一个表情模型挂上去：它是完整的全身像，整个模型换掉，
     身体那件先藏起来（回正面再拿回来），所以两件从不拼在一起 */
  function swapMood(st, url, onOk, onFail) {
    /* 顺序号：连点两个表情时，只认最后一次切换 */
    var seq = (st.swapSeq = (st.swapSeq || 0) + 1);
    /* 换装期间这一格先不渲染（画面停在上一帧），
       否则渲染循环会把模型解析切碎、白白拖慢切换；10 秒兜底自动恢复 */
    st.busy = seq;
    var settle = function () { if (st.busy === seq) st.busy = 0; };
    setTimeout(function () { if (st.busy === seq) st.busy = 0; }, 10000);

    getBuffer(url).then(function (buf) {
      return new Promise(function (resolve, reject) {
        loaderRef.parse(buf, '', function (gltf) {
          resolve((gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]))) || null);
        }, reject);
      });
    }).then(function (scene) {
      if (seq !== st.swapSeq) { settle(); return; }   // 已被更新的一次切换取代
      if (!scene) throw new Error('表情模型为空');
      var holder = normalize(st, scene);
      if (st.moodHolder) {                            // 换过表情：丢掉上一个
        st.pivot.remove(st.moodHolder);
        disposeObj(st.moodHolder);
      }
      st.moodHolder = holder;
      st.pivot.add(holder);
      st.isMood = true;
      showModel(st);                                  // 表情整模上场，身体让位
      settle();
      resize(st);
      updateCamera(st);
      st.renderer.render(st.scene, st.camera);
      if (onOk) onOk();
    }).catch(function (err) {
      settle();
      logWarn(err);                             // 换不了就保持当前形象
      if (seq === st.swapSeq && onFail) onFail();
    });
  }

  /* 摘掉表情回到正面：把表情模型丢掉、身体显示出来即可，
     取景、缩放、旋转状态全部原样保留 */
  function restoreBase(st) {
    bumpSeq(st);                                // 在途的表情加载一并作废
    if (st.moodHolder) {
      st.pivot.remove(st.moodHolder);
      disposeObj(st.moodHolder);
      st.moodHolder = null;
    }
    st.isMood = false;
    showModel(st);
    if (st.ready) {
      updateCamera(st);
      st.renderer.render(st.scene, st.camera);
    }
  }

  /* 显示哪一件：挂着表情就显示表情模型、藏起身体，回正面反过来。
     两件都是完整模型，只是显隐切换 —— 没有裁切、没有拼接，也就没有接缝。 */
  function showModel(st) {
    if (st.moodHolder) st.moodHolder.visible = st.isMood;
    if (st.holder) st.holder.visible = !st.isMood;
  }

  function bindMoodProtocol() {
    /* 侧栏：script.js 换表情时广播过来，有表情模型就整模换上；
       index:-1 = 点身体回正，换回身体那件 */
    if (buddyStage) {
      buddyStage.addEventListener('buddymood', function (e) {
        var i = (e && e.detail && e.detail.index) | 0;
        var st = findStage(buddyStage);
        bumpSeq(st);                          // 这次意图优先，作废在途切换
        if (!st) return;

        if (i < 0) {                          /* 回正面全身：换回身体那件 */
          restoreBase(st);
          buddyStage.setAttribute('data-mood', '');
          return;
        }

        var url = MOOD_MODELS[i];
        if (!url) return;
        swapMood(st, url, function () {
          buddyStage.setAttribute('data-mood', 'model');
        }, null);
      });
    }

    /* 正文：缩略按钮 */
    if (moodsEl) {
      moodsEl.addEventListener('click', function (e) {
        var t = e.target;
        var b = t && t.closest ? t.closest('button[data-mood]') : null;
        if (!b) return;
        selectHeroMood(parseInt(b.getAttribute('data-mood'), 10) || 0);
      });
    }

    /* 正文：转一下（转 90°，键盘也能用） */
    if (rotBtn) {
      rotBtn.addEventListener('click', function () {
        var st = findStage(heroStage);
        if (!st || !st.ready) return;
        if (reduceMotion) {
          st.az -= Math.PI / 2;
        } else {
          st.vel = -5.1;
          st.resumeAt = performance.now() + 1600;
        }
      });
    }

    bindZoomButtons();
  }

  /* 正文：＋ / − 缩放按钮（滚轮、双指捏合之外的第三种缩放方式，键盘也好按） */
  function bindZoomButtons() {
    function step(dir) {
      var st = heroStage ? findStage(heroStage) : null;
      if (!st || !st.ready) return;
      setZoom(st, st.zoom * Math.pow(1.28, dir));   // -1 = 拉近，+1 = 拉远
      st.resumeAt = performance.now() + 2400;
    }
    if (zoomInBtn) zoomInBtn.addEventListener('click', function () { step(-1); });
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { step(1); });
  }

  function clearMoodButtons() {
    if (!moodsEl) return;
    var btns = moodsEl.querySelectorAll('button[data-mood]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', 'false');
  }

  /* 把表情按钮恢复成“当前实际显示的那个” */
  function markMoodButtons(cur) {
    if (!moodsEl) return;
    var btns = moodsEl.querySelectorAll('button[data-mood]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', i === cur ? 'true' : 'false');
    }
  }

  function clearHeroMood() {
    if (!heroStage) return;
    var st = findStage(heroStage);
    bumpSeq(st);                          // 在途的表情模型作废
    heroStage.setAttribute('data-mood', '');
    if (st) st.moodIndex = -1;
    clearMoodButtons();
    setStatus('3D 已就绪 · 拖拽旋转 · 滚轮缩放', 'ok');
    /* 正挂着表情 → 换回身体那件；取景和旋转本来就没动过，画面只是脸换回来 */
    if (st && st.isMood) restoreBase(st);
  }

  function selectHeroMood(i) {
    if (!heroStage) return;
    markMoodButtons(i);

    var st = findStage(heroStage);
    bumpSeq(st);                            // 以这次点击为准
    var url = MOOD_MODELS[i];

    if (st && url) {
      setStatus('正在切换表情：' + MOOD_LABEL[i], 'ok');
      swapMood(st, url, function () {
        st.moodIndex = i;
        heroStage.setAttribute('data-mood', 'model');
        setStatus('当前表情：' + MOOD_LABEL[i] + ' · 3D', 'ok');
      }, function () {
        /* 这个表情的模型没换上：按钮回滚到正在显示的那个表情 */
        var cur = (typeof st.moodIndex === 'number' && st.moodIndex >= 0) ? st.moodIndex : -1;
        markMoodButtons(cur);
        heroStage.setAttribute('data-mood', cur >= 0 ? 'model' : '');
        setStatus('这个表情没加载上 · 保持当前形象', 'ok');
      });
      return;
    }

    setStatus('3D 不可用，无法切换表情', failed ? 'fail' : 'ok');
  }

  /* 表情 / 旋转 / 缩放按钮一上来就绑好；3D 挂了时这些按钮会整排藏起来 */
  bindMoodProtocol();
})();
