import * as THREE from 'three';

const D2R = Math.PI / 180;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('globe');
const plate = document.querySelector('.plate');
const chapters = [...document.querySelectorAll('.chapter')];

/* ---------- stops (lat, lon from public city coordinates) ---------- */
const STOPS = {
  hero:    { lat: 32,    lon: -45,    dist: 1.0 },
  kyiv:    { lat: 50.45, lon: 30.52,  dist: 0.92 },
  daytona: { lat: 29.21, lon: -81.02, dist: 0.92 },
  atlanta: { lat: 33.75, lon: -84.39, dist: 0.9 },
  mexico:  { lat: 19.43, lon: -99.13, dist: 0.91 },
  orbit:   { lat: 27,    lon: -90,    dist: 1.22 },
};
const ORDER = chapters.map(c => c.dataset.stop);
const LEGS = [['kyiv', 'daytona'], ['daytona', 'atlanta'], ['atlanta', 'mexico']]; // leg k starts at chapter k+1

function latLon(lat, lon, r = 1) {
  const phi = (90 - lat) * D2R, th = (lon + 180) * D2R;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
function facing(lat, lon, elev = 9) {
  const v = latLon(lat, lon);
  const a = Math.atan2(v.x, v.z);
  const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
  const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (lat - elev) * D2R);
  return qX.multiply(qY);
}
const STATE = ORDER.map(k => ({ q: facing(STOPS[k].lat, STOPS[k].lon), dist: STOPS[k].dist }));

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
camera.position.set(0, 0, 4);

const globe = new THREE.Group();
scene.add(globe);

/* earth */
const earthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x0d1422) });
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
globe.add(earth);

/* atmosphere: soft outer halo plus front rim, normal blending so it reads on paper */
const haloMat = new THREE.ShaderMaterial({
  transparent: true, side: THREE.BackSide, depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color(0xa9b6cb) }, uA: { value: 0.32 } },
  vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec3 vN; varying vec3 vP; void main(){ float f=dot(normalize(-vP), -vN); float a=pow(clamp(1.0-f,0.,1.)*1.0,6.0); a=smoothstep(0.0,1.0,a); gl_FragColor=vec4(uColor, a*uA); }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), haloMat));
const rimMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color(0xa7b9d8) } },
  vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vP; void main(){ float f=1.0-max(dot(normalize(-vP), vN),0.0); gl_FragColor=vec4(uColor, pow(f,3.6)*0.6); }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.002, 96, 64), rimMat));

/* city markers */
const markers = {};
for (const k of ['kyiv', 'daytona', 'atlanta', 'mexico']) {
  const s = STOPS[k];
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.011, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  const p = latLon(s.lat, s.lon, 1.003);
  for (const o of [m, ring]) { o.position.copy(p); o.lookAt(p.clone().multiplyScalar(2)); globe.add(o); }
  markers[k] = { dot: m, ring };
}

/* route arcs: great circle with lift, drawn as thin tubes */
function arcCurve(a, b) {
  const va = latLon(STOPS[a].lat, STOPS[a].lon), vb = latLon(STOPS[b].lat, STOPS[b].lon);
  const ang = va.angleTo(vb);
  const lift = 0.02 + 0.22 * ang / Math.PI;
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const s = i / 96;
    const v = new THREE.Vector3().copy(va).applyAxisAngle(new THREE.Vector3().crossVectors(va, vb).normalize(), ang * s);
    pts.push(v.multiplyScalar(1.004 + lift * Math.sin(Math.PI * s)));
  }
  return new THREE.CatmullRomCurve3(pts);
}
const arcMat = new THREE.MeshBasicMaterial({ color: 0xdde8ff, transparent: true, opacity: 0.95 });
const arcs = LEGS.map(([a, b]) => {
  const curve = arcCurve(a, b);
  const geo = new THREE.TubeGeometry(curve, 160, 0.0032, 6, false);
  const mesh = new THREE.Mesh(geo, arcMat);
  geo.setDrawRange(0, 0);
  globe.add(mesh);
  return { curve, geo, mesh, total: geo.index.count };
});
/* home bases arc (Atlanta and Mexico City) revealed in the AI chapter */
const homeCurve = arcCurve('mexico', 'atlanta');
const homeGeo = new THREE.TubeGeometry(homeCurve, 120, 0.0045, 6, false);
const homeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
globe.add(new THREE.Mesh(homeGeo, homeMat));

/* lights for the models */
scene.add(new THREE.HemisphereLight(0xf4f1ea, 0x1a2233, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 4); scene.add(key);

/* ---------- texture ---------- */
const big = innerWidth > 900 && renderer.capabilities.maxTextureSize >= 4096;
new THREE.TextureLoader().load(`assets/tex/earth-night-${big ? 3600 : 2048}.jpg`, tex => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  earthMat.map = tex;
  earthMat.color.setRGB(1.25, 1.22, 1.18);
  earthMat.needsUpdate = true;
  canvas.classList.add('is-ready');
  plate.classList.add('is-ready');
});

/* ---------- MODELS ---------- */
const PLANE_FLIP = false; // set true if the nose points backward
const models = { plane: null, sat: null, update() {} };
function fadeable(root) {
  const mats = [];
  root.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; mats.push(o.material); } });
  return op => { for (const m of mats) { m.opacity = op; m.depthWrite = op > 0.98; } root.visible = op > 0.01; };
}
async function loadModels() {
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import('./assets/vendor/addons/loaders/GLTFLoader.js'),
    import('./assets/vendor/addons/loaders/DRACOLoader.js'),
  ]);
  const draco = new DRACOLoader().setDecoderPath('assets/vendor/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const [pg, sg] = await Promise.all([loader.loadAsync('assets/models/airliner.glb'), loader.loadAsync('assets/models/satellite.glb')]);

  // airliner: centre it, scale to a readable size on the globe
  const plane = new THREE.Group(); const pm = pg.scene;
  const pb = new THREE.Box3().setFromObject(pm); pm.position.sub(pb.getCenter(new THREE.Vector3()));
  if (PLANE_FLIP) pm.rotation.y = Math.PI;
  plane.add(pm); plane.scale.setScalar(0.0029); globe.add(plane);
  const planeFade = fadeable(plane); planeFade(0);

  const sat = new THREE.Group(); const sm = sg.scene;
  const sb = new THREE.Box3().setFromObject(sm); sm.position.sub(sb.getCenter(new THREE.Vector3()));
  sat.add(sm); sat.scale.setScalar(0.016); scene.add(sat);
  const satFade = fadeable(sat); satFade(0);

  const up = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), m4 = new THREE.Matrix4();
  models.update = (t, time) => {
    // plane: parked at Kyiv from t=1, flies leg k between chapter k+1 and k+2, parked at Mexico City, then fades for the AI chapter
    const vis = Math.min(Math.max((t - 0.55) / 0.35, 0), 1) * (1 - Math.min(Math.max((t - 4.25) / 0.45, 0), 1));
    planeFade(vis);
    if (vis > 0) {
      const k = Math.min(Math.max(Math.floor(t) - 1, 0), LEGS.length - 1);
      const s = Math.min(Math.max(t - (k + 1), 0), 1);
      const ss = Math.min(Math.max(s, 0.001), 0.999);
      const c = arcs[k].curve;
      const p = c.getPointAt(ss); const p2 = c.getPointAt(Math.min(ss + 0.004, 1)); const p0 = c.getPointAt(Math.max(ss - 0.004, 0));
      fwd.subVectors(p2, p0).normalize();
      up.copy(p).normalize();
      side.crossVectors(up, fwd).normalize();
      up.crossVectors(fwd, side).normalize();
      m4.makeBasis(side, up, fwd);
      plane.quaternion.setFromRotationMatrix(m4);
      plane.position.copy(p).addScaledVector(up, 0.012);
    }
    // satellite: crosses the AI chapter on a tilted orbit in camera space
    const sv = Math.min(Math.max((t - 4.35) / 0.5, 0), 1);
    satFade(sv);
    if (sv > 0) {
      const a = (REDUCED ? 0.6 : time * 0.16) % (Math.PI * 2);
      const r = 1.32;
      sat.position.set(Math.cos(a) * r, 0.42 + Math.sin(a) * 0.18, Math.sin(a) * r * 0.55 + 0.5);
      sat.rotation.set(0.35, -a + 0.6, 0.15);
    }
  };
}
loadModels().catch(err => console.warn('models skipped', err));

/* ---------- scroll to chapter progress ---------- */
let targetT = 0, curT = 0;
function readScroll() {
  const mobile = innerWidth <= 860;
  const line = mobile ? plate.offsetHeight + 24 : innerHeight / 2;
  const d = chapters.map(c => { const r = c.getBoundingClientRect(); return (mobile ? r.top : r.top + r.height / 2) - line; });
  let t = 0;
  if (d[0] > 0) t = 0;
  else if (d[d.length - 1] <= 0) t = d.length - 1;
  else for (let i = 0; i < d.length - 1; i++) if (d[i] <= 0 && d[i + 1] > 0) { t = i + (-d[i]) / (d[i + 1] - d[i]); break; }
  targetT = t;
}
addEventListener('scroll', readScroll, { passive: true });

/* ---------- size ---------- */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // distance at which the globe plus halo fits the narrower side of the plate
  const halfV = camera.fov * D2R / 2, halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  camera.userData.fit = 1.16 / Math.sin(Math.min(halfV, halfH));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

/* ---------- shadow follows the globe's on-screen size ---------- */
const shadowEl = document.querySelector('.plate-shadow');
let lastR = -1;
function placeShadow() {
  const h = canvas.clientHeight, top = canvas.offsetTop;
  const ang = Math.asin(Math.min(1 / camera.position.z, 1));
  const r = Math.tan(ang) / Math.tan(camera.fov * D2R / 2) * h / 2;
  if (Math.abs(r - lastR) < 0.5) return; lastR = r;
  shadowEl.style.top = `${top + h / 2 + r * 1.12}px`;
  shadowEl.style.width = `${r * 1.5}px`;
  shadowEl.style.opacity = String(Math.min(1, Math.max(0, (h / 2 - r * 1.12) / 40)));
}

/* ---------- loop ---------- */
let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(plate);
const clock = new THREE.Clock();
const qTmp = new THREE.Quaternion();
const smooth = x => x * x * (3 - 2 * x);

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (!visible) return;
  curT += (targetT - curT) * (REDUCED ? 1 : 1 - Math.exp(-dt * 6));
  const i = Math.min(Math.floor(curT), STATE.length - 2);
  const f = smooth(Math.min(Math.max(curT - i, 0), 1));
  qTmp.slerpQuaternions(STATE[i].q, STATE[i + 1].q, f);
  // slow drift on the opening view only
  if (!REDUCED) {
    const drift = Math.max(0, 1 - curT * 1.6);
    if (drift > 0) qTmp.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(time * 0.12) * 0.35 * drift));
  }
  globe.quaternion.copy(qTmp);
  // phones never zoom in past the full globe, so it never outgrows the screen
  const zoom = THREE.MathUtils.lerp(STATE[i].dist, STATE[i + 1].dist, f);
  camera.position.z = (innerWidth <= 860 ? Math.max(zoom, 1) : zoom) * camera.userData.fit;

  // arcs draw as each leg is flown
  arcs.forEach((a, k) => {
    const p = Math.min(Math.max(curT - (k + 1), 0), 1);
    a.geo.setDrawRange(0, Math.floor(a.total * p / 6 / 6) * 6 * 6);
  });
  homeMat.opacity = Math.min(Math.max((curT - 4.2) / 0.6, 0), 1) * 0.9;

  // active marker ring
  const active = ORDER[Math.round(curT)];
  for (const [k, m] of Object.entries(markers)) {
    const on = k === active ? 1 : 0;
    m.ring.material.opacity += (on * 0.9 - m.ring.material.opacity) * 0.12;
    m.dot.material.opacity += ((on ? 1 : 0.55) - m.dot.material.opacity) * 0.12;
    const s = 1 + (REDUCED ? 0 : 0.15 * Math.sin(time * 2.4));
    m.ring.scale.setScalar(s);
  }
  models.update(curT, time, dt);
  placeShadow();
  renderer.render(scene, camera);
}
readScroll();
frame();

/* ---------- gauges ---------- */
const C = 2 * Math.PI * 52;
const gio = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const g = e.target, fill = parseFloat(g.dataset.fill);
    g.querySelector('.g-arc').style.strokeDashoffset = String(C * (1 - fill));
    const n = g.querySelector('[data-count]');
    if (n && !REDUCED) {
      const to = +n.dataset.count, t0 = performance.now();
      const step = now => { const k = Math.min((now - t0) / 1400, 1); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    gio.unobserve(g);
  }
}, { threshold: 0.4 });
document.querySelectorAll('.gauge').forEach(g => gio.observe(g));

/* ---------- cabin window: pull the shade for night mode ---------- */
const root = document.documentElement;
const cabin = document.querySelector('.cabin-toggle');
const shade = cabin.querySelector('.cabin-shade');
const THEMES = {
  light: { halo: 0xa9b6cb, haloA: 0.32, rim: 0xa7b9d8 },
  dark:  { halo: 0x4f6f9f, haloA: 0.55, rim: 0x86a3d4 },
};
function paintTheme() {
  const t = root.dataset.theme === 'dark' ? 'dark' : 'light';
  cabin.setAttribute('aria-pressed', String(t === 'dark'));
  cabin.setAttribute('aria-label', t === 'dark' ? 'Day mode: raise the window shade' : 'Night mode: pull the window shade down');
  const c = THEMES[t];
  haloMat.uniforms.uColor.value.setHex(c.halo);
  haloMat.uniforms.uA.value = c.haloA;
  rimMat.uniforms.uColor.value.setHex(c.rim);
}
function setTheme(t) {
  root.dataset.theme = t;
  try { localStorage.setItem('kb-theme', t); } catch (e) {}
  paintTheme();
}
paintTheme();

// a tap toggles through the native click; only a real vertical drag (past 12px) pulls the shade by hand
let drag = null, suppressClick = false;
cabin.addEventListener('pointerdown', e => {
  cabin.classList.remove('is-nudge');
  drag = { y: e.clientY, moved: false, id: e.pointerId, start: root.dataset.theme === 'dark' ? -20 : -84 };
});
cabin.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.abs(dy) > 12) { drag.moved = true; cabin.classList.add('is-dragging'); try { cabin.setPointerCapture(drag.id); } catch (err) {} }
  if (drag.moved) {
    shade.style.transform = `translateY(${Math.min(-20, Math.max(-84, drag.start + dy * 2.4))}%)`;
    drag.dy = dy;
  }
});
function finishDrag() {
  if (!drag) return;
  if (drag.moved) {
    cabin.classList.remove('is-dragging');
    shade.style.transform = '';
    setTheme(drag.dy > 0 ? 'dark' : 'light');
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 400);
  }
  drag = null;
}
cabin.addEventListener('pointerup', finishDrag);
cabin.addEventListener('pointercancel', () => { if (drag && drag.moved) { cabin.classList.remove('is-dragging'); shade.style.transform = ''; } drag = null; });
cabin.addEventListener('click', e => {
  if (suppressClick) { e.preventDefault(); return; }
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
});
cabin.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); setTheme('dark'); }
  if (e.key === 'ArrowUp') { e.preventDefault(); setTheme('light'); }
});

// first visit only: the shade tugs once so people see it moves
try {
  if (!localStorage.getItem('kb-theme') && !REDUCED && root.dataset.theme !== 'dark') {
    setTimeout(() => { cabin.classList.add('is-nudge'); setTimeout(() => cabin.classList.remove('is-nudge'), 1200); }, 2400);
  }
} catch (e) {}
