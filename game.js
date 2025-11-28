// Level data

// game world constants
const tileSize = 32; // fixed game units
const cols = 100; // wide level (camera will follow)
const rows = 16; // fixed rows

// Embedded level data (from level.txt) to avoid CORS issues when publishing
const levelText = `0000000000000000000000000000000000000000000020000000000000021222222222000000000000000000000000000000
0000000000000000000000000000000000000000000020000000300000001000011100000000001111111100000000000000
0000000000000000000000000000000330000000000000000000200000001000000000000000660000000000000000000000
0000000000000000000000000003300000003333326666623333300000331000000333300000000000000000000000000000
0000000000000000000000000000000000000000020000020000000000001000000000000000000000000000000000000000
0000000000000000000111110000000000000000022222220000000022221000103000000000000000000000000000000000
0000000000000000000000000000000000000000000020000000000000001000000000000000000000000000000000000000
0000000000000000000000066666666666600000000020000000000000002000000000000000000000000000000000000000
0000000000000000000000000000000000000000000020000000000000000000000000100000000000000000000000000000
0000000000000000000000000000000000000000000020003333300000000000000000000000000000000000000000000000
0000000000000000000000066666666666600000000020000000000000002000000000000000000000000000000000000000
0000055500000004004000000000000000000000000020000000000000301000111111100000000000000000000000000000
0000000000100001221000000000000000000000000020000000000010001000000000000000000000000000000000000000
0000000000000001221222222222222222222222222222222222222212221000122222200000000000000000000000000000
1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111`;

// Tiny platformer engine - behavior-driven tiles
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

ctx.imageSmoothingEnabled = false;

// load background layers for parallax
const bgFar = new Image();
bgFar.src = 'assets/background/far.png';

const bgNear = new Image();
bgNear.src = 'assets/background/near.png';

// load sprite sheet
const tilesSpriteSheet = new Image();
tilesSpriteSheet.src = 'assets/platformer_tiles.png';

// sprite layout: 2 rows x 6 columns, each 64x64
// row 0: grass variants, row 1: grassless variants
function getTileSpriteCoords(tileType, isGrass, r, c) {
  const spriteSize = 64;
  const variants = 6;
  const row = isGrass ? 0 : 1;
  // use tile position (r, c) as seed for consistent variant selection
  const col = (r * 71 + c * 73) % variants;
  return {
    sx: col * spriteSize,
    sy: row * spriteSize,
    sw: spriteSize,
    sh: spriteSize
  };
}
// === MARIO SPRITES ===
const marioImageRight = new Image();
marioImageRight.src = 'assets/player.png';   // facing right

const marioImageLeft = new Image();
marioImageLeft.src = 'assets/playerl.png';   // facing left

// Animation state derived from original SMB sprite sheet
const marioSprite = {
  imgR: marioImageRight,
  imgL: marioImageLeft,
  frameW: 16,
  frameH: 16,
  baseX: 80,   // idle small Mario X in the sheet (from your Player code)
  baseY: 32,   // idle small Mario Y in the sheet
  frames: [0], // frame offsets (0,1,2) horizontally
  currentFrame: 0,
  frameTimer: 0,
  frameInterval: 12, // in "game frames"
  state: 'idle'
};


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

  ctx.imageSmoothingEnabled = false;
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
  jumpPower: 12.6, //enough for 4 blocks high
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
  x: 40, y: 40, w: tileSize, h: tileSize,
  vx: 0, vy: 0,
  // runtime flags
  onGround: false,
  onIce: false,
  coyoteUntil: 0,
  facingLeft: false
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

  parseLevelText(levelText);
  // clear all destruction timers
  for (const k in destructionState) delete destructionState[k];
}

// tiles
const Tile = {
  Void: 0,
  Dirt: 1,
  Lava: 2,
  Crumble: 3,
  Ice: 4,
  Breakable: 5,
  ThinIce: 6
};

const BehaviorFlags = {
  None: 0,
  Solid: 1 << 0,
  Kill: 1 << 1,
  Unstable: 1 << 2,
  Slippery: 1 << 3,
  Breakable: 1 << 4
};

const tileProperties = {
  [Tile.Void]: { color: null, behaviors: BehaviorFlags.None },
  [Tile.Dirt]: { color: [100, 140, 30], behaviors: BehaviorFlags.Solid },
  [Tile.Lava]: { color: [150, 60, 60], behaviors: BehaviorFlags.Kill },
  [Tile.Crumble]: { color: [60, 60, 60], behaviors: BehaviorFlags.Unstable },
  [Tile.Ice]: { color: [150, 180, 240], behaviors: BehaviorFlags.Slippery },
  [Tile.Breakable]: { color: [132, 76, 59], behaviors: BehaviorFlags.Breakable },
  [Tile.ThinIce]: { color: [180, 150, 240], behaviors: BehaviorFlags.Slippery | BehaviorFlags.Breakable | BehaviorFlags.Unstable }
};

// behavior helper functions
function hasBehavior(tileType, flag) {
  return (tileType & flag) === flag;
}

function getTileBehaviors(tile) {
  return tile; // tile ID is the behavior flags bitmask
}

const level = [];

function parseLevelText(text) {
  // initialize empty rows
  for (let rr = 0; rr < rows; rr++) level[rr] = new Array(cols).fill(Tile.Void);

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

    if (ch >= '0' && ch <= '6') {
      level[r][c] = Number(ch);
    } else {
      level[r][c] = Tile.Void; // TODO: change error handling here (probably)
    }
    c++;
  }
}

// (no base snapshot — respawning removed)

// per-instance unstable tile state (key = "r,c")
// { state: 'crumbling'|'fallen', start, breakAt, respawnAt, fallY, vy }
const destructionState = {};

function tileAtPixel(px, py) {
  const c = Math.floor(px / tileSize);
  const r = Math.floor(py / tileSize);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return Tile.Void;
  // guard if level rows are not initialized for some reason
  if (!level[r]) return Tile.Void;
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

  // update facing direction for sprite
  if (inputX > 0) player.facingLeft = false;
  else if (inputX < 0) player.facingLeft = true;


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


  

  // process unstable tiles: animate crumbling, spawn falling debris
  for (const key in destructionState) {
    const st = destructionState[key];
    const now = Date.now();
    const [rr, cc] = key.split(',').map(Number);

    if (st.state === 'crumbling' && now >= st.breakAt) {
      // break the tile (becomes empty) and start falling debris
      if (level[rr] && level[rr][cc] !== Tile.Void) level[rr][cc] = Tile.Void;
      st.state = 'fallen';
      st.fallY = 0;
      st.vy = 0;
      // fallen visuals expire after a short time
      st.expireAt = now + 3000; // 3s visual
    }

    if (st.state === 'fallen') {
      // falling piece physics (purely visual)
      st.vy += MOVE.gravity * dt * 10; // scale for visible effect
      st.fallY += st.vy * dt;

      // remove visual after lifetime
      if (st.expireAt && now >= st.expireAt) {
        delete destructionState[key];
      }
    }
  }

  updateMarioAnimation(dt);

  // camera follow (center player horizontally within level bounds)
  camera.x = player.x - (W / camera.scale)/2 + player.w/2;
  camera.x = Math.max(0, Math.min(camera.x, cols*tileSize - (W / camera.scale)));
}

function updateMarioAnimation(dt) {
  let newState;
  if (!player.onGround && Math.abs(player.vy) > 0.1) {
    newState = 'jump';
  } else if (player.onGround && Math.abs(player.vx) > 0.1) {
    newState = 'run';
  } else {
    newState = 'idle';
  }

  if (newState !== marioSprite.state) {
    marioSprite.state = newState;

    if (newState === 'run') {
      // running animation: baseX 96, frames [0,1,2] -> 96,112,128
      marioSprite.baseX = 96;
      marioSprite.baseY = 32;
      marioSprite.frames = [0, 1, 2];
      marioSprite.frameInterval = 6; // faster animation
    } else if (newState === 'jump') {
      // jumping frame: 160,32
      marioSprite.baseX = 160;
      marioSprite.baseY = 32;
      marioSprite.frames = [0];
      marioSprite.frameInterval = Infinity;
    } else {
      // idle: 80,32
      marioSprite.baseX = 80;
      marioSprite.baseY = 32;
      marioSprite.frames = [0];
      marioSprite.frameInterval = Infinity;
    }

    marioSprite.currentFrame = 0;
    marioSprite.frameTimer = 0;
  }

  // advance frames only when we have a multi-frame animation
  if (marioSprite.frames.length > 1 && isFinite(marioSprite.frameInterval)) {
    marioSprite.frameTimer += dt;
    if (marioSprite.frameTimer >= marioSprite.frameInterval) {
      marioSprite.frameTimer = 0;
      marioSprite.currentFrame =
        (marioSprite.currentFrame + 1) % marioSprite.frames.length;
    }
  }
}


function collideHorizontal() {
  const sign = Math.sign(player.vx) || 1;
  const testX = sign > 0 ? player.x + player.w : player.x;
  const samples = [player.y + 1, player.y + player.h - 1];
  for (let sy of samples) {
    const tileType = tileAtPixel(testX, sy);
    const props = tileProperties[tileType];
    if (!props) continue;
    const flags = props.behaviors || BehaviorFlags.None;
    if (hasBehavior(flags, BehaviorFlags.Kill)) {
      respawn();
      return;
    }
    if (hasBehavior(flags, BehaviorFlags.Solid) || hasBehavior(flags, BehaviorFlags.Unstable) || hasBehavior(flags, BehaviorFlags.Slippery)) {
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
    const props = tileProperties[tileType];
    if (!props) continue;
    const flags = props.behaviors || BehaviorFlags.None;

    // compute tile cell coords
    const c = Math.floor(sx / tileSize);
    const r = Math.floor(testY / tileSize);

    if (hasBehavior(flags, BehaviorFlags.Kill)) {
      respawn();
      return;
    }

    if (hasBehavior(flags, BehaviorFlags.Solid) || hasBehavior(flags, BehaviorFlags.Unstable) || hasBehavior(flags, BehaviorFlags.Slippery) || hasBehavior(flags, BehaviorFlags.Breakable)) {
      if (sign > 0) {
        // landed on top of tile
        player.y = Math.floor((testY) / tileSize) * tileSize - player.h - 0.001;
        player.onGround = true;

        player.vy = 0;

        player.onIce = hasBehavior(flags, BehaviorFlags.Slippery);

        // refresh coyote window when we touched ground
        player.coyoteUntil = Date.now() + MOVE.coyoteTime;

        if (hasBehavior(flags, BehaviorFlags.Unstable)) {
          const key = `${r},${c}`;
          if (!destructionState[key]) {
            const now = Date.now();
            const breakDelay = 500; // ms until tile breaks after landing
            destructionState[key] = {
              state: 'crumbling',
              start: now,
              breakAt: now + breakDelay,
              // no respawn
              respawnAt: null,
              fallY: 0,
              vy: 0,
              origTile: level[r] && level[r][c]
            };
          }
        }

        // landing on breakable from above acts like normal block
        return;
      } else {
        // hitting tile from below
        if (hasBehavior(flags, BehaviorFlags.Breakable)) {
          const key = `${r},${c}`;
          // create a fallen visual state and remove the tile immediately
          if (!destructionState[key]) {
            const now = Date.now();
            destructionState[key] = {
              state: 'fallen',
              start: now,
              breakAt: now,
              expireAt: now + 3000,
              fallY: 0,
              vy: -15, // bump upward before falling
              origTile: level[r] && level[r][c]
            };
          }
          // remove tile immediately from level for physics
          if (level[r] && level[r][c] !== Tile.Void) level[r][c] = Tile.Void;
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

function drawMario() {
  const img = player.facingLeft ? marioSprite.imgL : marioSprite.imgR;

  // current frame source rect in the sprite sheet
  const frameOffset = marioSprite.frames[marioSprite.currentFrame] || 0;
  const sx = marioSprite.baseX + frameOffset * marioSprite.frameW;
  const sy = marioSprite.baseY;
  const sw = marioSprite.frameW;
  const sh = marioSprite.frameH;

  // scale 16x16 to one tile (32x32)
  const scale = tileSize / marioSprite.frameW; // 2 if tileSize=32
  const dw = sw * scale;
  const dh = sh * scale;

  const dx = player.x;
  const dy = player.y;

  // only draw when image is loaded
  if (img.complete && img.naturalWidth !== 0) {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  } else {
    // fallback: red box while image loading
    ctx.fillStyle = '#d33';
    ctx.fillRect(dx, dy, player.w, player.h);
    ctx.strokeStyle = '#0008';
    ctx.strokeRect(dx, dy, player.w, player.h);
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
  
  // draw parallax backgrounds in screen space (before camera transform)
  if (bgFar.complete && bgFar.naturalHeight > 0) {
    const farOffsetX = ((-camera.x * 0.2) % bgFar.width) * camera.scale;
    const farOffsetY = ((-camera.y * 0.2) % bgFar.height) * camera.scale;
    const bgWidth = bgFar.width * camera.scale;
    const bgHeight = bgFar.height * camera.scale;
    for (let x = farOffsetX - bgWidth; x < canvas.width; x += bgWidth) {
      for (let y = farOffsetY - bgHeight; y < canvas.height; y += bgHeight) {
        ctx.drawImage(bgFar, x, y, bgWidth, bgHeight);
      }
    }
  }
  if (bgNear.complete && bgNear.naturalHeight > 0) {
    const nearOffsetX = ((-camera.x * 0.5) % bgNear.width) * camera.scale;
    const nearOffsetY = ((-camera.y * 0.5) % bgNear.height) * camera.scale;
    const bgWidth = bgNear.width * camera.scale;
    const bgHeight = bgNear.height * camera.scale;
    for (let x = nearOffsetX - bgWidth; x < canvas.width; x += bgWidth) {
      for (let y = nearOffsetY - bgHeight; y < canvas.height; y += bgHeight) {
        ctx.drawImage(bgNear, x, y, bgWidth, bgHeight);
      }
    }
  }
  
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
      if (tileType !== Tile.Void) {
        const props = tileProperties[tileType];
        
        // only apply textures to Solid (dirt) tiles for now
        const isSolidTile = hasBehavior(props.behaviors, BehaviorFlags.Solid);
        
        if (isSolidTile && tilesSpriteSheet.complete) {
          // determine if this tile should show grass or grassless
          // grass if there's NO solid tile directly above (exposed top surface)
          const tileAbove = r > 0 ? level[r-1][c] : Tile.Void;
          const tileAboveProps = tileAbove !== Tile.Void ? tileProperties[tileAbove] : null;
          const isGrass = !(tileAboveProps && hasBehavior(tileAboveProps.behaviors, BehaviorFlags.Solid));
          
          // draw from sprite sheet
          const coords = getTileSpriteCoords(tileType, isGrass, r, c);
          ctx.drawImage(
            tilesSpriteSheet,
            coords.sx, coords.sy, coords.sw, coords.sh,
            c*tileSize, r*tileSize, tileSize, tileSize
          );
        } else {
          // draw solid color for non-dirt tiles or while sprite sheet loading
          const color = props && props.color;
          if (color) {
            ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            ctx.fillRect(c*tileSize, r*tileSize, tileSize, tileSize);
          }
        }
      }
    }
  }

  // draw unstable tile visuals (crumbling and falling debris)
  {
    const now = Date.now();
    for (const key in destructionState) {
      const st = destructionState[key];
      const [rr, cc] = key.split(',').map(Number);
      const x = cc * tileSize;
      const y = rr * tileSize;
      const origTile = (st.origTile !== undefined) ? st.origTile : Tile.Crumble;
      const props = (origTile !== undefined && tileProperties[origTile]) ? tileProperties[origTile] : tileProperties[Tile.Crumble];
      const color = props && props.color;
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
  drawMario();

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
    // respawning removed — no base snapshot
    showLevelLoadedMessage();
  } catch (err) {
    console.error('Failed to parse level data.', err);
    throw err;
  }
  updateCamera();
  requestAnimationFrame(loop);
})();
