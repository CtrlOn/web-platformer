// Tiny platformer engine - minimal
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// game world constants
const tileSize = 32; // fixed game units
const cols = 100; // wide level (camera will follow)
const rows = 16; // fixed rows

let W = canvas.width, H = canvas.height;

// camera (scales and translates to viewport)
const camera = { x: 0, y: 0, scale: 1 };

function updateCamera() {
  camera.scale = H / (rows * tileSize);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  W = canvas.width;
  H = canvas.height;
  updateCamera();
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const keyStates = {};
let jumpFrame = 0;

window.addEventListener('keydown', e => { // JS is dumb, this is not keydown, this is keyheld
  if (e.key === 'z' || e.key === 'ArrowUp' || e.key === 'w') {
    if (keyStates[e.key] !== true) { // Now this is real keydown
      jumpFrame = Date.now() + 120;
    }
  }
  keyStates[e.key] = true;
});
window.addEventListener('keyup', e => { keyStates[e.key] = false; });

// player (in game units)
const player = {
  x: 50, y: 50, w: 24, h: 32,
  vx: 0, vy: 0,
  speed: 3.6,
  jumpPower: 12,
  onGround: false
};

const level = [];

// create blank level and then put floor and some platforms
for (let r=0; r<rows; r++){
  level[r] = new Array(cols).fill(null);
}
// create a continuous floor
for (let c=0; c<cols; c++){
  level[rows-1][c] = [135, 170, 35];
  level[rows-2][c] = [160, 150, 35];
}
// add some floating platforms
level[rows-4][8] = [190, 190, 10];
level[rows-6][14] = [190, 190, 10];
level[rows-5][15] = [190, 190, 10];
level[rows-4][24] = [190, 190, 10];
level[rows-6][30] = [190, 190, 10];

function tileAtPixel(px, py) {
  const c = Math.floor(px / tileSize);
  const r = Math.floor(py / tileSize);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  return level[r][c];
}

function rectIntersect(a, b) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
}

function update(dt) {
  const t = Date.now();

  // input
  if (keyStates['ArrowLeft'] || keyStates['a']) {
    player.vx = -player.speed;
  } else if (keyStates['ArrowRight'] || keyStates['d']) {
    player.vx = player.speed;
  } else {
    player.vx = 0;
  }

  // jump
  if (jumpFrame > t && player.onGround) {
    player.vy = -player.jumpPower;
    player.onGround = false;
    jumpFrame = 0;
  }

  // physics
  player.vy += 0.5; // gravity
  player.x += player.vx * dt;
  collideHorizontal();
  player.y += player.vy * dt;
  collideVertical();

  // camera follow (center player horizontally within level bounds)
  camera.x = player.x - (W / camera.scale)/2 + player.w/2;
  camera.x = Math.max(0, Math.min(camera.x, cols*tileSize - (W / camera.scale)));
}

function collideHorizontal() {
  // check horizontal collisions by sampling player corners
  const box = {...player};
  const sign = Math.sign(player.vx) || 1;
  const testX = sign > 0 ? player.x + player.w : player.x;
  // sample top and bottom edges
  const samples = [player.y + 1, player.y + player.h - 1];
  for (let sy of samples) {
    if (tileAtPixel(testX, sy) !== null) {
      // align player to tile edge
      if (sign > 0) player.x = Math.floor((testX) / tileSize) * tileSize - player.w - 0.001;
      else player.x = (Math.floor(testX / tileSize) + 1) * tileSize + 0.001;
      player.vx = 0;
    }
  }
}

function collideVertical() {
  const sign = Math.sign(player.vy) || 1;
  const testY = sign > 0 ? player.y + player.h : player.y;
  const samples = [player.x + 1, player.x + player.w - 1];
  player.onGround = false;
  for (let sx of samples) {
    if (tileAtPixel(sx, testY) !== null) {
      if (sign > 0) {
        player.y = Math.floor((testY) / tileSize) * tileSize - player.h - 0.001;
        player.onGround = true;
      } else {
        player.y = (Math.floor(testY / tileSize) + 1) * tileSize + 0.001;
      }
      player.vy = 0;
    }
  }
}

let last = 0;
function loop(t) {
  const dt = Math.min(16, t - last) / (1000/60) || 1;
  last = t;
  update(dt);

  // render
  ctx.fillStyle = '#77D'; // replace with your desired color
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);

  // draw grid
  ctx.strokeStyle = '#66D';
  ctx.lineWidth = 1 / camera.scale;
  const left = Math.floor(camera.x / tileSize);
  const top = Math.floor(camera.y / tileSize);
  const right = left + Math.ceil(W / camera.scale / tileSize) + 1;
  const bottom = top + Math.ceil(H / camera.scale / tileSize) + 1;
  for (let c = left; c <= right; c++) {
    const x = c * tileSize;
    ctx.beginPath();
    ctx.moveTo(x, top * tileSize);
    ctx.lineTo(x, bottom * tileSize);
    ctx.stroke();
  }
  for (let r = top; r <= bottom; r++) {
    const y = r * tileSize;
    ctx.beginPath();
    ctx.moveTo(left * tileSize, y);
    ctx.lineTo(right * tileSize, y);
    ctx.stroke();
  }

  // draw tiles
  for (let r=0; r<rows; r++){
    for (let c=0; c<cols; c++){
      if (level[r][c] !== null) {
        const [rVal, gVal, bVal] = level[r][c];
        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        ctx.fillRect(c*tileSize, r*tileSize, tileSize, tileSize);
        ctx.strokeStyle = '#0004';
        ctx.strokeRect(c*tileSize, r*tileSize, tileSize, tileSize);
      }
    }
  }

  // draw player (simple rectangle)
  ctx.fillStyle = '#d33';
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.strokeStyle = '#0008';
  ctx.strokeRect(player.x, player.y, player.w, player.h);

  ctx.restore();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
