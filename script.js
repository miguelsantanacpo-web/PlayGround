const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const waveEl = document.getElementById('wave');
const citiesEl = document.getElementById('cities');
const batteryEl = document.getElementById('battery');
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreEl = document.getElementById('finalScore');

const cityConfigs = [
  { name: 'Las Vegas', x: 0.26, y: 0.84, radius: 18 },
  { name: 'New York', x: 0.18, y: 0.68, radius: 16 },
  { name: 'Los Angeles', x: 0.38, y: 0.76, radius: 17 },
  { name: 'São Paulo', x: 0.72, y: 0.83, radius: 17 },
  { name: 'Curitiba', x: 0.89, y: 0.66, radius: 15 },
  { name: 'Rio de Janeiro', x: 0.63, y: 0.72, radius: 16 }
];

const state = {
  running: false,
  score: 0,
  wave: 1,
  cityCount: 6,
  interceptors: 18,
  threatLevel: 0,
  lastTime: 0,
  enemySpawnTimer: 0,
  skyline: [],
  enemies: [],
  missiles: [],
  explosions: [],
  cities: [],
  pointer: { x: 0, y: 0, active: false },
  flashTimer: 0,
  message: '',
  messageTimer: 0,
  musicPulse: 0,
};

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  createCities(true);
}

function createCities(preserveDamage = false) {
  const previousCities = new Map(state.cities.map((city) => [city.name, city]));
  const compact = state.width < 600;
  const mobilePositions = [[0.13, 0.77], [0.29, 0.66], [0.45, 0.77], [0.61, 0.66], [0.77, 0.77], [0.91, 0.66]];
  state.cities = cityConfigs.map((city, index) => ({
    ...city,
    active: preserveDamage ? (previousCities.get(city.name)?.active ?? true) : true,
    x: (compact ? mobilePositions[index][0] : city.x) * state.width,
    y: (compact ? mobilePositions[index][1] : city.y) * state.height,
    pulse: previousCities.get(city.name)?.pulse ?? index * 0.7,
  }));
}

function resetGame() {
  state.running = true;
  state.score = 0;
  state.wave = 1;
  state.cityCount = 6;
  state.interceptors = 18;
  state.threatLevel = 0;
  state.enemies = [];
  state.missiles = [];
  state.explosions = [];
  state.enemySpawnTimer = 0;
  state.flashTimer = 0;
  state.message = 'DEFENSE GRID ONLINE';
  state.messageTimer = 2.2;
  createCities();
  updateHud();
  hideGameOver();
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  waveEl.textContent = String(state.wave);
  citiesEl.textContent = String(state.cityCount);
  batteryEl.textContent = String(state.interceptors);
}

function hideGameOver() {
  gameOverOverlay.classList.add('hidden');
}

function showGameOver() {
  finalScoreEl.textContent = String(state.score);
  gameOverOverlay.classList.remove('hidden');
}

function spawnEnemy() {
  const enemyCount = 1 + Math.min(2, Math.floor(state.wave / 2));
  for (let i = 0; i < enemyCount; i++) {
    const side = Math.random() < 0.5 ? -40 : state.width + 40;
    const x = side;
    const y = 60 + Math.random() * (state.height * 0.5);
    const activeCities = state.cities.filter((city) => city.active);
    if (!activeCities.length) continue;
    const targetCity = activeCities[Math.floor(Math.random() * activeCities.length)];
    const angle = Math.atan2(targetCity.y - y, targetCity.x - x);
    state.enemies.push({
      x,
      y,
      targetX: targetCity.x,
      targetY: targetCity.y,
      vx: Math.cos(angle) * (1.2 + state.wave * 0.18),
      vy: Math.sin(angle) * (1.2 + state.wave * 0.18),
      radius: 9 + Math.random() * 4,
      type: Math.random() < 0.7 ? 'bomber' : 'missile',
      hit: false,
      trail: [],
      hue: Math.random() < 0.5 ? 115 : 80,
    });
  }
}

function shootAt(x, y) {
  if (!state.running || state.interceptors <= 0) return;
  state.interceptors -= 1;
  updateHud();
  const originX = state.width * 0.5;
  const originY = state.height - 42;
  const dx = x - originX;
  const dy = y - originY;
  const distance = Math.hypot(dx, dy) || 1;
  const speed = 560;
  state.missiles.push({
    x: originX,
    y: originY,
    targetX: x,
    targetY: y,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
    radius: 4,
  });
}

function getClosestEnemy(x, y) {
  let closest = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = enemy;
    }
  }
  return closest;
}

function update(dt) {
  if (!state.running) return;

  state.threatLevel += dt * 0.08;
  state.enemySpawnTimer -= dt;
  if (state.enemySpawnTimer <= 0) {
    spawnEnemy();
    state.enemySpawnTimer = Math.max(0.7, 2.2 - state.wave * 0.12);
  }

  const nextWave = Math.min(12, 1 + Math.floor(state.score / 120));
  if (nextWave > state.wave) {
    state.wave = nextWave;
    state.interceptors = Math.min(30, state.interceptors + 6);
    state.message = `WAVE ${state.wave} INBOUND`;
    state.messageTimer = 2;
    updateHud();
  }

  for (const city of state.cities) {
    city.pulse += dt * 2;
  }

  for (let missileIndex = state.missiles.length - 1; missileIndex >= 0; missileIndex--) {
    const missile = state.missiles[missileIndex];
    const remaining = Math.hypot(missile.targetX - missile.x, missile.targetY - missile.y);
    const step = Math.hypot(missile.vx, missile.vy) * dt;
    if (remaining <= step + 3) {
      state.explosions.push({ x: missile.targetX, y: missile.targetY, radius: 10, maxRadius: 82, alpha: 1, life: 0 });
      state.missiles.splice(missileIndex, 1);
      continue;
    }
    missile.x += missile.vx * dt;
    missile.y += missile.vy * dt;

    let hitEnemy = null;
    for (const enemy of state.enemies) {
      if (Math.hypot(enemy.x - missile.x, enemy.y - missile.y) < enemy.radius + missile.radius + 4) {
        hitEnemy = enemy;
        break;
      }
    }
    if (hitEnemy) {
      state.explosions.push({ x: hitEnemy.x, y: hitEnemy.y, radius: 10, maxRadius: 82, alpha: 1, life: 0 });
      state.enemies = state.enemies.filter((enemy) => enemy !== hitEnemy);
      state.score += 10;
      state.missiles.splice(missileIndex, 1);
      updateHud();
    }
  }

  for (const enemy of [...state.enemies]) {
    enemy.x += enemy.vx * 60 * dt;
    enemy.y += enemy.vy * 60 * dt;
    enemy.trail.push({ x: enemy.x, y: enemy.y });
    if (enemy.trail.length > 8) enemy.trail.shift();

    if (Math.hypot(enemy.x - enemy.targetX, enemy.y - enemy.targetY) < 18) {
      const city = state.cities.find((c) => c.active && Math.hypot(c.x - enemy.targetX, c.y - enemy.targetY) < 12);
      if (city) {
        city.active = false;
        state.cityCount = state.cities.filter((c) => c.active).length;
        state.score = Math.max(0, state.score - 30);
        state.explosions.push({ x: city.x, y: city.y, radius: 18, maxRadius: 70, alpha: 1, life: 0 });
      }
      state.enemies = state.enemies.filter((e) => e !== enemy);
      if (state.cityCount <= 0) {
        state.running = false;
        showGameOver();
      }
      updateHud();
    }
  }

  for (let i = state.explosions.length - 1; i >= 0; i--) {
    const explosion = state.explosions[i];
    explosion.life += dt;
    explosion.radius = Math.min(explosion.maxRadius || 70, 10 + explosion.life * 150);
    explosion.alpha = Math.max(0, 1 - explosion.life / 0.8);
    if (explosion.life > 0.8) state.explosions.splice(i, 1);
  }

  for (const explosion of state.explosions) {
    for (const enemy of [...state.enemies]) {
      if (Math.hypot(enemy.x - explosion.x, enemy.y - explosion.y) <= explosion.radius + enemy.radius) {
        state.enemies = state.enemies.filter((candidate) => candidate !== enemy);
        state.score += 10;
        updateHud();
      }
    }
  }

  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
  }
}

function drawBackground() {
  ctx.fillStyle = '#040b07';
  ctx.fillRect(0, 0, state.width, state.height);

  for (let y = 0; y < state.height; y += 18) {
    ctx.strokeStyle = 'rgba(105,255,178,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
    ctx.stroke();
  }

  for (let x = 0; x < state.width; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height);
    ctx.strokeStyle = 'rgba(105,255,178,0.03)';
    ctx.stroke();
  }

  const groundY = state.height - 26;
  ctx.fillStyle = 'rgba(16, 45, 35, 0.95)';
  ctx.fillRect(0, groundY, state.width, state.height - groundY);

  ctx.strokeStyle = 'rgba(105,255,178,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < state.width; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, groundY);
    ctx.lineTo(i + 10, state.height);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(105,255,178,0.12)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 67 + (state.threatLevel * 17) % 100) % (state.width + 30);
    const y = 40 + (i * 37) % (state.height * 0.38);
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawCities() {
  for (const city of state.cities) {
    if (!city.active) continue;
    const pulse = 1 + Math.sin(city.pulse) * 0.15;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(105,255,178,0.18)';
    ctx.arc(city.x, city.y, city.radius * 1.6 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = '#7dffba';
    ctx.arc(city.x, city.y, city.radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(3, 12, 10, 0.9)';
    const labelWidth = Math.max(50, city.name.length * 7);
    ctx.fillRect(city.x - labelWidth / 2, city.y + 19, labelWidth, 18);
    ctx.fillStyle = '#bfffe0';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(city.name, city.x, city.y + 32);
  }
}

function drawDefenseBase() {
  const x = state.width * 0.5;
  const y = state.height - 25;
  ctx.strokeStyle = '#7eeab0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 60, y);
  ctx.lineTo(x + 60, y);
  ctx.lineTo(x + 20, y - 34);
  ctx.lineTo(x - 20, y - 34);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = '#a3ff7d';
  ctx.arc(x, y - 32, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawMissiles() {
  for (const missile of state.missiles) {
    ctx.beginPath();
    ctx.strokeStyle = '#9dffb3';
    ctx.lineWidth = 2;
    ctx.moveTo(missile.x, missile.y);
    const angle = Math.atan2(missile.vy, missile.vx);
    ctx.lineTo(missile.x - Math.cos(angle) * 12, missile.y - Math.sin(angle) * 12);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#b6ffd5';
    ctx.arc(missile.x, missile.y, missile.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 120, 120, 0.7)';
    for (let i = 0; i < enemy.trail.length; i++) {
      const pos = enemy.trail[i];
      const a = i / enemy.trail.length;
      ctx.fillStyle = `rgba(255, 120, 120, ${0.2 + a * 0.7})`;
      ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
    }

    ctx.beginPath();
    ctx.fillStyle = enemy.type === 'bomber' ? '#ff6b6b' : '#ff8a5b';
    ctx.moveTo(enemy.x, enemy.y - enemy.radius);
    ctx.lineTo(enemy.x + enemy.radius * 1.2, enemy.y);
    ctx.lineTo(enemy.x, enemy.y + enemy.radius);
    ctx.lineTo(enemy.x - enemy.radius * 1.2, enemy.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawExplosions() {
  for (const explosion of state.explosions) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 210, 113, ${explosion.alpha})`;
    ctx.lineWidth = 3;
    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 120, 120, ${explosion.alpha * 0.5})`;
    ctx.arc(explosion.x, explosion.y, explosion.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMessage() {
  if (state.messageTimer <= 0) return;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(state.width * 0.5 - 140, 34, 280, 40);
  ctx.fillStyle = '#d7ffe7';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(state.message, state.width * 0.5, 60);
}

function render() {
  drawBackground();
  drawCities();
  drawDefenseBase();
  drawMissiles();
  drawEnemies();
  drawExplosions();
  drawMessage();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - state.lastTime)/1000 || 0.016, 0.033);
  state.lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  state.pointer = { x, y, active: true };
  shootAt(x, y);
});

window.addEventListener('resize', resizeCanvas);

document.getElementById('startButton').addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  resetGame();
});

document.getElementById('restartButton').addEventListener('click', () => {
  resetGame();
});

resizeCanvas();
render();
requestAnimationFrame(loop);
