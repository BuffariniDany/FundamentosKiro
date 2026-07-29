// ─────────────────────────────────────────────
//  Flappy Kiro  –  game.js
// ─────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const scoreText = document.getElementById('score-text');

// ── Canvas size ──────────────────────────────
canvas.width  = 800;
canvas.height = 560;

// ── Game constants ───────────────────────────
const GRAVITY       = 0.45;
const FLAP_STRENGTH = -8.5;
const PIPE_SPEED    = 2.8;
const PIPE_WIDTH    = 70;
const PIPE_GAP      = 185;
const PIPE_INTERVAL = 1600;   // ms between new pipes
const GROUND_H      = 0;      // no visible ground strip (handled by score bar)

// ── Game state ───────────────────────────────
let state        = 'start';   // 'start' | 'playing' | 'dead'
let score        = 0;
let highScore    = 0;
let lastPipeTime = 0;
let animFrame    = 0;

// ── Ghost ────────────────────────────────────
const ghost = {
  x:  160,
  y:  canvas.height / 2,
  vy: 0,
  w:  34,
  h:  38,
  wobble: 0,   // for idle bob animation
};

function resetGhost() {
  ghost.x  = 160;
  ghost.y  = canvas.height / 2;
  ghost.vy = 0;
  ghost.wobble = 0;
}

// ── Pipes ────────────────────────────────────
let pipes = [];

function spawnPipe() {
  const minTop = 60;
  const maxTop = canvas.height - PIPE_GAP - 60;
  const topH   = Math.floor(Math.random() * (maxTop - minTop) + minTop);
  pipes.push({
    x:    canvas.width + 10,
    topH: topH,
    botY: topH + PIPE_GAP,
    botH: canvas.height - (topH + PIPE_GAP),
    scored: false,
  });
}

function resetPipes() {
  pipes = [];
  lastPipeTime = 0;
}

// ── Clouds (decorative background blobs) ─────
// Each cloud has a depth `scale` in [0,1].
//   scale → 0  :  far away  (small, slow, faint)
//   scale → 1  :  close     (large, fast, more opaque)
const clouds = [];
function initClouds() {
  clouds.length = 0;
  const count = 12;
  for (let i = 0; i < count; i++) {
    const scale = Math.random();                 // depth factor 0..1
    clouds.push({
      x:     Math.random() * canvas.width,
      y:     Math.random() * (canvas.height * 0.88),
      w:     45 + scale * 95,                   // 45px (far) → 140px (near)
      h:     22 + scale * 32,                   // 22px (far) →  54px (near)
      speed: 0.18 + scale * 1.1,               // 0.18 (far) →  1.28 (near)
      alpha: 0.15 + scale * 0.50,              // 0.15 (far) →  0.65 (near)
      scale,
    });
  }
}

// ── Sketchy background scribble lines ─────────
// Pre-generate random scribble segments once
const scribbles = [];
function initScribbles() {
  scribbles.length = 0;
  const count = 220;
  for (let i = 0; i < count; i++) {
    scribbles.push({
      x1: Math.random() * canvas.width,
      y1: Math.random() * canvas.height,
      x2: 0,
      y2: 0,
      len: 18 + Math.random() * 55,
      angle: Math.random() * Math.PI * 2,
    });
    const s = scribbles[scribbles.length - 1];
    s.x2 = s.x1 + Math.cos(s.angle) * s.len;
    s.y2 = s.y1 + Math.sin(s.angle) * s.len;
  }
}

// ── Draw helpers ─────────────────────────────

function drawBackground() {
  // Sky fill
  ctx.fillStyle = '#8ec8d8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Scribble texture
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#4a8aaa';
  ctx.lineWidth   = 1.2;
  for (const s of scribbles) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCloud(c) {
  ctx.save();

  // Use per-cloud alpha for depth/perspective effect
  ctx.globalAlpha = c.alpha;

  const r = Math.min(c.w, c.h) * 0.45;
  ctx.fillStyle = '#ddeef5';
  ctx.beginPath();
  ctx.moveTo(c.x + r, c.y);
  ctx.lineTo(c.x + c.w - r, c.y);
  ctx.quadraticCurveTo(c.x + c.w, c.y, c.x + c.w, c.y + r);
  ctx.lineTo(c.x + c.w, c.y + c.h - r);
  ctx.quadraticCurveTo(c.x + c.w, c.y + c.h, c.x + c.w - r, c.y + c.h);
  ctx.lineTo(c.x + r, c.y + c.h);
  ctx.quadraticCurveTo(c.x, c.y + c.h, c.x, c.y + c.h - r);
  ctx.lineTo(c.x, c.y + r);
  ctx.quadraticCurveTo(c.x, c.y, c.x + r, c.y);
  ctx.closePath();
  ctx.fill();

  // Sketchy border inherits the same alpha
  ctx.strokeStyle = '#aaccdd';
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = c.alpha * 0.4;
  ctx.stroke();

  ctx.restore();
}

function drawClouds() {
  // Draw far-away (low scale) clouds first so near ones render on top
  const sorted = [...clouds].sort((a, b) => a.scale - b.scale);
  for (const c of sorted) drawCloud(c);
}

// Draw one pipe segment (rect + cap)
function drawPipeSegment(x, y, w, h, capOnBottom) {
  const capH = 18;

  // Main pipe body with green gradient
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0,    '#2d8a2d');
  grad.addColorStop(0.25, '#4ec94e');
  grad.addColorStop(0.65, '#2d8a2d');
  grad.addColorStop(1,    '#1a5e1a');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Vertical highlight stripe
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 10, y, 12, h);
  ctx.restore();

  // Cap
  const capX = x - 6;
  const capW = w + 12;
  const capY = capOnBottom ? y : y + h - capH;

  const capGrad = ctx.createLinearGradient(capX, 0, capX + capW, 0);
  capGrad.addColorStop(0,    '#246024');
  capGrad.addColorStop(0.25, '#46b846');
  capGrad.addColorStop(0.65, '#246024');
  capGrad.addColorStop(1,    '#153d15');
  ctx.fillStyle = capGrad;
  ctx.fillRect(capX, capY, capW, capH);

  // Cap highlight
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(capX + 8, capY, 14, capH);
  ctx.restore();

  // Sketchy pipe outline
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#1a4a1a';
  ctx.lineWidth   = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeRect(capX, capY, capW, capH);
  ctx.restore();
}

function drawPipes() {
  for (const p of pipes) {
    // Top pipe (cap faces down)
    drawPipeSegment(p.x, 0, PIPE_WIDTH, p.topH, true);
    // Bottom pipe (cap faces up)
    drawPipeSegment(p.x, p.botY, PIPE_WIDTH, p.botH, false);
  }
}

function drawGhost() {
  const x = ghost.x;
  const y = ghost.y + Math.sin(ghost.wobble) * 3;
  const w = ghost.w;
  const h = ghost.h;

  // Tilt based on velocity
  const tilt = Math.max(-0.4, Math.min(0.5, ghost.vy * 0.045));

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Shadow / glow
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle   = '#aaaaff';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.55, w * 0.55, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ghost body
  ctx.fillStyle = '#f0f0f8';
  ctx.beginPath();
  // Top dome
  const hw = w / 2;
  ctx.arc(0, -h * 0.15, hw, Math.PI, 0, false);
  // Right side down
  ctx.lineTo(hw, h * 0.45);
  // Wavy bottom
  const waveAmp = 5;
  ctx.quadraticCurveTo(hw * 0.5,  h * 0.45 + waveAmp, 0,       h * 0.45);
  ctx.quadraticCurveTo(-hw * 0.5, h * 0.45 - waveAmp, -hw,     h * 0.45);
  ctx.closePath();
  ctx.fill();

  // Slight outline
  ctx.strokeStyle = '#c8c8d8';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Eyes (two small dark dots)
  ctx.fillStyle = '#333344';
  ctx.beginPath();
  ctx.arc(-7, -h * 0.1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, -h * 0.1, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-6, -h * 0.12, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(8, -h * 0.12, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawStartScreen() {
  // Semi-transparent overlay
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle   = '#000020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Title
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  ctx.font      = 'bold 58px "Courier New", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor   = '#88aaff';
  ctx.shadowBlur    = 18;
  ctx.fillText('FLAPPY KIRO', canvas.width / 2, canvas.height / 2 - 70);

  ctx.shadowBlur  = 0;
  ctx.font        = '22px "Courier New", monospace';
  ctx.fillStyle   = '#ccddff';
  ctx.fillText('Press  SPACE  or  TAP  to start', canvas.width / 2, canvas.height / 2 + 10);

  ctx.font      = '17px "Courier New", monospace';
  ctx.fillStyle = '#8899bb';
  ctx.fillText('guide the ghost through the pipes', canvas.width / 2, canvas.height / 2 + 48);

  ctx.restore();
}

function drawDeadScreen() {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle   = '#200000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  ctx.font        = 'bold 52px "Courier New", monospace';
  ctx.fillStyle   = '#ff6666';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur  = 20;
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 60);

  ctx.shadowBlur  = 0;
  ctx.font        = '24px "Courier New", monospace';
  ctx.fillStyle   = '#ffffff';
  ctx.fillText(`Score: ${score}   High: ${highScore}`, canvas.width / 2, canvas.height / 2);

  ctx.font      = '20px "Courier New", monospace';
  ctx.fillStyle = '#ffbbbb';
  ctx.fillText('Press  SPACE  or  TAP  to retry', canvas.width / 2, canvas.height / 2 + 55);

  ctx.restore();
}

// ── Update logic ──────────────────────────────

function updateGhost(dt) {
  ghost.vy     += GRAVITY;
  ghost.y      += ghost.vy;
  ghost.wobble += 0.05;

  // Hit ceiling
  if (ghost.y - ghost.h / 2 < 0) {
    ghost.y  = ghost.h / 2;
    ghost.vy = 0;
  }

  // Hit floor
  if (ghost.y + ghost.h / 2 > canvas.height) {
    die();
  }
}

function updatePipes(timestamp) {
  // Spawn new pipes
  if (timestamp - lastPipeTime > PIPE_INTERVAL) {
    spawnPipe();
    lastPipeTime = timestamp;
  }

  // Move pipes
  for (const p of pipes) {
    p.x -= PIPE_SPEED;

    // Score when ghost passes pipe center
    if (!p.scored && p.x + PIPE_WIDTH < ghost.x) {
      p.scored = true;
      score++;
      if (score > highScore) highScore = score;
      updateScoreBar();
    }
  }

  // Remove off-screen pipes
  pipes = pipes.filter(p => p.x + PIPE_WIDTH + 14 > 0);
}

function updateClouds() {
  for (const c of clouds) {
    c.x -= c.speed;
    if (c.x + c.w < 0) {
      // Recycle off-screen cloud with a fresh random depth
      const scale = Math.random();
      c.scale = scale;
      c.x     = canvas.width + 10;
      c.y     = Math.random() * (canvas.height * 0.88);
      c.w     = 45 + scale * 95;
      c.h     = 22 + scale * 32;
      c.speed = 0.18 + scale * 1.1;
      c.alpha = 0.15 + scale * 0.50;
    }
  }
}

function checkCollisions() {
  const gLeft   = ghost.x - ghost.w / 2 + 5;
  const gRight  = ghost.x + ghost.w / 2 - 5;
  const gTop    = ghost.y - ghost.h / 2 + 5;
  const gBottom = ghost.y + ghost.h / 2 - 8;

  for (const p of pipes) {
    const pLeft  = p.x - 6;
    const pRight = p.x + PIPE_WIDTH + 6;

    if (gRight < pLeft || gLeft > pRight) continue;

    // Top pipe collision
    if (gTop < p.topH + 18) { die(); return; }
    // Bottom pipe collision
    if (gBottom > p.botY - 4) { die(); return; }
  }
}

function die() {
  state = 'dead';
}

function flap() {
  if (state === 'start') {
    startGame();
    return;
  }
  if (state === 'dead') {
    startGame();
    return;
  }
  ghost.vy = FLAP_STRENGTH;
}

function startGame() {
  state        = 'playing';
  score        = 0;
  resetGhost();
  resetPipes();
  updateScoreBar();
  lastPipeTime = performance.now();
}

function updateScoreBar() {
  scoreText.textContent = `Score: ${score} | High: ${highScore}`;
}

// ── Input ─────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    flap();
  }
});

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  flap();
});

// ── Main loop ─────────────────────────────────
let lastTimestamp = 0;

function loop(timestamp) {
  const dt = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  // Update
  if (state === 'playing') {
    updateGhost(dt);
    updatePipes(timestamp);
    updateClouds();
    checkCollisions();
  } else if (state === 'start') {
    // Idle ghost bob
    ghost.wobble += 0.035;
    ghost.y = canvas.height / 2 + Math.sin(ghost.wobble) * 8;
    updateClouds();
  } else if (state === 'dead') {
    updateClouds();
  }

  // Draw
  drawBackground();
  drawClouds();
  drawPipes();
  drawGhost();

  if (state === 'start') drawStartScreen();
  if (state === 'dead')  drawDeadScreen();

  animFrame = requestAnimationFrame(loop);
}

// ── Boot ──────────────────────────────────────
initScribbles();
initClouds();
updateScoreBar();
requestAnimationFrame(loop);
