// Tiny platformer engine - behavior-driven tiles
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

////////// BACKGROUND MUSIC //////////
const bgm = document.getElementById('Soundtrack');
let musicStarted = false;

////////// JUMP SFX  ////////////
const jumpSfx = document.getElementById("JumpSfx");

///////// DEATH SFX ////////////
const deathSfx = document.getElementById("DeathSfx");

// browsers require user interaction before playing audio
window.addEventListener('keydown', () => {
    if (!musicStarted) {
        Soundtrack.volume = 0.6; // Modify volume as needed
        Soundtrack.play().catch(err => console.log(err));
        musicStarted = true;
    }
});

window.addEventListener('keydown', e => {
  // treat multiple keys as the same "jump" input (buffered)
  if (e.key === 'z' || e.key === 'ArrowUp' || e.key === 'w') {
    if (keyStates[e.key] !== true) {
      // jump buffer: store an expiry timestamp (ms)
      jumpFrame = Date.now() + MOVE.jumpBuffer;
    }
  }
  keyStates[e.key] = true;
});

window.addEventListener('keyup', e => {
  // release tracking for variable jump height
  if (e.key === 'z' || e.key === 'ArrowUp' || e.key === 'w') {
    // if we are moving upward, cut the jump for tighter control
    if (player.vy < 0) {
      player.vy *= MOVE.jumpCutMultiplier;
    }
  }
  keyStates[e.key] = false;
});

// player (in game units)
// Movement constants (separate from runtime `player` state)
const MOVE = {
  maxSpeedGround: 4.5,
  maxSpeedAir: 4.5,
  accelGround: 0.9,
  frictionGround: 0.8, // how fast vx approaches 0 when no input (ground)
  accelAir: 0.15,
  gravity: 0.55,
  maxFallSpeed: 14,
  jumpPower: 12,
  jumpCutMultiplier: 0.5,

  //if on ice
  accelIce: 0.25,
  frictionIce: 0.03,

  // timers (ms)
  coyoteTime: 120,
  jumpBuffer: 150
};

// player (runtime state only)
const player = {
  x: 40, y: 40, w: 25, h: 25,
  vx: 0, vy: 0,
  // runtime flags
  onGround: false,
  onIce: false,
  coyoteUntil: 0
};

// spawn/respawn
const spawn = { x: 40, y: 40 };
function respawn() {
  if (deathSfx) {
    deathSfx.cloneNode(true).play().catch(() => {});
  }
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.onIce = false;
  // immediately restore any unstable tiles so the world resets on player respawn
  restoreUnstableNow();
}

function restoreUnstableNow() {
  // restore any unstable tiles from the original base level
  for (let rr = 0; rr < rows; rr++) {
    for (let cc = 0; cc < cols; cc++) {
      if (baseLevel[rr] && baseLevel[rr][cc] === Tile.Unstable) {
        level[rr][cc] = Tile.Unstable;
      }
    }
  }
  // clear any visual-only unstable states
  for (const k in unstableState) delete unstableState[k];
}

// tiles
const Tile = {
  Empty: 0,
  Solid: 1,
  Kill: 2,
  Unstable: 3,
  Ice: 4,
  Breakable: 5
};

const tileProperties = {
  [Tile.Empty]: { color: null, solid: false, behavior: 'none' },
  [Tile.Solid]: { color: [135, 170, 35], solid: true, behavior: 'solid' },
  [Tile.Kill]: { color: [255, 60, 60], solid: false, behavior: 'kill' },
  [Tile.Unstable]: { color: [255, 200, 0], solid: true, behavior: 'unstable' },
  [Tile.Ice]: { color: [214, 255, 250], solid: true, behavior: 'ice' },
  [Tile.Breakable]: {color: [132, 76, 59], solid: true, behavior: 'breakable' }
};

const level = [];

// load level from `level.txt` where characters '0'..'4' map to Tile values
// and '\n' indicates a new row. If fetch fails (e.g. file:// restrictions),
// a simple fallback level will be used.
function parseLevelText(text) {
  // initialize empty rows
  for (let rr = 0; rr < rows; rr++) level[rr] = new Array(cols).fill(Tile.Empty);

  let r = 0, c = 0;
  let skipUntilNewline = false;
  for (let i = 0; i < text.length && r < rows; i++) {
    const ch = text[i];
    // handle CRLF and LF/CR uniformly: treat any '\r' or '\n' as newline
    if (ch === '\n' || ch === '\r') {
      // if CRLF, skip the paired char
      if (ch === '\r' && text[i+1] === '\n') { /* allow loop to hit the '\n' which will also advance */ }
      // end current row and prepare next
      r++; c = 0; skipUntilNewline = false;
      continue;
    }

    if (skipUntilNewline) {
      // currently discarding overflow characters until newline
      continue;
    }

    if (c >= cols) {
      // we've exceeded the allowed columns for this row; ignore characters until newline
      skipUntilNewline = true;
      continue;
    }

    if (ch >= '0' && ch <= '5') {
      level[r][c] = Number(ch);
    } else {
      level[r][c] = Tile.Empty;
    }
    c++;
  }
}

// Embedded level data (from level.txt) to avoid CORS issues when publishing
const levelText = `0000000000000000000000000000000000000000000000000000000000021222222222000000000000000000000000000000
0000000000000000000000000000000000000000000000000000300000001000011100000000001111111100000000000000
0000000000000000000000000000000330000000000000000000200000001000000000000000000000000000000000000000
0000000000000000000000000003300000003333333333333333300000331000000333300000000000000000000000000000
0000000000000000000000000000000000000000020000020000000000001000000000000000000000000000000000000000
0000000000000000000111110000000000000000022222220000000022221000103000000000000000000000000000000000
0000000000000000000000000000000000000000000020000000000000001000000000000000000000000000000000000000
0000000000000000000000000004001000000000000020000000000000002000000000000000000000000000000000000000
0000000000000000000000000002002000000000000020000000000000000000000000100000000000000000000000000000
0000000000000000000000000000000000000000000020003333300000000000000000000000000000000000000000000000
0000000000000000000000033333333333300000000020000000000000002000000000000000000000000000000000000000
0000055500000004004000000000000000000000000020000000000000301000111111100000000000000000000000000000
0000000000100001221000000000000000000000000020000000000010001000000000000000000000000000000000000000
0000000000000001221222222222222222222222222222222222222212221000122222200000000000000000000000000000
1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111`;

// snapshot of original level to allow respawning unstable tiles
let baseLevel = [];

// per-instance unstable tile state (key = "r,c")
// { state: 'crumbling'|'fallen', start, breakAt, respawnAt, fallY, vy }
const unstableState = {};

function tileAtPixel(px, py) {
  const c = Math.floor(px / tileSize);
  const r = Math.floor(py / tileSize);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return Tile.Empty;
  // guard if level rows are not initialized for some reason
  if (!level[r]) return Tile.Empty;
  return level[r][c];
}

function rectIntersect(a, b) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
}

// helper: move `current` toward `target` by maxDelta (no overshoot)
function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return current;
}

function update(dt) {
  const t = Date.now();

  // input
  const inputX = (((keyStates['ArrowRight'] || keyStates['d']) ? 1 : 0) - ((keyStates['ArrowLeft'] || keyStates['a']) ? 1 : 0));

  // (no slip/groundRetention logic — simplified movement)

  // Horizontal control (simple single-step integration)
  const onIce = player.onGround && player.onIce;

  if(onIce){
    if(inputX !== 0){
      const accel = MOVE.accelIce
      const desiredVx = inputX * MOVE.maxSpeedGround;
      player.vx = approach(player.vx, desiredVx, accel * dt);
    }
  
    if(inputX === 0){
      player.vx = approach(player.vx, 0, MOVE.frictionIce * dt);
    }
  } else {
    const accel = player.onGround ? MOVE.accelGround : MOVE.accelAir;
    const desiredVx = inputX * (player.onGround ? MOVE.maxSpeedGround : MOVE.maxSpeedAir);
    player.vx = approach(player.vx, desiredVx, accel * dt);

    if (inputX === 0 && player.onGround) {
      player.vx = approach(player.vx, 0, MOVE.frictionGround * dt);
    }
  }



  // jump (buffered + coyote time)
  if (jumpFrame > t && (player.onGround || t <= player.coyoteUntil)) {
    player.vy = -MOVE.jumpPower;
    player.onGround = false;
    jumpFrame = 0;
    player.coyoteUntil = 0;

    if(jumpSfx){
      jumpSfx.cloneNode(true).play().catch(() => {});
    }
  }

  // vertical physics
  player.vy += MOVE.gravity * dt;
  if (player.vy > MOVE.maxFallSpeed) player.vy = MOVE.maxFallSpeed;

  // integrate and resolve collisions
  player.x += player.vx * dt;
  collideHorizontal();
  player.y += player.vy * dt;
  collideVertical();

  // clamp horizontal speed to current max
  const actualMaxSpeed = player.onGround ? MOVE.maxSpeedGround : MOVE.maxSpeedAir;
  player.vx = Math.max(-actualMaxSpeed, Math.min(actualMaxSpeed, player.vx));


  

  // process unstable tiles: animate crumbling, spawn falling debris, and respawn
  for (const key in unstableState) {
    const st = unstableState[key];
    const now = Date.now();
    const [rr, cc] = key.split(',').map(Number);

    if (st.state === 'crumbling' && now >= st.breakAt) {
      // break the tile (becomes empty) and start falling debris
      if (level[rr] && level[rr][cc] === Tile.Unstable) level[rr][cc] = Tile.Empty;
      st.state = 'fallen';
      st.fallY = 0;
      st.vy = 0;
      if (!st.respawnAt) st.respawnAt = now + 6000; // 6s after break
    }

    if (st.state === 'fallen') {
      // falling piece physics (purely visual)
      st.vy += MOVE.gravity * dt * 10; // scale for visible effect
      st.fallY += st.vy * dt;

      // respawn after timeout
      if (now >= st.respawnAt) {
        if (baseLevel[rr] && baseLevel[rr][cc] === Tile.Unstable) {
          level[rr][cc] = Tile.Unstable;
        }
        delete unstableState[key];
      }
    }
  }

  // camera follow (center player horizontally within level bounds)
  camera.x = player.x - (W / camera.scale)/2 + player.w/2;
  camera.x = Math.max(0, Math.min(camera.x, cols*tileSize - (W / camera.scale)));
}

function collideHorizontal() {
  const sign = Math.sign(player.vx) || 1;
  const testX = sign > 0 ? player.x + player.w : player.x;
  const samples = [player.y + 1, player.y + player.h - 1];
  for (let sy of samples) {
    const tileType = tileAtPixel(testX, sy);
    const behavior = tileProperties[tileType] && tileProperties[tileType].behavior;
    if (!behavior || behavior === 'none') continue;
    if (behavior === 'kill') {
      respawn();
      return;
    }
    if (behavior === 'solid' || behavior === 'unstable' || behavior === 'ice') {
      // align player to tile edge
      if (sign > 0) player.x = Math.floor((testX) / tileSize) * tileSize - player.w - 0.001;
      else player.x = (Math.floor(testX / tileSize) + 1) * tileSize + 0.001;
      player.vx = 0;
      return;
    }
  }
}

function collideVertical() {
  const sign = Math.sign(player.vy) || 1;
  const testY = sign > 0 ? player.y + player.h : player.y;
  const samples = [player.x + 1, player.x + player.w - 1];
  player.onGround = false;
  player.onIce = false;
  for (let sx of samples) {
    const tileType = tileAtPixel(sx, testY);
    const behavior = tileProperties[tileType] && tileProperties[tileType].behavior;
    if (!behavior || behavior === 'none') continue;

    // compute tile cell coords
    const c = Math.floor(sx / tileSize);
    const r = Math.floor(testY / tileSize);

    if (behavior === 'kill') {
      respawn();
      return;
    }

    if (behavior === 'solid' || behavior === 'unstable' || behavior === 'ice' || behavior === 'breakable') {
      if (sign > 0) {
        // landed on top of tile
        player.y = Math.floor((testY) / tileSize) * tileSize - player.h - 0.001;
        player.onGround = true;

        player.vy = 0;

        player.onIce = (behavior === 'ice');

        // refresh coyote window when we touched ground
        player.coyoteUntil = Date.now() + MOVE.coyoteTime;

        if (behavior === 'unstable') {
          const key = `${r},${c}`;
          if (!unstableState[key]) {
            const now = Date.now();
            const breakDelay = 500; // ms until tile breaks after landing
            unstableState[key] = {
              state: 'crumbling',
              start: now,
              breakAt: now + breakDelay,
              // respawn will be scheduled after break (breakAt + 6000ms)
              respawnAt: now + breakDelay + 6000,
              fallY: 0,
              vy: 0
            };
          }
        } 
        
        // landing on breakable from above acts like normal block
        return;
      } else {
        // hitting breakable tile from below
        if (behavior === 'breakable') {
          if(level[r] && level[r][c] === Tile.Breakable) {
            level[r][c] = Tile.Empty;
          }
          // hit bottom of tile
          player.y = (Math.floor(testY / tileSize) + 1) * tileSize + 0.001;
          player.vy = 0;
          return;
        } else {
          player.y = (Math.floor(testY / tileSize) + 1) * tileSize + 0.001;
          player.vy = 0;
          return;
        }
      }
    }
  }
}

let last = 0;
function loop(t) {
  const dt = Math.min(16, t - last) / (1000/60) || 1;
  last = t;
  update(dt);

  // render background
  ctx.fillStyle = '#77D';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);

  // draw grid (optional)
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
      const tileType = level[r][c];
      if (tileType !== Tile.Empty) {
        const props = tileProperties[tileType];
        const color = props && props.color;
        if (color) {
          ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
          ctx.fillRect(c*tileSize, r*tileSize, tileSize, tileSize);
          ctx.strokeStyle = '#0004';
          ctx.strokeRect(c*tileSize, r*tileSize, tileSize, tileSize);
        }
      }
    }
  }

  // draw unstable tile visuals (crumbling and falling debris)
  {
    const now = Date.now();
    for (const key in unstableState) {
      const st = unstableState[key];
      const [rr, cc] = key.split(',').map(Number);
      const x = cc * tileSize;
      const y = rr * tileSize;
      const color = tileProperties[Tile.Unstable].color;
      if (!color) continue;

      if (st.state === 'crumbling') {
        const prog = Math.max(0, Math.min(1, (now - st.start) / Math.max(1, st.breakAt - st.start)));
        const wobble = Math.sin(prog * Math.PI * 6) * 4 * (1 - prog);
        const alpha = 1 - prog * 0.6;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + tileSize/2, y + tileSize/2 + Math.sin(prog * Math.PI) * 3);
        ctx.rotate(wobble * 0.01);
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillRect(-tileSize/2, -tileSize/2, tileSize, tileSize);
        ctx.strokeStyle = '#0004';
        ctx.strokeRect(-tileSize/2, -tileSize/2, tileSize, tileSize);
        ctx.restore();
      } else if (st.state === 'fallen') {
        ctx.save();
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        const pad = tileSize * 0.15;
        ctx.fillRect(x + pad, y + st.fallY + pad, tileSize - pad*2, tileSize - pad*2);
        ctx.restore();
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

function showLevelLoadedMessage() {
  const msg = document.createElement('div');
  msg.textContent = 'Level loaded!';
  msg.style.position = 'fixed';
  msg.style.top = '16px';
  msg.style.left = '50%';
  msg.style.transform = 'translateX(-50%)';
  msg.style.background = '#222d';
  msg.style.color = '#fff';
  msg.style.fontSize = '20px';
  msg.style.padding = '8px 24px';
  msg.style.borderRadius = '8px';
  msg.style.zIndex = '9999';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 1200);
}

(async function init() {
  try {
    parseLevelText(levelText);
    // take a snapshot of the original level so unstable tiles can respawn
    baseLevel = level.map(row => row.slice());
    showLevelLoadedMessage();
  } catch (err) {
    console.error('Failed to parse level data.', err);
    throw err;
  }
  updateCamera();
  requestAnimationFrame(loop);
})();
