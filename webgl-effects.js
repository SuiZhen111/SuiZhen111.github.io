/* ============================================================
   WebGL 视觉特效（原生 WebGL2 移植，无需任何第三方库）
   1) Grainient：全屏流动渐变噪声背景
   2) MagicRings：首屏扩散光环
   均带性能保护：页面隐藏/滚出视口自动暂停；DPR 上限 2；
   系统"减少动态"时只渲染静帧；WebGL 不可用时自动隐藏。
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var VS3 = '#version 300 es\n' +
    'in vec2 position;\n' +
    'void main(){ gl_Position = vec4(position, 0.0, 1.0); }';

  var VS1 = 'attribute vec2 position;\n' +
    'void main(){ gl_Position = vec4(position, 0.0, 1.0); }';

  function hexToRgb(hex) {
    var r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
      ? [parseInt(r[1], 16) / 255, parseInt(r[2], 16) / 255, parseInt(r[3], 16) / 255]
      : [1, 1, 1];
  }

  function initGL(canvas, vsSrc, fsSrc) {
    var gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, premultipliedAlpha: false
    });
    if (!gl) return null;

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
      return s;
    }
    var v = sh(gl.VERTEX_SHADER, vsSrc);
    var f = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!v || !f) return null;

    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    gl.useProgram(p);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(p, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    return { gl: gl, prog: p };
  }

  function uMap(gl, prog, names) {
    var U = {};
    names.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    return U;
  }

  /* ================= Grainient：全屏流动渐变背景 ================= */
  var GRAINIENT_FRAG =
'#version 300 es\n' +
'precision highp float;\n' +
'uniform vec2 iResolution;\n' +
'uniform float iTime;\n' +
'uniform float uTimeSpeed;\n' +
'uniform float uColorBalance;\n' +
'uniform float uWarpStrength;\n' +
'uniform float uWarpFrequency;\n' +
'uniform float uWarpSpeed;\n' +
'uniform float uWarpAmplitude;\n' +
'uniform float uBlendAngle;\n' +
'uniform float uBlendSoftness;\n' +
'uniform float uRotationAmount;\n' +
'uniform float uNoiseScale;\n' +
'uniform float uGrainAmount;\n' +
'uniform float uGrainScale;\n' +
'uniform float uGrainAnimated;\n' +
'uniform float uContrast;\n' +
'uniform float uGamma;\n' +
'uniform float uSaturation;\n' +
'uniform vec2 uCenterOffset;\n' +
'uniform float uZoom;\n' +
'uniform vec3 uColor1;\n' +
'uniform vec3 uColor2;\n' +
'uniform vec3 uColor3;\n' +
'uniform float uLightMode;\n' +
'out vec4 fragColor;\n' +
'#define S(a,b,t) smoothstep(a,b,t)\n' +
'mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}\n' +
'vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}\n' +
'float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}\n' +
'void mainImage(out vec4 o, vec2 C){\n' +
'  float t=iTime*uTimeSpeed;\n' +
'  vec2 uv=C/iResolution.xy;\n' +
'  float ratio=iResolution.x/iResolution.y;\n' +
'  vec2 tuv=uv-0.5+uCenterOffset;\n' +
'  tuv/=max(uZoom,0.001);\n' +
'  float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*uNoiseScale);\n' +
'  tuv.y*=1.0/ratio;\n' +
'  tuv*=Rot(radians((degree-0.5)*uRotationAmount+180.0));\n' +
'  tuv.y*=ratio;\n' +
'  float frequency=uWarpFrequency;\n' +
'  float ws=max(uWarpStrength,0.001);\n' +
'  float amplitude=uWarpAmplitude/ws;\n' +
'  float warpTime=t*uWarpSpeed;\n' +
'  tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;\n' +
'  tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*0.5);\n' +
'  vec3 colLav=uColor1;\n' +
'  vec3 colOrg=uColor2;\n' +
'  vec3 colDark=uColor3;\n' +
'  float b=uColorBalance;\n' +
'  float s=max(uBlendSoftness,0.0);\n' +
'  mat2 blendRot=Rot(radians(uBlendAngle));\n' +
'  float blendX=(tuv*blendRot).x;\n' +
'  float edge0=-0.3-b-s;\n' +
'  float edge1=0.2-b+s;\n' +
'  float v0=0.5-b+s;\n' +
'  float v1=-0.3-b-s;\n' +
'  vec3 layer1=mix(colDark,colOrg,S(edge0,edge1,blendX));\n' +
'  vec3 layer2=mix(colOrg,colLav,S(edge0,edge1,blendX));\n' +
'  vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));\n' +
'  vec2 grainUv=uv*max(uGrainScale,0.001);\n' +
'  if(uGrainAnimated>0.5){grainUv+=vec2(iTime*0.05);}\n' +
'  float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);\n' +
'  col+=(grain-0.5)*uGrainAmount;\n' +
'  col=(col-0.5)*uContrast+0.5;\n' +
'  float luma=dot(col,vec3(0.2126,0.7152,0.0722));\n' +
'  col=mix(vec3(luma),col,uSaturation);\n' +
'  col=pow(max(col,0.0),vec3(1.0/max(uGamma,0.001)));\n' +
'  col=clamp(col,0.0,1.0);\n' +
'  if(uLightMode>0.5){\n' +
'    float energy=max(max(col.r,col.g),col.b);\n' +
'    vec3 hue=col/max(energy,0.001);\n' +
'    float chroma=length(col-vec3(dot(col,vec3(0.333333))));\n' +
'    float coverage=clamp(0.12+chroma*1.15+energy*0.18,0.0,0.88);\n' +
'    col=mix(vec3(1.0),clamp(hue*0.58+col*0.18,0.0,1.0),coverage);\n' +
'  }\n' +
'  o=vec4(col,1.0);\n' +
'}\n' +
'void main(){\n' +
'  vec4 o=vec4(0.0);\n' +
'  mainImage(o,gl_FragCoord.xy);\n' +
'  fragColor=o;\n' +
'}\n';

  function initBackground() {
    var canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    var ctx = initGL(canvas, VS3, GRAINIENT_FRAG);
    if (!ctx) { canvas.style.display = 'none'; return; }
    var gl = ctx.gl;

    var U = uMap(gl, ctx.prog, ['iResolution', 'iTime', 'uTimeSpeed', 'uColorBalance',
      'uWarpStrength', 'uWarpFrequency', 'uWarpSpeed', 'uWarpAmplitude', 'uBlendAngle',
      'uBlendSoftness', 'uRotationAmount', 'uNoiseScale', 'uGrainAmount', 'uGrainScale',
      'uGrainAnimated', 'uContrast', 'uGamma', 'uSaturation', 'uCenterOffset', 'uZoom',
      'uColor1', 'uColor2', 'uColor3', 'uLightMode']);

    /* 深海极光配色：暗部为站点底色，保证前景文字可读 */
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      var w = Math.max(1, Math.floor(window.innerWidth * dpr));
      var h = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    resize();
    window.addEventListener('resize', resize);

    gl.uniform1f(U.uTimeSpeed, 0.22);
    gl.uniform1f(U.uColorBalance, 0.0);
    gl.uniform1f(U.uWarpStrength, 1.4);
    gl.uniform1f(U.uWarpFrequency, 4.0);
    gl.uniform1f(U.uWarpSpeed, 1.8);
    gl.uniform1f(U.uWarpAmplitude, 55.0);
    gl.uniform1f(U.uBlendAngle, 60.0);
    gl.uniform1f(U.uBlendSoftness, 0.35);
    gl.uniform1f(U.uRotationAmount, 420.0);
    gl.uniform1f(U.uNoiseScale, 2.2);
    gl.uniform1f(U.uGrainAmount, 0.05);
    gl.uniform1f(U.uGrainScale, 2.5);
    gl.uniform1f(U.uGrainAnimated, 0.0);
    gl.uniform1f(U.uContrast, 1.3);
    gl.uniform1f(U.uGamma, 1.05);
    gl.uniform1f(U.uSaturation, 0.9);
    gl.uniform2f(U.uCenterOffset, 0.0, 0.0);
    gl.uniform1f(U.uZoom, 0.7);
    var c1 = hexToRgb('#1a7268'), c2 = hexToRgb('#1c4266'), c3 = hexToRgb('#0e1c33');
    gl.uniform3f(U.uColor1, c1[0], c1[1], c1[2]);
    gl.uniform3f(U.uColor2, c2[0], c2[1], c2[2]);
    gl.uniform3f(U.uColor3, c3[0], c3[1], c3[2]);
    gl.uniform1f(U.uLightMode, 0.0);

    function render(t) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.iTime, t);
      gl.uniform2f(U.iResolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    if (reduceMotion) { render(3.0); return; }

    var t0 = performance.now();
    var raf = 0;
    function loop(now) {
      render((now - t0) * 0.001);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (raf === 0 && !document.hidden) raf = requestAnimationFrame(loop); }
    function stop() { if (raf !== 0) { cancelAnimationFrame(raf); raf = 0; } }
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });
    start();
  }

  /* ================= MagicRings：首屏扩散光环 ================= */
  var RINGS_FRAG =
'precision highp float;\n' +
'uniform float uTime, uAttenuation, uLineThickness;\n' +
'uniform float uBaseRadius, uRadiusStep, uScaleRate;\n' +
'uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;\n' +
'uniform float uFadeIn, uFadeOut;\n' +
'uniform float uMouseInfluence, uHoverAmount, uHoverScale, uParallax, uBurst;\n' +
'uniform float uCoverageAlpha;\n' +
'uniform vec2 uResolution, uMouse;\n' +
'uniform vec3 uColor, uColorTwo;\n' +
'uniform int uRingCount;\n' +
'const float HP = 1.5707963;\n' +
'const float CYCLE = 3.45;\n' +
'float fade(float t) {\n' +
'  return t < uFadeIn ? smoothstep(0.0, uFadeIn, t) : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, t);\n' +
'}\n' +
'float ring(vec2 p, float ri, float cut, float t0, float px) {\n' +
'  float t = mod(uTime + t0, CYCLE);\n' +
'  float r = ri + t / CYCLE * uScaleRate;\n' +
'  float d = abs(length(p) - r);\n' +
'  float a = atan(abs(p.y), abs(p.x)) / HP;\n' +
'  float th = max(1.0 - a, 0.5) * px * uLineThickness;\n' +
'  float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;\n' +
'  d += pow(cut * a, 3.0) * r;\n' +
'  return h * exp(-uAttenuation * d) * fade(t);\n' +
'}\n' +
'void main() {\n' +
'  float px = 1.0 / min(uResolution.x, uResolution.y);\n' +
'  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) * px;\n' +
'  float cr = cos(uRotation), sr = sin(uRotation);\n' +
'  p = mat2(cr, -sr, sr, cr) * p;\n' +
'  p -= uMouse * uMouseInfluence;\n' +
'  float sc = mix(1.0, uHoverScale, uHoverAmount) + uBurst * 0.3;\n' +
'  p /= sc;\n' +
'  vec3 c = vec3(0.0);\n' +
'  float coverage = 0.0;\n' +
'  float rcf = max(float(uRingCount) - 1.0, 1.0);\n' +
'  for (int i = 0; i < 10; i++) {\n' +
'    if (i >= uRingCount) break;\n' +
'    float fi = float(i);\n' +
'    vec2 pr = p - fi * uParallax * uMouse;\n' +
'    vec3 rc = mix(uColor, uColorTwo, fi / rcf);\n' +
'    float ringAmount = ring(pr, uBaseRadius + fi * uRadiusStep, pow(uRingGap, fi), i == 0 ? 0.0 : 2.95 * fi, px);\n' +
'    c = mix(c, rc, vec3(ringAmount));\n' +
'    coverage = max(coverage, ringAmount);\n' +
'  }\n' +
'  c *= 1.0 + uBurst * 2.0;\n' +
'  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);\n' +
'  c += (n - 0.5) * uNoiseAmount;\n' +
'  float intensity = max(c.r, max(c.g, c.b));\n' +
'  vec3 emissiveColor = intensity > 0.0001 ? clamp(c / intensity, 0.0, 1.0) : vec3(0.0);\n' +
'  vec3 outputColor = mix(emissiveColor, clamp(c, 0.0, 1.0), uCoverageAlpha);\n' +
'  float outputAlpha = mix(intensity, coverage, uCoverageAlpha);\n' +
'  gl_FragColor = vec4(outputColor, clamp(outputAlpha * uOpacity, 0.0, 1.0));\n' +
'}\n';

  function initRings() {
    var canvas = document.querySelector('.rings-canvas');
    if (!canvas) return;
    var ctx = initGL(canvas, VS1, RINGS_FRAG);
    if (!ctx) { canvas.style.display = 'none'; return; }
    var gl = ctx.gl;

    var U = uMap(gl, ctx.prog, ['uTime', 'uAttenuation', 'uLineThickness', 'uBaseRadius',
      'uRadiusStep', 'uScaleRate', 'uOpacity', 'uNoiseAmount', 'uRotation', 'uRingGap',
      'uFadeIn', 'uFadeOut', 'uMouseInfluence', 'uHoverAmount', 'uHoverScale', 'uParallax',
      'uBurst', 'uCoverageAlpha', 'uResolution', 'uMouse', 'uColor', 'uColorTwo', 'uRingCount']);

    /* 头像彩蛋：监听爆发事件 */
    var burst = 0;
    document.addEventListener('avatar:burst', function () { burst = 1; });

    function resize() {
      var w = Math.max(1, canvas.clientWidth);
      var h = Math.max(1, canvas.clientHeight);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    var c1 = hexToRgb('#64ffda'), c2 = hexToRgb('#a5b4fc');
    gl.uniform1f(U.uAttenuation, 20.0);
    gl.uniform1f(U.uLineThickness, 1.4);
    gl.uniform1f(U.uBaseRadius, 0.30);
    gl.uniform1f(U.uRadiusStep, 0.09);
    gl.uniform1f(U.uScaleRate, 0.085);
    gl.uniform1f(U.uOpacity, 0.5);
    gl.uniform1f(U.uNoiseAmount, 0.0);
    gl.uniform1f(U.uRotation, 0.0);
    gl.uniform1f(U.uRingGap, 1.5);
    gl.uniform1f(U.uFadeIn, 0.7);
    gl.uniform1f(U.uFadeOut, 0.5);
    gl.uniform1f(U.uMouseInfluence, 0.0);
    gl.uniform1f(U.uHoverAmount, 0.0);
    gl.uniform1f(U.uHoverScale, 1.0);
    gl.uniform1f(U.uParallax, 0.0);
    gl.uniform1f(U.uBurst, 0.0);
    gl.uniform1f(U.uCoverageAlpha, 0.0);
    gl.uniform2f(U.uResolution, 1, 1);
    gl.uniform2f(U.uMouse, 0, 0);
    gl.uniform3f(U.uColor, c1[0], c1[1], c1[2]);
    gl.uniform3f(U.uColorTwo, c2[0], c2[1], c2[2]);
    gl.uniform1i(U.uRingCount, 3);

    var elapsed = 0;
    var lastT = 0;
    var raf = 0;

    function render() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uTime, elapsed);
      gl.uniform2f(U.uResolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function loop(now) {
      var dt = lastT === 0 ? 0 : Math.min(now - lastT, 100);
      lastT = now;
      elapsed += dt * 0.001 * 0.55;
      burst *= 0.95;
      if (burst < 0.001) burst = 0;
      gl.uniform1f(U.uBurst, burst);
      render();
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (raf === 0 && !document.hidden && !reduceMotion) {
        lastT = 0;
        raf = requestAnimationFrame(loop);
      }
    }
    function stop() { if (raf !== 0) { cancelAnimationFrame(raf); raf = 0; } }

    if (reduceMotion) { elapsed = 1.4; render(); return; }

    /* 滚出视口或页面隐藏时暂停 */
    var inView = true;
    var io = new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      (inView && !document.hidden) ? start() : stop();
    }, { threshold: 0 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : (inView ? start() : 0);
    });
    start();
  }

  initBackground();
  initRings();
})();
