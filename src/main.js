const canvas = document.getElementById('table');
const ctx = canvas.getContext('2d');

const resetButton = document.getElementById('resetGame');
const playerPanels = {
  A: document.getElementById('playerA'),
  B: document.getElementById('playerB'),
};
const turnName = document.getElementById('turnName');

const TABLE = { width: 1000, height: 550, cushion: 28, pocketRadius: 26 };
const BALL_RADIUS = 12;
const FRICTION = 0.992;
const STOP_EPS = 2e-2;

const COLORS = {
  cue: '#f8fafc',
  black: '#0f172a',
  solid: '#f97316',
  stripe: '#60a5fa',
};

const pockets = [
  { x: TABLE.cushion + 6, y: TABLE.cushion + 6 },
  { x: TABLE.width / 2, y: TABLE.cushion + 4 },
  { x: TABLE.width - TABLE.cushion - 6, y: TABLE.cushion + 6 },
  { x: TABLE.cushion + 6, y: TABLE.height - TABLE.cushion - 6 },
  { x: TABLE.width / 2, y: TABLE.height - TABLE.cushion - 4 },
  { x: TABLE.width - TABLE.cushion - 6, y: TABLE.height - TABLE.cushion - 6 },
];

class Ball {
  constructor({ number, x, y, type }) {
    this.number = number;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.type = type;
    this.pocketed = false;
  }

  move(dt) {
    if (this.pocketed) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= FRICTION;
    this.vy *= FRICTION;

    if (Math.hypot(this.vx, this.vy) < STOP_EPS) {
      this.vx = 0;
      this.vy = 0;
    }
  }
}

const state = {
  balls: [],
  currentPlayer: 'A',
  assignments: { A: null, B: null },
  scores: { A: 0, B: 0 },
  shotPockets: [],
  shotFoul: false,
  waitingAim: false,
  aiming: false,
  aimVector: null,
};

function rackBalls() {
  state.balls = [];
  const rackStart = { x: TABLE.width * 0.65, y: TABLE.height / 2 };
  let row = 1;
  let count = 0;
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    const col = Math.floor(count / row);
    const offsetY = (col - (row - 1) / 2) * (BALL_RADIUS * 2.2);
    const x = rackStart.x + row * (BALL_RADIUS * 1.9);
    const y = rackStart.y + offsetY;
    state.balls.push(new Ball({ number: n, x, y, type: ballType(n) }));
    count++;
    if (count === row * row) { row++; }
  }
  state.balls.push(new Ball({ number: 0, x: TABLE.width * 0.2, y: TABLE.height / 2, type: 'cue' }));
  state.assignments.A = null;
  state.assignments.B = null;
  state.scores.A = 0;
  state.scores.B = 0;
  state.currentPlayer = 'A';
  state.shotPockets = [];
  state.shotFoul = false;
  state.waitingAim = true;
  updateHud();
}

function ballType(number) {
  if (number === 0) return 'cue';
  if (number === 8) return 'black';
  if (number >= 1 && number <= 7) return 'solid';
  return 'stripe';
}

function drawTable() {
  ctx.clearRect(0, 0, TABLE.width, TABLE.height);

  ctx.fillStyle = '#073c21';
  ctx.fillRect(TABLE.cushion, TABLE.cushion, TABLE.width - 2 * TABLE.cushion, TABLE.height - 2 * TABLE.cushion);

  ctx.strokeStyle = '#052b17';
  ctx.lineWidth = 2;
  ctx.strokeRect(TABLE.cushion, TABLE.cushion, TABLE.width - 2 * TABLE.cushion, TABLE.height - 2 * TABLE.cushion);

  pockets.forEach(p => {
    const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, TABLE.pocketRadius);
    grad.addColorStop(0, '#111');
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, TABLE.pocketRadius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBalls() {
  state.balls.forEach(ball => {
    if (ball.pocketed) return;
    const { x, y, number, type } = ball;
    const color = COLORS[type] || COLORS.solid;
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = type === 'black' ? 3 : 1.5;
    ctx.stroke();

    ctx.fillStyle = type === 'black' ? '#f8fafc' : '#111827';
    ctx.font = 'bold 12px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number === 0 ? '●' : number, x, y);
  });
}

function drawCue() {
  const cueBall = getCueBall();
  if (!cueBall || cueBall.pocketed || !state.waitingAim) return;
  const mouse = state.aimVector;
  if (!state.aiming || !mouse) return;

  const aimDir = normalize(mouse.dx, mouse.dy);
  const len = Math.min(mouse.power, 160);
  const endX = cueBall.x - aimDir.x * len;
  const endY = cueBall.y - aimDir.y * len;

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cueBall.x, cueBall.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.strokeStyle = '#e2e8f0';
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(cueBall.x, cueBall.y);
  ctx.lineTo(cueBall.x + aimDir.x * 500, cueBall.y + aimDir.y * 500);
  ctx.stroke();
  ctx.setLineDash([]);
}

function normalize(x, y) {
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

function update(dt) {
  state.balls.forEach(ball => ball.move(dt));
  handleCollisions();
  checkPockets();

  if (!anyBallMoving()) {
    if (!state.waitingAim) {
      endOfShot();
    }
    state.waitingAim = true;
  }
}

function handleCollisions() {
  state.balls.forEach(ball => {
    if (ball.pocketed) return;
    const minX = TABLE.cushion + BALL_RADIUS;
    const maxX = TABLE.width - TABLE.cushion - BALL_RADIUS;
    const minY = TABLE.cushion + BALL_RADIUS;
    const maxY = TABLE.height - TABLE.cushion - BALL_RADIUS;

    if (ball.x < minX) { ball.x = minX; ball.vx = Math.abs(ball.vx) * 0.9; }
    if (ball.x > maxX) { ball.x = maxX; ball.vx = -Math.abs(ball.vx) * 0.9; }
    if (ball.y < minY) { ball.y = minY; ball.vy = Math.abs(ball.vy) * 0.9; }
    if (ball.y > maxY) { ball.y = maxY; ball.vy = -Math.abs(ball.vy) * 0.9; }
  });

  for (let i = 0; i < state.balls.length; i++) {
    for (let j = i + 1; j < state.balls.length; j++) {
      const a = state.balls[i];
      const b = state.balls[j];
      if (a.pocketed || b.pocketed) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0 || dist > BALL_RADIUS * 2) continue;
      const overlap = BALL_RADIUS * 2 - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * overlap / 2;
      a.y -= ny * overlap / 2;
      b.x += nx * overlap / 2;
      b.y += ny * overlap / 2;

      const dvx = a.vx - b.vx;
      const dvy = a.vy - b.vy;
      const relVel = dvx * nx + dvy * ny;
      if (relVel > 0) continue;
      const impulse = -(1 + 0.9) * relVel / 2;
      a.vx += impulse * nx;
      a.vy += impulse * ny;
      b.vx -= impulse * nx;
      b.vy -= impulse * ny;
    }
  }
}

function checkPockets() {
  state.balls.forEach(ball => {
    if (ball.pocketed) return;
    for (const p of pockets) {
      if (Math.hypot(ball.x - p.x, ball.y - p.y) < TABLE.pocketRadius - 2) {
        ball.pocketed = true;
        ball.vx = ball.vy = 0;
        state.shotPockets.push(ball);
        if (ball.type === 'cue') state.shotFoul = true;
        break;
      }
    }
  });
}

function getCueBall() {
  return state.balls.find(b => b.type === 'cue');
}

function anyBallMoving() {
  return state.balls.some(b => !b.pocketed && (Math.abs(b.vx) > STOP_EPS || Math.abs(b.vy) > STOP_EPS));
}

function startShot(force) {
  const cueBall = getCueBall();
  if (!cueBall || cueBall.pocketed) return;
  const dir = normalize(force.x, force.y);
  const speed = Math.min(Math.hypot(force.x, force.y), 220);
  cueBall.vx += dir.x * speed;
  cueBall.vy += dir.y * speed;
  state.waitingAim = false;
  state.shotPockets = [];
  state.shotFoul = false;
}

function endOfShot() {
  const player = state.currentPlayer;
  const opponent = player === 'A' ? 'B' : 'A';
  let pocketOwn = false;
  let pocketOpponent = false;
  let pocketBlack = false;

  state.shotPockets.forEach(ball => {
    if (ball.type === 'solid') pocketOwn ||= state.assignments[player] === 'solid' || state.assignments[player] === null;
    if (ball.type === 'stripe') pocketOwn ||= state.assignments[player] === 'stripe' || state.assignments[player] === null;
    if (state.assignments[player] && ball.type === state.assignments[opponent]) pocketOpponent = true;
    if (ball.type === 'black') pocketBlack = true;
  });

  if (!state.assignments[player] && !state.assignments[opponent]) {
    const firstGroup = state.shotPockets.find(b => b.type === 'solid' || b.type === 'stripe');
    if (firstGroup) {
      state.assignments[player] = firstGroup.type;
      state.assignments[opponent] = firstGroup.type === 'solid' ? 'stripe' : 'solid';
    }
  }

  let foul = state.shotFoul;
  if (pocketOpponent) foul = true;

  if (pocketBlack) {
    const won = state.assignments[player] && remainingGroupBalls(player) === 0;
    alert(won ? `${player} 击入黑球，赢得对局！` : `${player} 提前击入黑球，判负！`);
    rackBalls();
    return;
  }

  state.shotPockets.forEach(ball => {
    const owner = ball.type === state.assignments.A ? 'A' : ball.type === state.assignments.B ? 'B' : null;
    if (owner) state.scores[owner]++;
  });

  if (state.shotPockets.length === 0 || foul || (state.assignments[player] && !pocketOwn)) {
    state.currentPlayer = opponent;
  }

  if (getCueBall().pocketed) {
    placeCueBall();
  }

  state.shotPockets = [];
  state.shotFoul = false;
  updateHud();
}

function remainingGroupBalls(player) {
  const type = state.assignments[player];
  if (!type) return Infinity;
  return state.balls.filter(b => b.type === type && !b.pocketed).length;
}

function placeCueBall() {
  const cueBall = getCueBall();
  cueBall.pocketed = false;
  cueBall.x = TABLE.width * 0.2;
  cueBall.y = TABLE.height / 2;
  cueBall.vx = cueBall.vy = 0;
}

function updateHud() {
  turnName.textContent = `玩家 ${state.currentPlayer}`;
  ['A', 'B'].forEach(key => {
    const panel = playerPanels[key];
    panel.querySelector('.assignment').textContent = state.assignments[key] ? `${state.assignments[key] === 'solid' ? '实色' : '花色'}` : '未分组';
    panel.querySelector('.score').textContent = `进球：${state.scores[key]}`;
    panel.style.outline = key === state.currentPlayer ? '2px solid #fbbf24' : 'none';
  });
}

let lastTime = performance.now();
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 16, 3);
  lastTime = timestamp;
  drawTable();
  update(dt / 60);
  drawBalls();
  drawCue();
  requestAnimationFrame(loop);
}

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (TABLE.width / rect.width);
  const my = (e.clientY - rect.top) * (TABLE.height / rect.height);
  const cueBall = getCueBall();
  if (!cueBall || cueBall.pocketed || !state.waitingAim) return;
  const dist = Math.hypot(mx - cueBall.x, my - cueBall.y);
  if (dist > 80) return;
  state.aiming = true;
  state.aimVector = { dx: cueBall.x - mx, dy: cueBall.y - my, power: dist };
});

canvas.addEventListener('mousemove', e => {
  if (!state.aiming) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (TABLE.width / rect.width);
  const my = (e.clientY - rect.top) * (TABLE.height / rect.height);
  const cueBall = getCueBall();
  state.aimVector = { dx: cueBall.x - mx, dy: cueBall.y - my, power: Math.hypot(cueBall.x - mx, cueBall.y - my) };
});

canvas.addEventListener('mouseup', () => {
  if (!state.aiming || !state.aimVector) return;
  startShot(state.aimVector);
  state.aiming = false;
});

resetButton.addEventListener('click', rackBalls);

rackBalls();
requestAnimationFrame(loop);
