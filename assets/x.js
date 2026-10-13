/* Xenith Capital: the instrument.
   WebGL2 Earth lit by the real sun, light streams between financial centers, orbiting capabilities, glass readouts.
   Every panel is an illustrative simulation. No network, no storage, no cookies, no third parties. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('live')) return;
  var cv = document.getElementById('gl');
  var gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl || !window.XL || !window.XO) { root.classList.remove('live'); return; }

  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var DEG = Math.PI / 180;

  /* ================= data ================= */
  function decode(b64) {
    var r = atob(b64), n = r.length >> 2, out = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var la = ((r.charCodeAt(4 * i) | r.charCodeAt(4 * i + 1) << 8) << 16 >> 16) / 100 * DEG;
      var lo = ((r.charCodeAt(4 * i + 2) | r.charCodeAt(4 * i + 3) << 8) << 16 >> 16) / 100 * DEG;
      out[3 * i] = Math.cos(la) * Math.sin(lo); out[3 * i + 1] = Math.sin(la); out[3 * i + 2] = Math.cos(la) * Math.cos(lo);
    }
    return out;
  }
  function vec(lat, lon) { lat *= DEG; lon *= DEG; return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]; }
  var LAND = decode(window.XL), OCEAN = decode(window.XO);
  var CITIES = [
    { k: 'NYC', la: 40.71, lo: -74.01 }, { k: 'LON', la: 51.51, lo: -0.13 }, { k: 'FRA', la: 50.11, lo: 8.68 },
    { k: 'TYO', la: 35.68, lo: 139.69 }, { k: 'HKG', la: 22.32, lo: 114.17 }, { k: 'CHI', la: 41.88, lo: -87.63 },
    { k: 'AUS', la: 30.27, lo: -97.74, hq: 1 }
  ];
  CITIES.forEach(function (c) { c.v = vec(c.la, c.lo); });

  /* ================= GL helpers ================= */
  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function prog(vs, fs) {
    var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var a = gl.getActiveUniform(p, i), nm = a.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, a.name); }
    return { p: p, u: u };
  }
  var FS_TRI = '#version 300 es\nout vec2 v;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));v=p;gl_Position=vec4(p*2.-1.,0.,1.);}';

  var P_PTS = prog(
    '#version 300 es\nprecision highp float;\n' +
    'layout(location=0) in vec3 a_p; layout(location=1) in vec4 a_c; layout(location=2) in vec2 a_sm;\n' +
    'uniform mat3 u_M; uniform mat3 u_S; uniform vec2 u_c; uniform vec2 u_res; uniform float u_f; uniform float u_D; uniform float u_ps; uniform float u_t; uniform float u_conv; uniform vec3 u_sun; uniform vec3 u_city[7]; uniform float u_sw;\n' +
    'out vec3 v_c;\n' +
    'float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}\n' +
    'void main(){\n' +
    ' float m=a_sm.y; vec3 e=a_p; vec3 p;\n' +
    ' if(m>1.5&&m<2.5) p=u_S*e; else if(m>3.5) p=e; else p=u_M*e;\n' +
    ' float k=u_conv*u_conv; if(m<1.5||(m>2.5&&m<3.5)) p=mix(p,vec3(0.),k);\n' +
    ' vec3 C=vec3(0.,0.,u_D); vec3 d=p-C; float A=dot(d,d),B=2.*dot(C,d),CC=dot(C,C)-1.; float ds=B*B-4.*A*CC; float occ=0.;\n' +
    ' if(ds>0.&&k<0.5){float t1=(-B-sqrt(ds))/(2.*A); if(t1>0.&&t1<0.992) occ=1.;}\n' +
    ' float z=u_D-p.z; vec2 s=u_c+p.xy*u_f/z;\n' +
    ' gl_Position=vec4(s/u_res*2.-1.,0.,1.);\n' +
    ' float sz=a_sm.x*u_ps*(u_D-1.)/max(z,0.2);\n' +
    ' vec3 col;\n' +
    ' if(m<0.5){\n' +
    '  float fr=clamp(dot(normalize(p),normalize(C-p)),0.,1.);\n' +
    '  float L=dot(e,u_sun); float day=smoothstep(-0.10,0.32,L); float hh=h(e);\n' +
    '  vec3 cy=vec3(0.16,0.86,1.0), vi=vec3(0.46,0.36,1.0), mg=vec3(0.85,0.30,1.0);\n' +
    '  vec3 ir=mix(mix(mg,vi,smoothstep(0.04,0.42,fr)),cy,smoothstep(0.42,0.92,fr));\n' +
    '  col=ir*(0.10+2.1*day)*(0.75+0.5*hh)*(0.5+0.5*fr);\n' +
    '  float near=0.; for(int i=0;i<7;i++){near=max(near,smoothstep(0.9965,0.99985,dot(e,u_city[i])));}\n' +
    '  float town=step(0.93,hh)*(0.5+fract(hh*91.7));\n' +
    '  col+=vec3(1.0,0.62,0.30)*(town*2.6+near*5.0)*(1.-day)*(0.55+0.45*fr);\n' +
    '  float lo=atan(e.x,e.z); float dl=abs(mod(lo-u_sw+3.14159265,6.2831853)-3.14159265);\n' +
    '  float sd=mod(u_sw-lo+3.14159265,6.2831853)-3.14159265; float tr=sd>0.?exp(-sd*5.)*0.35:0.;\n' +
    '  col+=vec3(0.35,1.0,0.75)*(exp(-dl*dl*120.)*2.0+tr)*(0.5+0.5*fr);\n' +
    '  if(occ>0.5) col=vi*0.035;\n' +
    '  if(m<-0.5) col*=0.13;\n' +
    ' } else if(m<1.5){\n' +
    '  float L=dot(e,u_sun); float day=smoothstep(-0.1,0.45,L);\n' +
    '  col=vec3(0.18,0.42,1.0)*(0.035+0.16*day); if(occ>0.5) col=vec3(0.);\n' +
    ' } else if(m<2.5){\n' +
    '  col=a_c.rgb*a_c.a*(0.65+0.35*sin(u_t*0.9+h(e)*60.)); if(occ>0.5) col=vec3(0.);\n' +
    ' } else {\n' +
    '  col=a_c.rgb*a_c.a; if(occ>0.5) col*=(m>3.5?0.1:0.06);\n' +
    ' }\n' +
    ' col*=1.+k*5.;\n' +
    ' v_c=col; gl_PointSize=max(sz,1.);\n' +
    '}',
    '#version 300 es\nprecision mediump float; in vec3 v_c; out vec4 o;\n' +
    'void main(){vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard; o=vec4(v_c*exp(-r*3.2),1.);}'
  );

  var P_ATM = prog(FS_TRI,
    '#version 300 es\nprecision highp float; in vec2 v; out vec4 o;\n' +
    'uniform vec2 u_c; uniform float u_R; uniform vec3 u_sv; uniform float u_conv;\n' +
    'void main(){\n' +
    ' vec2 q=(gl_FragCoord.xy-u_c)/u_R; float r=length(q); vec3 col=vec3(0.);\n' +
    ' vec2 dir=r>1e-4?q/r:vec2(0.);\n' +
    ' float sunSide=0.30+0.70*smoothstep(-0.55,0.85,dot(dir,normalize(u_sv.xy+1e-5))*0.8+u_sv.z*0.25);\n' +
    ' if(r<1.){ vec3 n=vec3(q,sqrt(1.-r*r)); float L=dot(n,u_sv); float day=smoothstep(-0.15,0.55,L);\n' +
    '  col+=vec3(0.02,0.09,0.26)*(0.10+1.35*day);\n' +
    '  col+=vec3(0.20,0.60,1.0)*pow(r,9.)*0.75*sunSide; }\n' +
    ' else { float g=exp(-(r-1.)*16.)*1.0+exp(-(r-1.)*4.5)*0.06; col+=mix(vec3(0.30,0.32,1.0),vec3(0.15,0.70,1.0),sunSide)*g*sunSide; }\n' +
    ' col*=1.-u_conv;\n' +
    ' o=vec4(col,1.);\n' +
    '}');

  var P_BRIGHT = prog(FS_TRI,
    '#version 300 es\nprecision highp float; in vec2 v; out vec4 o; uniform sampler2D u_t; uniform vec2 u_px; uniform float u_th;\n' +
    'void main(){ vec3 c=(texture(u_t,v+u_px*vec2(-1.,-1.)).rgb+texture(u_t,v+u_px*vec2(1.,-1.)).rgb+texture(u_t,v+u_px*vec2(-1.,1.)).rgb+texture(u_t,v+u_px*vec2(1.,1.)).rgb)*0.25;\n' +
    ' float l=max(c.r,max(c.g,c.b)); o=vec4(c*max(l-u_th,0.)/max(l,1e-4),1.);}');

  var P_BLUR = prog(FS_TRI,
    '#version 300 es\nprecision highp float; in vec2 v; out vec4 o; uniform sampler2D u_t; uniform vec2 u_dir;\n' +
    'void main(){ vec3 c=texture(u_t,v).rgb*0.2270270;\n' +
    ' c+=(texture(u_t,v+u_dir*1.3846154).rgb+texture(u_t,v-u_dir*1.3846154).rgb)*0.3162162;\n' +
    ' c+=(texture(u_t,v+u_dir*3.2307692).rgb+texture(u_t,v-u_dir*3.2307692).rgb)*0.0702703; o=vec4(c,1.);}');

  var P_COMP = prog(FS_TRI,
    '#version 300 es\nprecision highp float; in vec2 v; out vec4 o; uniform sampler2D u_s; uniform sampler2D u_b1; uniform sampler2D u_b2; uniform float u_flash; uniform float u_gl; uniform float u_gy; uniform float u_gh; uniform float u_gs; uniform float u_dpr;\n' +
    'vec3 S(vec2 v){return texture(u_s,v).rgb+texture(u_b1,v).rgb*0.85+texture(u_b2,v).rgb*0.4;}\n' +
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}\n' +
    'void main(){ vec2 uv=v; float band=step(abs(uv.y-u_gy),u_gh)*u_gl; uv.x+=(u_gs-0.5)*0.07*band; uv.y+=sin(uv.x*90.+u_gs*40.)*0.002*band;\n' +
    ' vec2 dr=(uv-0.5); float ca=0.0016+0.009*u_gl;\n' +
    ' vec3 c=vec3(S(uv+dr*ca).r,S(uv).g,S(uv-dr*ca).b)+vec3(u_flash)*vec3(1.0,0.75,0.95);\n' +
    ' c+=vec3(1.0,0.2,0.85)*band*0.06;\n' +
    ' c=aces(c*1.12); vec2 q=v-0.5; c*=1.-dot(q,q)*0.45; c*=0.965+0.035*step(0.5,fract(gl_FragCoord.y/(2.*u_dpr)));\n' +
    ' float n=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715)))); c+=(n-0.5)/255.;\n' +
    ' o=vec4(c,1.);}');

  /* render targets: half-float HDR when the GPU allows, 8-bit otherwise */
  var HDR = !!gl.getExtension('EXT_color_buffer_float');
  function makeRT(w, h) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, HDR ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    return { t: t, f: f, w: w, h: h, ok: ok };
  }
  var RT = {};
  function freeRT() { for (var k in RT) { gl.deleteTexture(RT[k].t); gl.deleteFramebuffer(RT[k].f); } RT = {}; }
  function buildRT(w, h) {
    freeRT();
    RT.s = makeRT(w, h);
    if (!RT.s.ok && HDR) { HDR = false; freeRT(); RT.s = makeRT(w, h); }
    var qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2), ew = Math.max(1, w >> 3), eh = Math.max(1, h >> 3);
    RT.q1 = makeRT(qw, qh); RT.q2 = makeRT(qw, qh); RT.e1 = makeRT(ew, eh); RT.e2 = makeRT(ew, eh);
  }

  /* ================= geometry ================= */
  var STRIDE = 9; // pos3, col4, size, mode
  var ringN = 150, starN = 380;
  var GRAT = []; (function () { var la, lo; for (la = -60; la <= 60; la += 30) for (lo = -180; lo < 180; lo += 2) GRAT.push(vec(la, lo)); for (lo = -180; lo < 180; lo += 30) for (la = -78; la <= 78; la += 2) GRAT.push(vec(la, lo)); })();
  var nStatic = LAND.length / 3 * 2 + OCEAN.length / 3 + starN + ringN + GRAT.length;
  var S = new Float32Array(nStatic * STRIDE), w = 0;
  function put(arr, x, y, z, r, g, b, a, sz, m) { var o = w * STRIDE; arr[o] = x; arr[o + 1] = y; arr[o + 2] = z; arr[o + 3] = r; arr[o + 4] = g; arr[o + 5] = b; arr[o + 6] = a; arr[o + 7] = sz; arr[o + 8] = m; w++; }
  var i;
  for (i = 0; i < LAND.length; i += 3) put(S, LAND[i], LAND[i + 1], LAND[i + 2], 0, 0, 0, 0, 1.0, 0);
  for (i = 0; i < LAND.length; i += 3) put(S, LAND[i], LAND[i + 1], LAND[i + 2], 0, 0, 0, 0, 2.7, -1);
  var OCSZ = 0.5;
  for (i = 0; i < OCEAN.length; i += 3) put(S, OCEAN[i], OCEAN[i + 1], OCEAN[i + 2], 0, 0, 0, 0, OCSZ, 1);
  for (i = 0; i < starN; i++) {
    var u = rnd(-1, 1), th = rnd(0, Math.PI * 2), rr = rnd(7, 13), sq = Math.sqrt(1 - u * u), warm = Math.random() < 0.18;
    put(S, sq * Math.cos(th) * rr, u * rr, sq * Math.sin(th) * rr, warm ? 1 : 0.7, warm ? 0.82 : 0.82, 1, Math.pow(Math.random(), 4) * 0.9 + 0.05, rnd(0.35, 0.7), 2);
  }
  GRAT.forEach(function (g) { put(S, g[0] * 1.002, g[1] * 1.002, g[2] * 1.002, 0.3, 0.62, 1.0, 0.16, 0.8, 3); });
  var RING_R = 1.62, RING_Y = 0.27;
  function ringPos(a) { return [RING_R * Math.cos(a), -RING_R * RING_Y * Math.sin(a), RING_R * Math.sin(a) * 0.96]; }
  for (i = 0; i < ringN; i++) { var rp = ringPos(i / ringN * Math.PI * 2); put(S, rp[0], rp[1], rp[2], 0.55, 0.85, 1.0, 0.42, 1.25, 4); }

  function vao(data, dynamic) {
    var a = gl.createVertexArray(); gl.bindVertexArray(a);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE * 4, 28);
    gl.bindVertexArray(null);
    return { a: a, b: b };
  }
  var VS = vao(S, false);
  var DMAX = 12000, D = new Float32Array(DMAX * STRIDE), VD = vao(D, true);
  var VTRI = gl.createVertexArray();

  /* ================= camera / layout ================= */
  var CAMD = 3.4, W = 1, H = 1, DPR = 1, R = 100, CX = 0, CY = 0, F = 1, PHONE = false;
  var yawBase = -(-40) * DEG, yawVel = 0, lean = [0, 0], leanT = [0, 0], tilt0 = 0.30, M = new Float32Array(9);
  var yaw = 0, tilt = 0;
  function buildM() {
    var c = Math.cos(yaw), s = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    // row-major rows: [c,0,s],[st*s,ct,-st*c],[-ct*s,st,ct*c]; uploaded column-major
    M[0] = c; M[1] = st * s; M[2] = -ct * s; M[3] = 0; M[4] = ct; M[5] = st; M[6] = s; M[7] = -st * c; M[8] = ct * c;
  }
  function rot(v) { return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; }
  function project(p) { var z = CAMD - p[2]; return [CX + p[0] * F / z, CY - p[1] * F / z, z]; }
  function occluded(p) {
    var C = [0, 0, CAMD], d = [p[0], p[1], p[2] - CAMD];
    var A = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], B = 2 * (C[2] * d[2]), CC = CAMD * CAMD - 1, ds = B * B - 4 * A * CC;
    if (ds <= 0) return false;
    var t1 = (-B - Math.sqrt(ds)) / (2 * A); return t1 > 0 && t1 < 0.992;
  }
  var hero = $('.hero'), top = $('.top');
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    PHONE = W < 760 || W / H < 0.82;
    root.classList.toggle('phone', PHONE);
    var tb = top.getBoundingClientRect().bottom;
    if (PHONE) {
      R = Math.min(W * 0.285, H * 0.2);
      var room = $('#cta').getBoundingClientRect().top - 12 - hero.offsetHeight - 26 - tb - 6;
      // ring front edge sits ~1.86R below the top of the globe band; shrink the planet before the copy collides with the button
      R = Math.max(40, Math.min(R, room / (1.5 + RING_R * RING_Y * Math.sqrt(CAMD * CAMD - 1) / (CAMD - RING_R * 0.96))));
      CX = W / 2; CY = tb + R * 1.5 + 6;
    } else {
      var shortS = H < 820;
      R = Math.min(W * 0.2, H * (shortS ? 0.25 : 0.27));
      CX = W * (shortS ? 0.63 : 0.6); CY = H * (shortS ? 0.39 : 0.41);
    }
    F = R * Math.sqrt(CAMD * CAMD - 1);
    var fz = CAMD - RING_R * 0.96, fy = CY + RING_R * RING_Y * F / fz;
    root.style.setProperty('--gy', Math.round(PHONE ? fy + 26 : CY + R * 1.62 * 0.27 * 0.8 + R * 0.42) + 'px');
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    buildRT(cv.width, cv.height);
    root.setAttribute('data-g', [Math.round(CX), Math.round(CY), Math.round(R)].join(','));
  }

  /* ================= real sun ================= */
  var SUN = [0, 0, 1], SUNLL = [0, 0];
  function sunNow() {
    var d = new Date(), start = Date.UTC(d.getUTCFullYear(), 0, 0), n = (d.getTime() - start) / 864e5;
    var decl = -23.44 * Math.cos(2 * Math.PI / 365 * (n + 10));
    var B = 2 * Math.PI * (n - 81) / 365, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var hrs = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    var lon = -15 * (hrs - 12 + eot / 60); lon = ((lon + 540) % 360) - 180;
    SUNLL = [decl, lon]; SUN = vec(decl, lon);
  }
  sunNow(); setInterval(sunNow, 20000);

  /* ================= simulated system state ================= */
  var regT = 0, regV = 0, sig = [0, 0, 0, 0, 0, 0], W8 = [0.22, 0.14, 0.2, 0.16, 0.18, 0.1];
  var SECT = ['TECHNOLOGY', 'VALUE', 'INDUSTRIALS', 'DEFENSIVE', 'ENERGY'], sw = [34, 22, 18, 16, 10];
  function postureOf(v) { return v < -0.5 ? 'RISK-OFF' : v < -0.15 ? 'DEFENSIVE' : v < 0.15 ? 'NEUTRAL' : v < 0.5 ? 'CONSTRUCTIVE' : 'RISK-ON'; }
  function stepSignals() {
    var drift = rnd(-0.25, 0.25), sum = 0;
    for (var k = 0; k < 6; k++) { sig[k] = clamp(sig[k] * 0.86 + drift * 0.5 + rnd(-0.3, 0.3), -1, 1); sum += sig[k] * W8[k]; }
    regT = clamp(sum * 1.7, -1, 1);
    var tg = [34 + 12 * regT, 22 - 3 * regT, 18 + 3 * regT, 16 - 8 * regT, 10 - 4 * regT].map(function (x) { return Math.max(3, x + rnd(-1.6, 1.6)); });
    var s = tg.reduce(function (a, b) { return a + b; }, 0);
    sw = tg.map(function (x) { return Math.round(x / s * 100); }); sw[0] += 100 - sw.reduce(function (a, b) { return a + b; }, 0);
    paint();
  }

  /* ================= DOM ================= */
  var glyphs = $$('.gy'), gv = glyphs.map(function (g) { return $('.v', g); });
  var tag = $('#tag'), tagK = $('b', tag), tagV = $('span', tag);
  var series = 4112;
  function setText(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  var NOISE = '#%&@$*+=<>/\\ABCDEFHKMNRSTXZ0123456789';
  function decrypt(el, s) {
    if (!el || el._to === s) return; el._to = s;
    if (RM || !el.textContent) { el.textContent = s; return; }
    var n = 0, steps = 7; clearInterval(el._iv);
    el._iv = setInterval(function () {
      n++; var o = '';
      for (var k = 0; k < s.length; k++) o += s[k] === ' ' || k < (n / steps) * s.length ? s[k] : NOISE[(Math.random() * NOISE.length) | 0];
      el.textContent = o; if (n >= steps) { clearInterval(el._iv); el.textContent = s; }
    }, 45);
  }
  function paint() {
    decrypt(gv[0], postureOf(regT));
    var top = 0; for (var k = 1; k < 5; k++) if (sw[k] > sw[top]) top = k;
    decrypt(gv[1], SECT[top] + ' ' + sw[top] + '%');
    decrypt(gv[2], series.toLocaleString('en-US') + ' SERIES');
    // readouts
    var pm = $('#pmark'); if (pm) pm.style.left = ((regT + 1) / 2 * 100).toFixed(1) + '%';
    setText($('#pval'), postureOf(regT) + '  ' + (regT >= 0 ? '+' : '−') + Math.abs(regT).toFixed(2));
    $$('#sigs li').forEach(function (li, k) {
      var b = $('i', li), v = sig[k], wdt = Math.abs(v) * 50;
      b.style.left = (v < 0 ? 50 - wdt : 50) + '%'; b.style.width = wdt + '%'; b.classList.toggle('n', v < 0);
      setText($('b', li), (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2));
    });
    $$('#secs li').forEach(function (li, k) { $('i', li).style.width = sw[k] + '%'; setText($('b', li), sw[k] + '%'); });
  }

  /* clocks + observer timer */
  var clocks = $$('.ck b').map(function (b) {
    var f; try { f = new Intl.DateTimeFormat('en-GB', { timeZone: b.getAttribute('data-tz'), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { f = null; }
    return { el: b, f: f };
  });
  var obsEl = $('#obs'), t0 = Date.now(), p2 = function (n) { return n < 10 ? '0' + n : '' + n; };
  function tick() {
    var d = new Date(); clocks.forEach(function (c) { if (c.f) c.el.textContent = c.f.format(d); });
    var s = Math.floor((Date.now() - t0) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    if (obsEl) obsEl.textContent = (h ? h + ':' + p2(m) : p2(m)) + ':' + p2(s % 60);
  }
  tick(); setInterval(tick, 1000);

  /* redacted system name: a bar of light that almost resolves */
  var red = $('#sys'), GL = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  function leak() {
    if (!red) return;
    var s = ''; for (var k = 0; k < 6; k++) s += Math.random() < 0.34 ? GL[(Math.random() * GL.length) | 0] : '█';
    red.textContent = s; red.classList.add('leak');
    setTimeout(function () { red.textContent = '██████'; red.classList.remove('leak'); }, rnd(90, 220));
    setTimeout(leak, rnd(2600, 6200));
  }
  if (!RM) setTimeout(leak, 2400);

  /* headline resolves out of scattered light, then holds still */
  $$('.hl .w').forEach(function (wd, wi) {
    var txt = wd.textContent; wd.textContent = '';
    for (var k = 0; k < txt.length; k++) {
      var sp = document.createElement('span'); sp.textContent = txt[k]; sp.setAttribute('aria-hidden', 'true');
      if (!RM) {
        sp.style.setProperty('--dx', rnd(-90, 90).toFixed(0) + 'px'); sp.style.setProperty('--dy', rnd(-60, 60).toFixed(0) + 'px');
        sp.style.transitionDelay = (0.35 + wi * 0.18 + k * 0.045 + rnd(0, 0.25)).toFixed(2) + 's';
      }
      wd.appendChild(sp);
    }
  });

  /* intel feed (inside the readout) */
  var feed = $('#feed');
  var N = function (a, b) { return Math.round(rnd(a, b)).toLocaleString('en-US'); };
  var hex = function () { var s = (Math.random() * 0xffff | 0).toString(16).toUpperCase(); return ('000' + s).slice(-4); };
  var T = [
    function () { series = Math.round(rnd(3900, 4400)); return ['c', 'INGEST', series.toLocaleString('en-US') + ' SERIES · OK']; },
    function () { return ['c', 'PARSE', N(120, 480) + ' FILINGS · 10-K / 10-Q / 8-K']; },
    function () { return ['v', 'MODEL', 'CONSENSUS ' + rnd(0.52, 0.88).toFixed(2) + ' · ' + ((Math.random() * 3 | 0) + 4) + '/7 AGREE']; },
    function () { return ['p', 'DISSENT', 'MODEL ' + pick(['B', 'C', 'E', 'F']) + ' · CONFIDENCE ' + rnd(0.3, 0.6).toFixed(2)]; },
    function () { return ['w', 'ANALYST', 'REVIEW · HUMAN IN THE LOOP']; },
    function () { return ['a', 'DECISION', 'LOGGED · #' + hex() + ' · SIGNED']; },
    function () { return ['c', 'REGIME', 'RECOMPUTE · ' + postureOf(regT)]; },
    function () { return ['v', 'CORR', 'CROSS-ASSET SCAN · ' + N(900, 1600) + ' PAIRS']; },
    function () { return ['w', 'OVERRIDE', 'ANALYST REJECTS ' + ((Math.random() * 3 | 0) + 1) + ' MODEL CALL(S)']; },
    function () { return ['a', 'HANDOFF', 'MACHINE → FIDUCIARY · NO AUTONOMOUS TRADES']; }
  ];
  var seq = [0, 1, 2, 3, 4, 5], qi = 0;
  function nextLine() {
    var r = (qi < seq.length ? T[seq[qi++]] : pick(T))();
    var d = new Date(), ts = p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + 'Z';
    var li = document.createElement('li');
    // static template only: r[0]/r[1] come from the fixed list above; the message is set with textContent below
    li.innerHTML = '<span class="ts">' + ts + '</span><span class="t ' + r[0] + '">' + r[1] + '</span><span class="m"></span>';
    $('.m', li).textContent = r[2];
    feed.appendChild(li);
    while (feed.children.length > 14) feed.removeChild(feed.firstChild);
    paint();
    setTimeout(nextLine, RM ? 2600 : rnd(700, 1600));
  }

  /* ================= readouts ================= */
  var veil = $('#veil'), openRo = null, lastFocus = null, mainEl = $('#main');
  function openReadout(id) {
    var ro = document.getElementById(id); if (!ro || openRo) return;
    lastFocus = document.activeElement; openRo = ro;
    ro.classList.add('open'); veil.classList.add('on'); root.classList.add('reading'); glitch(0.18, false);
    mainEl.inert = true;
    var x = $('.x', ro); if (x) x.focus();
  }
  function closeReadout() {
    if (!openRo) return;
    openRo.classList.remove('open'); veil.classList.remove('on'); root.classList.remove('reading');
    mainEl.inert = false; openRo = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  var hoverHold = 0;
  glyphs.forEach(function (g) {
    g.addEventListener('click', function () { openReadout(g.getAttribute('data-ro')); });
    g.addEventListener('pointerenter', function () { hoverHold++; });
    g.addEventListener('pointerleave', function () { hoverHold = Math.max(0, hoverHold - 1); });
    g.addEventListener('focus', function () { hoverHold++; });
    g.addEventListener('blur', function () { hoverHold = Math.max(0, hoverHold - 1); });
  });
  $$('.ro .x').forEach(function (b) { b.addEventListener('click', closeReadout); });
  veil.addEventListener('click', closeReadout);
  document.addEventListener('keydown', function (e) {
    if (!openRo) return;
    if (e.key === 'Escape') { e.preventDefault(); closeReadout(); return; }
    if (e.key === 'Tab') {
      var f = $$('a,button', openRo); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  /* ================= interaction: lean, drag, tilt ================= */
  var drag = null, pointer = null;
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') { pointer = [e.clientX, e.clientY]; leanT = [clamp((e.clientX / W - 0.5) * 0.5, -0.25, 0.25), clamp((e.clientY / H - 0.5) * 0.3, -0.15, 0.15)]; }
    if (drag) {
      var dx = e.clientX - drag.x; drag.x = e.clientX;
      var dy = e.clientY - drag.y; drag.y = e.clientY;
      var now = performance.now(), dtp = Math.max(1, now - drag.t); drag.t = now;
      yawBase += dx / R * 0.9; tilt0 = clamp(tilt0 + dy / R * 0.5, -0.2, 0.75);
      yawVel = dx / R * 0.9 / (dtp / 1000);
    }
  });
  cv.addEventListener('pointerdown', function (e) {
    var dx = e.clientX - CX, dy = e.clientY - CY;
    if (dx * dx + dy * dy < R * R * 1.6) { drag = { x: e.clientX, y: e.clientY, t: performance.now() }; yawVel = 0; cv.setPointerCapture(e.pointerId); }
  });
  function endDrag() { drag = null; }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  var tiltBase = null, motionOn = false;
  function onOrient(e) {
    if (e.gamma == null || e.beta == null) return;
    motionOn = true;
    if (!tiltBase) tiltBase = [e.gamma, e.beta];
    leanT = [clamp((e.gamma - tiltBase[0]) / 30, -1, 1) * 0.55, clamp((e.beta - tiltBase[1]) / 30, -1, 1) * 0.28];
  }
  var mo = $('#motion');
  if (window.DeviceOrientationEvent) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (mo && PHONE) {
        mo.hidden = false;
        mo.addEventListener('click', function () {
          DeviceOrientationEvent.requestPermission().then(function (s) {
            if (s === 'granted') { window.addEventListener('deviceorientation', onOrient); mo.classList.add('done'); setText($('span', mo) || mo, 'MOTION LINK ACTIVE'); setTimeout(function () { mo.hidden = true; }, 1600); }
          }).catch(function () { mo.hidden = true; });
        });
      }
    } else {
      window.addEventListener('deviceorientation', onOrient);
    }
  }

  /* ================= request access: the peak ================= */
  var cta = $('#cta'), clr = $('#clr'), conv = 0, convT = 0, flash = 0;
  cta.addEventListener('click', function (e) {
    if (RM || convT > 0) return;
    e.preventDefault();
    var href = cta.getAttribute('href');
    convT = 1; root.classList.add('pending'); setText(clr, 'PENDING'); glitch(0.35);
    setTimeout(function () { flash = 1.2; window.location.href = href; }, 1150);
    setTimeout(function () { convT = 0; root.classList.remove('pending'); setText(clr, 'OBSERVER'); }, 2900);
  });

  /* ================= arcs (light streams) ================= */
  var arcs = [], spawnT = 0, bursts = [];
  function slerp(a, b, t, h) {
    var d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1), om = Math.acos(d), s = Math.sin(om) || 1e-6;
    var ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s, lift = 1 + h * Math.sin(Math.PI * t);
    return [(a[0] * ka + b[0] * kb) * lift, (a[1] * ka + b[1] * kb) * lift, (a[2] * ka + b[2] * kb) * lift];
  }
  var CY_ = [0.2, 0.85, 1.0], PK = [1.0, 0.16, 0.82], VI = [0.58, 0.4, 1.0], AC = [0.7, 1.0, 0.22], AM = [1.0, 0.6, 0.18], WH = [0.92, 0.96, 1.0];
  var COLS = [CY_, CY_, PK, PK, VI, AC, AM, WH], GCOL = [CY_, VI, AC, PK];
  function spawnArc() {
    var a = Math.random() < 0.4 ? CITIES[6] : pick(CITIES), b = pick(CITIES);
    if (a === b) return;
    var d = Math.acos(clamp(a.v[0] * b.v[0] + a.v[1] * b.v[1] + a.v[2] * b.v[2], -1, 1));
    arcs.push({ a: a.v, b: b.v, h: 0.06 + 0.34 * d / Math.PI, age: 0, life: rnd(5, 9), col: pick(COLS), sp: rnd(0.24, 0.42), ph: Math.random(), hit: 0, hits: 0 });
  }
  function basis(v) {
    var up = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var t1 = [up[1] * v[2] - up[2] * v[1], up[2] * v[0] - up[0] * v[2], up[0] * v[1] - up[1] * v[0]], l = Math.hypot(t1[0], t1[1], t1[2]);
    t1 = [t1[0] / l, t1[1] / l, t1[2] / l];
    return [t1, [v[1] * t1[2] - v[2] * t1[1], v[2] * t1[0] - v[0] * t1[2], v[0] * t1[1] - v[1] * t1[0]]];
  }
  function splash(v, c, big, sc) {
    var b = basis(v), dr = [];
    for (var k = 0; k < (big ? 22 : 14); k++) dr.push([rnd(0, 6.283), rnd(0.4, 1.2), rnd(0.3, 1)]);
    bursts.push({ v: v, t1: b[0], t2: b[1], c: c, age: 0, life: big ? 2.2 : 1.7, s: (big ? 1.5 : 1) * (sc || 1), dr: dr });
  }
  function onSphere(B, r, th, h) {
    var x = B.v[0] + r * (Math.cos(th) * B.t1[0] + Math.sin(th) * B.t2[0]), y = B.v[1] + r * (Math.cos(th) * B.t1[1] + Math.sin(th) * B.t2[1]), z = B.v[2] + r * (Math.cos(th) * B.t1[2] + Math.sin(th) * B.t2[2]);
    var l = Math.hypot(x, y, z) / h; return [x / l, y / l, z / l];
  }
  /* strikes: a capability on the ring fires a beam down onto a city */
  var strikes = [], strikeT = 2.5;
  function spawnStrike() {
    var gk = -1, best = -9, k;
    for (k = 0; k < 4; k++) { var z = glyphPos[k][2] + rnd(0, 1.2); if (glyphPos[k][2] > -0.6 && z > best) { best = z; gk = k; } }
    if (gk < 0) return;
    var vis = []; for (k = 0; k < CITIES.length; k++) if (rot(CITIES[k].v)[2] > 0.25) vis.push(k);
    if (!vis.length) return;
    strikes.push({ g: gk, ci: pick(vis), age: 0, c: GCOL[gk] });
    root.dataset.strikes = (+root.dataset.strikes || 0) + 1;
    glyphs[gk].classList.add('fire'); setTimeout(function () { glyphs[gk].classList.remove('fire'); }, 900);
  }
  function fillDynamic(dt, t) {
    w = 0;
    spawnT -= dt;
    if (spawnT <= 0 && arcs.length < 18) { spawnArc(); spawnT = rnd(0.2, 0.55); }
    strikeT -= dt; if (strikeT <= 0 && !RM) { spawnStrike(); strikeT = rnd(1.4, 3.2); }
    arcs = arcs.filter(function (A) {
      A.age += dt; if (A.age > A.life) return false;
      var grow = clamp(A.age / 1.4, 0, 1), fade = clamp((A.life - A.age) / 1.2, 0, 1), c = A.col, k, p;
      var PN = 110, end = Math.floor(PN * grow);
      for (k = 0; k <= end && w < DMAX - 40; k++) { p = slerp(A.a, A.b, k / PN, A.h); put(D, p[0], p[1], p[2], c[0], c[1], c[2], (0.95 + 0.6 * (k === end && grow < 1)) * fade, 1.4, 3); }
      if (grow >= 1) {
        if (!A.hit) { A.hit = 1; splash(A.b, c, false); }
        for (var q = 0; q < 3; q++) {
          var tp0 = A.age * A.sp + A.ph + q / 3, tp = tp0 % 1, lap = Math.floor(tp0);
          if (q === 0 && lap > A.hits) { A.hits = lap; if (fade > 0.5) splash(A.b, c, false, 0.6); }
          for (var tr = 0; tr < 18 && w < DMAX - 4; tr++) {
            var tt = tp - tr * 0.006; if (tt < 0) break;
            p = slerp(A.a, A.b, tt, A.h);
            var hd = tr === 0, ia = hd ? 7.5 : 2.8 * Math.pow(1 - tr / 18, 2);
            put(D, p[0], p[1], p[2], hd ? 1 : c[0], hd ? 1 : c[1], hd ? 1 : c[2], ia * fade, hd ? 3.4 : 2.4, 3);
          }
        }
      }
      return true;
    });
    strikes = strikes.filter(function (St) {
      St.age += dt; if (St.age > 1.6) return false;
      var a = glyphPos[St.g], cv3 = rot(CITIES[St.ci].v), b = [cv3[0] * 1.004, cv3[1] * 1.004, cv3[2] * 1.004], c = St.c;
      var grow = clamp(St.age / 0.38, 0, 1), fade = clamp((1.6 - St.age) / 0.7, 0, 1), n = 90, e = Math.floor(n * grow), k;
      for (k = 0; k <= e && w < DMAX - 20; k++) { var t = k / n; put(D, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, c[0], c[1], c[2], (k === e ? 6 : 1.7) * fade, k === e ? 3.4 : 1.6, 4); }
      if (grow >= 1 && !St.hit) { St.hit = 1; splash(CITIES[St.ci].v, c, true); }
      return true;
    });
    bursts = bursts.filter(function (B) {
      B.age += dt; if (B.age > B.life || w > DMAX - 120) return false;
      var u = B.age / B.life, k = 1 - u, eo = 1 - Math.pow(1 - u, 3), c = B.c, j, p;
      put(D, B.v[0] * 1.006, B.v[1] * 1.006, B.v[2] * 1.006, 1, 1, 1, 3.2 * Math.pow(k, 5) * B.s, (3 + 6 * u) * B.s, 3);
      put(D, B.v[0] * 1.006, B.v[1] * 1.006, B.v[2] * 1.006, c[0], c[1], c[2], 1.1 * k * k * k, (5 + 12 * u) * B.s, 3);
      for (j = 0; j < 40; j++) { p = onSphere(B, 0.15 * eo * B.s, j / 40 * 6.283, 1.004); put(D, p[0], p[1], p[2], c[0], c[1], c[2], 2.0 * k * k, 1.3, 3); }
      if (u > 0.12) { var u2 = (u - 0.12) / 0.88, e2 = 1 - Math.pow(1 - u2, 3); for (j = 0; j < 26; j++) { p = onSphere(B, 0.085 * e2 * B.s, j / 26 * 6.283 + 0.1, 1.004); put(D, p[0], p[1], p[2], 1, 1, 1, 1.2 * (1 - u2) * (1 - u2), 1.1, 3); } }
      B.dr.forEach(function (d) { p = onSphere(B, d[1] * 0.16 * eo * B.s, d[0], 1.004 + d[2] * 0.07 * Math.sin(Math.PI * Math.min(1, u * 1.25)) * B.s); put(D, p[0], p[1], p[2], c[0], c[1], c[2], 2.0 * k, 1.6, 3); });
      if (u < 0.45) { var bk = 1 - u / 0.45; for (j = 0; j < 12; j++) { var hh = 1.004 + j * 0.012 * B.s; put(D, B.v[0] * hh, B.v[1] * hh, B.v[2] * hh, c[0], c[1], c[2], 2.0 * bk * (1 - j / 12), 1.5, 3); } }
      return true;
    });
    CITIES.forEach(function (c, ci) {
      var pul = 0.7 + 0.3 * Math.sin(t * 2.2 + ci), v = c.v;
      put(D, v[0] * 1.003, v[1] * 1.003, v[2] * 1.003, c.hq ? 0.75 : 1, c.hq ? 1 : 0.9, c.hq ? 0.55 : 1, (c.hq ? 2.4 : 1.6) * pul, 2.4, 3);
    });
    // glyph nodes on the ring
    glyphPos.forEach(function (gp, k) { var c = GCOL[k], pu = 0.6 + 0.4 * Math.sin(t * 3.2 + k * 1.6); put(D, gp[0], gp[1], gp[2], c[0], c[1], c[2], 2.6 * pu + 0.6, 3.4, 4); put(D, gp[0], gp[1], gp[2], 1, 1, 1, 2.2, 1.6, 4); });
    return w;
  }

  /* ================= glyph orbit + city lock ================= */
  var ringA = 0.6, glyphPos = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  function placeGlyphs(dt) {
    if (!hoverHold && !openRo) ringA += (RM ? 0.004 : 0.03) * dt;
    glyphs.forEach(function (g, k) {
      var a = ringA + k * Math.PI / 2, p = ringPos(a); glyphPos[k] = p;
      var s = project(p), front = p[2] > -0.2, hid = occluded(p);
      var sc = clamp(0.82 + (p[2] / RING_R) * 0.2, 0.62, 1.02);
      g.style.transform = 'translate3d(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
      g.style.opacity = hid ? '0.12' : (front ? '1' : '0.5');
      g.style.zIndex = front ? '6' : '3';
      g.classList.toggle('hid', hid);
      var lft = PHONE ? s[0] > CX : s[0] < CX - R * 0.2, tw = g._tw || (g._tw = $('.tx', g).getBoundingClientRect().width + 26);
      if (!lft && s[0] + tw > W - 8) lft = true; else if (lft && s[0] - tw < 8) lft = false;
      g.classList.toggle('lft', lft);
    });
  }
  var lockI = 6, lockT = 0;
  function placeTag(dt) {
    var best = -1, bd = 1e9, k, p, s;
    if (pointer && !PHONE) {
      for (k = 0; k < CITIES.length; k++) {
        p = rot(CITIES[k].v); if (p[2] < 0.15) continue; s = project(p);
        var dd = (s[0] - pointer[0]) * (s[0] - pointer[0]) + (s[1] - pointer[1]) * (s[1] - pointer[1]);
        if (dd < bd) { bd = dd; best = k; }
      }
      if (bd > 160 * 160) best = -1;
    } else {
      lockT += dt;
      p = rot(CITIES[lockI].v);
      if (lockT > 3.4 || p[2] < 0.2) {
        var vis = []; for (k = 0; k < CITIES.length; k++) { if (k !== lockI && rot(CITIES[k].v)[2] > 0.35) vis.push(k); }
        if (vis.length) { lockI = pick(vis); lockT = 0; }
      }
      best = rot(CITIES[lockI].v)[2] > 0.2 ? lockI : -1;
    }
    if (best < 0 || openRo) { tag.classList.remove('on'); return; }
    var c = CITIES[best]; p = rot(c.v); s = project(p);
    tag.style.transform = 'translate3d(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px,0)';
    setText(tagK, c.k + (c.hq ? ' · HQ' : ''));
    setText(tagV, Math.abs(c.la).toFixed(2) + (c.la >= 0 ? 'N ' : 'S ') + Math.abs(c.lo).toFixed(2) + (c.lo >= 0 ? 'E' : 'W') + ' · ' + (c.hq ? 'COMMAND' : 'LINK ' + (18 + ((c.k.charCodeAt(0) * 7 + c.k.charCodeAt(1)) % 140)) + 'ms'));
    tag.classList.toggle('lft', s[0] > W - 230);
    tag.classList.add('on');
  }

  /* ================= render ================= */
  var cityFlat = new Float32Array(21); CITIES.forEach(function (c, k) { cityFlat[3 * k] = c.v[0]; cityFlat[3 * k + 1] = c.v[1]; cityFlat[3 * k + 2] = c.v[2]; });
  var SROT = new Float32Array(9), starYaw = 0;
  function tri() { gl.bindVertexArray(VTRI); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  function pass(p, rt) { gl.useProgram(p.p); gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.f : null); gl.viewport(0, 0, rt ? rt.w : cv.width, rt ? rt.h : cv.height); }
  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  function blur(src, tmp, dirScale) {
    pass(P_BLUR, tmp); bindTex(0, src.t); gl.uniform1i(P_BLUR.u.u_t, 0); gl.uniform2f(P_BLUR.u.u_dir, dirScale / src.w, 0); tri();
    pass(P_BLUR, src); bindTex(0, tmp.t); gl.uniform1i(P_BLUR.u.u_t, 0); gl.uniform2f(P_BLUR.u.u_dir, 0, dirScale / tmp.h); tri();
  }
  function render(t, nd) {
    var sv = rot(SUN);
    // scene
    pass(P_ATM, RT.s); gl.clearColor(0.0015, 0.002, 0.006, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    var cx = CX * DPR, cy = (H - CY) * DPR;
    gl.uniform2f(P_ATM.u.u_c, cx, cy); gl.uniform1f(P_ATM.u.u_R, R * DPR * (1 - conv * conv * 0.98)); gl.uniform3f(P_ATM.u.u_sv, sv[0], sv[1], sv[2]); gl.uniform1f(P_ATM.u.u_conv, conv);
    tri();
    gl.useProgram(P_PTS.p);
    var u = P_PTS.u;
    gl.uniformMatrix3fv(u.u_M, false, M);
    var cs = Math.cos(starYaw), ss = Math.sin(starYaw);
    SROT[0] = cs; SROT[1] = 0; SROT[2] = -ss; SROT[3] = 0; SROT[4] = 1; SROT[5] = 0; SROT[6] = ss; SROT[7] = 0; SROT[8] = cs;
    gl.uniformMatrix3fv(u.u_S, false, SROT);
    gl.uniform2f(u.u_c, cx, cy); gl.uniform2f(u.u_res, cv.width, cv.height);
    gl.uniform1f(u.u_f, F * DPR); gl.uniform1f(u.u_D, CAMD); gl.uniform1f(u.u_ps, Math.max(1.6, R / 92) * DPR);
    gl.uniform1f(u.u_t, t); gl.uniform1f(u.u_conv, conv); gl.uniform3f(u.u_sun, SUN[0], SUN[1], SUN[2]);
    gl.uniform3fv(u.u_city, cityFlat); gl.uniform1f(u.u_sw, sweep);
    gl.bindVertexArray(VS.a); gl.drawArrays(gl.POINTS, 0, nStatic);
    gl.bindVertexArray(VD.a); gl.bindBuffer(gl.ARRAY_BUFFER, VD.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, nd * STRIDE); gl.drawArrays(gl.POINTS, 0, nd);
    gl.disable(gl.BLEND);
    // bloom
    pass(P_BRIGHT, RT.q1); bindTex(0, RT.s.t); gl.uniform1i(P_BRIGHT.u.u_t, 0); gl.uniform2f(P_BRIGHT.u.u_px, 1.5 / RT.s.w, 1.5 / RT.s.h); gl.uniform1f(P_BRIGHT.u.u_th, HDR ? 0.7 : 0.45); tri();
    blur(RT.q1, RT.q2, 1.0);
    pass(P_BLUR, RT.e1); bindTex(0, RT.q1.t); gl.uniform1i(P_BLUR.u.u_t, 0); gl.uniform2f(P_BLUR.u.u_dir, 1 / RT.q1.w, 0); tri();
    pass(P_BLUR, RT.e2); bindTex(0, RT.e1.t); gl.uniform2f(P_BLUR.u.u_dir, 0, 1 / RT.e1.h); tri();
    blur(RT.e2, RT.e1, 1.6);
    // composite
    pass(P_COMP, null);
    bindTex(0, RT.s.t); bindTex(1, RT.q1.t); bindTex(2, RT.e2.t);
    gl.uniform1i(P_COMP.u.u_s, 0); gl.uniform1i(P_COMP.u.u_b1, 1); gl.uniform1i(P_COMP.u.u_b2, 2); gl.uniform1f(P_COMP.u.u_flash, flash);
    gl.uniform1f(P_COMP.u.u_gl, glI); gl.uniform1f(P_COMP.u.u_gy, glY); gl.uniform1f(P_COMP.u.u_gh, glH); gl.uniform1f(P_COMP.u.u_gs, glS); gl.uniform1f(P_COMP.u.u_dpr, DPR);
    tri();
  }

  /* ================= loop ================= */
  var glI = 0, glY = 0.5, glH = 0.02, glS = 0.5, glLeft = 0, glNext = 3.5, sweep = -3.14159, hlEl = $('.hl');
  function glitch(dur, strong) {
    if (RM) return; glLeft = dur; glNext = rnd(4.5, 9);
    if (strong !== false && hlEl) { hlEl.classList.remove('glitch'); void hlEl.offsetWidth; hlEl.classList.add('glitch'); setTimeout(function () { hlEl.classList.remove('glitch'); }, 260); }
  }
  function stepGlitch(dt) {
    glNext -= dt; if (glNext <= 0) glitch(rnd(0.12, 0.28), Math.random() < 0.6);
    if (glLeft > 0) { glLeft -= dt; glI = Math.random() < 0.7 ? rnd(0.5, 1) : 0; glY = Math.random(); glH = rnd(0.006, 0.06); glS = Math.random(); } else glI = 0;
  }
  var last = performance.now(), clockT = 0, visible = true;
  document.addEventListener('visibilitychange', function () { visible = !document.hidden; if (visible) { last = performance.now(); requestAnimationFrame(frame); } });
  function frame(now) {
    if (!visible) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now; clockT += dt;
    if (!drag) { yawVel *= Math.pow(0.08, dt); yawBase += yawVel * dt; }
    yawBase += (RM ? 0.008 : 0.05) * dt;
    starYaw += 0.004 * dt;
    var ks = Math.min(1, dt * (motionOn ? 5 : 2.2));
    lean[0] += (leanT[0] - lean[0]) * ks; lean[1] += (leanT[1] - lean[1]) * ks;
    yaw = yawBase + lean[0]; tilt = tilt0 + lean[1];
    buildM();
    conv += ((convT ? 1 : 0) - conv) * Math.min(1, dt * (convT ? 2.6 : 1.8));
    flash *= Math.pow(0.02, dt);
    regV += (regT - regV) * Math.min(1, dt * 1.5);
    stepGlitch(dt); sweep += dt * (RM ? 0.1 : 0.7); if (sweep > 3.14159) sweep -= 6.28318;
    placeGlyphs(dt);
    var nd = fillDynamic(dt, clockT);
    render(clockT, nd);
    placeTag(dt);
    requestAnimationFrame(frame);
  }

  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { glyphs.forEach(function (g) { g._tw = 0; }); layout(); }, 80); });
  layout();
  stepSignals(); setInterval(stepSignals, RM ? 7000 : 2600);
  nextLine();
  root.classList.add('booted');
  requestAnimationFrame(function () { root.classList.add('resolved'); });
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
})();
