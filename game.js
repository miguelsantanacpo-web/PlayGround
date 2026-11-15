import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

// Fruit Slice 3D: lightweight Three.js arcade loop with local settings and synthesized audio.
const canvas = document.querySelector('#game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 6, -6, .1, 40);
camera.position.z = 20;
scene.add(new THREE.HemisphereLight(0xe4f8ff, 0x68423a, 2));
const light = new THREE.DirectionalLight(0xffedcc, 2.8);
light.position.set(-4, 6, 10);
scene.add(light);
const fruits = [
  ['Apple', 0xe94e43, 0xffe6a3, [1, 1, .9]], ['Peach', 0xf6a06f, 0xffdfad, [1, .94, .9]],
  ['Mango', 0xf6bb37, 0xffe28a, [.83, 1.12, .83]], ['Tangerine', 0xff9b32, 0xffd065, [1, .9, .92]],
  ['Watermelon', 0x3eaa62, 0xff5470, [1.12, .9, .86]], ['Dragon fruit', 0xe94e91, 0xfff0de, [.95, 1.05, .86]],
  ['Jackfruit', 0x86a944, 0xffd55b, [.82, 1.12, .82]]
];
let brightness = 1;
function mat(color) { const m = new THREE.MeshStandardMaterial({ color, roughness: .48 }); m.userData.original = new THREE.Color(color); m.color.copy(m.userData.original).multiplyScalar(brightness); return m; }
function createFruit(index) {
  const [name, color, inner, shape] = fruits[index];
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.68, 24, 18), mat(color));
  body.scale.set(...shape); body.castShadow = true; group.add(body);
  if (index !== 4 && index !== 5) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .22, 8), mat(0x79502e));
    stem.position.y = .68; group.add(stem);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 7), mat(0x5c9e45));
    leaf.scale.set(1, .35, .5); leaf.position.set(.13, .72, .02); leaf.rotation.z = -.4; group.add(leaf);
  }
  if (index === 4) {
    for (let i = -2; i <= 2; i++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(.65, .025, 5, 24), mat(0x267d4c));
      stripe.position.x = i * .2; stripe.rotation.y = Math.PI / 2; group.add(stripe);
    }
  }
  if (index === 5) for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, thorn = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 5), mat(0x70af52));
    thorn.position.set(Math.cos(a) * .52, Math.sin(a) * .5, 0); thorn.rotation.z = -a; group.add(thorn);
  }
  group.scale.setScalar(.78);
  group.userData = { fruit: true, index, color, inner, name, velocity: new THREE.Vector2(), age: 0 };
  return group;
}
function resize() {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight), hh = 6;
  renderer.setSize(w, h, false); camera.left = -hh * w / h; camera.right = hh * w / h;
  camera.top = hh; camera.bottom = -hh; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
let state = 'menu', score = 0, bestScore = 0, lives = 3, elapsed = 0, spawnIn = 0;
let lastSlice = 0, comboCount = 0, pointer = null;
const active = [], effects = [];
function removeFrom(list, obj) { const i = list.indexOf(obj); if (i !== -1) list.splice(i, 1); scene.remove(obj); }
function hideScreens() { document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden')); }
function updateBest() { document.querySelector('#menu-best').textContent = String(bestScore).padStart(4, '0'); }
function setScore(n) { score = n; document.querySelector('#score').textContent = String(score); }
function updateLives() { document.querySelector('#lives').textContent = '♥ '.repeat(lives).trim() + '♡ '.repeat(3 - lives).trim(); }
function loadBest() { try { bestScore = Number(localStorage.getItem('fruit-best')) || 0; } catch {} updateBest(); }
function toast(text) {
  const el = document.querySelector('#toast'); el.textContent = text; el.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), 1200);
}
function spawnFruit() {
  const fruit = createFruit(Math.floor(Math.random() * fruits.length));
  const halfWidth = camera.right;
  fruit.position.set((Math.random() * 2 - 1) * Math.max(1, halfWidth - 1), -6.5, 0);
  fruit.userData.velocity.set((Math.random() - .5) * 2.4, 8.7 + Math.random() * 1.8 + Math.min(1.5, elapsed * .025));
  fruit.userData.spin = (Math.random() - .5) * 2.4;
  scene.add(fruit); active.push(fruit);
}
function startGame() {
  ensureAudio(); hideScreens();
  for (const f of [...active]) removeFrom(active, f);
  for (const f of [...effects]) removeFrom(effects, f);
  state = 'playing'; score = 0; lives = 3; elapsed = 0; spawnIn = .35; comboCount = 0;
  setScore(0); updateLives(); document.querySelector('#hud').classList.remove('hidden');
  document.querySelector('#combo').classList.add('hidden');
}
function pauseGame() { if (state !== 'playing') return; state = 'paused'; document.querySelector('#pause-screen').classList.remove('hidden'); }
function resumeGame() { if (state !== 'paused') return; state = 'playing'; document.querySelector('#pause-screen').classList.add('hidden'); }
function goMenu() {
  state = 'menu';
  for (const f of [...active]) removeFrom(active, f);
  for (const f of [...effects]) removeFrom(effects, f);
  document.querySelector('#hud').classList.add('hidden'); hideScreens();
  document.querySelector('#menu-screen').classList.remove('hidden'); updateBest();
}
function endGame() {
  if (state !== 'playing') return;
  state = 'over'; document.querySelector('#final-score').textContent = score;
  document.querySelector('#final-best').textContent = bestScore;
  document.querySelector('#hud').classList.add('hidden');
  document.querySelector('#gameover-screen').classList.remove('hidden'); playSfx('over');
}
function missFruit(fruit) {
  removeFrom(active, fruit); lives = Math.max(0, lives - 1); updateLives(); toast('A fruit slipped away!');
  if (!lives) endGame();
}
function sliceFruit(fruit, direction) {
  const data = fruit.userData, pos = fruit.position.clone();
  removeFrom(active, fruit);
  const halves = [new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12, 0, Math.PI), mat(data.color)), new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12, Math.PI, Math.PI), mat(data.color))];
  halves.forEach((half, side) => {
    half.scale.set(.8, .9, .8); half.position.copy(pos); half.position.x += side ? .16 : -.16;
    half.userData = { effect: true, vx: (side ? 1 : -1) * 1.7 + direction.x * .25, vy: 2.2, age: 0, spin: side ? 3 : -3 };
    scene.add(half); effects.push(half);
  });
  const now = performance.now(); comboCount = now - lastSlice < 650 ? comboCount + 1 : 1; lastSlice = now;
  score += comboCount > 1 ? 20 : 10;
  if (score > bestScore) { bestScore = score; try { localStorage.setItem('fruit-best', String(bestScore)); } catch {} updateBest(); }
  setScore(score); playSfx(comboCount > 1 ? 'combo' : 'slice');
  if (comboCount > 1) {
    const el = document.querySelector('#combo'); el.textContent = `${comboCount}× COMBO!`; el.classList.remove('hidden');
    clearTimeout(el.timer); el.timer = setTimeout(() => el.classList.add('hidden'), 750);
  }
}
function worldPoint(event) {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(camera.left + (event.clientX - r.left) / r.width * (camera.right - camera.left), camera.top - (event.clientY - r.top) / r.height * (camera.top - camera.bottom));
}
function trail(from, to) {
  const el = document.createElement('i'), dx = to.clientX - from.clientX, dy = to.clientY - from.clientY;
  el.className = 'trail'; el.style.left = `${from.clientX}px`; el.style.top = `${from.clientY}px`;
  el.style.width = `${Math.hypot(dx, dy)}px`; el.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  document.querySelector('#trail-layer').appendChild(el); setTimeout(() => el.remove(), 130);
}
canvas.addEventListener('pointerdown', event => {
  if (state !== 'playing') return;
  pointer = { screen: { x: event.clientX, y: event.clientY }, world: worldPoint(event) };
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!pointer || state !== 'playing') return;
  const point = worldPoint(event), segment = new THREE.Vector2().subVectors(point, pointer.world);
  trail(pointer.screen, event);
  for (const fruit of [...active]) {
    const offset = new THREE.Vector2(fruit.position.x - pointer.world.x, fruit.position.y - pointer.world.y);
    const t = THREE.MathUtils.clamp(offset.dot(segment) / Math.max(segment.lengthSq(), .0001), 0, 1);
    if (offset.distanceTo(segment.clone().multiplyScalar(t)) < .55) sliceFruit(fruit, segment);
  }
  pointer = { screen: { x: event.clientX, y: event.clientY }, world: point };
});
function releasePointer() { pointer = null; }
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);

let audio = null, musicTimer = null, musicStep = 0;
function loadSettings() {
  const defaults = { master: .72, sfx: .75, music: .38, brightness: 1, musicOn: true, muted: false };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('fruit-settings') || '{}') }; } catch { return defaults; }
}
const settings = loadSettings();
function saveSettings() { try { localStorage.setItem('fruit-settings', JSON.stringify(settings)); } catch {} }
function volume(kind) { return settings.muted ? 0 : settings.master * (kind === 'music' ? settings.music : settings.sfx); }
function tone(freq, duration, wave = 'sine', gain = .06, delay = 0) {
  if (!audio) return;
  const now = audio.currentTime + delay, osc = audio.createOscillator(), amp = audio.createGain();
  osc.type = wave; osc.frequency.value = freq; amp.gain.setValueAtTime(.0001, now);
  amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain * volume('sfx')), now + .01);
  amp.gain.exponentialRampToValueAtTime(.0001, now + duration);
  osc.connect(amp); amp.connect(audio.destination); osc.start(now); osc.stop(now + duration + .02);
}
function playSfx(kind) {
  if (kind === 'slice') { tone(820, .09, 'sawtooth', .045); tone(1200, .12, 'sine', .03, .025); }
  if (kind === 'combo') { tone(660, .12, 'triangle'); tone(990, .18, 'triangle', .05, .08); }
  if (kind === 'tap') tone(620, .07, 'sine', .04);
  if (kind === 'over') { tone(400, .2, 'triangle'); tone(300, .3, 'triangle', .04, .16); }
}
const melody = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 988, 880, 784, 659, 587];
function startMusic() {
  if (!audio || musicTimer || !settings.musicOn) return;
  musicTimer = setInterval(() => {
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    osc.frequency.value = melody[musicStep++ % melody.length]; gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, .025 * volume('music')), now + .06);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .3); osc.connect(gain); gain.connect(audio.destination);
    osc.start(now); osc.stop(now + .32);
  }, 320);
}
function ensureAudio() {
  if (!audio) { const C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); }
  if (audio?.state === 'suspended') audio.resume();
  if (settings.musicOn) startMusic();
}
function syncSettingsUI() {
  for (const [id, key] of [['master-volume','master'], ['sfx-volume','sfx'], ['music-volume','music'], ['brightness','brightness']]) document.getElementById(id).value = settings[key];
  for (const [id, key] of [['master-value','master'], ['sfx-value','sfx'], ['music-value','music'], ['brightness-value','brightness']]) document.getElementById(id).textContent = `${Math.round(settings[key] * 100)}%`;
  document.querySelector('#music-switch span').textContent = settings.musicOn ? 'ON' : 'OFF';
  document.querySelector('#sound-toggle').textContent = settings.muted ? '♫̸' : '♫';
  brightness = settings.brightness;
  scene.traverse(obj => { const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; for (const m of mats) if (m?.userData.original) m.color.copy(m.userData.original).multiplyScalar(brightness); });
}
for (const [id, key] of [['master-volume','master'], ['sfx-volume','sfx'], ['music-volume','music'], ['brightness','brightness']]) {
  document.getElementById(id).addEventListener('input', event => { settings[key] = Number(event.target.value); saveSettings(); syncSettingsUI(); });
}
document.querySelector('#music-switch').addEventListener('click', () => {
  settings.musicOn = !settings.musicOn; if (settings.musicOn) { ensureAudio(); startMusic(); } else { clearInterval(musicTimer); musicTimer = null; }
  saveSettings(); syncSettingsUI(); playSfx('tap');
});
document.querySelector('#sound-toggle').addEventListener('click', () => { settings.muted = !settings.muted; saveSettings(); syncSettingsUI(); if (!settings.muted) { ensureAudio(); playSfx('tap'); } });
function clickSound() { ensureAudio(); playSfx('tap'); }
document.querySelector('#play-button').addEventListener('click', startGame);
document.querySelector('#settings-button').addEventListener('click', () => { clickSound(); hideScreens(); document.querySelector('#settings-screen').classList.remove('hidden'); syncSettingsUI(); });
document.querySelector('#credits-button').addEventListener('click', () => { clickSound(); hideScreens(); document.querySelector('#credits-screen').classList.remove('hidden'); });
document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => { clickSound(); hideScreens(); document.getElementById(button.dataset.back).classList.remove('hidden'); }));
document.querySelectorAll('[data-menu]').forEach(button => button.addEventListener('click', () => { clickSound(); goMenu(); }));
document.querySelector('#pause-button').addEventListener('click', () => { playSfx('tap'); pauseGame(); });
document.querySelector('#resume-button').addEventListener('click', () => { playSfx('tap'); resumeGame(); });
document.querySelector('#restart-button').addEventListener('click', startGame);
document.querySelector('#again-button').addEventListener('click', startGame);
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });
syncSettingsUI(); loadBest();
let lastFrame = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(.04, (now - lastFrame) / 1000); lastFrame = now;
  if (state === 'playing') {
    elapsed += dt; spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnFruit();
      if (elapsed > 15 && Math.random() < .32) spawnFruit();
      spawnIn = Math.max(.72, 1.55 - elapsed * .008 - score * .00035) + Math.random() * .35;
    }
    for (const fruit of [...active]) {
      const d = fruit.userData; d.age += dt; d.velocity.y -= 9.5 * dt;
      fruit.position.x += d.velocity.x * dt; fruit.position.y += d.velocity.y * dt;
      fruit.rotation.z += d.spin * dt;
      if (fruit.position.y < -6.8) missFruit(fruit);
    }
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const obj = effects[i], d = obj.userData; d.age += dt; d.vy -= 8 * dt;
    obj.position.x += d.vx * dt; obj.position.y += d.vy * dt; obj.rotation.z += d.spin * dt;
    if (d.age > 1.3 || obj.position.y < -7) removeFrom(effects, obj);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
