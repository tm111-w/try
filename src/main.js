const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const materialDefs = {
  wood: { density: 0.6, restitution: 0.4, color: getComputedStyle(document.documentElement).getPropertyValue('--wood') },
  stone: { density: 1.2, restitution: 0.2, color: getComputedStyle(document.documentElement).getPropertyValue('--stone') },
  ice: { density: 0.4, restitution: 0.5, color: getComputedStyle(document.documentElement).getPropertyValue('--ice') },
};

const birdDefs = {
  blue: { color: '#5bb4ff', description: '三分鸟：触发分裂成三个' },
  yellow: { color: '#ffd447', description: '加速鸟：触发瞬时提速' },
  black: { color: '#3a3a3a', description: '爆炸鸟：触发小范围爆炸' },
};

class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s) { return new Vec2(this.x * s, this.y * s); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  len() { return Math.hypot(this.x, this.y); }
  norm() {
    const l = this.len();
    return l === 0 ? new Vec2(0, 0) : this.scale(1 / l);
  }
}

class Body {
  constructor({ pos, size, mass, restitution = 0.3, staticBody = false, color = '#888' }) {
    this.pos = pos;
    this.size = size;
    this.vel = new Vec2(0, 0);
    this.mass = mass;
    this.invMass = staticBody ? 0 : 1 / mass;
    this.restitution = restitution;
    this.staticBody = staticBody;
    this.color = color;
    this.type = 'block';
    this.health = mass * 20;
  }
  get half() { return this.size.scale(0.5); }
  get aabb() {
    return { min: this.pos.sub(this.half), max: this.pos.add(this.half) };
  }
}

class Circle {
  constructor({ pos, radius, mass, restitution = 0.5, staticBody = false, color = '#f66' }) {
    this.pos = pos;
    this.radius = radius;
    this.vel = new Vec2(0, 0);
    this.mass = mass;
    this.invMass = staticBody ? 0 : 1 / mass;
    this.restitution = restitution;
    this.staticBody = staticBody;
    this.color = color;
    this.type = 'circle';
    this.health = mass * 15;
  }
}

class Particle {
  constructor(pos, vel, life, color) {
    this.pos = pos;
    this.vel = vel;
    this.life = life;
    this.color = color;
  }
  update(dt) {
    this.pos = this.pos.add(this.vel.scale(dt));
    this.vel = this.vel.add(new Vec2(0, 400 * dt));
    this.life -= dt;
  }
}

class PhysicsWorld {
  constructor() {
    this.gravity = new Vec2(0, 900);
    this.bodies = [];
    this.particles = [];
  }
  add(body) { this.bodies.push(body); return body; }
  addParticle(p) { this.particles.push(p); }

  step(dt) {
    for (const body of this.bodies) {
      if (body.invMass === 0) continue;
      body.vel = body.vel.add(this.gravity.scale(dt));
      body.pos = body.pos.add(body.vel.scale(dt));
    }

    this.handleCollisions();
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => p.life > 0);
  }

  handleCollisions() {
    const groundY = canvas.height - 30;
    for (const body of this.bodies) {
      const halfY = body.radius ?? body.half.y;
      if (body.pos.y + halfY > groundY) {
        const depth = body.pos.y + halfY - groundY;
        body.pos.y -= depth;
        if (body.vel.y > 0) body.vel.y *= -body.restitution;
        this.damage(body, body.vel.len() * 2);
      }
    }

    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i];
        const b = this.bodies[j];
        this.resolveCollision(a, b);
      }
    }
  }

  resolveCollision(a, b) {
    if (a.invMass === 0 && b.invMass === 0) return;
    if (a.type === 'block' && b.type === 'block') {
      if (!this.aabbOverlap(a, b)) return;
      const overlapX = Math.min(a.aabb.max.x, b.aabb.max.x) - Math.max(a.aabb.min.x, b.aabb.min.x);
      const overlapY = Math.min(a.aabb.max.y, b.aabb.max.y) - Math.max(a.aabb.min.y, b.aabb.min.y);
      if (overlapX <= 0 || overlapY <= 0) return;
      const normal = overlapX < overlapY ? new Vec2(Math.sign(a.pos.x - b.pos.x) || 1, 0) : new Vec2(0, Math.sign(a.pos.y - b.pos.y) || 1);
      const penetration = overlapX < overlapY ? overlapX : overlapY;
      this.applyImpulse(a, b, normal, penetration);
    } else {
      this.circleRectCollision(a, b);
    }
  }

  aabbOverlap(a, b) {
    return !(a.aabb.max.x < b.aabb.min.x || a.aabb.min.x > b.aabb.max.x || a.aabb.max.y < b.aabb.min.y || a.aabb.min.y > b.aabb.max.y);
  }

  circleRectCollision(a, b) {
    let circle, rect;
    if (a.radius !== undefined && b.aabb) { circle = a; rect = b; }
    else if (b.radius !== undefined && a.aabb) { circle = b; rect = a; }
    else return;

    const closestX = Math.max(rect.aabb.min.x, Math.min(circle.pos.x, rect.aabb.max.x));
    const closestY = Math.max(rect.aabb.min.y, Math.min(circle.pos.y, rect.aabb.max.y));
    const dx = circle.pos.x - closestX;
    const dy = circle.pos.y - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq <= circle.radius * circle.radius) {
      const dist = Math.max(Math.sqrt(distSq), 0.0001);
      const normal = new Vec2(dx / dist, dy / dist);
      const penetration = circle.radius - dist;
      this.applyImpulse(circle, rect, normal, penetration);
    }
  }

  applyImpulse(a, b, normal, penetration) {
    const totalInvMass = a.invMass + b.invMass;
    if (totalInvMass === 0) return;

    const correction = normal.scale(penetration / totalInvMass);
    if (a.invMass !== 0) a.pos = a.pos.add(correction.scale(a.invMass));
    if (b.invMass !== 0) b.pos = b.pos.sub(correction.scale(b.invMass));

    const relativeVel = a.vel.sub(b.vel);
    const velAlongNormal = relativeVel.dot(normal);
    if (velAlongNormal > 0) return;

    const restitution = Math.min(a.restitution ?? 0.3, b.restitution ?? 0.3);
    const j = -(1 + restitution) * velAlongNormal / totalInvMass;
    const impulse = normal.scale(j);
    if (a.invMass !== 0) a.vel = a.vel.add(impulse.scale(a.invMass));
    if (b.invMass !== 0) b.vel = b.vel.sub(impulse.scale(b.invMass));

    const damageAmount = Math.abs(j) * 0.5;
    this.damage(a, damageAmount);
    this.damage(b, damageAmount);
  }

  damage(body, value) {
    if (body.health === undefined || body.invMass === 0) return;
    body.health -= value;
    if (body.health <= 0) {
      spawnBurst(body.pos, body.color || '#fff');
      playSound(180 + Math.random() * 40, 0.12);
      this.bodies = this.bodies.filter(b => b !== body);
    }
  }
}

const world = new PhysicsWorld();
const slingAnchor = new Vec2(160, canvas.height - 120);
let dragging = false;
let currentBird = null;
let launched = false;
let editorMode = false;
let levelData = { blocks: [], pigs: [], birds: ['blue', 'yellow', 'black'] };
let overlay = null;
let lastTime = performance.now();

function createGround() {
  world.add(new Body({ pos: new Vec2(canvas.width / 2, canvas.height - 15), size: new Vec2(canvas.width, 30), mass: 10000, restitution: 0.1, staticBody: true, color: '#c4e0a8' }));
}

function spawnBlock(x, y, material = 'wood', record = true) {
  const def = materialDefs[material];
  const size = new Vec2(80, 40);
  const mass = size.x * size.y * def.density / 1000;
  const body = new Body({ pos: new Vec2(x, y), size, mass, restitution: def.restitution, color: def.color });
  body.type = 'block';
  body.material = material;
  world.add(body);
  if (record) levelData.blocks.push({ x, y, material });
}

function spawnPig(x, y, record = true) {
  const pig = new Circle({ pos: new Vec2(x, y), radius: 18, mass: 1.2, restitution: 0.3, color: getComputedStyle(document.documentElement).getPropertyValue('--pig') });
  pig.type = 'pig';
  world.add(pig);
  if (record) levelData.pigs.push({ x, y });
}

function spawnBird(type = 'blue') {
  const bird = new Circle({ pos: slingAnchor.add(new Vec2(0, 10)), radius: 16, mass: 1, restitution: 0.4, color: birdDefs[type].color });
  bird.type = 'circle';
  bird.birdType = type;
  currentBird = bird;
  world.add(bird);
}

function setupDefaultLevel() {
  levelData = { blocks: [], pigs: [], birds: ['blue', 'yellow', 'black'] };
  world.bodies = [];
  createGround();
  spawnBlock(760, canvas.height - 80, 'wood');
  spawnBlock(840, canvas.height - 80, 'wood');
  spawnBlock(800, canvas.height - 140, 'stone');
  spawnPig(800, canvas.height - 200);
  spawnPig(880, canvas.height - 140);
  spawnBird(levelData.birds[0]);
}

setupDefaultLevel();

canvas.addEventListener('mousedown', (e) => {
  const { x, y } = getMouse(e);
  if (editorMode) {
    placeEditorElement(x, y);
    return;
  }
  if (!currentBird || launched) return;
  const dist = new Vec2(x, y).sub(currentBird.pos).len();
  if (dist < 30) dragging = true;
});

canvas.addEventListener('mousemove', (e) => {
  if (!dragging || !currentBird) return;
  const { x, y } = getMouse(e);
  const dir = new Vec2(x, y).sub(slingAnchor);
  const limited = clampLength(dir, 150);
  currentBird.pos = slingAnchor.add(limited);
});

window.addEventListener('mouseup', () => {
  if (!dragging || !currentBird) return;
  const pull = slingAnchor.sub(currentBird.pos);
  currentBird.vel = pull.scale(3);
  launched = true;
  dragging = false;
  playSound(300, 0.15);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') triggerBirdSkill();
});
canvas.addEventListener('click', () => { if (launched) triggerBirdSkill(); });

document.getElementById('playButton').addEventListener('click', () => {
  setupDefaultLevel();
  launched = false;
});

document.getElementById('editorToggle').addEventListener('click', () => {
  editorMode = !editorMode;
  showOverlay(editorMode ? '编辑器模式：点击画布放置元素' : '游戏模式');
});

document.getElementById('saveLevel').addEventListener('click', () => {
  localStorage.setItem('customLevel', JSON.stringify(levelData));
  showOverlay('关卡已保存');
});

document.getElementById('loadLevel').addEventListener('click', () => {
  const raw = localStorage.getItem('customLevel');
  if (!raw) return showOverlay('没有保存的关卡');
  loadLevel(JSON.parse(raw));
  showOverlay('已载入关卡');
});

function loadLevel(data) {
  levelData = data;
  world.bodies = [];
  createGround();
  data.blocks.forEach(b => spawnBlock(b.x, b.y, b.material, false));
  data.pigs.forEach(p => spawnPig(p.x, p.y, false));
  world.bodies = world.bodies.filter(b => b.type !== 'circle');
  const firstBird = levelData.birds[0] ?? 'blue';
  spawnBird(firstBird);
  launched = false;
}

function placeEditorElement(x, y) {
  const element = document.getElementById('elementSelect').value;
  const material = document.getElementById('materialSelect').value;
  const birdType = document.getElementById('birdSelect').value;
  if (element === 'block') {
    spawnBlock(x, y, material);
  } else if (element === 'pig') {
    spawnPig(x, y);
  } else if (element === 'bird') {
    levelData.birds.push(birdType);
    showOverlay(`已添加鸟：${birdType}`);
  }
}

function triggerBirdSkill() {
  if (!currentBird || !launched || currentBird.usedSkill) return;
  currentBird.usedSkill = true;
  if (currentBird.birdType === 'blue') {
    splitBird(currentBird);
  } else if (currentBird.birdType === 'yellow') {
    currentBird.vel = currentBird.vel.scale(1.8);
    spawnTrail(currentBird.pos, '#ffd447');
    playSound(760, 0.1);
  } else if (currentBird.birdType === 'black') {
    explode(currentBird.pos, 90);
    playSound(90, 0.3);
  }
}

function splitBird(bird) {
  const offsets = [new Vec2(-8, -4), new Vec2(0, 0), new Vec2(8, -4)];
  const birds = offsets.map((o, i) => {
    const b = new Circle({ pos: bird.pos.add(o), radius: 14, mass: 0.8, restitution: 0.4, color: bird.color });
    b.type = 'circle';
    b.birdType = 'blue';
    b.vel = bird.vel.add(new Vec2((i - 1) * 60, -40));
    world.add(b);
    return b;
  });
  world.bodies = world.bodies.filter(b => b !== bird);
  currentBird = birds[1];
  spawnBurst(bird.pos, '#8fceff');
}

function explode(pos, radius) {
  world.bodies.forEach(body => {
    if (body.invMass === 0) return;
    const dir = body.pos.sub(pos);
    const dist = dir.len();
    if (dist < radius) {
      const force = (radius - dist) * 8;
      body.vel = body.vel.add(dir.norm().scale(force * body.invMass));
      world.damage(body, force * 2);
    }
  });
  spawnBurst(pos, '#f35');
}

function spawnBurst(pos, color) {
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const speed = 80 + Math.random() * 80;
    world.addParticle(new Particle(pos, new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed), 0.8, color));
  }
}

function spawnTrail(pos, color) {
  for (let i = 0; i < 8; i++) {
    world.addParticle(new Particle(pos, new Vec2((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50), 0.4, color));
  }
}

function clampLength(vec, maxLen) {
  const len = vec.len();
  return len > maxLen ? vec.norm().scale(maxLen) : vec;
}

function getMouse(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function showOverlay(text) {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
  }
  overlay.textContent = text;
  overlay.style.left = '16px';
  overlay.style.top = '16px';
  overlay.style.opacity = '1';
  setTimeout(() => { if (overlay) overlay.style.opacity = '0'; }, 1200);
}

function drawSling() {
  ctx.strokeStyle = '#5b3a1b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(slingAnchor.x - 18, slingAnchor.y + 6);
  if (currentBird && !launched) ctx.lineTo(currentBird.pos.x, currentBird.pos.y);
  ctx.lineTo(slingAnchor.x + 18, slingAnchor.y + 6);
  ctx.stroke();

  ctx.fillStyle = '#7c4a24';
  ctx.beginPath();
  ctx.arc(slingAnchor.x, slingAnchor.y + 8, 12, 0, Math.PI * 2);
  ctx.fill();
}

function renderWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#c4e0a8';
  ctx.fillRect(0, canvas.height - 30, canvas.width, 40);
  drawSling();

  for (const body of world.bodies) {
    ctx.save();
    ctx.fillStyle = body.color;
    if (body.type === 'block') {
      ctx.fillRect(body.pos.x - body.half.x, body.pos.y - body.half.y, body.size.x, body.size.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.strokeRect(body.pos.x - body.half.x, body.pos.y - body.half.y, body.size.x, body.size.y);
    } else {
      ctx.beginPath();
      ctx.arc(body.pos.x, body.pos.y, body.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (body.type === 'pig') {
      ctx.fillStyle = '#2d7d1b';
      ctx.fillText('🐷', body.pos.x - 8, body.pos.y + 4);
    }
    ctx.restore();
  }

  world.particles.forEach(p => {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  renderUIHints();
}

function renderUIHints() {
  ctx.fillStyle = '#222';
  ctx.font = '15px sans-serif';
  ctx.fillText(editorMode ? '编辑器模式' : '游戏模式', 12, 22);
  if (!launched && currentBird) {
    ctx.fillText('拖动弹弓发射当前鸟', 12, 42);
  }
}

function nextBird() {
  const index = levelData.birds.indexOf(currentBird?.birdType);
  if (index >= 0) levelData.birds.splice(index, 1);
  if (levelData.birds.length > 0) {
    spawnBird(levelData.birds[0]);
    launched = false;
  } else {
    showOverlay('鸟已用完，点击“开始关卡”重置');
  }
}

function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.03);
  lastTime = now;
  world.step(dt);
  renderWorld();

  if (currentBird && launched && (currentBird.pos.x > canvas.width + 150 || currentBird.pos.y > canvas.height + 150)) {
    nextBird();
  }

  requestAnimationFrame(gameLoop);
}

function playSound(freq = 440, duration = 0.2) {
  const ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.15, ctxAudio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + duration);
  osc.connect(gain).connect(ctxAudio.destination);
  osc.start();
  osc.stop(ctxAudio.currentTime + duration);
}

requestAnimationFrame(gameLoop);
