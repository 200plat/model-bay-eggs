/*!
 * Model Bay — Easter Eggs
 * Zero-dependency canvas + Web Audio easter-egg layer for any page.
 *
 *   <canvas id="bg"></canvas>   (created automatically if missing)
 *   <script src="eggs.js"></script>
 *
 * Public API on window.ModelBayEggs:
 *   .setGPU(0-100)           drive star-speed/reactivity
 *   .hyperspace()            trigger Star Drive (rainbow speed stars, 20s)
 *   .portal()                trigger the sky portal
 *   .toggleMusic()/.toggleSpeed()  (SFX always on; no button by design)
 *   .spawnFlyer() .triggerWhale() .triggerEyes() .triggerShower()
 *   .triggerISS() .triggerAbduction() .triggerMoon() .triggerAurora()
 *   .triggerRain() .triggerAstronaut() .triggerTrainPass() (skyline train) / .triggerTrain() (satellite train)
 *   .wish()
 *   .setScene('fireplace'|'underwater'|'volcano'|'forest'|'desert'|'observatory'|'none')
 *   (mutually exclusive full-screen background scenes; one at a time)
 *
 * Anything present on the host page gets hooked automatically:
 *   #log            narrator line output
 *   #zapbtn         click for a spark burst + zap sound
 *   #musicbtn       mute/unmute (both the floating button and this)
 *   #floatmusic     handled automatically if present or created here
 */
(function () {
  'use strict';

  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------- canvas (two layers)
  // Front canvas sits above the UI (z-index 5), back canvas behind it (z-index -1).
  // Each easter egg renders on the layer for which its "on top" toggle is set.
  let cvFront = document.getElementById('bg');
  if (!cvFront) {
    cvFront = document.createElement('canvas');
    cvFront.id = 'bg';
    cvFront.style.cssText = 'position:fixed;inset:0;z-index:5;opacity:.9;pointer-events:none';
    document.body.appendChild(cvFront);
  }
  const cvBack = document.createElement('canvas');
  cvBack.id = 'bg-behind';
  cvBack.style.cssText = 'position:fixed;inset:0;z-index:-1;opacity:.9;pointer-events:none';
  document.body.appendChild(cvBack);
  const CTX_FRONT = cvFront.getContext('2d');
  const CTX_BACK = cvBack.getContext('2d');
  let ctx = CTX_FRONT;   // reassigned per egg in the render loop
  const fit = () => { cvFront.width = cvBack.width = innerWidth; cvFront.height = cvBack.height = innerHeight; };
  fit(); addEventListener('resize', fit);

  const rand = (a, b) => a + Math.random() * (b - a);
  // seeded PRNG for stable scene layouts (same seed => same arrangement every visit)
  const srand = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const el = (id) => document.getElementById(id);
  const say = (s) => { const e = el('log'); if (e) e.textContent = s; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------- persistence
  const store = {
    get(k, d) { try { const v = localStorage.getItem('modelbay:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('modelbay:' + k, JSON.stringify(v)); } catch {} },
  };

  // ---------------------------------------------------------- narrator voice
  const narr = {
    abduct: ['🛸 something stirs in the sky…', '🛸 crop circle forming… again?', '🛸 the mothership has trust issues'],
    gaze: ['🐄 it saw you. again.', '🐄 the gaze lasts three seconds. you blinked first.', '🐄 unbroken eye contact. splendid.', '🐄 it knows what you did. it is not mad.'],
    kitty: ['🐱 the telescope cat purrs. clearance granted.', '🐱 noted. mrrp.', '🐱 it judges you, but fondly.', '🐱 good human. proceed.'],
    abductDone: ['🐄 abduction complete. the cows will remember this.', '🐄 the cow understood what happened.', '🐄 another one for the collection.'],
    whale: ['🐋 a whale migrates through the sky…', '🐋 the sky has whales. nobody tells you this?', '🐋 it\'s looking for the datacenter with no windows.'],
    eyes: ['👀 something in the dark noticed you first.', '👀 don\'t blink. they blink for you.'],
    iss: ['🛰️ ISS passes overhead', '🛰️ someone up there is also watching us.', '🛰️ the astronauts waved back. probably.'],
    shower: ['🌠 a meteor shower breaks over the Spark!', '🌠 the sky is littering, but beautifully.', '🌠 mothership is late and angry about it.'],
    aurora: ['🌌 the aurora is practicing guitar', '🌌 northern lights… over a desk?', '🌌 the sky is showing off tonight'],
    moon: ['🌕 full moon tonight. run diagnostics.', '🌕 the moon is watching. it always is.', '🌕 supermoon hours. be kind to the GPUs.'],
    train: ['🛰️ satellite train in formation. we are not alone.', '🛰️ a parade of very expensive flash drives.', '🛰️ someone is taking roll call up there'],
    astronaut: ['👨‍🚀 a tiny astronaut hitched a ride', '👨‍🚀 someone left the airlock open again', '👨‍🚀 reporting for orbital duty'],
    portal: ['🌀 a portal opens. the stars go somewhere else.', '🌀 welcome to the between-space', '🌀 konami hyperdrive — destination: elsewhere'],
    rain: ['🌧️ it rains pixels for a moment', '🌧️ the datacenter is getting watered', '🌧️ a little rain for the silicon garden'],
    wish: ['✨ wish granted. probably.', '✨ the cosmos is listening (for once)', '✨ your wish has been filed under "maybe"'],
    dodge: ['🛸 no take-backs, cow', '🛸 it moved. they are fast when scared', '🛸 intercepted. ignored.'],
    graze: ['🐋 the whale leans into your hand', '🐋 soft giant. big energy.', '🐋 thanks for the snack, sky'],
  };
  const quip = (k) => say(pick(narr[k]));

  // ---------------------------------------------------------- audio
  let actx = null, master = null;
  let musicOn = store.get('music', false);
  let sfxOn = true; // no UI toggle for this; SFX was removed from the bar by user request
  // speed x1 / x10 — x10 fires everything 10x more often, not faster visually
  let speed = store.get('speed', store.get('flyers', false) ? 10 : 1);
  const CD = (ms) => ms / speed;            // cooldown scaled by speed
  function toggleSpeed() { speed = speed >= 10 ? 1 : 10; store.set('speed', speed); store.set('flyers', speed >= 10); syncSettingsUI(); return speed; }

  // ---------------------------------------------------------- per-egg toggles (the settings popup)
  const EGGS_TOGGLE = {
    starfield: false, flyers: false, whale: false, eyes: false, iss: false,
    shower: false, abduction: false, moon: false, aurora: false, train: false,
    astronaut: false, portal: false, rain: false, cow: true, trail: true,
    flicker: false, fireworks: false, eagle: false, balloon: false, gopher: false, lightning: false,
    snow: false, bats: false, santa: false, snake: false, grandFireworks: false,
    skyline: false, fireflies: false, comets: false, miniUfo: false, pumpkin: false,
    rocket: false, rainbow: false, paperPlane: false, asteroids: false, batSwarm: false, trainPass: false,
    christmasLights: true, halloweenLights: true, newyearLights: true,
    // the analog ghost: rare burst of broadcast snow; default off
    static: false,
  };
  const EGGS_TOP = {
    starfield: false, flyers: false, whale: false, eyes: false, iss: false,
    shower: false, abduction: false, moon: false, aurora: false, train: false,
    astronaut: false, portal: false, rain: false, cow: false, trail: true,
    flicker: false, fireworks: false, eagle: false, balloon: false, gopher: false, lightning: false,
    snow: false, bats: false, santa: false, snake: false, grandFireworks: false,
    skyline: false, fireflies: false, comets: false, miniUfo: false, pumpkin: false,
    rocket: false, rainbow: false, paperPlane: false, asteroids: false, batSwarm: false, trainPass: false,
    christmasLights: false, halloweenLights: false, newyearLights: false,
    static: false,
  };
  const eggToggle = Object.assign({}, EGGS_TOGGLE, store.get('eggToggle', {}));
  const eggTop = Object.assign({}, EGGS_TOP, store.get('eggTop', {}));
  const saveEggs = () => { store.set('eggToggle', eggToggle); store.set('eggTop', eggTop); };
  const eggOn = (k) => eggToggle[k] !== false;
  const layerOf = (k) => (eggTop[k] !== false) ? CTX_FRONT : CTX_BACK;

  // Theme presets: { on: which eggs to enable, top: which draw on top }
  const THEME_ORDER = ['minimal', 'sky', 'ground', 'spooky', 'festive', 'nature', 'all'];
  const THEME_ICON = { minimal: '◽️', sky: '🌤️', ground: '🦀', spooky: '🎃', festive: '🎄', nature: '🌿', all: '🌌' };
  const THEME_TITLE = { minimal: 'minimal — cow + cursor trail only', sky: 'sky life — flying & air', ground: 'ground life — critters & glow', spooky: 'spooky — halloween mood', festive: 'festive — christmas', nature: 'nature — calm & ambient', all: 'everything — every egg on + new year' };
  const THEMES = {
    minimal: { on: {cow: 1, trail: 1}, top: {trail: 1}, festive: 'none' },
    sky: { on: {starfield: 1, flyers: 1, eagle: 1, balloon: 1, aurora: 1, train: 1, trainPass: 1, iss: 1, shower: 1, comets: 1, miniUfo: 1, asteroids: 1, moon: 1, skyline: 1, fireflies: 1}, top: {trail: 1}, festive: 'none' },
    ground: { on: {cow: 1, gopher: 1, fireflies: 1, fireworks: 1, lightning: 1, rocket: 1, pumpkin: 1, trail: 1}, top: {trail: 1}, festive: 'none' },
    spooky: { on: {shower: 1, bats: 1, moon: 1, aurora: 1, abduction: 1, gopher: 1, pumpkin: 1, lightning: 1, snake: 1, batSwarm: 1, halloweenLights: 1}, top: {trail: 1}, festive: 'halloween' },
    festive: { on: {snow: 1, santa: 1, snake: 1, grandFireworks: 1, fireworks: 1, christmasLights: 1, cow: 1, trail: 1}, top: {trail: 1}, festive: 'christmas' },
    nature: { on: {starfield: 1, fireflies: 1, rain: 1, shower: 1, aurora: 1, moon: 1, eagle: 1, balloon: 1, whale: 1, eyes: 1, comets: 1, skyline: 1, trainPass: 1, trail: 1, cow: 1}, top: {trail: 1}, festive: 'none' },
    all: { on: Object.fromEntries(Object.keys(EGGS_TOGGLE).filter(k => k !== 'static').map(k => [k, 1])), top: {trail: 1}, festive: 'newyear' },
  };
  // ---------------------------------------------------------- preview renderers
  // ---------------------------------------------------------- scene previews (settings panel)
  function drawScenePreview(key, ctx, w, h, t) {
    const TAU = Math.PI * 2;
    ctx.clearRect(0, 0, w, h);
    switch (key) {
      case 'none': {
        ctx.fillStyle = '#070b16'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 7; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.4 * Math.sin(t * 2 + i)) + ')'; ctx.fillRect((i * 23 + 9) % w, (i * 13 + 4) % (h - 8), 1.3, 1.3); }
        ctx.fillStyle = '#04060c';
        for (let x = 0; x < w; x += 12) ctx.fillRect(x, h - 9, 10, 9);
        ctx.fillStyle = '#ffd880'; for (let x = 6; x < w; x += 14) ctx.fillRect(x, h - 7, 2, 1.6); break;
      }
      case 'fireplace': {
        ctx.fillStyle = '#201410'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#33241c'; for (let y = 0; y < h; y += 7) ctx.fillRect(0, y, w, 2);
        ctx.fillStyle = '#050202';
        ctx.beginPath(); ctx.moveTo(w / 2 - 18, h); ctx.lineTo(w / 2 - 18, h - 16); ctx.quadraticCurveTo(w / 2, h - 26, w / 2 + 18, h - 16); ctx.lineTo(w / 2 + 18, h); ctx.closePath(); ctx.fill();
        const wob = Math.sin(t * 6) * 3, fl = 0.85 + 0.3 * Math.sin(t * 9);
        ctx.fillStyle = 'rgba(255,150,40,' + fl + ')';
        ctx.beginPath(); ctx.ellipse(w / 2 + wob * 0.4, h - 3, 11 * fl, 7.5 * fl, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,225,130,' + fl + ')';
        ctx.beginPath(); ctx.ellipse(w / 2 + wob * 0.3, h - 2, 6 * fl, 4.4 * fl, 0, 0, TAU); ctx.fill(); break;
      }
      case 'underwater': {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#072a4a'); g.addColorStop(1, '#020c16');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(30,110,64,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (const sx of [18, 44, 78]) {
          const sway = Math.sin(t * 1.4 + sx) * 6;
          ctx.beginPath(); ctx.moveTo(sx, h); ctx.quadraticCurveTo(sx + sway * 0.4, h - 10, sx + sway, h - 18); ctx.stroke();
        }
        for (let i = 0; i < 3; i++) { const by = h - ((t * 26 + i * 19) % (h + 6)); ctx.strokeStyle = 'rgba(190,236,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(24 + i * 30 + Math.sin(t + i) * 2, by, 1.7 + i * 0.7, 0, TAU); ctx.stroke(); } break;
      }
      case 'volcano': {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#04050c'); g.addColorStop(1, '#1e0b06');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#0a0508';
        ctx.beginPath(); ctx.moveTo(w * 0.32, h); ctx.lineTo(w * 0.5, h - 19); ctx.lineTo(w * 0.68, h); ctx.closePath(); ctx.fill();
        const p = 0.6 + 0.4 * Math.sin(t * 2.4);
        const rg = ctx.createRadialGradient(w / 2, h - 19, 1, w / 2, h - 19, 13);
        rg.addColorStop(0, 'rgba(255,220,130,' + p + ')'); rg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = rg; ctx.fillRect(w / 2 - 14, h - 32, 28, 24); break;
      }
      case 'forest': {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#060d18'); g.addColorStop(1, '#0d1826');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e9eef8'; ctx.beginPath(); ctx.arc(w * 0.78, h * 0.26, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0e1620';
        for (const tx of [22, 44, 66]) {
          ctx.beginPath(); ctx.moveTo(tx, h - 3); ctx.lineTo(tx - 6, h - 3); ctx.moveTo(tx, h - 18); ctx.lineTo(tx - 7, h - 4); ctx.lineTo(tx + 7, h - 4); ctx.closePath(); ctx.fill();
        } break;
      }
      case 'desert': {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#150a26'); g.addColorStop(0.7, '#8a3527'); g.addColorStop(1, '#160a10');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffe7b2'; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.66, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#281320'; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h - 10); ctx.quadraticCurveTo(w * 0.3, h - 22, w * 0.55, h - 9); ctx.quadraticCurveTo(w * 0.8, h - 20, w, h - 6); ctx.lineTo(w, h); ctx.fill();
        ctx.fillStyle = '#0c0510'; ctx.fillRect(20, h - 12, 3.5, 10); ctx.fillRect(17, h - 8, 9, 2); break;
      }
      case 'observatory': {
        ctx.fillStyle = '#0a0908'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#151210'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(w / 2, h + 12, w * 0.52, Math.PI, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,190,255,0.35)'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) ctx.fillStyle = '#fff', ctx.fillRect((i * 29 + 11) % w, (i * 17 + 5) % (h / 2), 1.2, 1.2); break;
      }
      case 'synthwave': {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1b0730'); g.addColorStop(0.55, '#61104e'); g.addColorStop(1, '#0d0416');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const cy = h * 0.62, r = 13;
        ctx.fillStyle = '#ffd319'; ctx.beginPath(); ctx.arc(w / 2, cy, r, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = '#1b0730'; for (let i = 0; i < 3; i++) ctx.fillRect(w / 2 - r, cy - 4 - i * 4, r * 2, 1.8 + i);
        ctx.strokeStyle = '#ff2bd0'; ctx.lineWidth = 1.1;
        for (let i = 1; i < 5; i++) { const y = cy + (h - cy) * Math.pow(i / 5, 2.2); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.strokeStyle = '#17d3ff'; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(w / 2, cy); ctx.lineTo(w / 2 + k * 22, h); ctx.stroke(); } break;
      }
      case 'matrix': {
        ctx.fillStyle = '#010a04'; ctx.fillRect(0, 0, w, h);
        ctx.font = '7px ui-monospace, monospace'; ctx.textBaseline = 'top';
        const glyphs = 'ｦｧｮアウエカキク';
        for (const cx of [16, 40, 66, 92]) {
          const head = (t * 16 + cx * 3) % (h + 18) - 6;
          for (let k = 0; k < 5; k++) { ctx.fillStyle = k === 0 ? '#d8ffe2' : 'rgba(48,255,110,' + (1 - k / 5) + ')'; ctx.fillText(glyphs[(cx + k * 2 + ((t | 0) % 3)) % glyphs.length], cx, head - k * 8); }
        } break;
      }
      case 'bliss': {
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.75); g.addColorStop(0, '#3a8dde'); g.addColorStop(1, '#bfe0f4');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.24, 14, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4f9a2e'; ctx.beginPath(); ctx.moveTo(0, h); ctx.quadraticCurveTo(w * 0.4, h - 20, w, h - 4); ctx.lineTo(w, h); ctx.fill(); break;
      }
      case 'happy': {
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.72); g.addColorStop(0, '#ffb3c8'); g.addColorStop(1, '#fff3cf');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffe66a'; ctx.beginPath(); ctx.arc(w * 0.24, h * 0.24, 8, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.75; const rb = ['#ff6a6a', '#ffb24d', '#ffe66a', '#8aff8a', '#7ad7ff'];
        for (let i = 0; i < rb.length; i++) { ctx.strokeStyle = rb[i]; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.95, 16 + i * 3.4, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); }
        ctx.globalAlpha = 1;
        const by = h - 3 - ((t * 12) % (h * 0.5));
        ctx.fillStyle = '#ff5a7a'; ctx.beginPath(); ctx.ellipse(w * 0.45, by, 4, 5, 0, 0, TAU); ctx.fill(); break;
      }
      case 'excited': {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#060617'); g.addColorStop(1, '#2d1240');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#08061a'; for (const [bx, bw, bh] of [[4, 13, 15], [22, 9, 22], [36, 15, 11], [56, 10, 24], [71, 14, 17], [90, 16, 20]]) ctx.fillRect(bx, h - bh, bw, bh);
        ctx.fillStyle = '#ffd88a'; for (const [wx, wy] of [[8, h - 8], [26, h - 13], [41, h - 6], [60, h - 15], [75, h - 9], [95, h - 12]]) ctx.fillRect(wx, wy, 1.6, 1.7);
        const fl = 0.6 + 0.4 * Math.abs(Math.sin(t * 2.6));
        ctx.globalAlpha = fl; ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(w * 0.45, h * 0.28, 5 + fl * 3, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fl * 0.7; ctx.beginPath(); ctx.arc(w * 0.2, h * 0.2, 4 + fl * 2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; break;
      }
      case 'cabin': {
        ctx.fillStyle = '#1a110c'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#040f1e'; ctx.fillRect(14, 3, w - 28, h - 9);
        const g = ctx.createLinearGradient(0, 4, 0, h - 9); g.addColorStop(0, 'rgba(57,255,176,0.4)'); g.addColorStop(0.5, 'rgba(94,201,255,0.13)'); g.addColorStop(1, 'rgba(57,255,176,0)');
        ctx.fillStyle = g; ctx.fillRect(14, 3, w - 28, h - 9);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 6; i++) ctx.fillRect(17 + (i * 17) % (w - 30), (i * 9 + t * 12) % (h - 12) + 3, 1.3, 1.3); break;
      }
      case 'y2k': {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#b9c6d2'); g.addColorStop(0.55, '#d9dbe0'); g.addColorStop(0.75, '#79828f'); g.addColorStop(1, '#232a35');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const orb = (x, y, r) => { const og = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, 1, x, y, r); og.addColorStop(0, '#fff'); og.addColorStop(0.4, '#8a93a0'); og.addColorStop(0.62, '#dfe3e8'); og.addColorStop(1, '#10151d'); ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
        orb(22, 12, 7); orb(74, 10, 9); orb(47, 24, 4); break;
      }
      case 'lavara': {
        ctx.fillStyle = '#33221b'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(120,80,52,0.4)'; for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 4, h);
        ctx.fillStyle = '#050202'; ctx.fillRect(0, h - 7, w, 7);
        for (const lx of [30, 76]) {
          ctx.fillStyle = '#5a2433'; ctx.beginPath(); ctx.moveTo(lx - 5, h - 2); ctx.lineTo(lx - 8, h - 20); ctx.lineTo(lx + 8, h - 20); ctx.lineTo(lx + 5, h - 2); ctx.closePath(); ctx.fill();
          const bobY = h - 8 - ((t * 8 + lx) % 12);
          ctx.fillStyle = '#ff5a8c'; ctx.beginPath(); ctx.ellipse(lx + Math.sin(t * 2 + lx) * 3, bobY, 3.4, 4.2, 0, 0, TAU); ctx.fill();
        } break;
      }
      case 'train': {
        ctx.fillStyle = '#171310'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#040a18'; ctx.fillRect(8, 5, w - 16, h - 13);
        for (let i = 0; i < 5; i++) {
          const lx = w - ((t * 90 + i * 47) % (w + 30)) + 15;
          ctx.fillStyle = '#ffd88a'; ctx.fillRect(lx, h - 13 + (i % 2) * 3, 3, 2);
        }
        ctx.fillStyle = '#040a18'; ctx.fillRect(8, h - 8, w - 16, 3); break;
      }
      case 'noir': {
        ctx.fillStyle = '#08080a'; ctx.fillRect(0, 0, w, h);
        for (let y = 2; y < h - 6; y += 6) { ctx.fillStyle = '#16161a'; ctx.fillRect(16, y, w - 32, 3); }
        const fl = 0.35 + 0.1 * Math.sin(t * 2.2);
        const lg = ctx.createRadialGradient(22, h - 8, 2, 22, h - 8, 22);
        lg.addColorStop(0, 'rgba(255,214,140,' + fl + ')'); lg.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = lg; ctx.fillRect(0, 0, 46, h); break;
      }
      case 'library': {
        ctx.fillStyle = '#0d0906'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#04101f'; ctx.beginPath(); ctx.moveTo(w / 2 - 13, h); ctx.lineTo(w / 2 - 13, 8); ctx.quadraticCurveTo(w / 2, -2, w / 2 + 13, 8); ctx.lineTo(w / 2 + 13, h); ctx.closePath(); ctx.fill();
        for (const sp of [10, 24, 38]) { ctx.fillStyle = '#1e150e'; ctx.fillRect(0, sp, 14, 3); ctx.fillRect(w - 14, sp, 14, 3); }
        const fl = 0.6 + 0.4 * Math.abs(Math.sin(t * 7));
        ctx.fillStyle = 'rgba(255,220,140,' + fl + ')'; ctx.beginPath(); ctx.ellipse(w / 2 - 16, h - 4, 2.2, 3.2 * fl, 0, 0, TAU); ctx.ellipse(w / 2 + 16, h - 4, 2.2, 3.2 * fl, 0, 0, TAU); ctx.fill(); break;
      }
    }
  }


  function drawEggPreview(key, ctx, w, h, t) {
    const TAU = Math.PI * 2;
    // backdrop: dark rounded rect + a few twinkling stars
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070b16'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const sx = ((i * 37 + 11) % w) + 2, sy = ((i * 23 + 7) % h) + 2;
      const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 1.7));
      ctx.fillStyle = 'rgba(190,215,255,' + a.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, 0.7, 0, TAU); ctx.fill();
    }
    const midY = h * 0.62;
    switch (key) {
      case 'starfield': {
        for (let i = 0; i < 10; i++) {
          const x = (i * 97 + Math.sin(t * 0.8 + i) * 2) % w, y = (i * 61 + Math.cos(t + i) * 2) % h;
          const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2 + i * 2.3));
          ctx.fillStyle = i % 3 === 0 ? '#cfe6ff' : (i % 3 === 1 ? '#ffe9a8' : '#9fd0ff');
          ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, 0.9 + (i % 3) * 0.3, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1; break;
      }
      case 'flyers': {
        const bob = Math.sin(t * 2.4) * 2, x = ((t * 18) % (w + 40)) - 20;
        ctx.fillStyle = 'rgba(170,225,255,0.9)'; ctx.beginPath(); ctx.ellipse(x, midY + bob, 11, 3.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(95,150,215,0.95)'; ctx.beginPath(); ctx.ellipse(x, midY + bob - 2, 6, 3, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#7fffd4'; ctx.beginPath(); ctx.arc(x, midY + bob + 3, 1.2, 0, TAU); ctx.fill(); break;
      }
      case 'whale': {
        const x = ((t * 11) % (w + 80)) - 40, bob = Math.sin(t) * 2;
        ctx.fillStyle = 'rgba(46,66,102,0.92)'; ctx.beginPath(); ctx.ellipse(x, midY, 15, 5.5, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 14, midY); ctx.lineTo(x - 21, midY - 4 + bob); ctx.lineTo(x - 18, midY); ctx.lineTo(x - 21, midY + 4 + bob); ctx.closePath(); ctx.fill(); break;
      }
      case 'eyes': {
        const blink = Math.abs(((t * 1.7) % 1.4) - 0.12) < 0.09, hh = blink ? 0.6 : 2.4;
        ctx.fillStyle = '#ffcf7a'; ctx.shadowColor = '#ffcf7a'; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.ellipse(w / 2 - 8, h / 2, 3.4, hh, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w / 2 + 8, h / 2, 3.4, hh, 0, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; break;
      }
      case 'iss': {
        const x = ((t * 26) % (w + 40)) - 20;
        ctx.fillStyle = '#dfe6f5'; ctx.fillRect(x, h / 2 - 1.4, 4.6, 2.2);
        ctx.fillStyle = '#3f6fd8'; ctx.fillRect(x - 3, h / 2 - 1, 2.6, 1.4); ctx.fillRect(x + 5, h / 2 - 1, 2.6, 1.4); break;
      }
      case 'shower':
      case 'comets': {
        for (let i = 0; i < 3; i++) {
          const ph = (t * 7 + i * 5) % (w + 60);
          ctx.globalAlpha = 0.9; ctx.strokeStyle = '#cfe6ff'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(ph, 4); ctx.lineTo(ph - 10, 14); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ph, 4, 1.2, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1; break;
      }
      case 'abduction': {
        const bob = Math.sin(t * 2) * 1.5;
        ctx.fillStyle = 'rgba(170,225,255,0.95)'; ctx.beginPath(); ctx.ellipse(w / 2, 7, 11, 3.4, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(190,255,235,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -(t * 40) % 8;
        ctx.beginPath(); ctx.moveTo(w / 2, 10); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(228,255,244,0.85)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 4, 4.4, 2.4, 0, 0, TAU); ctx.fill(); break;
      }
      case 'moon': {
        const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 13);
        g.addColorStop(0, '#fdf6d8'); g.addColorStop(0.6, '#e8e0b8'); g.addColorStop(1, 'rgba(232,224,184,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, 12.5, 0, TAU); ctx.fill(); break;
      }
      case 'aurora': {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#39ffb0'); grad.addColorStop(0.5, '#5ec9ff'); grad.addColorStop(1, 'rgba(94,201,255,0)');
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.4);
        ctx.fillStyle = grad;
        for (let x = 0; x < w; x += 6) { const hh = Math.sin(x * 0.14 + t * 1.3) * 7 + 20; ctx.fillRect(x, 0, 5, hh); }
        ctx.globalAlpha = 1; break;
      }
      case 'train': {
        const x = ((t * 22) % (w + 90)) - 45;
        for (let i = 0; i < 5; i++) ctx.beginPath(), ctx.moveTo(0, 0), ctx.lineTo(0, 0);
        ctx.fillStyle = '#0d1220'; ctx.fillRect(0, h - 10, w, 10);
        ctx.fillStyle = '#181f3a'; ctx.beginPath(); ctx.moveTo(w, h - 10); ctx.lineTo(w + 8, h - 6); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd880'; for (let i = 0; i < 6; i++) ctx.fillRect(3 + i * 17, h - 6, 3.4, 2.4); break;
      }
      case 'trainPass': {
        ctx.fillStyle = '#060a14'; ctx.fillRect(0, h - 12, w, 12);
        ctx.fillStyle = '#ffd880'; ctx.fillRect(4, h - 9, 2.4, 2); ctx.fillRect(40, h - 9, 2.4, 2); ctx.fillRect(76, h - 9, 2.4, 2);
        const x = ((t * 16) % (w + 60)) - 30;
        ctx.fillStyle = '#0d1220'; ctx.fillRect(x, h - 7, 34, 5.4);
        ctx.fillStyle = '#ffd880'; ctx.fillRect(x + 2, h - 5, 4, 1.8); ctx.fillRect(x + 10, h - 5, 4, 1.8); ctx.fillRect(x + 18, h - 5, 4, 1.8); break;
      }
      case 'astronaut': {
        const swing = Math.sin(t * 2.2) * 3;
        ctx.strokeStyle = 'rgba(200,220,255,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 + swing, 14); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w / 2 + swing, 15, 3.1, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a3550'; ctx.beginPath(); ctx.arc(w / 2 + swing, 14, 1.8, Math.PI, 0); ctx.fill(); break;
      }
      case 'portal': {
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(t * 1.4);
        for (let i = 0; i < 4; i++) { ctx.strokeStyle = ['#b08cff', '#6ea8fe', '#9fd0ff', '#e2b3ff'][i]; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 3 + i * 2.8 + Math.sin(t * 2 + i) * 1.2, 0, TAU); ctx.stroke(); }
        ctx.restore(); break;
      }
      case 'rain': {
        ctx.strokeStyle = 'rgba(170,200,255,0.65)'; ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
          const x = (i * 17 + ((t * 60) % 60)) % w, y = (i * 13 + (t * 90) % (h + 20)) % h;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y + 8); ctx.stroke();
        } break;
      }
      case 'cow': {
        const x = ((t * 10) % (w + 30)) - 15;
        ctx.fillStyle = 'rgba(228,255,244,0.88)'; ctx.beginPath(); ctx.ellipse(x, h - 6, 7.5, 4.4, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 7, h - 8.4, 2.9, 0, TAU); ctx.fill(); break;
      }
      case 'static': {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 44; j++) {
            ctx.globalAlpha = 0.5 + Math.random() * 0.4;
            ctx.fillStyle = Math.random() < 0.5 ? '#e8e8e8' : '#0a0a0a';
            ctx.fillRect(((j * 37 + i * 13) % w), i * 9 + 2, 4, 5.5);
          }
        }
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, ((t * 14) % h), w, 2); ctx.globalAlpha = 1; break;
      }
      case 'trail': {
        for (let i = 0; i < 7; i++) {
          const x = (i * 31 + ((t * 22) % 60)) % w, y = (i * 17 + Math.sin(t + i) * 4 + h * 0.35) % h;
          const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 3 + i * 2));
          ctx.globalAlpha = a; ctx.fillStyle = i % 2 ? '#ffe9a8' : '#cfe6ff'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 3;
          ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; break;
      }
      case 'flicker': {
        const on = Math.floor(t * 2) % 2 === 0;
        ctx.fillStyle = on ? '#ffd880' : '#1a2338'; ctx.shadowColor = '#ffd880'; ctx.shadowBlur = on ? 6 : 0;
        ctx.beginPath(); ctx.arc(w / 2 - 8, h / 2, 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = on ? '#9cd4ff' : '#1a2338'; ctx.shadowColor = '#9cd4ff';
        ctx.beginPath(); ctx.arc(w / 2 + 8, h / 2, 2.4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; break;
      }
      case 'fireworks':
      case 'grandFireworks': {
        const b = (t * 0.55) % 1;
        const cxs = [w * 0.3, w * 0.7];
        for (const cx of cxs) {
          ctx.globalAlpha = 1 - b;
          for (let i = 0; i < 10; i++) {
            const ang = i * TAU / 10;
            const len = 2 + b * (key === 'grandFireworks' ? 13 : 9);
            ctx.strokeStyle = 'hsl(' + ((i * 36 + t * 60) % 360) + ',100%,68%)'; ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * len * .3, h * 0.5 + Math.sin(ang) * len * .3); ctx.lineTo(cx + Math.cos(ang) * len, h * 0.5 + Math.sin(ang) * len); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1; break;
      }
      case 'eagle': {
        const x = ((t * 14) % (w + 40)) - 20, flap = Math.sin(t * 5) * 3;
        ctx.strokeStyle = 'rgba(225,233,255,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x - 9, h * 0.55); ctx.quadraticCurveTo(x, h * 0.55 - 7 - flap, x + 12, h * 0.55); ctx.stroke(); break;
      }
      case 'balloon': {
        const x = ((t * 7) % (w + 30)) - 15, bob = Math.sin(t * 1.8) * 1.5;
        ctx.fillStyle = '#d94f4f'; ctx.beginPath(); ctx.arc(x, h * 0.3 + bob, 7.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#c3cede'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, h * 0.3 + 7 + bob); ctx.lineTo(x - 2, h * 0.3 + 12 + bob); ctx.moveTo(x + 4, h * 0.3 + 7 + bob); ctx.lineTo(x + 2, h * 0.3 + 12 + bob); ctx.stroke();
        ctx.fillStyle = '#5b4632'; ctx.fillRect(x - 2.5, h * 0.3 + 12 + bob, 5, 3); break;
      }
      case 'gopher': {
        const out = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3));
        ctx.fillStyle = 'rgba(58,42,28,0.95)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 1.5, 13, 4, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = out; ctx.fillStyle = '#8a6b4f'; ctx.beginPath(); ctx.ellipse(w / 2, h - 6, 5.5, 4, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
      }
      case 'lightning': {
        const flash = Math.floor(t * 2) % 3 === 0;
        if (flash) { ctx.fillStyle = 'rgba(207,230,255,0.8)'; ctx.fillRect(0, 0, w, h); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowColor = '#cfe6ff'; ctx.shadowBlur = 8;
        let x = w / 2 + Math.sin(t) * 4, y = 0;
        ctx.beginPath(); ctx.moveTo(x, y);
        while (y < h) { y += 4 + Math.sin(y * 3 + t * 8) * 1.6 + 2; x += Math.sin(y + t * 3) * 3; ctx.lineTo(x, y); }
        ctx.stroke(); ctx.shadowBlur = 0; break;
      }
      case 'snow': {
        for (let i = 0; i < 14; i++) { const x = (i * 13 + ((t * 8) % 130)) % w, y = (i * 29 + t * 14) % h; ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; break;
      }
      case 'bats':
      case 'batSwarm': {
        const n = key === 'batSwarm' ? 5 : 2;
        for (let i = 0; i < n; i++) {
          const x = ((t * 13 + i * 37) % (w + 30)) - 15, y = h * 0.5 + Math.sin(t * 2 + i * 2) * 5, wing = Math.sin(t * 8 + i * 3) * 3;
          ctx.fillStyle = '#1a1024'; ctx.beginPath(); ctx.ellipse(x, y, 3, 1.6, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x, y - 2 - wing, x + 3, y); ctx.fill();
        } break;
      }
      case 'santa': {
        const x = ((t * 12) % (w + 50)) - 25;
        ctx.fillStyle = '#b33a3a'; ctx.beginPath(); ctx.ellipse(x, h * 0.4, 8.5, 4.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 6, h * 0.4 - 4, 2.4, 0, TAU); ctx.fill(); break;
      }
      case 'snake': {
        ctx.strokeStyle = '#7de08a'; ctx.lineWidth = 1.8; ctx.shadowColor = '#7de08a'; ctx.shadowBlur = 3;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) ctx.lineTo(x, h * 0.5 + Math.sin(x * 0.18 + t * 3) * 6);
        ctx.stroke(); ctx.shadowBlur = 0; break;
      }
      case 'skyline': {
        ctx.fillStyle = '#060a14'; ctx.fillRect(0, h - 10, w, 10);
        ctx.fillStyle = '#ffd880'; ctx.fillRect(8, h - 7, 3, 2.4); ctx.fillRect(40, h - 7, 3, 2.4); ctx.fillRect(74, h - 7, 3, 2.4); break;
      }
      case 'fireflies': {
        for (let i = 0; i < 5; i++) {
          const x = w * 0.2 + Math.sin(t * 1.1 + i * 2) * 20 + i * 18, y = h * 0.6 + Math.cos(t * 0.9 + i * 1.3) * 8;
          const glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 3));
          ctx.globalAlpha = glow; ctx.shadowColor = '#c5ff7a'; ctx.shadowBlur = 6; ctx.fillStyle = '#d8ff9a';
          ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; break;
      }
      case 'miniUfo': {
        const x = ((t * 10) % (w + 24)) - 12, bob = Math.sin(t * 1.9) * 1.3;
        ctx.fillStyle = 'rgba(190,230,255,0.95)'; ctx.beginPath(); ctx.ellipse(x, h * 0.4 + bob, 5.5, 1.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(120,190,255,0.9)'; ctx.beginPath(); ctx.ellipse(x, h * 0.4 + bob - 1, 2.8, 1.4, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#7fffd4'; ctx.beginPath(); ctx.arc(x, h * 0.4 + bob + 2, 0.7, 0, TAU); ctx.fill(); break;
      }
      case 'pumpkin': {
        ctx.shadowColor = '#ff8c1a'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#c2561a'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.55, 8.5, 6, 0, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#5a2e06'; ctx.fillRect(w / 2 - 1.2, h * 0.55 - 7, 2.4, 2.4);
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.moveTo(w / 2 - 5, h * 0.55 - 2); ctx.lineTo(w / 2 - 2, h * 0.55 - 4); ctx.lineTo(w / 2, h * 0.55 - 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w / 2 + 0.6, h * 0.55 - 2); ctx.lineTo(w / 2 + 3.4, h * 0.55 - 4); ctx.lineTo(w / 2 + 5.6, h * 0.55 - 2); ctx.closePath(); ctx.fill(); break;
      }
      case 'rocket': {
        const y = h - ((t * 26) % (h + 30));
        ctx.fillStyle = '#d9dee8'; ctx.beginPath(); ctx.moveTo(w / 2, y - 8); ctx.lineTo(w / 2 + 4, y + 3); ctx.lineTo(w / 2 - 4, y + 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b33a3a'; ctx.beginPath(); ctx.moveTo(w / 2, y - 8); ctx.lineTo(w / 2 + 4, y + 3); ctx.lineTo(w / 2, y); ctx.lineTo(w / 2 - 4, y + 3); ctx.closePath(); ctx.fill(); break;
      }
      case 'rainbow': {
        const bands = ['#ff6a6a', '#ffb84d', '#ffe769', '#7de08a', '#5ab4ff', '#b08cff'];
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < bands.length; i++) { ctx.strokeStyle = bands[i]; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(w / 2, h + 6, 14 - i * 2.1, Math.PI, 0); ctx.stroke(); }
        ctx.globalAlpha = 1; break;
      }
      case 'paperPlane': {
        const x = ((t * 12) % (w + 30)) - 15, bob = Math.sin(t * 2) * 2;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + 7, h * 0.42 + bob); ctx.lineTo(x - 7, h * 0.42 - 3 + bob); ctx.lineTo(x - 3, h * 0.42 + bob); ctx.lineTo(x - 7, h * 0.42 + 3 + bob); ctx.closePath(); ctx.fill(); break;
      }
      case 'asteroids': {
        for (let i = 0; i < 3; i++) {
          const x = ((t * 8 + i * 37) % (w + 20)) - 10, y = h * 0.3 + Math.sin(t * 1.3 + i * 2) * 6;
          ctx.beginPath(); ctx.fillStyle = '#7d7d8b'; ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.fillStyle = '#5a5a66'; ctx.arc(x + 0.8, y + 0.6, 1.1, 0, TAU); ctx.fill();
        } break;
      }
      default: {
        ctx.fillStyle = '#132036'; ctx.fillRect(0, h - 12, w, 12);
        ctx.fillStyle = '#ffd880'; ctx.fillRect(6, h - 9, 2.5, 2); ctx.fillRect(44, h - 9, 2.5, 2); ctx.fillRect(82, h - 9, 2.5, 2); break;
      }
    }
  }

  function applyTheme(name) {
    const t = THEMES[name];
    if (!t) return;
    const nt = {}, np = {};
    for (const k of Object.keys(EGGS_TOGGLE)) { nt[k] = !!t.on[k]; np[k] = !!t.top[k]; }
    Object.assign(eggToggle, nt);
    Object.assign(eggTop, np);
    store.set('theme', name);
    saveEggs();
    if (t.festive && t.festive !== festive) { festive = t.festive; store.set('festive', festive); }
    syncEggCheckboxes();
    syncSettingsUI();
  }

  let previewKey = null, previewRaf = 0, previewsRef = null;
  let scenePreviewKey = null, scenePreviews = null;
  function drawPreviewFrame() {
    if (previewKey && previewsRef && previewsRef[previewKey]) {
      const p = previewsRef[previewKey];
      drawEggPreview(previewKey, p.ctx, p.w, p.h, performance.now() / 1000);
    }
    if (scenePreviewKey && scenePreviews && scenePreviews[scenePreviewKey]) {
      const p = scenePreviews[scenePreviewKey];
      drawScenePreview(scenePreviewKey, p.ctx, p.w, p.h, performance.now() / 1000);
    }
    previewRaf = requestAnimationFrame(drawPreviewFrame);
  }

  function openEggPanel() {
    let modal = document.getElementById('modelbay-eggpanel');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modelbay-eggpanel';
      modal.innerHTML = `
        <div class="mbp-card" role="dialog" aria-label="Easter egg settings">
          <div class="mbp-head"><span>⚡ easter egg settings</span><button id="mbp-close" aria-label="close">✕</button></div>
          <div class="mbp-themes" id="mbp-themes"></div>
          <div class="mbp-scenes" id="mbp-scenes"></div>
          <div class="mbp-body" id="mbp-grid"></div>
          <div class="mbp-legend">▲ = draws on top of UI  ·  ▽ = behind UI&nbsp;&nbsp;·&nbsp;&nbsp;<button id="mbp-portal" style="cursor:pointer;background:#1a2338;border:1px solid #223049;color:#cdd6ec;border-radius:.4rem;padding:.1rem .55rem;font-size:.75rem;vertical-align:middle">🌀 portal</button></div>
          <div class="mbp-foot">
            <label class="mbp-check"><input type="checkbox" id="mbp-ontop-all"> <span>All effects draw <b>on top</b> of UI</span></label>
            <label class="mbp-check"><input type="checkbox" id="mbp-enable-all" checked> <span><b>Enable all</b> effects</span></label>
            <label class="mbp-check"><input type="checkbox" id="mbp-scene-audio"> <span>Scene ambience <b>(off by default)</b> — fire crackle, crickets, synthwave bass…</span></label>
            <label class="mbp-check"><input type="checkbox" id="mbp-sceneday"> <span>🌅 scene of the day — a different background each day (seeded by date)</span></label>
            <label class="mbp-check" style="color:#8b98b4;font-size:.78rem">latitude for sunrise/sunset glow <input id="mbp-lat" type="number" min="-66" max="66" step="1" style="width:64px;background:#1a2338;color:#cdd6ec;border:1px solid #223049;border-radius:.35rem;padding:.1rem .3rem;font-size:.8rem"></label>
            <div class="mbp-row"><button id="mbp-reset">reset defaults</button></div>
          </div>
        </div>`;
      modal.style.cssText = 'position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(4,8,18,.55);backdrop-filter:blur(4px)';
      modal.querySelector('.mbp-card').style.cssText = 'background:#131a28;border:1px solid #223049;border-radius:1rem;min-width:420px;max-width:780px;max-height:86vh;overflow:auto;box-shadow:0 10px 60px rgba(0,0,0,.6);color:#e8ecf4;font-family:ui-sans-serif,system-ui,sans-serif';
      modal.querySelector('.mbp-head').style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:.8rem 1rem;border-bottom:1px solid #223049;font-weight:700;letter-spacing:.02em;position:sticky;top:0;background:#131a28;z-index:1';
      modal.querySelector('.mbp-head button').style.cssText = 'cursor:pointer;background:none;border:none;color:#8b98b4;font-size:1.1rem';
      modal.querySelector('.mbp-body').style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:.4rem .6rem;padding:.9rem 1rem';
      modal.querySelector('.mbp-themes').style.cssText = 'display:flex;flex-wrap:wrap;gap:.35rem;padding:.7rem 1rem;border-bottom:1px solid #223049';
      modal.querySelector('.mbp-scenes').style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:.4rem .6rem;padding:.6rem .8rem;border-bottom:1px solid #223049';
      modal.querySelector('.mbp-scenes').innerHTML = SCENE_ORDER.map(k => '<div class="mbp-srow" data-scene="' + k + '" style="display:grid;grid-template-columns:1fr 110px;gap:.4rem;align-items:center;padding:.18rem;border-radius:.4rem;background:rgba(19,25,40,.4)"><button class="mbp-scene" data-scene="' + k + '" title="' + SCENE[k] + '" style="cursor:pointer;text-align:left;background:#1a2338;border:1px solid #223049;color:#cdd6ec;border-radius:.4rem;padding:.3rem .45rem;font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + SCENE[k] + '</button><canvas class="mbp-spreview" width="110" height="38" style="width:110px;height:38px;border-radius:.35rem;background:#070b16;display:block"></canvas></div>').join('');
      const spreviews = {};
      modal.querySelectorAll('.mbp-srow').forEach(row => {
        const k = row.dataset.scene;
        const cvs = row.querySelector('.mbp-spreview');
        spreviews[k] = { canvas: cvs, ctx: cvs.getContext('2d'), w: cvs.width, h: cvs.height };
        row.addEventListener('mouseenter', () => { scenePreviewKey = k; });
        row.addEventListener('mouseleave', () => { if (scenePreviewKey === k) scenePreviewKey = null; });
        row.querySelector('.mbp-scene').addEventListener('click', () => { setScene(k); });
      });
      scenePreviews = spreviews;
      for (const k of Object.keys(spreviews)) drawScenePreview(k, spreviews[k].ctx, spreviews[k].w, spreviews[k].h, (performance.now() % 10000) / 1000);
      modal.querySelector('.mbp-themes').innerHTML = [
        ['minimal','minimal'],['sky','sky life'],['ground','ground life'],['spooky','spooky'],['festive','festive'],['nature','nature'],['all','everything'],
      ].map(([k, l]) => '<button class="mbp-theme" data-theme="' + k + '" style="cursor:pointer;background:#1a2338;border:1px solid #223049;color:#cdd6ec;border-radius:.45rem;padding:.3rem .6rem;font-size:.78rem">' + l + '</button>').join('');
      modal.querySelectorAll('.mbp-theme').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
      modal.querySelector('.mbp-legend').style.cssText = 'padding:0 1rem .5rem;color:#8b98b4;font-size:.75rem';
      modal.querySelector('.mbp-foot').style.cssText = 'padding:.7rem 1rem;border-top:1px solid #223049;display:flex;flex-direction:column;gap:.5rem';
      modal.querySelectorAll('.mbp-row button').forEach(b => { b.style.cssText = 'cursor:pointer;background:#1a2338;border:1px solid #223049;color:#e8ecf4;border-radius:.45rem;padding:.35rem .7rem;font-size:.8rem'; });
      modal.querySelectorAll('.mbp-check').forEach(b => { b.style.cssText = 'display:flex;gap:.5rem;align-items:center;font-size:.85rem;color:#cdd6ec'; });
      document.body.appendChild(modal);

      const EGGS_LIST = [
        ['starfield', 'Starfield'], ['flyers', 'UFOs & satellites & birds'], ['whale', 'Sky whales'],
        ['eyes', 'Blinking amber eyes'], ['iss', 'ISS passes'], ['shower', 'Meteor showers'],
        ['abduction', 'Cow abduction'], ['moon', 'Supermoon'], ['aurora', 'Auroras'],
        ['train', 'Satellite trains'], ['trainPass', 'Passenger train on skyline'], ['astronaut', 'Tethered astronaut'], ['portal', 'Portal swirl'],
        ['rain', 'Rain burst'], ['cow', 'Wandering cow'], ['trail', 'Star-dust cursor trail'],
        ['flicker', 'Neon flicker on dots'], ['christmasLights', 'Christmas lights'], ['halloweenLights', 'Halloween lights'], ['newyearLights', 'New Year lights'],
        ['fireworks', 'Fireworks'], ['eagle', 'Soaring eagle'], ['balloon', 'Hot-air balloons'],
        ['gopher', 'Gopher rooting about'], ['lightning', 'Lightning flashes'],
        ['snow', 'Christmas snow'], ['bats', 'Halloween bats'], ['santa', 'Santa fly-by'], ['snake', 'Sky snake'], ['grandFireworks', 'Grand fireworks'],
        ['skyline', 'City skyline'], ['fireflies', 'Fireflies'], ['comets', 'Comets'], ['miniUfo', 'Ambient mini-UFOs'], ['pumpkin', 'Glowing jack-o-lantern'],
        ['static', 'Analog TV static'],
        ['rocket', 'Rocket launches'], ['rainbow', 'Rainbow arc'], ['paperPlane', 'Paper airplanes'], ['asteroids', 'Asteroid field'], ['batSwarm', 'Bat swarms (Halloween)'],
      ];
      const grid = modal.querySelector('#mbp-grid');
      const previews = {};
      for (const [key, label] of EGGS_LIST) {
        const row = document.createElement('div');
        row.className = 'mbp-row-item';
        row.dataset.key = key;
        row.style.cssText = 'display:grid;grid-template-columns:1fr 110px 28px;align-items:center;gap:.4rem;padding:.35rem .35rem;border-radius:.4rem;font-size:.82rem;background:rgba(20,29,47,.4);border:1px solid transparent';
        row.innerHTML = `<label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;min-width:0"><input type="checkbox" class="egg-tog" data-key="${key}" style="accent-color:#6ea8fe;flex-shrink:0"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span></label><canvas class="mbp-preview" width="110" height="38" style="width:110px;height:38px;border-radius:.35rem;background:#070b16;display:block"></canvas><button class="egg-top" data-key="${key}" title="draw on top of UI" style="cursor:pointer;background:#1a2338;border:1px solid #223049;color:#9fd0ff;border-radius:.4rem;padding:.1rem .45rem;font-size:.9rem;line-height:1.2">▲</button>`;
        grid.appendChild(row);
        const cvs = row.querySelector('.mbp-preview');
        previews[key] = { canvas: cvs, ctx: cvs.getContext('2d'), w: cvs.width, h: cvs.height };
        row.querySelector('.egg-tog').checked = eggOn(key);
        const topBtn = row.querySelector('.egg-top');
        const paintTop = () => { topBtn.textContent = eggTop[key] !== false ? '▲' : '▽'; topBtn.style.color = eggTop[key] !== false ? '#9fd0ff' : '#8b98b4'; };
        paintTop();
        row.querySelector('.egg-tog').addEventListener('change', (e) => { eggToggle[key] = e.target.checked; saveEggs(); });
        topBtn.addEventListener('click', () => { eggTop[key] = !(eggTop[key] !== false); saveEggs(); paintTop(); });
        row.addEventListener('mouseenter', () => { previewKey = key; });
        row.addEventListener('mouseleave', () => { if (previewKey === key) previewKey = null; });
      }
      modal.querySelector('#mbp-ontop-all').addEventListener('change', (e) => { Object.keys(EGGS_TOP).forEach(k => { eggTop[k] = e.target.checked; }); saveEggs(); syncEggCheckboxes(); });
      modal.querySelector('#mbp-enable-all').addEventListener('change', (e) => { Object.keys(EGGS_TOGGLE).forEach(k => { eggToggle[k] = e.target.checked; }); saveEggs(); syncEggCheckboxes(); });
      modal.querySelector('#mbp-reset').addEventListener('click', () => { Object.assign(eggToggle, EGGS_TOGGLE); Object.assign(eggTop, EGGS_TOP); saveEggs(); syncEggCheckboxes(); });
      const sceneAudioBox = modal.querySelector('#mbp-scene-audio');
      if (sceneAudioBox) { sceneAudioBox.checked = sceneSoundOn; sceneAudioBox.addEventListener('change', () => { if (sceneSoundOn !== sceneAudioBox.checked) toggleSceneSound(); }); }
      const sceneDayBox = modal.querySelector('#mbp-sceneday');
      if (sceneDayBox) { sceneDayBox.checked = store.get('sceneOfDay', false); sceneDayBox.addEventListener('change', () => { store.set('sceneOfDay', sceneDayBox.checked); applySceneOfDayIfEnabled(true); }); }
      const latBox = modal.querySelector('#mbp-lat');
      if (latBox) { latBox.value = store.get('lat', 40); latBox.addEventListener('change', () => { let v = parseFloat(latBox.value); if (!isFinite(v)) v = 40; v = Math.max(-66, Math.min(66, v)); store.set('lat', v); }); }
      previewsRef = previews;
      for (const k of Object.keys(previews)) drawEggPreview(k, previews[k].ctx, previews[k].w, previews[k].h, (performance.now() % 10000) / 1000);
      if (previewRaf) cancelAnimationFrame(previewRaf);
      previewRaf = requestAnimationFrame(drawPreviewFrame);
      modal.querySelector('#mbp-portal').addEventListener('click', () => { closeEggPanel(); triggerPortal(); });
      modal.querySelector('#mbp-close').addEventListener('click', closeEggPanel);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeEggPanel(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.style.display !== 'none') closeEggPanel(); });
    } else {
      modal.style.display = 'flex';
    }
    syncEggCheckboxes();
  }
  function syncEggCheckboxes() {
    const modal = document.getElementById('modelbay-eggpanel');
    if (!modal) return;
    modal.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => { cb.checked = eggOn(cb.dataset.key); });
    modal.querySelectorAll('.egg-top').forEach(btn => { const k = btn.dataset.key; btn.textContent = eggTop[k] !== false ? '▲' : '▽'; btn.style.color = eggTop[k] !== false ? '#9fd0ff' : '#8b98b4'; });
    const allTop = Object.keys(EGGS_TOP).every(k => eggTop[k] !== false);
    const allOn = Object.keys(EGGS_TOGGLE).every(k => eggToggle[k] !== false);
    const topAll = modal.querySelector('#mbp-ontop-all'); if (topAll) topAll.checked = allTop;
    const enableAll = modal.querySelector('#mbp-enable-all'); if (enableAll) enableAll.checked = allOn;
  }
  function closeEggPanel() { const m = document.getElementById('modelbay-eggpanel'); if (m) m.style.display = 'none'; previewKey = null; scenePreviewKey = null; if (previewRaf) cancelAnimationFrame(previewRaf); }

  function buildSkyline() {
    const buildings = [];
    let x = 0; const W = Math.max(1600, window.innerWidth || 1600);
    while (x < W) {
      const w = rand(34, 132), h = rand(24, 150);
      const cols = Math.max(1, Math.floor(w / 13)), rows = Math.max(1, Math.floor(h / 15));
      const windows = [];
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        if (Math.random() < 0.52) windows.push({ dx: c * 13 + 5, dy: r * 15 + 5, on: Math.random() < 0.38, phase: Math.random() * 10, warm: Math.random() < 0.72 });
      }
      buildings.push({ x, w, h, windows });
      x += w + rand(4, 34);
    }
    return { buildings: buildings, beaconIdx: Math.floor(Math.random() * buildings.length), dark: null };
  }
  const NOTE = m => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 66]];
  const PENTA = [72, 74, 76, 79, 81, 84, 86];

  function ensureCtx() {
    if (!actx && (window.AudioContext || window.webkitAudioContext)) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = (musicOn ? 0.055 : 0); master.connect(actx.destination);
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function chordGain(t) {
    const g = actx.createGain(); g.connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 2.4);
    g.gain.setValueAtTime(1, t + 6.5);
    g.gain.linearRampToValueAtTime(0, t + 9);
    return g;
  }
  function padChord(midi, t, dest) {
    for (const m of midi) for (const det of [-6, 4]) {
      const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(m); o.detune.value = det;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 750; lp.Q.value = .6;
      o.connect(lp); lp.connect(dest); o.start(t); o.stop(t + 9.2);
    }
  }
  function bell(t) {
    const m = pick(PENTA);
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = NOTE(m);
    const g = actx.createGain(); g.connect(master);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    o.connect(g); o.start(t); o.stop(t + 4.6);
  }
  let chordIdx = 0, chordTimer = null;
  function playCycle() {
    if (!musicOn) return;
    const t = actx.currentTime + 0.1, g = chordGain(t);
    padChord(PROG[chordIdx % PROG.length], t, g);
    chordIdx++;
    bell(t + 1.2 + Math.random() * 2);
    if (Math.random() < .6) bell(t + 4 + Math.random() * 3);
    chordTimer = setTimeout(playCycle, 8000);
  }
  function startMusic() { ensureCtx(); if (!musicOn) return; clearTimeout(chordTimer); chordIdx = 0; playCycle(); }
  function toggleMusic() {
    musicOn = !musicOn; store.set('music', musicOn);
    ensureCtx(); if (master) master.gain.value = musicOn ? 0.055 : 0;
    syncSettingsUI();
    if (musicOn) startMusic();
    return musicOn;
  }

  function chime() {
    ensureCtx(); if (!sfxOn) return;
    [76, 80, 83].forEach((m, i) => {
      const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(m);
      const g = actx.createGain(); g.connect(master);
      const t = actx.currentTime + 0.05 + i * 0.22;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(g); o.start(t); o.stop(t + 3);
    });
  }
  function moo() {
    if (!sfxOn) return; ensureCtx();
    const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(150, actx.currentTime); o.frequency.exponentialRampToValueAtTime(105, actx.currentTime + .7);
    const g = actx.createGain(); g.connect(master); g.gain.setValueAtTime(.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + .08); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .75);
    o.connect(g); o.start(); o.stop(actx.currentTime + .8);
  }
  function thunder() {
    if (!sfxOn) return; ensureCtx();
    const buf = actx.createBuffer(1, actx.sampleRate * 1.2, actx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = actx.createBufferSource(); src.buffer = buf;
    const g = actx.createGain(); g.connect(master); g.gain.setValueAtTime(.5, actx.currentTime); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + 1.3);
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    src.connect(lp); lp.connect(g); src.start();
  }
  function whaleSong() {
    if (!sfxOn) return; ensureCtx();
    [660, 440].forEach((f, i) => {
      const o = actx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, actx.currentTime + i * .35);
      const g = actx.createGain(); g.connect(master); g.gain.setValueAtTime(.0001, actx.currentTime + i * .35); g.gain.exponentialRampToValueAtTime(.18, actx.currentTime + i * .35 + .08); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + i * .35 + .6);
      o.connect(g); o.start(actx.currentTime + i * .35); o.stop(actx.currentTime + i * .35 + .7);
    });
  }
  // browsers need a gesture before audio can start
  const kick = () => { document.removeEventListener('pointerdown', kick); if (musicOn) startMusic(); };
  document.addEventListener('pointerdown', kick);

  // ---------------------------------------------------------- scene ambience (default OFF)
  let sceneSoundOn = store.get('sceneSound', false);
  let sceneBedBoomFn = null;
  const sceneBed = { nodes: [], timers: [], scene: null };
  function sceneBedStop() {
    for (const n of sceneBed.nodes) { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect && n.disconnect(); } catch (e) {} }
    for (const id of sceneBed.timers) { clearInterval(id); clearTimeout(id); }
    sceneBed.nodes = []; sceneBed.timers = []; sceneBed.scene = null; sceneBedBoomFn = null;
  }
  function sceneBedStart() {
    sceneBedStop();
    if (!sceneSoundOn) return;
    ensureCtx(); if (!actx) return;
    const bus = actx.createGain(); bus.gain.value = 0.5; bus.connect(actx.destination);
    sceneBed.nodes.push(bus);
    const loop = (sec, type, freq, q, gain) => {
      const buf = actx.createBuffer(1, actx.sampleRate * sec, actx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const gn = actx.createGain(); gn.gain.value = gain;
      src.connect(f); f.connect(gn); gn.connect(bus); src.start();
      sceneBed.nodes.push(src, f, gn);
    };
    const drone = (type, freq, gain) => {
      const o = actx.createOscillator(); o.type = type; o.frequency.value = freq;
      const gn = actx.createGain(); gn.gain.value = gain;
      o.connect(gn); gn.connect(bus); o.start();
      sceneBed.nodes.push(o, gn);
      return o;
    };
    const blip = (type, f0, f1, dur, gain, when) => {
      const o = actx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, actx.currentTime + (when || 0));
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, actx.currentTime + (when || 0) + dur * 0.6);
      const gn = actx.createGain(); gn.gain.value = gain;
      o.connect(gn); gn.connect(bus);
      const t0 = actx.currentTime + (when || 0);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.05);
      sceneBed.nodes.push(o, gn);
    };
    const chirpSeq = (every, fn) => {
      const loopFn = () => { fn(); sceneBed.timers.push(setTimeout(loopFn, every())); };
      sceneBed.timers.push(setTimeout(loopFn, 300 + Math.random() * 400));
    };
    const s = scene;
    if (s === 'fireplace') {
      loop(2.5, 'lowpass', 400, 0.8, 0.5);
      // random crackles
      chirpSeq(() => 90 + Math.random() * 340, () => {
        const buf = actx.createBuffer(1, actx.sampleRate * 0.07, actx.sampleRate);
        const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const src = actx.createBufferSource(); src.buffer = buf;
        const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 1600; f.Q.value = 1.4;
        const gn = actx.createGain(); gn.gain.setValueAtTime(0.5 + Math.random() * 0.5, actx.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.09);
        src.connect(f); f.connect(gn); gn.connect(bus); src.start();
        sceneBed.nodes.push(src, f, gn);
      });
    } else if (s === 'underwater') {
      drone('sine', 55, 0.5); drone('sine', 87, 0.28);
      loop(4, 'lowpass', 280, 1, 0.28);
      chirpSeq(() => 1400 + Math.random() * 2600, () => blip('sine', 280 + Math.random() * 240, 720 + Math.random() * 300, 0.22, 0.08));
    } else if (s === 'volcano') {
      drone('sine', 27, 0.42); drone('sine', 41, 0.16);
      loop(4, 'lowpass', 110, 1.5, 0.4);
      chirpSeq(() => 6000 + Math.random() * 9000, () => blip('sine', 38, 30, 2.4, 0.3));
    } else if (s === 'forest') {
      loop(5, 'bandpass', 460, 0.5, 0.12);
      chirpSeq(() => 1600 + Math.random() * 1400, () => { for (let k = 0; k < 3; k++) blip('triangle', 4200, 4200, 0.07, 0.05, k * 0.14); });
    } else if (s === 'cabin') {
      loop(5, 'bandpass', 290, 0.45, 0.15);
      chirpSeq(() => 16000 + Math.random() * 14000, () => blip('sine', 70, 46, 1.4, 0.1));
    } else if (s === 'lavara') {
      drone('sine', 110, 0.12); drone('sine', 164.8, 0.09);
    } else if (s === 'observatory') {
      drone('sine', 49, 0.16); drone('sine', 73.5, 0.1);
    } else if (s === 'synthwave') {
      // driving 8th-note bass, 96 BPM (C minor-ish: C2 F2 G2 Bb2)
      const seq = [65.4, 65.4, 87.3, 65.4, 98, 87.3, 116.5, 87.3];
      let i = 0;
      chirpSeq(() => 156.25, () => { blip('square', seq[i % seq.length], seq[i % seq.length], 0.14, 0.16); i++; });
      drone('sawtooth', 32.7, 0.05);
    } else if (s === 'matrix') {
      drone('sine', 36.7, 0.2);
      chirpSeq(() => 1800 + Math.random() * 2400, () => blip('sine', 1180, 940, 0.4, 0.05));
    } else if (s === 'noir') {
      const motif = [82.4, 98, 116.5, 123.5];
      chirpSeq(() => 3200 + Math.random() * 4200, () => blip('triangle', motif[(Math.random() * motif.length) | 0], motif[(Math.random() * motif.length) | 0], 1.9, 0.14));
    } else if (s === 'library') {
      loop(5, 'bandpass', 720, 0.6, 0.05);
      chirpSeq(() => 2600 + Math.random() * 3600, () => blip('triangle', 900 + Math.random() * 500, 500 + Math.random() * 200, 0.5, 0.06));
    } else if (s === 'desert') {
      loop(5, 'bandpass', 330, 0.4, 0.14);
      chirpSeq(() => 20000 + Math.random() * 16000, () => blip('sine', 660, 390, 1.9, 0.07));
    } else if (s === 'happy') {
      chirpSeq(() => 1400 + Math.random() * 1600, () => { blip('sine', 1568, 2349, 0.16, 0.09); blip('sine', 2093, 2637, 0.14, 0.07, 0.12); });
    } else if (s === 'bliss') {
      chirpSeq(() => 2400 + Math.random() * 2200, () => { blip('sine', 2637, 1760, 0.2, 0.07); blip('sine', 1760, 2637, 0.18, 0.055, 0.16); });
    } else if (s === 'excited') {
      loop(2.5, 'bandpass', 850, 0.9, 0.05);
      sceneBedBoomFn = () => {
        // distant celebratory boom + crowd swell
        blip('sine', 55, 38, 1.5, 0.32);
        const buf = actx.createBuffer(1, actx.sampleRate * 1.6, actx.sampleRate);
        const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.8);
        const src = actx.createBufferSource(); src.buffer = buf;
        const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480;
        const gn = actx.createGain(); gn.gain.setValueAtTime(0.22, actx.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 1.7);
        src.connect(f); f.connect(gn); gn.connect(bus); src.start();
        sceneBed.nodes.push(src, f, gn);
      };
    } else if (s === 'y2k') {
      const penta = [1318.5, 1568, 1760, 2093, 2349.3];
      chirpSeq(() => 210 + Math.random() * 190, () => blip('sine', penta[(Math.random() * penta.length) | 0], penta[(Math.random() * penta.length) | 0], 0.32, 0.05));
    } else if (s === 'train') {
      chirpSeq(() => 640 + Math.random() * 60, () => { blip('square', 190, 90, 0.07, 0.1); blip('square', 150, 70, 0.06, 0.08, 0.14); });
      loop(4, 'lowpass', 220, 0.8, 0.12);
    } else {
      // default: barely-there warm drone so "scene ambience" is never dead silence
      drone('sine', 73.4, 0.05);
    }
    sceneBed.scene = s;
  }
  function toggleSceneSound() {
    sceneSoundOn = !sceneSoundOn; store.set('sceneSound', sceneSoundOn);
    ensureCtx();
    if (sceneSoundOn) sceneBedStart(); else sceneBedStop();
    syncSettingsUI();
    return sceneSoundOn;
  }


  // ---------------------------------------------------------- stars & flyers & events
  let hyperUntil = 0;
  const STAR_COLS = ['#cfe6ff', '#cfe6ff', '#ffe9a8', '#9fd0ff', '#e2b3ff', '#ffd6a0'];
  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + .4, tw: Math.random() * Math.PI * 2, sp: .12 + Math.random() * .3, hue: (Math.random() * 360) | 0, col: pick(STAR_COLS) }));
  const flyers = [], particles = [];
  let lastFlyer = 0, nextFlyerIn = 5000;
  const flyerInterval = () => speed >= 10 ? 1800 : (18000 + Math.random() * 27000);

  function spawnFlyer() {
    const r = Math.random(), dir = Math.random() < .5 ? 1 : -1;
    const base = { x: dir > 0 ? -80 : cvFront.width + 80, dir, y: 40 + Math.random() * (cvFront.height * .45), t: 0 };
    if (r < .28) flyers.push({ ...base, kind: 'comet', vx: dir * (3.4 + Math.random() * 1.7), vy: .5 + Math.random() * .4 });
    else if (r < .5) flyers.push({ ...base, kind: 'ufo', vx: dir * (1.7 + Math.random() * .8), hue: Math.random() < .5 ? 170 : 285 });
    else if (r < .6) flyers.push({ ...base, kind: 'mothership', vx: dir * 1.15, hue: 190 });
    else if (r < .82) flyers.push({ ...base, kind: 'satellite', vx: dir * (2.0 + Math.random()), rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .03 });
    else if (eggOn('miniUfo')) flyers.push({ ...base, kind: 'miniUfo', vx: dir * (2.5 + Math.random()), hue: 200 + Math.random() * 120 });
    else flyers.push({ ...base, kind: 'birds', vx: dir * (1.4 + Math.random() * .7), n: 3 + ((Math.random() * 3) | 0), flap: Math.random() * Math.PI * 2 });
  }
  function drawFlyer(f) {
    ctx.save();
    const bob = (f.kind === 'ufo' || f.kind === 'mothership') ? Math.sin(f.t * 2.4) * 5 : 0;
    ctx.translate(f.x, f.y + bob);
    if (f.kind === 'comet') {
      const g = ctx.createLinearGradient(0, 0, -f.vx * 38, -f.vy * 21);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(150,200,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-f.vx * 38, -f.vy * 21); ctx.stroke();
      ctx.shadowColor = '#9cf'; ctx.shadowBlur = 22; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    } else if (f.kind === 'ufo' || f.kind === 'mothership') {
      const big = f.kind === 'mothership', s = big ? 2.7 : 1.4;
      ctx.fillStyle = 'rgba(170,225,255,0.9)'; ctx.beginPath(); ctx.ellipse(0, 4 * s, 17 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(95,150,215,0.95)'; ctx.beginPath(); ctx.ellipse(0, 0, 9.5 * s, 5.5 * s, 0, Math.PI, 0); ctx.fill();
      const blink = Math.floor(f.t * 3) % 3;
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = (i + 1 === blink) ? '#7fffd4' : (big ? '#ffd479' : '#e2b3ff');
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(i * 9 * s, 4.5 * s, 1.8 * s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (big) { ctx.fillStyle = 'rgba(140,255,230,0.25)'; ctx.beginPath(); ctx.ellipse(0, 10 * s, 13 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); }
      // waving alien hand on mothership
      if (big && Math.sin(f.t * 2) > 0.3) {
        ctx.strokeStyle = '#9fe8c6'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-3, -13); ctx.moveTo(-3, -13); ctx.lineTo(-6, -16); ctx.moveTo(-3, -13); ctx.lineTo(-1, -17); ctx.stroke();
      }
    } else if (f.kind === 'miniUfo') {
      ctx.fillStyle = 'rgba(190,230,255,0.95)'; ctx.beginPath(); ctx.ellipse(0, 3, 8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,190,255,0.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.2, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#7fffd4'; ctx.beginPath(); ctx.arc(0, 3.2, 1.1, 0, Math.PI * 2); ctx.fill();
    } else if (f.kind === 'satellite') {
      ctx.rotate(f.rot);
      ctx.fillStyle = '#c3cede'; ctx.fillRect(-5, -3.2, 10, 6.4);
      ctx.fillStyle = '#3f6fd8'; ctx.fillRect(-15.5, -2.6, 8.4, 5.2); ctx.fillRect(7.1, -2.6, 8.4, 5.2);
      ctx.strokeStyle = '#7b8bb0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -3.2); ctx.lineTo(0, -8.4); ctx.stroke();
    } else if (f.kind === 'birds') {
      ctx.strokeStyle = 'rgba(225,233,255,0.95)'; ctx.lineWidth = 1.9;
      for (let i = 0; i < f.n; i++) { const bx = -i * 20, by = (i % 2 ? -1 : 1) * i * 5.5, w = Math.sin(f.flap + f.t * 9) * 6; ctx.beginPath(); ctx.moveTo(bx - 7, by); ctx.quadraticCurveTo(bx, by - w, bx + 7, by); ctx.stroke(); }
    }
    ctx.restore();
  }

  let whale = null, eyes = null, iss = null, shower = null, abduct = null, moon = null, auroraT = -1, train = null, astronaut = null, portalT = -1, rainT = -1, cowWanderer = { x: 0, dir: 1, t: 0 };
  let nextEyesAt = Date.now() + rand(20000, 45000), nextWhaleAt = Date.now() + rand(60000, 120000);
  let nextAbductAt = Date.now() + rand(45000, 105000), nextIssAt = Date.now() + rand(70000, 140000);
  let nextShowerAt = Date.now() + rand(90000, 150000), nextMoonAt = Date.now() + rand(120000, 240000);
  let firework = null, eagle = null, balloon = null, gopher = { x: 0, dir: 1, t: 0, state: 'idle', outside: 0 }, lightningT = -1, nextFireworkAt = 0, nextEagleAt = 0, nextBalloonAt = 0, nextLightningAt = 0;
  let pumpkin = null, nextPumpkinAt = Date.now() + CD(rand(40000, 90000));
  // santa variant: 'sleigh' or 'moto' chosen randomly each appearance
  // (lantern style toggled by halloween festive)
  let festive = store.get('festive', 'none');
  const snowflakes = [], bats = [];
  let snake = null, santa = null, nextSnakeAt = 0, nextSantaAt = 0, nextGrandAt = 0, nextBooAt = 0;
  nextSnakeAt = Date.now() + rand(120000, 300000); nextSantaAt = Date.now() + rand(60000, 180000); nextGrandAt = Date.now() + rand(30000, 90000); nextBooAt = Date.now() + rand(60000, 120000);
  const fireflies = []; const skyline = buildSkyline();
  const skylineCat = { until: 0, idx: 0, nextAt: Date.now() + 45000 + Math.random() * 75000 };
  let cowGazeUntil = 0, nextCowGazeAt = Date.now() + 30000 + Math.random() * 70000;
  let staticUntil = 0, nextStaticAt = Date.now() + 90000 + Math.random() * 120000;
  const obsKitty = { x: -1, y: -1 };
  let comet = null, auroraBoostUntil = 0, auroraBoostActive = false, nextCometAt = 0, nextFireflyAt = 0, nextMiniAt = 0;
  let rocket = null, rainbow = null, paperPlane = null, trainPass = null, batSwarm = null, asteroids = [];
  let nextRocketAt = 0, nextRainbowAt = 0, nextPlaneAt = 0, nextAsteroidAt = 0, nextTrainPassAt = 0, nextBatSwarmAt = 0;
  nextRocketAt = Date.now() + rand(45000, 150000); nextRainbowAt = Date.now() + rand(60000, 240000); nextPlaneAt = Date.now() + rand(25000, 90000); nextAsteroidAt = Date.now() + rand(20000, 70000); nextTrainPassAt = Date.now() + rand(40000, 150000); nextBatSwarmAt = Date.now() + rand(60000, 200000);
  nextCometAt = Date.now() + rand(30000, 80000); nextFireflyAt = Date.now() + rand(15000, 45000); nextMiniAt = Date.now() + rand(45000, 120000);
  nextFireworkAt = Date.now() + CD(rand(20000, 60000)); nextEagleAt = Date.now() + CD(rand(60000, 180000)); nextBalloonAt = Date.now() + CD(rand(40000, 120000)); nextLightningAt = Date.now() + CD(rand(90000, 300000));
  let nextAuroraAt = Date.now() + rand(60000, 140000), nextTrainAt = Date.now() + rand(150000, 300000), nextAstronautAt = Date.now() + rand(180000, 360000);
  const trail = [];
  addEventListener('mousemove', e => { if (!eggOn('trail')) return; trail.push({ x: e.clientX, y: e.clientY, life: .9 + Math.random() * .5, r: 1 + Math.random() * 1.5 }); if (trail.length > 40) trail.shift(); });

  function triggerEyes() { eyes = { x: rand(120, cvFront.width - 120), y: rand(40, cvFront.height * .4), t: 0, life: 5 }; quip('eyes'); }
  function triggerWhale() { whale = { x: -170, y: cvFront.height * rand(.16, .3), t: 0 }; whaleSong(); quip('whale'); }
  function triggerISS() { iss = { x: cvFront.width + 60, y: cvFront.height * rand(.1, .28), vx: -3.4 }; quip('iss'); }
  function triggerShower() {
    const grand = Math.random() < 0.24;
    shower = grand
      ? { t0: Date.now(), n: 16 + ((Math.random() * 6) | 0), i: 0, grand: true }
      : { t0: Date.now(), n: 7 + ((Math.random() * 4) | 0), i: 0 };
    thunder();
    say(grand ? '🌠☄️ A MASSIVE meteor shower breaks over the Spark!' : pick(narr.shower));
  }
  function triggerMoon() { moon = { t: 0, life: 26 }; quip('moon'); }
  function triggerAurora() { auroraT = 0; auroraBoostUntil = Date.now() + 9000; quip('aurora'); }
  function triggerTrain() { train = { x: -120, y: cvFront.height * rand(.08, .2), t: 0 }; quip('train'); }
  function triggerAstronaut() { astronaut = { x: cvFront.width * rand(.3, .7), y: cvFront.height * .12, t: 0, vy: 0 }; quip('astronaut'); }
  function triggerPortal() { portalT = 0; quip('portal'); }
  function triggerRain() { rainT = 0; quip('rain'); }
  function triggerAbduction() {
    const dir = Math.random() < .5 ? 1 : -1;
    abduct = { phase: 'in', dir, x: dir > 0 ? -140 : cvFront.width + 140, y: cvFront.height * .22 + Math.random() * cvFront.height * .14, tx: cvFront.width * (0.3 + Math.random() * 0.4), groundY: cvFront.height * (0.72 + Math.random() * 0.14), t: 0, beam: 0, cowP: 0 };
    quip('abduct'); moo();
  }
  function wish() { say(pick(narr.wish)); for (let i = 0; i < 14; i++) particles.push({ x: rand(0, cvFront.width), y: rand(0, cvFront.height * .4), vx: rand(-1, 1), vy: rand(.4, 1.8), r: rand(1, 2.7), life: .9 + Math.random() * .6, hue: pick(['#ffe9a8', '#cfe6ff', '#e2b3ff', '#9fd0ff']) }); }
  function dodge(f) { f.vx *= -1.4; f.vy = f.vy ?? 0; f.y += rand(-20, 20); say(pick(narr.dodge)); }
  function graze(w) { say(pick(narr.graze)); }

  // ---- real-world time: moon phase painter
  const SYNODIC = 29.53058867, REF_NEW = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
  function currentMoonPhase() {
    const d = Date.now() / 86400000 - REF_NEW;
    return (((d % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
  }
  function drawMoonPhase(c, x, y, r, alpha) {
    const ph = currentMoonPhase();
    const illum = (1 - Math.cos(ph * 2 * Math.PI)) / 2;
    const waxing = ph < 0.5;
    c.save(); c.translate(x, y);
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = '#14161e'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    if (illum > 0.02) {
      c.save(); c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.clip();
      const dir = waxing ? 1 : -1;
      const off = (1 - illum) * 2 * r * dir;
      c.fillStyle = '#f4f1dd'; c.beginPath(); c.arc(off, 0, r, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // craters on the lit side
    c.globalAlpha = (alpha !== undefined ? alpha : 1) * 0.5;
    c.fillStyle = '#b9b9ac';
    c.beginPath(); c.arc(-r * 0.3, -r * 0.15, r * 0.18, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(r * 0.32, r * 0.24, r * 0.12, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // ---- sun times for a latitude (default 40°N, override via panel)
  function sunTimes(date) {
    const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const LAT = (parseFloat(store.get('lat', 40)) || 40) * Math.PI / 180;
    const decl = -23.44 * Math.PI / 180 * Math.cos(2 * Math.PI * (doy + 10) / 365);
    const cosH = -Math.tan(LAT) * Math.tan(decl);
    const hAngle = Math.acos(Math.min(1, Math.max(-1, cosH))) * 180 / Math.PI / 15;
    return { sunrise: 12 - hAngle, sunset: 12 + hAngle };
  }

  function drawCow(x, y, ang, p, kick, gaze) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1.35, 1.35);
    const glow = Math.min(1, p * 1.4), a = 0.55 + glow * 0.4;
    ctx.strokeStyle = 'rgba(228,255,244,' + a + ')'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const lx = -9 + i * 6, swing = Math.sin(kick + i * 1.7) * (4 + Math.sin(kick * 2) * 1.5); ctx.beginPath(); ctx.moveTo(lx, 5); ctx.lineTo(lx + swing, 13); ctx.stroke(); }
    ctx.fillStyle = 'rgba(228,255,244,' + a + ')';
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 6.4, 0, 0, Math.PI * 2); ctx.fill();
    if (gaze) {
      // dead-on stare at the viewer: big round head + two patient eyes
      const bob = Math.sin(kick * 0.5) * 0.5;
      ctx.beginPath(); ctx.arc(0, -6.4 + bob, 6.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(228,255,244,' + a + ')'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-4.6, -12.2 + bob); ctx.lineTo(-5.6, -16 + bob); ctx.moveTo(4.6, -12.2 + bob); ctx.lineTo(5.6, -16 + bob); ctx.stroke();
      ctx.fillStyle = 'rgba(228,255,244,1)';
      ctx.beginPath(); ctx.ellipse(-2.6, -6.6 + bob, 1.05, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2.6, -6.6 + bob, 1.05, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04060b';
      ctx.beginPath(); ctx.arc(-2.6, -6.4 + bob, 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2.6, -6.4 + bob, 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(6,8,12,0.9)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-1.2, -2.9 + bob); ctx.lineTo(1.2, -2.9 + bob); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(10.5, -3.4, 4.6, 3.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(8.6, -6.2); ctx.lineTo(7.4, -9.6); ctx.moveTo(12.3, -6.7); ctx.lineTo(13.6, -10); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-10.5, -1); ctx.quadraticCurveTo(-15, 3 + Math.sin(kick * 2) * 2.4, -13, 8.5); ctx.stroke();
    ctx.restore();
  }

  function updateEvents(dt, now) {
    // fireflies
    if (eggOn('fireflies')) {
      ctx = layerOf('fireflies');
      if ((fireflies.length < 12 && Math.random() < CD(0.008)) || fireflies.length < 4) fireflies.push({ x: Math.random() * cvFront.width, y: cvFront.height * rand(0.55, 0.92), t: Math.random() * 10, phase: Math.random() * 6.28, drift: rand(0.2, 0.7) });
      for (let i = fireflies.length - 1; i >= 0; i--) {
        const f = fireflies[i]; f.t += dt; f.x += Math.sin(f.t * 0.9 + f.phase) * f.drift * 0.6; f.y += Math.cos(f.t * 0.7) * f.drift * 0.35;
        const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f.t * 2.4 + f.phase));
        ctx.save(); ctx.globalAlpha = glow; ctx.shadowColor = '#c5ff7a'; ctx.shadowBlur = 12; ctx.fillStyle = '#d8ff9a'; ctx.beginPath(); ctx.arc(f.x, f.y, 2.1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    // comets
    if (eggOn('comets')) {
      if (!comet && now > nextCometAt) { comet = { x: -80, y: rand(0.05, 0.35) * cvFront.height, vx: 5.2, vy: 1.1, t: 0 }; nextCometAt = now + CD(rand(40000, 140000)); }
      if (comet) {
        ctx = layerOf('comets'); ctx.save(); ctx.translate(comet.x, comet.y); ctx.rotate(Math.atan2(comet.vy, comet.vx));
        ctx.globalAlpha = 0.9;
        const g = ctx.createLinearGradient(0, 0, -140, 0);
        g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#9fd0ff'); g.addColorStop(1, 'rgba(159,208,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-140, 0); ctx.stroke();
        ctx.globalAlpha = 1; ctx.shadowColor = '#fff'; ctx.shadowBlur = 14; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        comet.x += comet.vx; comet.y += comet.vy; comet.t += dt;
        if (comet.x > cvFront.width + 160) comet = null;
      }
    }
    // aurora boost
    if (auroraBoostUntil > now) { auroraBoostActive = true; } else { auroraBoostActive = false; auroraBoostUntil = 0; }

    // fireworks
    if (eggOn('fireworks')) {
      if (!firework && now > nextFireworkAt) { firework = { t: 0, bursts: [], launched: 0 }; nextFireworkAt = now + CD(rand(15000, 60000)); }
      if (firework) {
        ctx = layerOf('fireworks');
        firework.t += dt;
        const finale = !!firework.grandFinale, grand = Math.random() < 0.12;
        if (firework.launched < (finale ? 9 : (grand ? 5 : 3)) && Math.random() < (finale ? 0.055 : 0.035)) { firework.bursts.push({ x: rand(0.1, 0.9) * cvFront.width, y: cvFront.height * rand(0.05, 0.32), r: 0, maxR: finale ? 150 : (grand ? 130 : 90), hue: (Math.random() * 360) | 0, life: finale ? 2.8 : (grand ? 2.4 : 1.6), grand: finale || grand }); firework.launched++; }
        for (let i = firework.bursts.length - 1; i >= 0; i--) {
          const b = firework.bursts[i]; b.r += dt * (b.grand ? 70 : 90); b.life -= dt;
          if (b.life <= 0) { firework.bursts.splice(i, 1); continue; }
          ctx.save(); ctx.globalAlpha = Math.max(0, b.life);
          for (let p = 0; p < 14; p++) { const ang = p * Math.PI * 2 / 14 + b.r * 0.1; ctx.beginPath(); ctx.fillStyle = 'hsl(' + ((b.hue + p * 12) % 360) + ',100%,70%)'; ctx.arc(b.x + Math.cos(ang) * b.r, b.y + Math.sin(ang) * b.r, 2.2, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        }
        if (firework.launched >= 3 && firework.bursts.length === 0) firework = null;
      }
    }
    // festive: snowfall (christmas)
    if (festive === 'christmas' && eggOn('snow')) {
      ctx = layerOf('snow');
      if (Math.random() < CD(0.5) && snowflakes.length < 180) snowflakes.push({ x: Math.random() * cvFront.width, y: -8, r: rand(1.2, 2.8), vy: rand(18, 42), phase: Math.random() * 6, drift: rand(0.14, 0.5) });
      for (let i = snowflakes.length - 1; i >= 0; i--) {
        const s = snowflakes[i]; s.y += s.vy * dt; s.x += Math.sin(s.y * 0.02 + s.phase) * s.drift;
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        if (s.y > cvFront.height + 6) snowflakes.splice(i, 1);
      }
      // santa fly-by
      if (!santa && now > nextSantaAt) { santa = { x: -120, y: cvFront.height * rand(0.1, 0.25), t: 0, dir: 1, variant: Math.random() < 0.5 ? 'sleigh' : 'moto' }; nextSantaAt = now + CD(rand(90000, 300000)); }
      if (santa) {
        ctx = layerOf('santa'); santa.t += dt; santa.x += 3.4;
        ctx.save(); ctx.translate(santa.x, santa.y);
        if (santa.variant === 'sleigh') {
          // sleigh + reindeer silhouette
          ctx.fillStyle = '#b33a3a'; ctx.beginPath(); ctx.ellipse(0, 3, 16, 7.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(12, -6, 4.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#b33a3a'; ctx.beginPath(); ctx.arc(12, -8.5, 5, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#f6ead6'; ctx.fillRect(24, -2, 12, 8);
          ctx.strokeStyle = '#c49a6c'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(38, 2); ctx.lineTo(46, -6); ctx.moveTo(46, -6); ctx.lineTo(46, -12); ctx.moveTo(44, -4); ctx.lineTo(51, -9); ctx.stroke();
        } else {
          // motorcycle + sidecar silhouette
          ctx.strokeStyle = '#dad3c4'; ctx.lineWidth = 1.8;
          // bike frame
          ctx.beginPath(); ctx.moveTo(-16, 8); ctx.lineTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(14, 8); ctx.closePath(); ctx.stroke();
          ctx.fillStyle = '#3a3a44'; ctx.fillRect(-6, 0, 10, 4);
          // wheels
          ctx.fillStyle = '#14141c'; ctx.beginPath(); ctx.arc(-12, 9, 4.6, 0, Math.PI * 2); ctx.arc(10, 9, 4.6, 0, Math.PI * 2); ctx.fill();
          // santa body
          ctx.fillStyle = '#b33a3a'; ctx.beginPath(); ctx.ellipse(-2, -2, 7, 6.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2, -7, 3.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#b33a3a'; ctx.beginPath(); ctx.arc(2, -9, 3.9, Math.PI, 0); ctx.fill();
          // handlebar
          ctx.strokeStyle = '#dad3c4'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(14, -4); ctx.stroke();
        }
        ctx.restore();
        if (santa.x > cvFront.width + 150) santa = null;
      }
    }
    // pumpkin carving (halloween)
    if (festive === 'halloween' && eggOn('pumpkin')) {
      if (!pumpkin && now > nextPumpkinAt) { pumpkin = { x: rand(0.12, 0.88) * cvFront.width, t: 0, life: 26 }; nextPumpkinAt = now + CD(rand(50000, 140000)); }
      if (pumpkin) {
        ctx = layerOf('pumpkin'); pumpkin.t += dt;
        const glow = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(pumpkin.t * 2.2));
        const y = cvFront.height * 0.96;
        ctx.save(); ctx.translate(pumpkin.x, y); ctx.shadowColor = '#ff8c1a'; ctx.shadowBlur = 18 * glow;
        ctx.fillStyle = '#c2561a'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#5a2e06'; ctx.fillRect(-2, -19, 4, 5);
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-5, -9); ctx.lineTo(-1, -4); ctx.closePath(); ctx.fill(); // left eye
        ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(6, -9); ctx.lineTo(11, -4); ctx.closePath(); ctx.fill(); // right eye
        ctx.beginPath(); ctx.moveTo(-8, 4); ctx.quadraticCurveTo(0, 9, 8, 4); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill(); // mouth
        ctx.restore();
        if (pumpkin.t > pumpkin.life) pumpkin = null;
      }
    }
    // festive light strings around the screen edges
    // christmas: round bulbs in red/green/gold/blue/pink/violet/ice
    // halloween: alternating jack-o-lantern + ghost + purple bulbs
    // new year: gold + silver star sparks
    const litModes = { christmas: ['christmasLights', 'round'], halloween: ['halloweenLights', 'spooky'], newyear: ['newyearLights', 'star'] };
    const active = festive === 'christmas' || festive === 'halloween' || festive === 'newyear' ? litModes[festive] : null;
    if (active && eggOn(active[0])) {
      ctx = layerOf(active[0]);
      const palettes = {
        round: ['#ff5a5a', '#7de08a', '#ffd24a', '#5ab4ff', '#ff8ce0', '#9fd0ff', '#b08cff'],
        spooky: ['#ff8c1a', '#f5f5f0', '#a055ff'],
        star: ['#ffd700', '#e8e8ff', '#ff6a6a'],
      };
      const palette = palettes[active[1]];
      const W = cvFront.width, H = cvFront.height, step = 26;
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(230,220,210,0.45)';
      ctx.beginPath();
      ctx.moveTo(0, 4); ctx.lineTo(W, 4); ctx.moveTo(0, H - 4); ctx.lineTo(W, H - 4); ctx.moveTo(4, 0); ctx.lineTo(4, H); ctx.moveTo(W - 4, 0); ctx.lineTo(W - 4, H);
      ctx.stroke();
      const bulbs = [];
      for (let x = 18; x < W - 6; x += step) bulbs.push({ x, y: 4, side: 'h' });
      for (let x = 18; x < W - 6; x += step) bulbs.push({ x, y: H - 4, side: 'h' });
      for (let y = 18; y < H - 6; y += step) bulbs.push({ x: 4, y, side: 'v' });
      for (let y = 18; y < H - 6; y += step) bulbs.push({ x: W - 4, y, side: 'v' });
      for (let i = 0; i < bulbs.length; i++) {
        const b = bulbs[i];
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.3));
        const col = palette[i % palette.length];
        ctx.globalAlpha = tw; ctx.shadowColor = col; ctx.shadowBlur = 9;
        const sideH = b.side === 'h';
        if (active[1] === 'spooky') {
          if (i % 3 === 0) {
            // pumpkin: orange disc, dark triangle eyes + mouth
            ctx.fillStyle = '#ff8c1a'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.4, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0; ctx.fillStyle = '#1a0d00';
            ctx.beginPath(); ctx.moveTo(b.x - 1.4, b.y - 0.4); ctx.lineTo(b.x - 0.5, b.y - 1.5); ctx.lineTo(b.x + 0.4, b.y - 0.4); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(b.x + 0.6, b.y - 0.4); ctx.lineTo(b.x + 1.5, b.y - 1.5); ctx.lineTo(b.x + 2.4, b.y - 0.4); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(b.x - 1.2, b.y + 1.0); ctx.quadraticCurveTo(b.x, b.y + 1.8, b.x + 1.2, b.y + 1.0); ctx.lineTo(b.x, b.y + 0.8); ctx.closePath(); ctx.fill();
          } else if (i % 3 === 1) {
            // ghost: white rounded column with two eyes
            ctx.fillStyle = '#f5f5f0'; ctx.beginPath(); ctx.arc(b.x, b.y - 0.6, 2.4, Math.PI, 0); ctx.fill();
            ctx.fillRect(b.x - 2.4, b.y - 0.6, 4.8, 2.6);
            ctx.shadowBlur = 0; ctx.fillStyle = '#1a1024';
            ctx.beginPath(); ctx.arc(b.x - 0.9, b.y - 0.8, 0.55, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(b.x + 0.9, b.y - 0.8, 0.55, 0, Math.PI * 2); ctx.fill();
          } else {
            // purple spark
            ctx.fillStyle = '#a055ff'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2); ctx.fill();
          }
        } else if (active[1] === 'star') {
          // 4-point star
          const s = 4 + Math.sin(t * 2.3 + i) * 1.2;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y - s); ctx.lineTo(b.x + 1.1, b.y - 1.1); ctx.lineTo(b.x + s, b.y); ctx.lineTo(b.x + 1.1, b.y + 1.1); ctx.lineTo(b.x, b.y + s); ctx.lineTo(b.x - 1.1, b.y + 1.1); ctx.lineTo(b.x - s, b.y); ctx.lineTo(b.x - 1.1, b.y - 1.1); ctx.closePath();
          ctx.fillStyle = col; ctx.fill();
        } else {
          // round bulb
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, 2.8, 0, Math.PI * 2); ctx.fill();
        }
        // socket (shared)
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(20,20,28,0.9)';
        if (sideH) ctx.fillRect(b.x - 1.2, b.y - 0.8, 2.4, 1.6); else ctx.fillRect(b.x - 0.8, b.y - 1.2, 1.6, 2.4);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
    }
    // analog broadcast static: ~1.5s every minute or two, silent, occasional frame tear
    if (eggOn('static')) {
      if (!staticUntil && now > nextStaticAt) { staticUntil = now + 1500; nextStaticAt = now + 80000 + Math.random() * 90000; }
      if (staticUntil && now > staticUntil) staticUntil = 0;
      if (staticUntil) {
        ctx = layerOf('static');
        for (let i = 0; i < 620; i++) {
          ctx.globalAlpha = 0.16 + Math.random() * 0.3;
          ctx.fillStyle = Math.random() < 0.5 ? '#e8e8e8' : '#0b0b0b';
          ctx.fillRect(Math.random() * cvFront.width, Math.random() * cvFront.height, 2.6, 2.6);
        }
        if (Math.random() < 0.42) {
          const tearY = Math.random() * cvFront.height;
          ctx.globalAlpha = 0.42; ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, tearY, cvFront.width, 3 + Math.random() * 5);
          ctx.globalAlpha = 0.3; ctx.fillStyle = '#f5f5f5'; ctx.fillRect((Math.random() - 0.5) * 34, tearY - 5, cvFront.width, 1.4);
        }
        ctx.globalAlpha = 1;
      }
    }
    // festive: halloween (bats + boo)
    if (festive === 'halloween' && eggOn('bats')) {
      ctx = layerOf('bats');
      if (Math.random() < CD(0.05) && bats.length < 6) bats.push({ x: -20, y: rand(0.15, 0.5) * cvFront.height, t: 0, dir: 1, size: rand(0.8, 1.3) });
      for (let i = bats.length - 1; i >= 0; i--) {
        const b = bats[i]; b.t += dt; b.x += 3.0; const batY = b.y + Math.sin(b.t * 3.4) * 12;
        const wing = Math.sin(b.t * 9) * 6 * b.size;
        ctx.fillStyle = '#1a1024'; ctx.beginPath();
        ctx.moveTo(b.x - 10 * b.size, batY); ctx.quadraticCurveTo(b.x, batY - wing, b.x + 10 * b.size, batY);
        ctx.rotate(0); ctx.fill();
        ctx.fillStyle = '#f0e0ff'; ctx.beginPath(); ctx.arc(b.x - 2.3, batY - 1, 0.7, 0, Math.PI * 2); ctx.arc(b.x + 2.3, batY - 1, 0.7, 0, Math.PI * 2); ctx.fill();
        if (b.x > cvFront.width + 30) bats.splice(i, 1);
      }
      if (now > nextBooAt && Math.random() < 0.002) { say('👻 BOO!'); nextBooAt = now + CD(rand(40000, 120000)); }
    }
    // festive: new year (grand finale fireworks)
    if (festive === 'newyear' && eggOn('grandFireworks')) {
      if (!firework && now > nextGrandAt) { firework = { t: 0, bursts: [], launched: 0, grandFinale: true }; nextGrandAt = now + CD(rand(25000, 55000)); say('🎆 Happy New Year!'); }
    }
    // sky snake
    if (eggOn('snake')) {
      if (!snake && now > nextSnakeAt) { snake = { x: -80, y: rand(0.35, 0.75) * cvFront.height, t: 0, dir: 1, hue: (Math.random() * 360) | 0 }; nextSnakeAt = now + CD(rand(180000, 420000)); }
      if (snake) {
        ctx = layerOf('snake'); snake.t += dt; snake.x += 1.6;
        ctx.save(); ctx.strokeStyle = 'hsl(' + snake.hue + ',70%,62%)'; ctx.lineWidth = 3.2; ctx.shadowColor = 'hsl(' + snake.hue + ',80%,70%)'; ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let s = 0; s <= 240; s += 4) ctx.fillText ? ctx.lineTo(snake.x + s, snake.y + Math.sin(snake.t * 2 + s * 0.07) * 10) : ctx.lineTo(snake.x + s, snake.y + Math.sin(snake.t * 2 + s * 0.07) * 10);
        ctx.stroke(); ctx.restore();
        // head
        ctx.beginPath(); ctx.fillStyle = 'hsl(' + snake.hue + ',70%,62%)'; ctx.arc(snake.x + 242, snake.y + Math.sin(snake.t * 2 + 242 * 0.07) * 10, 3.2, 0, Math.PI * 2); ctx.fill();
        if (snake.x > cvFront.width + 360) snake = null;
      }
    }
    if (eggOn('eagle')) {
      if (!eagle && now > nextEagleAt) { eagle = { x: -80, y: cvFront.height * rand(0.12, 0.45), t: 0, flap: 0 }; nextEagleAt = now + CD(rand(60000, 180000)); }
      if (eagle) {
        ctx = layerOf('eagle');
        eagle.t += dt; eagle.x += 2.8; eagle.flap += dt * 5;
        const wy = Math.sin(eagle.flap) * 7;
        ctx.save(); ctx.translate(eagle.x, eagle.y); ctx.strokeStyle = 'rgba(225,233,255,0.95)'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(0, 3, 14, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(19, -2); ctx.lineTo(14, -3.4); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(4, -14 - wy, 24, -6 - wy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(4, 14 + wy, 24, 6 + wy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-19, -4); ctx.lineTo(-19, 4); ctx.closePath(); ctx.fillStyle = '#c3cede'; ctx.fill();
        ctx.restore();
        if (eagle.x > cvFront.width + 140) eagle = null;
      }
    }
    // hot-air balloon
    if (eggOn('balloon')) {
      if (!balloon && now > nextBalloonAt) { balloon = { x: -70, y: cvFront.height * rand(0.15, 0.55), t: 0, hue: (Math.random() * 360) | 0 }; nextBalloonAt = now + CD(rand(40000, 120000)); }
      if (balloon) {
        ctx = layerOf('balloon');
        balloon.t += dt; balloon.x += 0.75 + Math.sin(balloon.t * 0.6) * 0.15;
        const bob = Math.sin(balloon.t * 0.9) * 6;
        ctx.save(); ctx.translate(balloon.x, balloon.y + bob);
        ctx.beginPath(); ctx.fillStyle = 'hsl(' + balloon.hue + ',75%,62%)'; ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = 'hsl(' + ((balloon.hue + 30) % 360) + ',80%,70%)'; ctx.moveTo(-15, 0); ctx.quadraticCurveTo(0, 22, 15, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = '#c3cede'; ctx.lineWidth = 1.2; ctx.moveTo(-8, 12); ctx.lineTo(-5, 22); ctx.moveTo(8, 12); ctx.lineTo(5, 22); ctx.stroke();
        ctx.fillStyle = '#5b4632'; ctx.fillRect(-5, 22, 10, 6);
        ctx.restore();
        if (balloon.x > cvFront.width + 140) balloon = null;
      }
    }
    // gopher
    if (eggOn('gopher')) {
      if (gopher.state === 'idle' && Math.random() < CD(0.004)) gopher.state = 'surfacing';
      if (gopher.state !== 'idle') {
        ctx = layerOf('gopher');
        gopher.t += dt;
        if (gopher.state === 'surfacing') { gopher.outside = Math.min(1, gopher.outside + dt * 1.4); if (gopher.outside >= 1) gopher.state = 'rooting'; }
        else if (gopher.state === 'rooting') {
          gopher.x += gopher.dir * 0.9; if (Math.random() < 0.02) gopher.dir *= -1;
          if (Math.random() < 0.014 && gopher.t > 2.5) gopher.state = 'diving';
        } else if (gopher.state === 'diving') { gopher.outside = Math.max(0, gopher.outside - dt * 1.6); if (gopher.outside <= 0) { gopher.state = 'idle'; gopher.t = 0; if (Math.random() < 0.5) gopher.x = rand(0.1, 0.9) * cvFront.width; } }
        const bob = Math.sin(gopher.t * 7) * 1.6 * gopher.outside;
        const y = cvFront.height * 0.95;
        ctx.beginPath(); ctx.fillStyle = 'rgba(58,42,28,0.9)'; ctx.ellipse(gopher.x, y + 6, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(gopher.x, y + 5 - gopher.outside * 12 + bob); ctx.globalAlpha = Math.max(0, gopher.outside);
        ctx.beginPath(); ctx.fillStyle = '#8a6b4f'; ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(7, -4, 5.5, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a98468'; ctx.beginPath(); ctx.ellipse(11, -3.4, 1.8, 1.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#120c07'; ctx.beginPath(); ctx.arc(8.4, -5, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#a98468'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(-9 - Math.sin(gopher.t * 9) * 2, 6.5); ctx.moveTo(0, 3); ctx.lineTo(-1.5 - Math.sin(gopher.t * 9) * 2, 6.5); ctx.stroke();
        ctx.restore();
      }
    }
    // lightning
    if (eggOn('lightning')) {
      if (lightningT < 0) { if (now > nextLightningAt) { lightningT = 0; nextLightningAt = now + CD(rand(90000, 300000)); } }
      else {
        ctx = layerOf('lightning');
        lightningT += dt;
        const life = 0.6;
        if (lightningT > life) lightningT = -1;
        else {
          const a = (1 - lightningT / life);
          ctx.fillStyle = '#cfe6ff'; ctx.globalAlpha = a * 0.8;
          ctx.fillRect(0, 0, cvFront.width, cvFront.height * 0.5);
          ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.4; ctx.shadowColor = '#cfe6ff'; ctx.shadowBlur = 20;
          let x = cvFront.width * rand(0.15, 0.85), y = 0;
          ctx.beginPath(); ctx.moveTo(x, y);
          while (y < cvFront.height * 0.5) { y += rand(12, 26); x += rand(-18, 18); ctx.lineTo(x, y); }
          ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        }
      }
    }
    // eyes
    ctx = layerOf('eyes');
    if (eggOn('eyes') && !eyes && now > nextEyesAt) { triggerEyes(); nextEyesAt = now + CD(rand(45000, 90000)); }
    if (eyes) { eyes.t += dt; const fadeIn = Math.min(1, eyes.t / .7), fadeOut = Math.min(1, (eyes.life - eyes.t) / .9), a = Math.min(fadeIn, fadeOut); const blink = Math.abs(((eyes.t * 1.7) % 1.4) - .12) < .09, hh = blink ? 1.1 : 5.2; ctx.globalAlpha = a; const g1 = ctx.createRadialGradient(eyes.x, eyes.y, 0, eyes.x, eyes.y, 7); g1.addColorStop(0, '#ffcf7a'); g1.addColorStop(1, 'rgba(255,207,122,0)'); ctx.fillStyle = g1; ctx.shadowColor = '#ffcf7a'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.ellipse(eyes.x, eyes.y, 4.5, hh, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(eyes.x + 19, eyes.y, 4.5, hh, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; if (eyes.t > eyes.life) eyes = null; }
    // whale
    ctx = layerOf('whale');
    if (eggOn('whale') && !whale && now > nextWhaleAt) { triggerWhale(); nextWhaleAt = now + CD(rand(240000, 400000)); }
    if (whale) { whale.t += dt; whale.x += 1.05; const flap = Math.sin(whale.t * 1.7) * 4; ctx.save(); ctx.translate(whale.x, whale.y + Math.sin(whale.t * .9) * 10); ctx.fillStyle = 'rgba(46,66,102,0.92)'; ctx.shadowColor = 'rgba(130,180,255,0.4)'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.ellipse(0, 0, 36, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-32, 0); ctx.lineTo(-52, -9 + flap); ctx.lineTo(-46, 0); ctx.lineTo(-52, 9 + flap); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(6, 9); ctx.lineTo(-6, 20 + flap * .6); ctx.lineTo(-2, 8); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#9fd0ff'; ctx.beginPath(); ctx.arc(20, -3, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); if (whale.x > cvFront.width + 180) whale = null; }
    // ISS
    ctx = layerOf('iss');
    if (eggOn('iss') && !iss && now > nextIssAt) { triggerISS(); nextIssAt = now + CD(rand(150000, 260000)); }
    if (iss) { iss.x += iss.vx; ctx.save(); ctx.translate(iss.x, iss.y); ctx.fillStyle = '#dfe6f5'; ctx.fillRect(-3.5, -1.6, 7, 3.2); ctx.fillStyle = '#3f6fd8'; ctx.fillRect(-9, -1.3, 4, 2.6); ctx.fillRect(5, -1.3, 4, 2.6); ctx.fillStyle = 'rgba(223,230,245,0.75)'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText('ISS', -8, -6); ctx.restore(); if (iss.x < -90) iss = null; }
    // meteor shower
    ctx = layerOf('shower');
    if (eggOn('shower') && !shower && now > nextShowerAt) { triggerShower(); nextShowerAt = now + CD(rand(130000, 220000)); }
    if (shower && shower.i < shower.n && now > shower.t0 + shower.i * 350) { shower.i++; const fromLeft = Math.random() < .5; flyers.push({ kind: 'comet', x: fromLeft ? -60 : cvFront.width + 60, y: Math.random() * cvFront.height * .35, vx: (fromLeft ? 1 : -1) * (1.6 + Math.random() * 1.6), vy: 1.6 + Math.random() * 1.3, t: 0, dir: fromLeft ? 1 : -1 }); if (shower.i >= shower.n) shower = null; }
    // supermoon
    ctx = layerOf('moon');
    if (eggOn('moon') && !moon && now > nextMoonAt) { triggerMoon(); nextMoonAt = now + CD(rand(180000, 300000)); }
    if (moon) { moon.t += dt; const a = Math.min(1, moon.t / 3) * Math.min(1, (moon.life - moon.t) / 3); const mx = cvFront.width - 130, my = cvFront.height * .16; const g = ctx.createRadialGradient(mx, my, 0, mx, my, 95); g.addColorStop(0, 'rgba(253,246,216,' + (0.5 * a) + ')'); g.addColorStop(1, 'rgba(253,246,216,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, cvFront.width, cvFront.height); drawMoonPhase(ctx, mx, my, 30, a * 0.96); if (moon.t > moon.life) moon = null; }
    // aurora
    ctx = layerOf('aurora');
    if (eggOn('aurora') && auroraT < 0 && now > nextAuroraAt) { triggerAurora(); nextAuroraAt = now + CD(rand(240000, 480000)); }
    if (auroraT >= 0) { auroraT += dt; const life = 22; const a = Math.sin((auroraT % life) / life * Math.PI) * (auroraBoostActive ? 1.5 : 0.8); ctx.save(); ctx.globalAlpha = a; const g = ctx.createLinearGradient(0, 0, 0, cvFront.height * .45); g.addColorStop(0, '#39ffb0'); g.addColorStop(.4, '#5ec9ff'); g.addColorStop(1, 'rgba(94,201,255,0)'); ctx.fillStyle = g; for (let x = 0; x < cvFront.width; x += 26) { const h = Math.sin(x * .012 + auroraT * 1.4) * 26 + Math.sin(x * .03 + auroraT * .7) * 14 + 46; ctx.fillRect(x, 0, 22, h); } ctx.restore(); if (auroraT > life) auroraT = -1; }
    // satellite train
    ctx = layerOf('train');
    if (eggOn('train') && !train && now > nextTrainAt) { triggerTrain(); nextTrainAt = now + CD(rand(200000, 400000)); }
    if (train) { train.t += dt; train.x += 2.2; ctx.save(); for (let i = 0; i < 5; i++) { const x = train.x - i * 34; if (x < -60 || x > cvFront.width + 60) continue; ctx.fillStyle = '#fff'; ctx.shadowColor = '#cfe6ff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x, train.y + Math.sin(train.t * 2 + i) * 3, 3, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); if (train.x - 4 * 34 > cvFront.width + 120) train = null; }
    // astronaut on a tether
    ctx = layerOf('astronaut');
    if (eggOn('astronaut') && !astronaut && now > nextAstronautAt) { triggerAstronaut(); nextAstronautAt = now + CD(rand(200000, 420000)); }
    if (astronaut) { astronaut.t += dt; astronaut.vy = Math.min(1.2, astronaut.vy + dt * .25); astronaut.y += astronaut.vy; const swing = Math.sin(astronaut.t * 2.4) * 14; ctx.save(); ctx.translate(astronaut.x + swing, astronaut.y); ctx.strokeStyle = 'rgba(200,220,255,0.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -astronaut.y); ctx.lineTo(0, 0); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2a3550'; ctx.beginPath(); ctx.arc(0, -1.2, 2.6, 0, Math.PI); ctx.fill(); ctx.restore(); if (astronaut.y > cvFront.height + 20) astronaut = null; }
    // portal swirl
    ctx = layerOf('portal');
    if (eggOn('portal') && portalT >= 0) { portalT += dt; const life = 12; if (portalT > life) portalT = -1; else { ctx.save(); ctx.translate(cvFront.width / 2, cvFront.height * .3); ctx.rotate(portalT * .8); ctx.globalAlpha = Math.sin((portalT / life) * Math.PI); for (let i = 0; i < 7; i++) { ctx.strokeStyle = ['#b08cff', '#6ea8fe', '#9fd0ff'][i % 3]; ctx.lineWidth = 5 - i * .6; ctx.beginPath(); ctx.arc(0, 0, 12 + i * 9, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; ctx.restore(); } }
    // rain
    ctx = layerOf('rain');
    if (eggOn('rain') && rainT >= 0) { rainT += dt; const life = 11; if (rainT > life) rainT = -1; else { ctx.save(); ctx.globalAlpha = Math.sin((rainT / life) * Math.PI) * .55; ctx.strokeStyle = 'rgba(170,200,255,0.6)'; ctx.lineWidth = 1.3; for (let x = 0; x < cvFront.width; x += 14) { const y = (x * 7 + rainT * 260 + x * x * .13) % (cvFront.height + 60) - 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3, y + 16); ctx.stroke(); } ctx.restore(); } }
    // comet already handled; asteroids field
    if (eggOn('asteroids')) {
      if (asteroids.length === 0 && Math.random() < CD(0.0025) && now > nextAsteroidAt) {
        nextAsteroidAt = now + CD(rand(25000, 90000));
        const dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < 7; i++) asteroids.push({ x: dir > 0 ? -20 - Math.random()*180 : cvFront.width + 20 + Math.random()*180, y: rand(0.05, 0.45) * cvFront.height, vx: dir * rand(0.7, 1.6), vy: rand(-0.4, 0.4), r: rand(1.6, 4.6), seed: Math.random() * 1000 });
      }
      ctx = layerOf('asteroids');
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i]; a.x += a.vx; a.y += a.vy; a.vy += 0.006;
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.seed + now / 6000);
        ctx.fillStyle = '#7d7d8b'; ctx.beginPath(); ctx.arc(0, 0, a.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a5a66'; ctx.beginPath(); ctx.arc(a.r * 0.35, a.r * 0.2, a.r * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (a.x < -80 || a.x > cvFront.width + 80 || a.y > cvFront.height + 40) asteroids.splice(i, 1);
      }
    }
    // rocket launch (with particle plume)
    if (eggOn('rocket')) {
      if (!rocket && now > nextRocketAt) { rocket = { x: rand(0.15, 0.85) * cvFront.width, y: cvFront.height + 8, vy: -4.6, t: 0, phase: 'rise', palook: [] }; nextRocketAt = now + CD(rand(120000, 360000)); }
      if (rocket) {
        ctx = layerOf('rocket'); rocket.t += dt;
        if (rocket.phase === 'rise') {
          rocket.y += rocket.vy; rocket.vy -= 0.02;
          if (Math.random() < 0.6) rocket.palook.push({ x: rocket.x + rand(-3, 3), y: rocket.y + 12, vy: rand(1.6, 3.2), vx: rand(-0.8, 0.8), life: rand(.6, 1.3), r: rand(1.2, 3.2), hue: rand(10, 45) });
          if (rocket.y < -40) rocket = null;
        }
        for (let i = rocket.palook.length - 1; i >= 0; i--) {
          const p = rocket.palook[i]; p.y += p.vy; p.x += p.vx; p.life -= dt;
          if (p.life <= 0) { rocket.palook.splice(i, 1); continue; }
          ctx.globalAlpha = p.life; ctx.fillStyle = 'hsl(' + p.hue + ',100%,60%)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (rocket) {
          ctx.save(); ctx.translate(rocket.x, rocket.y);
          ctx.fillStyle = '#d9dee8'; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(7, 4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#b33a3a'; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(7, 4); ctx.lineTo(0, 1); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
          ctx.fillRect(-7, 4, 14, 5);
          ctx.fillStyle = '#4a4a55'; ctx.fillRect(-4, 9, 8, 4);
          ctx.restore();
        }
      }
    }
    // rainbow arc (fades in and out)
    if (eggOn('rainbow')) {
      if (!rainbow && now > nextRainbowAt) { rainbow = { t: 0, life: 18 }; nextRainbowAt = now + CD(rand(180000, 480000)); }
      if (rainbow) {
        ctx = layerOf('rainbow'); rainbow.t += dt; const a = Math.sin(Math.min(1, rainbow.t / (rainbow.life / 2)) * Math.PI);
        ctx.globalAlpha = a;
        const cx = cvFront.width * 0.5, cy = cvFront.height * 0.62, r = Math.min(cvFront.width, cvFront.height) * 0.65;
        const bands = ['#ff6a6a', '#ffb84d', '#ffe769', '#7de08a', '#5ab4ff', '#b08cff'];
        for (let i = 0; i < bands.length; i++) {
          ctx.beginPath(); ctx.strokeStyle = bands[i]; ctx.lineWidth = 6; ctx.arc(cx, cy, r - i * 8, Math.PI, 0); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (rainbow.t > rainbow.life) rainbow = null;
      }
    }
    // paper airplane
    if (eggOn('paperPlane')) {
      if (!paperPlane && now > nextPlaneAt) { paperPlane = { x: -30, y: rand(0.12, 0.45) * cvFront.height, vx: 2.7, t: 0, bob: Math.random() * 10 }; nextPlaneAt = now + CD(rand(25000, 90000)); }
      if (paperPlane) {
        ctx = layerOf('paperPlane'); paperPlane.t += dt; paperPlane.x += paperPlane.vx;
        const bob = Math.sin(paperPlane.t * 2 + paperPlane.bob) * 10;
        ctx.save(); ctx.translate(paperPlane.x, paperPlane.y + bob); ctx.rotate(Math.sin(paperPlane.t * 2 + paperPlane.bob) * 0.12);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-16, -8); ctx.lineTo(-6, 0); ctx.lineTo(-16, 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(200,215,255,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-16, 0); ctx.stroke();
        ctx.restore();
        if (paperPlane.x > cvFront.width + 40) paperPlane = null;
      }
    }
    // train passing on the skyline
    if (eggOn('trainPass')) {
      if (!trainPass && now > nextTrainPassAt) { trainPass = { x: -180, y: cvFront.height * 0.965, dir: 1, t: 0 }; nextTrainPassAt = now + CD(rand(70000, 220000)); }
      if (trainPass) {
        ctx = layerOf('trainPass'); trainPass.t += dt; trainPass.x += 5.6;
        ctx.save(); ctx.translate(trainPass.x, trainPass.y);
        ctx.fillStyle = '#0d1220'; ctx.fillRect(0, -10, 175, 12);
        ctx.fillStyle = '#141b31'; ctx.beginPath(); ctx.moveTo(175, -10); ctx.lineTo(190, -3); ctx.lineTo(175, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd880';
        for (let i = 0; i < 12; i++) ctx.fillRect(8 + i * 13, -8, 7, 4);
        // rooftop marker lights
        ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(10, -11, 1.2, 0, Math.PI * 2); ctx.arc(165, -11, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (trainPass.x > cvFront.width + 220) trainPass = null;
      }
    }
    // bat swarm (Halloween)
    if (eggOn('batSwarm') && festive === 'halloween') {
      if (!batSwarm && now > nextBatSwarmAt) { batSwarm = { x: -80, y: rand(0.1, 0.45) * cvFront.height, t: 0 }; nextBatSwarmAt = now + CD(rand(60000, 200000)); }
      if (batSwarm) {
        ctx = layerOf('bats'); batSwarm.t += dt; batSwarm.x += 2.6;
        const flap = Math.sin(batSwarm.t * 7) * 6;
        for (let i = 0; i < 9; i++) {
          const ox = (i * 26) * (i % 2 ? -1 : 1), oy = (i * 17) - 34, bx = batSwarm.x + ox, by = batSwarm.y + oy + Math.sin(batSwarm.t * 4 + i) * 5;
          ctx.fillStyle = '#1a1024'; ctx.beginPath(); ctx.ellipse(bx, by, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.quadraticCurveTo(bx, by - 4 - flap, bx + 5, by); ctx.fill();
          ctx.fillStyle = '#f0e0ff'; ctx.beginPath(); ctx.arc(bx - 1.2, by - 0.6, 0.4, 0, Math.PI * 2); ctx.arc(bx + 1.2, by - 0.6, 0.4, 0, Math.PI * 2); ctx.fill();
        }
        if (batSwarm.x > cvFront.width + 250) batSwarm = null;
      }
    }
    ctx = layerOf('cow');
    if (eggOn('cow')) {
      cowWanderer.t += dt;
      if (now > nextCowGazeAt && now > cowGazeUntil) { cowGazeUntil = now + 2600 + Math.random() * 1800; nextCowGazeAt = now + 60000 + Math.random() * 115000; quip('gaze'); }
      const gazing = now < cowGazeUntil;
      if (!gazing) cowWanderer.x += cowWanderer.dir * 22 * dt;
      if (cowWanderer.x > cvFront.width * .8 && cowWanderer.dir > 0) cowWanderer.dir = -1;
      if (cowWanderer.x < cvFront.width * .1 && cowWanderer.dir < 0) cowWanderer.dir = 1;
      drawCow(cowWanderer.x, cvFront.height * .92, 0, 1, cowWanderer.t * 1.6, gazing);
    }
    // abduction sequence
    ctx = layerOf('abduction');
    if (eggOn('abduction') && !abduct && now > nextAbductAt) { triggerAbduction(); nextAbductAt = now + CD(rand(210000, 360000)); }
    if (abduct) { const a = abduct; a.t += dt; if (a.phase === 'in') { const dx = a.tx - a.x; a.x += dx * Math.min(1, dt * 1.7); if (Math.abs(dx) < 2.5) { a.phase = 'beam'; a.t = 0; } } else if (a.phase === 'beam') { a.beam = Math.min(1, a.beam + dt * .75); a.cowP = Math.min(1, a.t / 6.5); const cowY = a.groundY - a.cowP * 150; const grad = ctx.createLinearGradient(0, a.y + 10, 0, a.groundY); grad.addColorStop(0, 'rgba(160,255,225,' + (0.34 * a.beam) + ')'); grad.addColorStop(1, 'rgba(160,255,225,0.02)'); ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(a.x, a.y + 12); ctx.lineTo(a.x - 46, a.groundY); ctx.lineTo(a.x + 46, a.groundY); ctx.closePath(); ctx.fill(); ctx.save(); ctx.strokeStyle = 'rgba(190,255,235,' + (0.5 * a.beam) + ')'; ctx.lineWidth = 2; ctx.setLineDash([7, 9]); ctx.lineDashOffset = -(now / 28) % 64; ctx.beginPath(); ctx.moveTo(a.x, a.y + 12); ctx.lineTo(a.x - 40, a.groundY); ctx.moveTo(a.x, a.y + 12); ctx.lineTo(a.x + 40, a.groundY); ctx.moveTo(a.x, a.y + 12); ctx.lineTo(a.x, a.groundY); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); if (a.cowP >= 1) { a.phase = 'ascend'; a.t = 0; } } else if (a.phase === 'ascend') { a.y -= dt * (60 + a.t * 160); if (a.t > 1.5) { a.phase = 'out'; a.t = 0; } } else if (a.phase === 'out') { a.y -= dt * 420; a.x += a.dir * dt * 120; if (a.y < -140) { abduct = null; quip('abductDone'); } } if (abduct) { const a2 = abduct; if (a2.phase !== 'in' || Math.abs(a2.x - a2.tx) > 4) { if (a2.phase === 'beam') drawCow(a2.x + Math.sin(a2.t * 3.1) * 7, a2.groundY - a2.cowP * 150, Math.sin(a2.t * 3.1) * .22, a2.cowP, a2.t * 7); ctx.save(); ctx.translate(a2.x, a2.y + Math.sin(a2.t * 2.2) * 3); ctx.fillStyle = 'rgba(170,225,255,0.95)'; ctx.beginPath(); ctx.ellipse(0, 7, 34, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(95,150,215,0.97)'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 10.5, 0, Math.PI, 0); ctx.fill(); const blink = Math.floor(a2.t * 4) % 3; for (let i = -1; i <= 1; i++) { ctx.fillStyle = (i + 1 === blink) ? '#7fffd4' : '#ffd479'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(i * 18, 7, 3.2, 0, Math.PI * 2); ctx.fill(); } ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(140,255,230,0.3)'; ctx.beginPath(); ctx.ellipse(0, 17, 26, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } } }
    // star-dust mouse trail
    ctx = layerOf('trail');
    for (let i = trail.length - 1; i >= 0; i--) { const p = trail[i]; p.life -= dt * 1.15; if (p.life <= 0) { trail.splice(i, 1); continue; } ctx.globalAlpha = Math.min(.85, p.life) * .8; ctx.fillStyle = i % 3 ? '#ffe9a8' : '#cfe6ff'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
  }

  // ---------------------------------------------------------- konami (x2 for portal)
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  let konamiIdx = 0, lastKonami = 0;
  addEventListener('keydown', e => {
    konamiIdx = (e.code === KONAMI[konamiIdx]) ? konamiIdx + 1 : 0;
    if (konamiIdx === KONAMI.length) {
      const now = Date.now();
      if (now - lastKonami < 5000) triggerPortal(); else { hyperUntil = now + 20000; say('✦✦ STAR DRIVE ENGAGED — 20s of hyperspace!'); }
      lastKonami = now; konamiIdx = 0; chime();
    }
  });

  // ---------------------------------------------------------- neon flicker on .dot elements
  if (!reduced && eggOn('flicker')) setInterval(() => {
    if (!effectsVisible) return;
    if (Math.random() < 0.12) {
      document.querySelectorAll('.dot.on').forEach(d => { if (Math.random() < 0.4) { d.style.opacity = '.35'; setTimeout(() => d.style.opacity = '', 120); } });
    }
  }, 1200);

  // ---------------------------------------------------------- settings bar (everyone, simple)
  const settingsBar = document.createElement('div');
  settingsBar.id = 'modelbay-settings';
  settingsBar.innerHTML = `
    <button type="button" id="mb-btn-dark" title="lights out — click to bring the house lights back up">🌑</button>
    <button type="button" id="mb-btn-eye" title="hide the other toolbar icons (animations keep running)">👁</button>
    <button type="button" id="mb-btn-music" title="toggle ambient music">🎵</button>
    <button type="button" id="mb-btn-speed" title="warp speed: 1x / 10x event rate">1x</button>
    <button type="button" id="mb-btn-theme" title="egg theme">⬜</button>
    <button type="button" id="mb-btn-scene" title="background scenes — click to cycle">🏙️</button>
    <button type="button" id="mb-btn-theater" title="hide all characters and effects (animations pause invisibly)">🎭</button>
    <button type="button" id="mb-btn-ontop" title="toggle all effects on top of UI / behind UI">▽</button>
    <button type="button" id="mb-btn-festive" title="festive — off — click to cycle">⬜</button>
    <button type="button" id="mb-btn-config" title="easter egg settings — toggle each event">⚙️</button>`;
  settingsBar.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9000;display:flex;gap:.35rem;transition:gap .25s';
  settingsBar.querySelectorAll('button').forEach(b => {
    b.style.cssText = 'background:rgba(19,26,40,.8);backdrop-filter:blur(3px);border:1px solid rgba(140,180,255,.45);border-radius:.6rem;color:#e8ecf4;min-width:54px;height:40px;padding:0 .35rem;font-size:17px;cursor:pointer';
  });
  // the eye itself always stays visible — just toggles the rest of the icons
  const eyeBtn = settingsBar.querySelector('#mb-btn-eye');
  eyeBtn.style.minWidth = '46px'; eyeBtn.style.fontSize = '20px';
  function applyToolbar(open) {
    settingsBar.classList.toggle('mb-collapsed', !open);
    eyeBtn.textContent = open ? '👁' : '🙈';
    eyeBtn.title = open ? 'hide the rest of the icons' : 'show the icons again';
    // inject show/hide style if missing
    if (!document.getElementById('mb-toolbar-style')) {
      const st = document.createElement('style');
      st.id = 'mb-toolbar-style';
      st.textContent = '#modelbay-settings.mb-collapsed > button:not(#mb-btn-eye){display:none} #modelbay-settings.mb-collapsed{gap:0}';
      document.head.appendChild(st);
    }
  }
  let toolbarOpen = store.get('toolbarOpen', true);
  eyeBtn.addEventListener('click', () => { toolbarOpen = !toolbarOpen; store.set('toolbarOpen', toolbarOpen); applyToolbar(toolbarOpen); });
  applyToolbar(toolbarOpen);

  // ---------------------------------------------------------- dark mode (lights-out)
  // One button kills the whole page to black. Only the toggle stays visible, breathing amber.
  const darkOverlay = document.createElement('div');
  darkOverlay.id = 'modelbay-dark';
  darkOverlay.style.cssText = 'position:fixed;inset:0;background:#020202;z-index:60;opacity:0;pointer-events:none;transition:opacity .4s;';
  document.body.appendChild(darkOverlay);
  const darkBtn = settingsBar.querySelector('#mb-btn-dark');
  darkBtn.style.minWidth = '46px'; darkBtn.style.fontSize = '20px';
  let darkMode = store.get('darkMode', false);
  function applyDark(on) {
    darkMode = on; store.set('darkMode', on);
    darkOverlay.style.opacity = on ? '1' : '0';
    darkOverlay.style.pointerEvents = on ? 'auto' : 'none';
    settingsBar.style.zIndex = on ? '70' : '9000';
    settingsBar.querySelectorAll('button').forEach(b => {
      b.style.visibility = (!on || b.id === 'mb-btn-dark') ? '' : 'hidden';
    });
    if (on) {
      darkBtn.style.borderColor = 'rgba(232,236,244,.7)';
      darkBtn.style.color = '#e8ecf4';
    } else {
      darkBtn.style.borderColor = '';
      darkBtn.style.color = '';
      settingsBar.querySelectorAll('button').forEach(b => { b.style.visibility = ''; });
      applyToolbar(toolbarOpen);
    }
  }
  darkBtn.addEventListener('click', () => applyDark(!darkMode));
  applyDark(darkMode);

  // ---------------------------------------------------------- full-screen scenes
  // Mutually exclusive background scenes drawn on the BACK layer. Each scene builds a
  // static paint into an offscreen cache once per resize, then animated bits on top.
  const SCENE_ORDER = ['none', 'fireplace', 'underwater', 'volcano', 'forest', 'desert', 'observatory', 'synthwave', 'matrix', 'bliss', 'happy', 'excited', 'cabin', 'y2k', 'lavara', 'train', 'noir', 'library'];
  const SCENE = {
    none: '🏙️ none — the regular background',
    fireplace: '🔥 fireplace — brick hearth & embers',
    underwater: '🌊 underwater — seaweed, rays & fish',
    volcano: '🌋 volcano — molten vent & ember rain',
    forest: '🌲 the woods — pines, fog & fireflies',
    desert: '🌵 sunset desert — dunes & tumbleweed',
    observatory: '🔭 observatory — dome, telescope & cosmos',
    synthwave: '🕹️ 80s synthwave — sun, grid & palms',
    matrix: '🟢 90s matrix — falling glyph rain',
    bliss: '🏞️ 2000s bliss — rolling hill & sky',
    happy: '🌈 happy — rainbow, balloons & butterflies',
    excited: '🎆 excited — midnight fireworks city',
    cabin: '🛖 northern cabin — aurora window & snow',
    y2k: '💿 y2k — chrome dreams & orbs',
    lavara: '🪔 70s lava lamps — shag carpet edition',
    train: '🚆 night train — lights whipping by',
    noir: '🕵️ film noir office — rain & venetian blinds',
    library: '📚 library at midnight — candles & dust',
  };
  let scene = store.get('scene', 'none') || 'none';
  let sceneCache = null, sceneCacheKey = '';
  const sceneFx = {
    sparks: [], bubbles: [], fish: null, tumble: null, nextTumbleAt: 0,
    jelly: null, nextJellyAt: 0, obsStars: null, meteor: null, nextMeteorAt: 0,
    ffly: null, nextTussleAt: 0,
  };

  function setScene(name, silent) {
    scene = SCENE_ORDER.includes(name) ? name : 'none';
    store.set('scene', scene);
    sceneCache = null;
    sceneFx.sparks.length = 0;
    if (!silent) say('scene: ' + (SCENE[scene] || scene));
    syncScenesUI();
    syncSettingsUI();
    if (sceneSoundOn) sceneBedStart();
  }
  function syncScenesUI() {
    const modal = document.getElementById('modelbay-eggpanel');
    if (!modal) return;
    modal.querySelectorAll('.mbp-srow').forEach(row => {
      const on = row.dataset.scene === scene;
      row.style.background = on ? 'rgba(30,44,72,.55)' : 'rgba(19,25,40,.4)';
      const btn = row.querySelector('.mbp-scene');
      btn.style.borderColor = on ? '#6ea8fe' : '#223049';
      btn.style.boxShadow = on ? '0 0 12px rgba(110,168,254,.4)' : 'none';
      btn.style.color = on ? '#bcd7ff' : '#cdd6ec';
    });
  }

  // ---- shared static helpers
  function sceneStars(sc, seed, count, maxY) {
    const r0 = srand(seed);
    for (let i = 0; i < count; i++) {
      const x = r0() * sc.canvas.width, y = r0() * maxY;
      const a = 0.3 + r0() * 0.6;
      sc.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      const big = r0() < 0.13;
      sc.fillRect(x, y, big ? 2.1 : 1.3, big ? 2.1 : 1.3);
    }
  }
  function sceneDune(sc, W, baseY, amp, freq, seed, color) {
    const r0 = srand(seed);
    const ph = r0() * 9, ph2 = r0() * 9;
    sc.fillStyle = color;
    sc.beginPath(); sc.moveTo(0, baseY);
    for (let x = 0; x <= W; x += 8) {
      const y = baseY + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.35 + ph2) * amp * 0.38;
      sc.lineTo(x, y);
    }
    sc.lineTo(W, baseY + 600); sc.lineTo(0, baseY + 600); sc.closePath(); sc.fill();
  }
  function scenePine(sc, x, baseY, h, tone) {
    const w = h * 0.44;
    sc.fillStyle = tone;
    for (let level = 0; level < 4; level++) {
      const lw = w * (1 - level * 0.21);
      const ly = baseY - h + h * level * 0.3;
      sc.beginPath();
      sc.moveTo(x, ly);
      sc.lineTo(x - lw / 2, ly + h * 0.4);
      sc.lineTo(x + lw / 2, ly + h * 0.4);
      sc.closePath(); sc.fill();
    }
    sc.fillRect(x - 2, baseY - 4, 4, 8);
  }
  // ---- static painters (rendered once into sceneCache)
  function sceneBuildFireplace(sc, W, H) {
    const wx = W / 2;
    const gW = sc.createRadialGradient(wx, H * 0.63, H * 0.08, wx, H * 0.63, H);
    gW.addColorStop(0, '#2b1b13'); gW.addColorStop(0.5, '#1a1210'); gW.addColorStop(1, '#090606');
    sc.fillStyle = gW; sc.fillRect(0, 0, W, H);
    const r0 = srand(1717);
    const bw = 118, bh = 44, mg = 6;
    for (let row = 0; row * (bh + mg) < H + bh; row++) {
      const y = row * (bh + mg);
      const off = (row % 2) ? (bw + mg) / 2 : 0;
      for (let x = -bw; x < W + bw; x += bw + mg) {
        const v = 0.7 + r0() * 0.6, light = r0() < 0.12;
        sc.fillStyle = 'rgb(' + Math.round((light ? 88 : 58) * v) + ',' + Math.round((light ? 64 : 42) * v) + ',' + Math.round((light ? 50 : 34) * v) + ')';
        sc.fillRect(x + off, y, bw, bh);
        sc.fillStyle = 'rgba(0,0,0,0.22)'; sc.fillRect(x + off, y + bh - 5, bw, 5);
        sc.fillStyle = 'rgba(255,235,210,0.06)'; sc.fillRect(x + off, y, bw, 3);
      }
    }
    // firebox (arch) + lintel
    const fbW = Math.min(520, W * 0.48), fbH = Math.min(330, H * 0.4);
    const fbX = wx - fbW / 2, fbY = H - fbH - H * 0.05, archR = fbW * 0.36;
    sc.fillStyle = '#040202';
    sc.beginPath();
    sc.moveTo(fbX, H);
    sc.lineTo(fbX, fbY + archR);
    sc.quadraticCurveTo(wx, fbY - archR * 0.78, fbX + fbW, fbY + archR);
    sc.lineTo(fbX + fbW, H); sc.closePath(); sc.fill();
    const gi = sc.createRadialGradient(wx, H - fbH * 0.3, 8, wx, H - fbH * 0.3, fbW * 0.62);
    gi.addColorStop(0, 'rgba(255,140,50,0.5)'); gi.addColorStop(0.55, 'rgba(190,70,18,0.18)'); gi.addColorStop(1, 'rgba(190,70,18,0)');
    sc.fillStyle = gi; sc.fillRect(fbX, fbY - archR, fbW, fbH + archR);
    sc.strokeStyle = '#241812'; sc.lineWidth = 12;
    sc.beginPath(); sc.moveTo(fbX - 6, fbY + archR);
    sc.quadraticCurveTo(wx, fbY - archR * 0.78, fbX + fbW + 6, fbY + archR); sc.stroke();
    // mantle beam + candlesticks
    sc.fillStyle = '#3a2a20'; sc.fillRect(wx - fbW * 0.72, fbY - 10, fbW * 1.44, 16);
    sc.fillStyle = 'rgba(255,230,200,0.12)'; sc.fillRect(wx - fbW * 0.72, fbY - 10, fbW * 1.44, 4);
    sc.fillStyle = '#0f0a08';
    for (const s of [-1, 1]) {
      const cx = wx + s * fbW * 0.55;
      sc.fillRect(cx - 3, fbY - 34, 6, 25);
      sc.beginPath(); sc.ellipse(cx, fbY - 9, 9, 4, 0, 0, Math.PI * 2); sc.fill();
    }
    // logs in the firebox
    sc.save(); sc.translate(wx, H - H * 0.05 + 10);
    sc.rotate(-0.17); sc.fillStyle = '#1e110b';
    sc.beginPath(); sc.ellipse(-24, 0, 54, 13, 0, 0, Math.PI * 2); sc.fill();
    sc.rotate(0.34); sc.fillStyle = '#180d08';
    sc.beginPath(); sc.ellipse(28, -5, 48, 12, 0, 0, Math.PI * 2); sc.fill();
    sc.restore();
    // side vignette
    const vg = sc.createLinearGradient(0, 0, W, 0);
    vg.addColorStop(0, 'rgba(0,0,0,0.5)'); vg.addColorStop(0.14, 'rgba(0,0,0,0)'); vg.addColorStop(0.86, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    sc.fillStyle = vg; sc.fillRect(0, 0, W, H);
  }
  function sceneBuildUnderwater(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#072a4a'); g.addColorStop(0.45, '#051e33'); g.addColorStop(1, '#020c16');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    const r0 = srand(4242);
    sc.fillStyle = '#1d1c16';
    sc.beginPath(); sc.moveTo(0, H * 0.86);
    for (let x = 0; x <= W; x += 10) sc.lineTo(x, H * 0.86 + Math.sin(x * 0.008 + 2) * 16 + Math.sin(x * 0.023) * 6);
    sc.lineTo(W, H + 30); sc.lineTo(0, H + 30); sc.closePath(); sc.fill();
    for (let i = 0; i < 11; i++) {
      const rx = r0() * W, ry = H * 0.855 + r0() * 26, rr = 9 + r0() * 26;
      sc.fillStyle = 'rgba(22,25,19,' + (0.6 + r0() * 0.4).toFixed(2) + ')';
      sc.beginPath(); sc.ellipse(rx, ry, rr, rr * 0.6, 0, 0, Math.PI * 2); sc.fill();
    }
    // coral branches
    sc.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const cx = r0() * W, cy = H * 0.87, h0 = 22 + r0() * 46;
      sc.strokeStyle = i % 3 ? '#2a1720' : '#1c2430';
      for (let b = 0; b < 4; b++) {
        const a = -Math.PI / 2 + (b - 1.5) * 0.42 + (r0() - 0.5) * 0.34;
        sc.lineWidth = 2.6 + r0() * 2.2;
        sc.beginPath(); sc.moveTo(cx, cy);
        sc.quadraticCurveTo(cx + Math.cos(a) * h0 * 0.5, cy + Math.sin(a) * h0 * 0.62, cx + Math.cos(a) * h0, cy + Math.sin(a) * h0);
        sc.stroke();
      }
    }
  }
  function sceneBuildVolcano(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04050c'); g.addColorStop(0.55, '#0e0710'); g.addColorStop(1, '#1f0b06');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    sceneStars(sc, 31415, 150, H * 0.62);
    const hg = sc.createRadialGradient(W / 2, H * 0.76, 10, W / 2, H * 0.76, W * 0.55);
    hg.addColorStop(0, 'rgba(255,96,22,0.4)'); hg.addColorStop(1, 'rgba(255,96,22,0)');
    sc.fillStyle = hg; sc.fillRect(0, 0, W, H);
    // far ridge
    sc.fillStyle = '#0d0812';
    sc.beginPath(); sc.moveTo(0, H * 0.74);
    for (let x = 0; x <= W; x += 12) sc.lineTo(x, H * 0.74 - Math.abs(Math.sin(x * 0.0062 + 1.4)) * 66 - Math.sin(x * 0.02) * 12);
    sc.lineTo(W, H + 30); sc.lineTo(0, H + 30); sc.closePath(); sc.fill();
    // volcano cone with caldera scoop
    const peakX = W * 0.5, peakY = H * 0.3, baseY = H * 0.9;
    sc.fillStyle = '#0a0508';
    sc.beginPath();
    sc.moveTo(peakX - 62, peakY);
    sc.lineTo(peakX - W * 0.44, baseY);
    sc.lineTo(peakX + W * 0.44, baseY);
    sc.lineTo(peakX + 62, peakY);
    sc.quadraticCurveTo(peakX, peakY + 30, peakX - 62, peakY);
    sc.closePath(); sc.fill();
    // faint rim highlight
    sc.strokeStyle = 'rgba(255,120,50,0.16)'; sc.lineWidth = 2.2;
    sc.beginPath(); sc.moveTo(peakX - 62, peakY); sc.quadraticCurveTo(peakX, peakY + 30, peakX + 62, peakY); sc.stroke();
  }
  function sceneBuildForest(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H * 0.82);
    g.addColorStop(0, '#060d18'); g.addColorStop(0.52, '#081420'); g.addColorStop(1, '#0d1826');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    sceneStars(sc, 8191, 95, H * 0.5);
    // moon drawn live (real phase)
    // distant ridge
    sc.fillStyle = '#0a101a';
    sc.beginPath(); sc.moveTo(0, H * 0.52);
    for (let x = 0; x <= W; x += 9) sc.lineTo(x, H * 0.52 - Math.abs(Math.sin(x * 0.0048 + 3.1)) * 108 - Math.sin(x * 0.018) * 14);
    sc.lineTo(W, H + 30); sc.lineTo(0, H + 30); sc.closePath(); sc.fill();
    // pine layers, back to front
    const tones = ['#0c141d', '#0e1722', '#121c2a'];
    for (let L = 0; L < 3; L++) {
      const rr = srand(500 + L * 99);
      const n = 15 + L * 7;
      for (let i = 0; i < n; i++) {
        const x = rr() * W, h = 44 + rr() * 80 + L * 26;
        scenePine(sc, x, H * 0.64 + L * 46 + rr() * 34, h, tones[L]);
      }
    }
    sc.fillStyle = '#050a10'; sc.fillRect(0, H * 0.9, W, H * 0.1 + 30);
  }
  function sceneBuildDesert(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#150a26'); g.addColorStop(0.4, '#2b1230'); g.addColorStop(0.66, '#52203a'); g.addColorStop(0.82, '#8a3527'); g.addColorStop(1, '#cf7134');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    sceneStars(sc, 666, 60, H * 0.3);
    // big low sun
    const sx = W * 0.63, sy = H * 0.7;
    const sg = sc.createRadialGradient(sx, sy, 10, sx, sy, 200);
    sg.addColorStop(0, '#ffe2a8'); sg.addColorStop(0.18, '#ffc46a'); sg.addColorStop(0.36, 'rgba(255,150,70,0.4)'); sg.addColorStop(1, 'rgba(255,150,70,0)');
    sc.fillStyle = sg; sc.fillRect(0, 0, W, H);
    sc.fillStyle = '#ffe7b2'; sc.beginPath(); sc.arc(sx, sy, 78, 0, Math.PI * 2); sc.fill();
    sceneDune(sc, W, H * 0.66, 44, 0.010, 101, '#331a2e');
    sceneDune(sc, W, H * 0.77, 62, 0.0078, 202, '#281320');
    sceneDune(sc, W, H * 0.9, 86, 0.0058, 303, '#160a10');
    // cacti (two sizes)
    const cactus = (x, y, s) => {
      sc.save(); sc.translate(x, y); sc.scale(s, s); sc.fillStyle = '#0c0510';
      sc.fillRect(-5, -60, 10, 60);
      sc.fillRect(-20, -42, 7, 18); sc.fillRect(-20, -26, 15, 7);
      sc.fillRect(13, -36, 7, 15); sc.fillRect(6, -24, 15, 7);
      sc.fillStyle = 'rgba(140,95,105,0.3)'; sc.fillRect(-6, -58, 2, 54);
      sc.restore();
    };
    cactus(W * 0.17, H * 0.905, 0.95); cactus(W * 0.86, H * 0.815, 0.6); cactus(W * 0.4, H * 0.8, 0.38);
  }
  function sceneBuildObservatory(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0b09'); g.addColorStop(0.5, '#0a0908'); g.addColorStop(1, '#060504');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // dome arc + ribs
    sc.strokeStyle = '#151210'; sc.lineWidth = Math.max(26, W * 0.03);
    sc.beginPath(); sc.arc(W / 2, H * 1.16, W * 0.66, Math.PI, Math.PI * 2); sc.stroke();
    sc.strokeStyle = '#100e0b'; sc.lineWidth = 6;
    for (const dx of [-0.42, -0.2, 0.2, 0.42]) {
      sc.beginPath(); sc.moveTo(W / 2 + dx * W * 0.3, H * 0.1); sc.lineTo(W / 2 + dx * W * 0.72, H + 40); sc.stroke();
    }
    // window arch + galaxy interior
    const ww = Math.min(600, W * 0.52), wh = Math.min(400, H * 0.48);
    const wx0 = W / 2 - ww / 2, wy0 = H * 0.15, archR = ww * 0.32;
    sc.save();
    sc.beginPath();
    sc.moveTo(wx0, wy0 + wh);
    sc.lineTo(wx0, wy0 + archR);
    sc.quadraticCurveTo(W / 2, wy0 - archR * 0.82, wx0 + ww, wy0 + archR);
    sc.lineTo(wx0 + ww, wy0 + wh); sc.closePath(); sc.clip();
    sc.fillStyle = '#040713'; sc.fillRect(wx0, wy0 - archR, ww, wh + archR * 2);
    const gal = sc.createLinearGradient(wx0, wy0 + wh * 0.72, wx0 + ww, wy0 + wh * 0.05);
    gal.addColorStop(0, 'rgba(70,100,175,0)'); gal.addColorStop(0.5, 'rgba(170,200,255,0.42)'); gal.addColorStop(1, 'rgba(70,100,175,0)');
    sc.fillStyle = gal; sc.fillRect(wx0, wy0 - archR, ww, wh + archR * 2);
    // dense stars inside the clip
    const r0 = srand(2718);
    for (let i = 0; i < 130; i++) {
      const x = wx0 + r0() * ww, y = wy0 - archR * 0.4 + r0() * (wh + archR * 1.2);
      const a = 0.4 + r0() * 0.6, big = r0() < 0.14;
      sc.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      sc.fillRect(x, y, big ? 2.2 : 1.4, big ? 2.2 : 1.4);
    }
    // moon drawn live (real phase)
    // telescope silhouette
    sc.fillStyle = '#030509';
    const tx = wx0 + ww * 0.3, ty = wy0 + wh * 0.74;
    sc.save(); sc.translate(tx, ty); sc.rotate(-0.48); sc.fillRect(-8, -105, 16, 105); sc.restore();
    sc.strokeStyle = '#030509'; sc.lineWidth = 6;
    sc.beginPath(); sc.moveTo(tx, ty); sc.lineTo(tx - 24, ty + 64); sc.moveTo(tx, ty); sc.lineTo(tx + 24, ty + 64); sc.moveTo(tx, ty); sc.lineTo(tx, ty + 70); sc.stroke();
    sc.restore();
    // iron frame around the arch
    sc.strokeStyle = '#171410'; sc.lineWidth = 15;
    sc.beginPath(); sc.moveTo(wx0, wy0 + wh); sc.lineTo(wx0, wy0 + archR); sc.quadraticCurveTo(W / 2, wy0 - archR * 0.82, wx0 + ww, wy0 + archR); sc.lineTo(wx0 + ww, wy0 + wh); sc.stroke();
    sc.strokeStyle = '#131009'; sc.lineWidth = 7;
    sc.beginPath(); sc.moveTo(W / 2, wy0 - archR * 0.72); sc.lineTo(W / 2, wy0 + wh); sc.stroke();
    // floor
    sc.fillStyle = '#070605'; sc.fillRect(0, wy0 + wh, W, H - (wy0 + wh));
  }
  function sceneBuildCabin(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f0a06'); g.addColorStop(0.6, '#120c08'); g.addColorStop(1, '#080604');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // log walls (side strips flanking a wide window)
    const vpX = W / 2, vpY = H * 0.18;
    const ww = Math.min(640, W * 0.6), wh = Math.min(430, H * 0.5);
    const wx0 = vpX - ww / 2, wy0 = H * 0.2, archR = ww * 0.28;
    // window cavity: outside view
    sc.save();
    sc.beginPath();
    sc.moveTo(wx0, wy0 + wh); sc.lineTo(wx0, wy0 + archR);
    sc.quadraticCurveTo(vpX, wy0 - archR * 0.85, wx0 + ww, wy0 + archR);
    sc.lineTo(wx0 + ww, wy0 + wh); sc.closePath(); sc.clip();
    const night = sc.createLinearGradient(0, wy0, 0, wy0 + wh);
    night.addColorStop(0, '#030f1e'); night.addColorStop(0.52, '#0a2338'); night.addColorStop(0.78, '#17435e'); night.addColorStop(1, '#1d4a63');
    sc.fillStyle = night; sc.fillRect(wx0, wy0 - archR, ww, wh + archR * 2);
    sceneStars(sc, 2024, 70, 0); // outside clip is fine (clipped)
    // aurora ribbon (static base; animated one drawn live)
    const aur = sc.createLinearGradient(0, wy0, 0, wy0 + wh * 0.55);
    aur.addColorStop(0, 'rgba(57,255,176,0.32)'); aur.addColorStop(0.5, 'rgba(94,201,255,0.1)'); aur.addColorStop(1, 'rgba(57,255,176,0)');
    sc.fillStyle = aur; sc.fillRect(wx0, wy0, ww, wh * 0.55);
    // snowy ridge
    sc.fillStyle = '#6d839b';
    sc.beginPath(); sc.moveTo(wx0, wy0 + wh * 0.62);
    for (let x = wx0; x <= wx0 + ww; x += 7) sc.lineTo(x, wy0 + wh * 0.62 - Math.abs(Math.sin(x * 0.006 + 2)) * 26 - Math.sin(x * 0.02) * 7);
    sc.lineTo(wx0 + ww, wy0 + wh); sc.lineTo(wx0, wy0 + wh); sc.closePath(); sc.fill();
    // pine ridge silhouette
    const r0 = srand(603);
    for (let i = 0; i < 26; i++) {
      const x = wx0 + r0() * ww, h = 9 + r0() * 34;
      scenePine(sc, x, wy0 + wh * 0.72 + r0() * 4, h, '#0b1620');
    }
    sc.restore();
    // frame ribs + log rows on walls
    sc.strokeStyle = '#241610'; sc.lineWidth = 13;
    sc.beginPath(); sc.moveTo(wx0, wy0 + wh); sc.lineTo(wx0, wy0 + archR); sc.quadraticCurveTo(vpX, wy0 - archR * 0.85, wx0 + ww, wy0 + archR); sc.lineTo(wx0 + ww, wy0 + wh); sc.stroke();
    const logs = (x0, x1) => {
      for (let y = -10; y < H + 20; y += 34) {
        sc.fillStyle = '#1a100a';
        sc.beginPath(); sc.ellipse((x0 + x1) / 2, y, (x1 - x0) / 2 + 14, 17, 0, 0, Math.PI * 2); sc.fill();
        sc.fillStyle = 'rgba(255,214,160,0.05)'; sc.fillRect(x0 - 4, y - 15, (x1 - x0) + 8, 4);
      }
    };
    logs(0, wx0 - 8); logs(wx0 + ww + 8, W);
    // floor
    sc.fillStyle = '#120b08'; sc.fillRect(0, wy0 + wh, W, H - (wy0 + wh) + 40);
    // braided rug
    sc.fillStyle = '#2a1a12'; sc.fillRect(W * 0.2, H * 0.9, W * 0.6, 8);
    sc.fillStyle = 'rgba(200,150,100,0.16)'; sc.fillRect(W * 0.2, H * 0.9, W * 0.6, 3);
  }
  function sceneBuildY2k(sc, W, H) {
    const horizon = H * 0.64;
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#aebdc9'); g.addColorStop(0.32, '#c9d3dd'); g.addColorStop(0.52, '#e9dee6'); g.addColorStop(0.66, '#f6d9c8'); g.addColorStop(0.72, '#d8e1e8'); g.addColorStop(1, '#79828f');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // big chrome horizon bar
    const bar = sc.createLinearGradient(0, horizon - 16, 0, horizon + 16);
    bar.addColorStop(0, '#f4f6f8'); bar.addColorStop(0.28, '#7d8794'); bar.addColorStop(0.5, '#fdfefe'); bar.addColorStop(0.72, '#606a77'); bar.addColorStop(1, '#d4dade');
    sc.fillStyle = bar; sc.fillRect(0, horizon - 14, W, 28);
    // floor: chrome mirror with column stripes
    const fl = sc.createLinearGradient(0, horizon + 14, 0, H);
    fl.addColorStop(0, '#98a2af'); fl.addColorStop(0.4, '#5f6873'); fl.addColorStop(1, '#1e232c');
    sc.fillStyle = fl; sc.fillRect(0, horizon + 14, W, H - horizon);
    sc.globalAlpha = 0.32;
    for (let i = -6; i <= 6; i++) {
      const x0 = W / 2 + i * (W * 0.14);
      const grad = sc.createLinearGradient(x0 - 30, 0, x0 + 30, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      sc.fillStyle = grad;
      sc.beginPath(); sc.moveTo(x0 - 12, horizon + 14); sc.lineTo(x0 + 12, horizon + 14); sc.lineTo(x0 + 150, H); sc.lineTo(x0 - 150, H); sc.closePath(); sc.fill();
    }
    sc.globalAlpha = 1;
    // chrome orbs with fake reflections (static gradient)
    const orb = (x, y, r) => {
      const og = sc.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.1, x, y, r);
      og.addColorStop(0, '#ffffff'); og.addColorStop(0.22, '#c8ccd4'); og.addColorStop(0.45, '#5c6572'); og.addColorStop(0.62, '#dfe3e8'); og.addColorStop(0.82, '#434a55'); og.addColorStop(1, '#10151d');
      sc.fillStyle = og; sc.beginPath(); sc.arc(x, y, r, 0, Math.PI * 2); sc.fill();
      // colored horizon band reflection
      const band = sc.createLinearGradient(0, y - r * 0.1, 0, y + r * 0.36);
      band.addColorStop(0, 'rgba(255,120,180,0)'); band.addColorStop(0.5, 'rgba(255,140,120,0.42)'); band.addColorStop(1, 'rgba(255,120,180,0)');
      sc.save(); sc.beginPath(); sc.arc(x, y, r, 0, Math.PI * 2); sc.clip(); sc.fillStyle = band; sc.fillRect(x - r, y - r * 0.1, 2 * r, r * 0.5); sc.restore();
      sc.fillStyle = 'rgba(255,255,255,0.75)'; sc.beginPath(); sc.ellipse(x - r * 0.42, y - r * 0.45, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2); sc.fill();
    };
    orb(W * 0.24, H * 0.3, 58); orb(W * 0.74, H * 0.18, 84); orb(W * 0.52, H * 0.42, 26);
    // chrome ribbon text shape (abstract sweeping swoosh)
    sc.strokeStyle = 'rgba(255,255,255,0.5)'; sc.lineWidth = 9; sc.lineCap = 'round';
    sc.beginPath(); sc.moveTo(W * 0.08, horizon * 0.42); sc.quadraticCurveTo(W * 0.32, horizon * 0.12, W * 0.55, horizon * 0.4); sc.quadraticCurveTo(W * 0.78, horizon * 0.62, W * 0.93, horizon * 0.32); sc.stroke();
  }
  function sceneBuildLavaLamp(sc, W, H) {
    // wallpaper: muted orange/brown stripes
    sc.fillStyle = '#3a241c'; sc.fillRect(0, 0, W, H);
    const rr = srand(60);
    for (let x = 0; x < W; x += 26) {
      const tone = 0.85 + rr() * 0.32;
      sc.fillStyle = 'rgba(' + Math.round(64 * tone) + ',' + Math.round(40 * tone) + ',' + Math.round(28 * tone) + ',0.5)';
      sc.fillRect(x, 0, 13, H);
    }
    // baseboard
    sc.fillStyle = '#140c08'; sc.fillRect(0, H * 0.78, W, H);
    // shag carpet: olive dashes on dark
    for (let i = 0; i < 560; i++) {
      const x = rr() * W, y = H * 0.82 + rr() * H * 0.18;
      sc.fillStyle = 'rgba(' + (60 + rr() * 60 | 0) + ',' + (72 + rr() * 70 | 0) + ',30,' + (0.25 + rr() * 0.35).toFixed(2) + ')';
      sc.fillRect(x, y, 3.2, 7);
    }
    // warm wall wash
    const wg = sc.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, W * 0.72);
    wg.addColorStop(0, 'rgba(255,150,60,0.13)'); wg.addColorStop(1, 'rgba(255,150,60,0)');
    sc.fillStyle = wg; sc.fillRect(0, 0, W, H);
    // two lava lamps
    const lamp = (lx, lampH, hue) => {
      const baseY = H * 0.78;
      sc.save(); sc.translate(lx, baseY);
      // base cone
      const bg = sc.createLinearGradient(-40, 0, 40, 0);
      bg.addColorStop(0, '#241a16'); bg.addColorStop(0.5, '#5a463c'); bg.addColorStop(1, '#241a16');
      sc.fillStyle = bg;
      sc.beginPath(); sc.moveTo(-36, 0); sc.lineTo(-10, -26); sc.lineTo(10, -26); sc.lineTo(36, 0); sc.closePath(); sc.fill();
      // glass body: tapered capsule
      const gh = lampH;
      const gg = sc.createLinearGradient(-26, 0, 26, 0);
      gg.addColorStop(0, '#3a161e'); gg.addColorStop(0.5, '#7c2438'); gg.addColorStop(1, '#3a161e');
      sc.fillStyle = gg;
      sc.beginPath();
      sc.moveTo(-11, -30); sc.lineTo(-24, -gh); sc.lineTo(-20, -gh - 12); sc.lineTo(-12, -gh - 26); sc.lineTo(12, -gh - 26); sc.lineTo(20, -gh - 12); sc.lineTo(24, -gh); sc.lineTo(11, -30); sc.closePath(); sc.fill();
      // glass highlight
      sc.fillStyle = 'rgba(255,255,255,0.16)';
      sc.beginPath(); sc.moveTo(-7, -34); sc.lineTo(-15, -gh); sc.lineTo(-11, -gh); sc.lineTo(-3, -34); sc.closePath(); sc.fill();
      // cap
      sc.fillStyle = bg;
      sc.fillRect(-13, -gh - 34, 26, 10);
      sc.restore();
    };
    lamp(W * 0.27, 210, 0); lamp(W * 0.73, 160, 0);
  }
  function sceneBuildTrain(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#171310'); g.addColorStop(1, '#0e0b09');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // window: wide horizontal rounded box
    const ww = Math.min(760, W * 0.76), wh = Math.min(300, H * 0.34);
    const wx = (W - ww) / 2, wy = H * 0.2;
    sc.fillStyle = '#241a12'; sc.fillRect(wx - 14, wy - 12, ww + 28, wh + 24);
    sc.save();
    const rr = (x, y, w, h, r) => { sc.beginPath(); sc.moveTo(x + r, y); sc.arcTo(x + w, y, x + w, y + h, r); sc.arcTo(x + w, y + h, x, y + h, r); sc.arcTo(x, y + h, x, y, r); sc.arcTo(x, y, x + w, y, r); sc.closePath(); };
    rr(wx, wy, ww, wh, 26); sc.clip();
    const night = sc.createLinearGradient(0, wy, 0, wy + wh);
    night.addColorStop(0, '#040a18'); night.addColorStop(0.62, '#0d1a33'); night.addColorStop(0.85, '#273252'); night.addColorStop(1, '#3c3a58');
    sc.fillStyle = night; sc.fillRect(wx, wy, ww, wh);
    sceneStars(sc, 155, 40, 0);
    // distant city glow ridge
    sc.fillStyle = '#0a1024';
    for (let x = wx; x < wx + ww; x += 4) {
      const h2 = (Math.abs(Math.sin(x * 0.015 + 1.2)) * 26 + Math.abs(Math.sin(x * 0.043)) * 12) | 0;
      if (h2 > 3) sc.fillRect(x, wy + wh * 0.78 - h2, 4, h2);
    }
    sc.restore();
    // window inner rim highlight
    sc.strokeStyle = 'rgba(255,230,190,0.08)'; sc.lineWidth = 3; rr(wx + 2, wy + 2, ww - 4, wh - 4, 22); sc.stroke();
    // shelf ledge + mug + thermos silhouette
    const sy = wy + wh + 16;
    sc.fillStyle = '#221812'; sc.fillRect(wx - 20, sy, ww + 40, 12);
    sc.fillStyle = '#0c0908';
    sc.beginPath(); sc.ellipse(W * 0.32, sy + 3, 16, 5, 0, 0, Math.PI * 2); sc.fill(); sc.fillRect(W * 0.32 - 14, sy - 16, 28, 16);
    sc.fillRect(W * 0.58 - 9, sy - 22, 18, 22);
    // hanging strap
    sc.strokeStyle = '#0c0908'; sc.lineWidth = 6;
    sc.beginPath(); sc.moveTo(W * 0.82, 0); sc.lineTo(W * 0.82, H * 0.16); sc.stroke();
    sc.beginPath(); sc.arc(W * 0.82, H * 0.19, 11, 0, Math.PI * 2); sc.stroke();
  }
  function sceneBuildNoir(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c0c0e'); g.addColorStop(1, '#08080a');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // big window with venetian blinds, night city outside
    const ww = Math.min(600, W * 0.55), wh = Math.min(330, H * 0.4);
    const wx = (W - ww) / 2, wy = H * 0.13;
    sc.fillStyle = '#1c1a18'; sc.fillRect(wx - 10, wy - 10, ww + 20, wh + 20);
    sc.save(); sc.beginPath(); sc.rect(wx, wy, ww, wh); sc.clip();
    const city = sc.createLinearGradient(0, wy, 0, wy + wh);
    city.addColorStop(0, '#0a0e1c'); city.addColorStop(0.6, '#161b30'); city.addColorStop(0.82, '#402a3a'); city.addColorStop(1, '#59443a');
    sc.fillStyle = city; sc.fillRect(wx, wy, ww, wh);
    sceneStars(sc, 1415, 30, 0);
    // buildings silhouettes + lit windows
    const r0 = srand(1416);
    for (let x = wx; x < wx + ww;) {
      const bw = 18 + r0() * 54, bh = 20 + r0() * 90;
      sc.fillStyle = '#070a14'; sc.fillRect(x, wy + wh - bh, bw, bh);
      for (let k = 0; k < 8; k++) if (r0() < 0.45) { sc.fillStyle = 'rgba(255,214,130,' + (0.35 + r0() * 0.4).toFixed(2) + ')'; sc.fillRect(x + 3 + r0() * (bw - 6), wy + wh - bh + 4 + r0() * (bh - 8), 2.4, 3); }
      x += bw + 4 + r0() * 12;
    }
    // slats with gaps
    for (let y = wy; y < wy + wh; y += 18) {
      sc.fillStyle = '#111113'; sc.fillRect(wx, y, ww, 9);
      sc.fillStyle = 'rgba(255,255,255,0.06)'; sc.fillRect(wx, y + 8, ww, 2);
    }
    sc.restore();
    // slat shadow bars cast on wall below window
    sc.fillStyle = 'rgba(0,0,0,0.32)';
    for (let i = 0; i < 6; i++) sc.fillRect(wx - 40, wy + wh + 14 + i * 22, ww + 80, 5);
    // desk ledge
    sc.fillStyle = '#1d130c'; sc.fillRect(0, H * 0.82, W, H * 0.18);
    // desk lamp cone (glow drawn live)
    sc.fillStyle = '#0d0906';
    sc.beginPath(); sc.ellipse(W * 0.22, H * 0.82, 26, 7, 0, 0, Math.PI * 2); sc.fill();
    sc.fillRect(W * 0.22 - 4, H * 0.7, 8, H * 0.13);
    sc.beginPath(); sc.moveTo(W * 0.22 - 18, H * 0.7); sc.lineTo(W * 0.22 + 18, H * 0.7); sc.lineTo(W * 0.22 + 26, H * 0.76); sc.lineTo(W * 0.22 - 26, H * 0.76); sc.closePath(); sc.fill();
    // coffee cup + papers silhouette
    sc.fillStyle = '#0a0806';
    sc.beginPath(); sc.ellipse(W * 0.66, H * 0.87, 17, 5, 0, 0, Math.PI * 2); sc.fill(); sc.fillRect(W * 0.66 - 14, H * 0.87 - 14, 28, 13);
    sc.save(); sc.translate(W * 0.45, H * 0.885); sc.rotate(-0.12);
    sc.fillStyle = '#151210'; sc.fillRect(-40, -4, 80, 7); sc.restore();
  }
  function sceneBuildLibrary(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#17110c'); g.addColorStop(1, '#0b0906');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // arched window with stars + moon
    const ww = Math.min(380, W * 0.34), wh = Math.min(360, H * 0.46);
    const wx = (W - ww) / 2, wy = H * 0.12, archR = ww * 0.34;
    sc.save();
    sc.beginPath(); sc.moveTo(wx, wy + wh); sc.lineTo(wx, wy + archR); sc.quadraticCurveTo(W / 2, wy - archR * 0.82, wx + ww, wy + archR); sc.lineTo(wx + ww, wy + wh); sc.closePath(); sc.clip();
    const night = sc.createLinearGradient(0, wy, 0, wy + wh);
    night.addColorStop(0, '#040a1c'); night.addColorStop(1, '#122036');
    sc.fillStyle = night; sc.fillRect(wx, wy - archR, ww, wh + archR * 2);
    sceneStars(sc, 2626, 46, 0);
    sc.restore();
    sc.strokeStyle = '#1f150e'; sc.lineWidth = 11;
    sc.beginPath(); sc.moveTo(wx, wy + wh); sc.lineTo(wx, wy + archR); sc.quadraticCurveTo(W / 2, wy - archR * 0.82, wx + ww, wy + archR); sc.lineTo(wx + ww, wy + wh); sc.stroke();
    // bookshelves flanking the window: rows of books
    const shelf = (x0, x1) => {
      for (let y = 40; y < H * 0.88; y += 78) {
        sc.fillStyle = '#1e150e'; sc.fillRect(x0, y, x1 - x0, 8);
        const r0 = srand((x0 | 0) * 31 + y);
        let x = x0 + 4;
        while (x < x1 - 10) {
          const bw = 6 + r0() * 14, bh = 34 + r0() * 22;
          const cols = ['#3a2433', '#243a3a', '#3a3324', '#243024', '#33241f', '#2e2440', '#40342a'];
          sc.fillStyle = cols[(r0() * cols.length) | 0];
          sc.globalAlpha = 0.85;
          sc.fillRect(x, y - bh, bw, bh);
          sc.globalAlpha = 1;
          if (r0() < 0.14) { sc.fillStyle = '#c8b888'; sc.fillRect(x + bw * 0.3, y - bh + 6, bw * 0.4, 2); } // title line
          x += bw + 2 + r0() * 3;
        }
      }
    };
    shelf(0, wx - 20); shelf(wx + ww + 20, W);
    // floor
    sc.fillStyle = '#0d0906'; sc.fillRect(0, H * 0.86, W, H);
    // table silhouette with candlesticks
    sc.fillStyle = '#090606';
    sc.beginPath(); sc.ellipse(W * 0.5, H * 0.88, W * 0.22, 10, 0, 0, Math.PI * 2); sc.fill();
    sc.fillRect(W * 0.5 - 8, H * 0.88, 16, H * 0.1);
  }
  function sceneCabinLive(W, H) {
    const vpX = W / 2, wy0 = H * 0.2, wh = Math.min(430, H * 0.5), ww = Math.min(640, W * 0.6);
    // aurora ribbons swaying (clipped inside window region)
    ctx.save();
    const wx0 = vpX - ww / 2, archR = ww * 0.28;
    ctx.beginPath(); ctx.moveTo(wx0, wy0 + wh); ctx.lineTo(wx0, wy0 + archR); ctx.quadraticCurveTo(vpX, wy0 - archR * 0.85, wx0 + ww, wy0 + archR); ctx.lineTo(wx0 + ww, wy0 + wh); ctx.closePath(); ctx.clip();
    for (let band = 0; band < 2; band++) {
      const baseY = wy0 + wh * (0.14 + band * 0.15);
      ctx.beginPath();
      for (let x = wx0; x <= wx0 + ww; x += 9) {
        const y = baseY + Math.sin(x * 0.012 + t * 0.35 + band * 2.2) * 11 + Math.sin(x * 0.03 + t * 0.6 + band) * 5;
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = 34 - band * 12;
      ctx.strokeStyle = band ? 'rgba(94,201,255,0.30)' : 'rgba(57,255,176,0.34)';
      ctx.shadowColor = band ? '#5ec9ff' : '#39ffb0'; ctx.shadowBlur = 18;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // moon with real phase, high in the window
    const mx = wx0 + ww * 0.24, my = wy0 + wh * 0.2;
    drawMoonPhase(ctx, mx, my, 16);
    // falling snow specks
    const S = sceneFx.cabinSnow || (sceneFx.cabinSnow = (() => { const arr = []; for (let i = 0; i < 46; i++) arr.push({ x: Math.random(), y: Math.random(), vy: 0.15 + Math.random() * 0.25, ph: Math.random() * 7 }); return arr; })());
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const s of S) {
      s.y += s.vy * 0.016; if (s.y > 1) { s.y = -0.02; s.x = Math.random(); }
      const sx = wx0 + s.x * ww, sy = wy0 + s.y * wh;
      ctx.fillRect(sx + Math.sin(t + s.ph) * 3, sy, 1.8, 1.8);
    }
    ctx.restore();
    // lamp flicker bottom-right (outside window, on wall)
    const flick = 0.2 + 0.1 * Math.sin(t * 6.3) + 0.06 * Math.sin(t * 13.7 + 1);
    const lg = ctx.createRadialGradient(W - 70, H * 0.66, 6, W - 70, H * 0.66, 150);
    lg.addColorStop(0, 'rgba(255,214,120,' + flick.toFixed(3) + ')');
    lg.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = lg; ctx.fillRect(W - 260, H * 0.4, 260, H * 0.6);
    // small table lamp silhouette
    ctx.fillStyle = '#100a07';
    ctx.beginPath(); ctx.ellipse(W - 70, H * 0.77, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(W - 73, H * 0.62, 6, H * 0.15);
    ctx.beginPath(); ctx.moveTo(W - 88, H * 0.62); ctx.lineTo(W - 52, H * 0.62); ctx.lineTo(W - 58, H * 0.55); ctx.lineTo(W - 82, H * 0.55); ctx.closePath(); ctx.fill();
  }
  function sceneLavaLampLive(W, H) {
    // wax blobs inside the two lamps (x positions match static lamp placement)
    const lampDefs = [{ x: W * 0.27, h: 210, phase: 0 }, { x: W * 0.73, h: 160, phase: 2.1 }];
    const lampBaseY = H * 0.78;
    for (const L of lampDefs) {
      const top = lampBaseY - L.h - 20, bot = lampBaseY - 30;
      const span = bot - top;
      for (let i = 0; i < 4; i++) {
        const ph = t * 0.5 + L.phase + i * 1.9;
        const cyc = (Math.sin(ph) + 1) / 2; // 0..1
        const y = bot - cyc * span;
        const size = 5 + (1 - cyc) * 5 + i * 1.6;
        const wob = Math.sin(t * 1.4 + i * 3 + L.phase) * 6;
        ctx.fillStyle = i % 2 ? '#ff5a8c' : '#ff8a3a';
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.ellipse(L.x + wob, y, size * (0.75 + (cyc > 0.85 || cyc < 0.15 ? 0.45 : 0)), size, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // cap glow lamp light
      const lg = ctx.createRadialGradient(L.x, bot - span / 2, 4, L.x, bot - span / 2, span * 0.9);
      lg.addColorStop(0, 'rgba(255,120,120,0.06)'); lg.addColorStop(1, 'rgba(255,120,120,0)');
      ctx.fillStyle = lg; ctx.fillRect(L.x - span, top - 20, span * 2, span + 40);
    }
  }
  function sceneTrainLive(W, H) {
    const ww = Math.min(760, W * 0.76), wh = Math.min(300, H * 0.34);
    const wx = (W - ww) / 2, wy = H * 0.2;
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    // fast passing lights (burst of dots with gaps)
    const P = sceneFx.trainPass || (sceneFx.trainPass = []);
    if (P.length < 40 && Math.random() < 0.5) P.push({ x: W + 40 + Math.random() * 300, y: wy + wh * (0.55 + Math.random() * 0.32), v: 3.2 + Math.random() * 2.4, r: 1.1 + Math.random() * 1.4, hue: pick(['#ffd88a', '#fff6c8', '#ff9d5c']) });
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.x -= p.v;
      if (p.x < wx - 30) { P.splice(i, 1); continue; }
      ctx.fillStyle = p.hue; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    // occasional building silhouette whipping by
    const B = sceneFx.trainBuild || (sceneFx.trainBuild = { next: 0, items: [] });
    if (Date.now() > B.next) { B.items.push({ x: W + 60, w: 60 + Math.random() * 80, h: 26 + Math.random() * 60 }); B.next = Date.now() + 1400 + Math.random() * 1800; }
    for (let i = B.items.length - 1; i >= 0; i--) {
      const b = B.items[i]; b.x -= 9.5;
      if (b.x + b.w < wx - 30) { B.items.splice(i, 1); continue; }
      ctx.fillStyle = '#060a16'; ctx.fillRect(b.x, wy + wh * 0.78 - b.h, b.w, b.h);
    }
    // tunnel: whole window pulses dark briefly every so often
    const T = sceneFx.trainTunnel || (sceneFx.trainTunnel = { next: 0, until: 0 });
    if (Date.now() > T.next) { T.until = Date.now() + 420 + Math.random() * 200; T.next = Date.now() + 9000 + Math.random() * 11000; }
    if (Date.now() < T.until) { ctx.fillStyle = 'rgba(2,2,4,0.82)'; ctx.fillRect(wx, wy, ww, wh); }
    ctx.globalAlpha = 1;
    // window reflection shimmer band drifting
    const refl = (t * 22) % (ww * 2.4) - ww * 0.7;
    const rg = ctx.createLinearGradient(wx + refl, 0, wx + refl + 130, 0);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.055)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(wx, wy, ww, wh);
    ctx.restore();
  }
  function sceneNoirLive(W, H) {
    const ww = Math.min(600, W * 0.55), wh = Math.min(330, H * 0.4);
    const wx = (W - ww) / 2, wy = H * 0.13;
    // rain streaks crawling down the glass
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    const R = sceneFx.noirRain || (sceneFx.noirRain = (() => { const arr = []; for (let i = 0; i < 26; i++) arr.push({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random() * 0.5, len: 8 + Math.random() * 22 }); return arr; })());
    ctx.strokeStyle = 'rgba(200,220,240,0.4)'; ctx.lineWidth = 1.3;
    for (const s of R) {
      s.y += s.v * 0.008; if (s.y > 1.05) { s.y = -0.05; s.x = Math.random(); }
      const rx = wx + s.x * ww, ry = wy + s.y * wh;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 1.5, ry + s.len); ctx.stroke();
    }
    ctx.restore();
    // desk lamp glow (breathing warm)
    const flick = 0.3 + 0.1 * Math.sin(t * 2.2) + 0.05 * Math.sin(t * 7.7 + 2);
    const lg = ctx.createRadialGradient(W * 0.22, H * 0.7, 8, W * 0.22, H * 0.7, 170);
    lg.addColorStop(0, 'rgba(255,214,140,' + flick.toFixed(3) + ')');
    lg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, H * 0.42, W * 0.45, H * 0.6);
    // coffee steam curls
    for (let c = 0; c < 2; c++) {
      const ph = t * 1.3 + c * 2.4;
      const sx = W * 0.66 + c * 7 - 3.5;
      ctx.strokeStyle = 'rgba(220,220,225,0.32)';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(sx, H * 0.87 - 15);
      ctx.bezierCurveTo(sx - 7 + Math.sin(ph) * 4, H * 0.845, sx + 7 - Math.cos(ph) * 4, H * 0.82, sx + Math.sin(ph * 1.6) * 5, H * 0.79);
      ctx.stroke();
    }
  }
  function sceneLibraryLive(W, H) {
    // candle flames on the table
    const wy = H * 0.87;
    for (const off of [-30, 0, 30]) {
      const cx = W * 0.5 + off;
      const fl = 5 + Math.sin(t * 9 + off) * 1.4 + Math.sin(t * 17 + off * 2) * 0.7;
      const g = ctx.createRadialGradient(cx, wy - 24, 1, cx, wy - 24, 26);
      g.addColorStop(0, 'rgba(255,220,140,0.85)'); g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, wy - 24, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd88a';
      ctx.beginPath(); ctx.ellipse(cx, wy - 22, 3.4, fl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath(); ctx.ellipse(cx, wy - 21, 1.6, fl * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8e0ca'; ctx.fillRect(cx - 2, wy - 18, 4, 16);
    }
    // dust motes drifting through the window light shaft
    const M = sceneFx.libraryDust || (sceneFx.libraryDust = (() => { const arr = []; for (let i = 0; i < 18; i++) arr.push({ x: Math.random(), y: Math.random(), ph: Math.random() * 7 }); return arr; })());
    for (const m of M) {
      m.x += 0.0006; m.y += Math.sin(t * 0.5 + m.ph) * 0.0004;
      if (m.x > 1) m.x = 0;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t + m.ph);
      ctx.fillStyle = '#e8e4cc';
      ctx.fillRect(W * 0.42 + m.x * W * 0.2, H * 0.16 + m.y * H * 0.55, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  // ---- static cache orchestration
  function sceneCacheEnsure(W, H) {
    const key = scene + ':' + W + 'x' + H;
    if (sceneCache && sceneCacheKey === key) return;
    sceneCache = document.createElement('canvas');
    sceneCache.width = W; sceneCache.height = H;
    const sc = sceneCache.getContext('2d');
    if (scene === 'fireplace') sceneBuildFireplace(sc, W, H);
    else if (scene === 'underwater') sceneBuildUnderwater(sc, W, H);
    else if (scene === 'volcano') sceneBuildVolcano(sc, W, H);
    else if (scene === 'forest') sceneBuildForest(sc, W, H);
    else if (scene === 'desert') sceneBuildDesert(sc, W, H);
    else if (scene === 'observatory') sceneBuildObservatory(sc, W, H);
    else if (scene === 'synthwave') sceneBuildSynthwave(sc, W, H);
    else if (scene === 'matrix') sceneBuildMatrix(sc, W, H);
    else if (scene === 'bliss') sceneBuildBliss(sc, W, H);
    else if (scene === 'happy') sceneBuildHappy(sc, W, H);
    else if (scene === 'excited') sceneBuildExcited(sc, W, H);
    else if (scene === 'cabin') sceneBuildCabin(sc, W, H);
    else if (scene === 'y2k') sceneBuildY2k(sc, W, H);
    else if (scene === 'lavara') sceneBuildLavaLamp(sc, W, H);
    else if (scene === 'train') sceneBuildTrain(sc, W, H);
    else if (scene === 'noir') sceneBuildNoir(sc, W, H);
    else if (scene === 'library') sceneBuildLibrary(sc, W, H);
    sceneCacheKey = key;
  }
  function sceneBuildSynthwave(sc, W, H) {
    const horizon = H * 0.62;
    const g = sc.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#150a2e'); g.addColorStop(0.42, '#2b0e46'); g.addColorStop(0.74, '#4c1246'); g.addColorStop(1, '#8a1c4a');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    sceneStars(sc, 9191, 70, horizon * 0.72);
    // striped outrun sun
    const r = Math.min(W, H) * 0.21, cx = W / 2, cy = horizon;
    sc.save();
    sc.beginPath(); sc.arc(cx, cy, r, 0, Math.PI * 2); sc.clip();
    const sg = sc.createLinearGradient(0, cy - r, 0, cy + r);
    sg.addColorStop(0, '#ffd319'); sg.addColorStop(0.45, '#ff8c37'); sg.addColorStop(0.78, '#ff2975'); sg.addColorStop(1, '#c30e63');
    sc.fillStyle = sg; sc.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    sc.fillStyle = '#150a2e';
    for (let i = 0; i < 6; i++) {
      const yy = cy + (i / 6) * r * 0.94 + r * 0.06;
      sc.fillRect(cx - r, yy, 2 * r, 2 + i * 2.1);
    }
    sc.restore();
    // horizon glow line
    const hg = sc.createRadialGradient(cx, horizon, 4, cx, horizon, W * 0.5);
    hg.addColorStop(0, 'rgba(255,60,190,0.75)'); hg.addColorStop(0.4, 'rgba(255,60,190,0.22)'); hg.addColorStop(1, 'rgba(255,60,190,0)');
    sc.fillStyle = hg; sc.fillRect(0, horizon - 40, W, H - horizon + 80);
    // jagged mountains behind the grid
    const ridge = (amp, seed, tone) => {
      sc.fillStyle = tone; sc.beginPath(); sc.moveTo(0, horizon);
      const r0 = srand(seed);
      for (let x = 0; x <= W; x += Math.max(14, W / 90)) sc.lineTo(x, horizon - r0() * amp - 8);
      sc.lineTo(W, horizon); sc.closePath(); sc.fill();
    };
    ridge(96, 444, '#1b0b21');
    ridge(52, 445, '#240e26');
    // ground + perspective grid
    const gnd = sc.createLinearGradient(0, horizon, 0, H);
    gnd.addColorStop(0, '#0d0416'); gnd.addColorStop(1, '#05010a');
    sc.fillStyle = gnd; sc.fillRect(0, horizon, W, H - horizon);
    sc.lineWidth = 1.4;
    sc.strokeStyle = '#ff2bd0'; // hot pink horizontal lines
    for (let i = 1; i <= 12; i++) {
      const p = Math.pow(i / 12, 2.6);
      const y = horizon + (H - horizon) * p;
      sc.globalAlpha = 0.35 + p * 0.6;
      sc.beginPath(); sc.moveTo(0, y); sc.lineTo(W, y); sc.stroke();
    }
    sc.strokeStyle = '#17d3ff'; // cyan rays
    const vpx = W / 2;
    for (let k = -13; k <= 13; k++) {
      sc.globalAlpha = 0.7;
      sc.beginPath(); sc.moveTo(vpx, horizon); sc.lineTo(vpx + k * (W / 26) * 3.4, H + 60); sc.stroke();
    }
    // palms at the edges
    const palm = (px, flip) => {
      sc.strokeStyle = '#070110'; sc.lineCap = 'round';
      sc.lineWidth = 9;
      sc.beginPath(); sc.moveTo(px, H * 0.88);
      sc.quadraticCurveTo(px + (flip ? -34 : 34), H * 0.68, px + (flip ? -16 : 16), H * 0.42);
      sc.stroke();
      const tx = px + (flip ? -16 : 16), ty = H * 0.42;
      sc.lineWidth = 5;
      for (let f = 0; f < 6; f++) {
        const ang = -Math.PI / 2 + (f - 2.5) * 0.52;
        sc.beginPath(); sc.moveTo(tx, ty);
        sc.quadraticCurveTo(tx + Math.cos(ang) * 54, ty + Math.sin(ang) * 46 - 14, tx + Math.cos(ang) * 88, ty + Math.sin(ang) * 66 + 10);
        sc.stroke();
      }
    };
    palm(W * 0.055, false); palm(W * 0.945, true);
    sc.globalAlpha = 1;
  }
  function sceneBuildMatrix(sc, W, H) {
    sc.fillStyle = '#010a04'; sc.fillRect(0, 0, W, H);
    // phosphor vignette + center wash + scanlines
    const vg = sc.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.45, W * 0.72);
    vg.addColorStop(0, 'rgba(16,60,26,0.34)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = vg; sc.fillRect(0, 0, W, H);
    sc.fillStyle = 'rgba(0,0,0,0.24)';
    for (let y = 0; y < H; y += 4) sc.fillRect(0, y, W, 1);
  }
  function sceneBuildBliss(sc, W, H) {
    const g = sc.createLinearGradient(0, 0, 0, H * 0.8);
    g.addColorStop(0, '#2e7cd6'); g.addColorStop(0.55, '#5d9fe0'); g.addColorStop(0.9, '#a5cfee'); g.addColorStop(1, '#cfe4f4');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // pale sun glare top-left
    const sg = sc.createRadialGradient(W * 0.18, H * 0.14, 10, W * 0.18, H * 0.14, W * 0.36);
    sg.addColorStop(0, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    sc.fillStyle = sg; sc.fillRect(0, 0, W, H * 0.5);
    // rolling hills (Bliss-style, right side rises higher)
    const hill = (baseY, amp, seed, color) => {
      sc.fillStyle = color; sc.beginPath(); sc.moveTo(0, baseY + 60);
      const r0 = srand(seed); const ph = r0() * 5;
      for (let x = 0; x <= W; x += 6) sc.lineTo(x, baseY - Math.sin(x * 0.004 + ph) * amp - Math.sin(x * 0.0016 + ph * 2) * amp * 0.8);
      sc.lineTo(W, H + 60); sc.lineTo(0, H + 60); sc.closePath(); sc.fill();
    };
    hill(H * 0.66, 60, 910, '#4f9a2e');
    hill(H * 0.78, 84, 911, '#3c7d22');
    // grass texture
    const r0 = srand(2001);
    for (let i = 0; i < 800; i++) {
      const x = r0() * W, y = H * 0.66 + Math.pow(r0(), 0.6) * H * 0.34;
      sc.fillStyle = 'rgba(' + (r0() < 0.5 ? '255,255,255' : '20,60,10') + ',' + (0.05 + r0() * 0.09).toFixed(2) + ')';
      sc.fillRect(x, y, 2, 2);
    }
  }
  function sceneBuildHappy(sc, W, H) {
    const horizon = H * 0.68;
    const g = sc.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#ef8fb4'); g.addColorStop(0.5, '#f9b9a8'); g.addColorStop(1, '#ffe9b8');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // rays
    const sx = W * 0.3, sy = H * 0.2;
    sc.save(); sc.translate(sx, sy);
    for (let i = 0; i < 14; i++) {
      sc.rotate((Math.PI * 2) / 14);
      sc.fillStyle = i % 2 ? 'rgba(255,246,205,0.16)' : 'rgba(255,246,205,0.4)';
      sc.beginPath(); sc.moveTo(0, 0); sc.lineTo(34, 26); sc.lineTo(34, -26); sc.closePath(); sc.fill();
    }
    sc.restore();
    // sun
    const sg = sc.createRadialGradient(sx, sy, 6, sx, sy, 130);
    sg.addColorStop(0, '#fffdf0'); sg.addColorStop(0.36, '#ffe98a'); sg.addColorStop(1, 'rgba(255,233,138,0)');
    sc.fillStyle = sg; sc.beginPath(); sc.arc(sx, sy, 130, 0, Math.PI * 2); sc.fill();
    sc.fillStyle = '#fffbe0'; sc.beginPath(); sc.arc(sx, sy, 52, 0, Math.PI * 2); sc.fill();
    // rainbow arc
    const rb = [['#ff6a6a', 150], ['#ffb24d', 132], ['#ffe66a', 114], ['#8aff8a', 96], ['#7ad7ff', 78], ['#b08cff', 60]];
    for (const [c, r] of rb) {
      sc.strokeStyle = c; sc.globalAlpha = 0.55; sc.lineWidth = 15;
      sc.beginPath(); sc.arc(W * 0.78, horizon + 60, r, Math.PI * 1.06, Math.PI * 1.94); sc.stroke();
    }
    sc.globalAlpha = 1;
    // meadow roll
    const meadow = (baseY, amp, seed, color) => {
      sc.fillStyle = color; sc.beginPath(); sc.moveTo(0, baseY + 40);
      const r0 = srand(seed); const ph = r0() * 6;
      for (let x = 0; x <= W; x += 8) sc.lineTo(x, baseY - Math.sin(x * 0.005 + ph) * amp);
      sc.lineTo(W, H + 40); sc.lineTo(0, H + 40); sc.closePath(); sc.fill();
    };
    meadow(horizon, 26, 770, '#69c84e');
    meadow(horizon + 34, 30, 771, '#48a035');
    // tiny wildflower dots
    const r0 = srand(88);
    for (let i = 0; i < 42; i++) {
      sc.fillStyle = ['#ffd9ec', '#fff6a8', '#ffc9d6', '#e6ffb8'][i % 4];
      sc.fillRect(r0() * W, horizon + 18 + r0() * (H - horizon), 2.6, 2.6);
    }
  }
  function sceneBuildExcited(sc, W, H) {
    const horizon = H * 0.74;
    const g = sc.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#05051a'); g.addColorStop(0.55, '#160d2e'); g.addColorStop(1, '#2d1240');
    sc.fillStyle = g; sc.fillRect(0, 0, W, horizon + 2);
    sceneStars(sc, 7331, 110, horizon * 0.62);
    // warm horizon glow
    const hg = sc.createRadialGradient(W / 2, horizon, 5, W / 2, horizon, W * 0.46);
    hg.addColorStop(0, 'rgba(255,120,60,0.5)'); hg.addColorStop(0.5, 'rgba(200,60,120,0.18)'); hg.addColorStop(1, 'rgba(200,60,120,0)');
    sc.fillStyle = hg; sc.fillRect(0, 0, W, H);
    // city silhouette with lit windows
    const r0 = srand(3141);
    const strip = [];
    let x = 0;
    while (x < W + 60) { const bw = 26 + r0() * 64, bh = 30 + r0() * 150; strip.push({ x, bw, bh }); x += bw + 4 + r0() * 14; }
    for (const b of strip) {
      sc.fillStyle = '#08061a';
      sc.fillRect(b.x, horizon - b.bh, b.bw, b.bh);
      // antenna on some
      if (b.bw > 40) sc.fillRect(b.x + b.bw / 2 - 1.4, horizon - b.bh - 18, 2.8, 18);
    }
    // lit windows (warm dots, static but twinkly)
    const r1 = srand(3142);
    for (let i = 0; i < 240; i++) {
      const b = strip[(r1() * strip.length) | 0];
      const wx = b.x + 3 + r1() * (b.bw - 6), wy = horizon - b.bh + 6 + r1() * (b.bh - 8);
      sc.fillStyle = r1() < 0.82 ? 'rgba(255,214,130,' + (0.35 + r1() * 0.5).toFixed(2) + ')' : 'rgba(140,220,255,0.65)';
      sc.fillRect(wx, wy, 2.4, 3.1);
    }
    // ground
    sc.fillStyle = '#050310'; sc.fillRect(0, horizon, W, H - horizon + 30);
  }
  // ---- live painters for the new scenes
  function sceneSynthwaveLive(W, H) {
    const horizon = H * 0.62;
    // sun pulse
    const pulse = 0.55 + 0.3 * Math.sin(t * 1.9);
    const cx = W / 2, cy = horizon, r = Math.min(W, H) * 0.21;
    const g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.1);
    g.addColorStop(0, 'rgba(255,80,180,' + (pulse * 0.36).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,80,180,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // traveling beam sweeping down the grid toward the viewer
    const cycle = (t * 0.5) % 1.6;
    if (cycle < 1) {
      const p = Math.pow(cycle, 2.4);
      const y = horizon + (H - horizon) * p;
      ctx.globalAlpha = 0.75 * (1 - cycle);
      ctx.fillStyle = '#ff9bf0';
      ctx.fillRect(0, y, W, 3 + cycle * 26);
      ctx.globalAlpha = 1;
    }
  }
  const MATRIX_GLYPHS = 'ｦｧｨｩｪｫｬｭｮｯアイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$&@%§';
  function sceneMatrixLive(W, H) {
    const colW = 17, rows = Math.ceil(H / 18) + 2;
    ctx.font = '13px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    const M = sceneFx.matrix || (sceneFx.matrix = (() => {
      const cols = [];
      const n = Math.floor(W / colW);
      for (let i = 0; i < n; i++) cols.push({ y: -Math.random() * H, vy: 1.6 + Math.random() * 2.6, len: 5 + ((Math.random() * 12) | 0), drift: Math.random() < 0.22 });
      return { cols, seedT: 0 };
    })());
    if (M.cols.length !== Math.floor(W / colW)) {
      M.cols = [];
      const n = Math.floor(W / colW);
      for (let i = 0; i < n; i++) M.cols.push({ y: -Math.random() * H, vy: 1.6 + Math.random() * 2.6, len: 5 + ((Math.random() * 12) | 0), drift: Math.random() < 0.22 });
    }
    for (let i = 0; i < M.cols.length; i++) {
      const c = M.cols[i];
      c.y += c.vy;
      const x = i * colW;
      for (let k = 0; k < c.len; k++) {
        const gy = c.y - k * 17;
        if (gy < -20 || gy > H + 20) continue;
        const gidx = ((x * 31 + ((gy / 17) | 0) * 7 + ((t * 9) | 0)) % MATRIX_GLYPHS.length + MATRIX_GLYPHS.length) % MATRIX_GLYPHS.length;
        const ch = MATRIX_GLYPHS[gidx];
        if (k === 0) { ctx.fillStyle = '#d8ffe2'; }
        else {
          const a = Math.max(0.12, 1 - k / c.len);
          ctx.fillStyle = 'rgba(48,255,110,' + a.toFixed(2) + ')';
        }
        ctx.fillText(ch, x, gy);
      }
      if (c.y - c.len * 17 > H + 30) { c.y = -Math.random() * H * 0.5 - 20; c.vy = 1.6 + Math.random() * 2.6; c.len = 5 + ((Math.random() * 12) | 0); }
    }
  }
  function sceneBlissLive(W, H) {
    const C = sceneFx.clouds || (sceneFx.clouds = (() => {
      const arr = [];
      for (let i = 0; i < 4; i++) arr.push({ x: Math.random() * W, y: H * (0.08 + Math.random() * 0.24), s: 26 + Math.random() * 30, vx: 0.09 + Math.random() * 0.07 });
      return arr;
    })());
    for (const c of C) {
      c.x += c.vx; if (c.x - c.s * 3 > W) c.x = -c.s * 4;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.s * 1.5, c.s * 0.62, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - c.s * 0.95, c.y + c.s * 0.14, c.s * 0.82, c.s * 0.46, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.s * 0.95, c.y + c.s * 0.14, c.s * 0.82, c.s * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // shimmer on the hill crest
    const shimmerY = H * 0.7 + Math.sin(t * 0.9) * 30;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, shimmerY, W, 2);
  }
  function sceneHappyLive(W, H) {
    // drifting balloons
    const B = sceneFx.balloonsArr || (sceneFx.balloonsArr = []);
    if (B.length < 8 && Math.random() < 0.02) B.push({ x: W * (0.12 + Math.random() * 0.76), y: H + 30, vy: 0.55 + Math.random() * 0.35, hue: ['#ff5a7a', '#ffb648', '#4dd0ff', '#8cff6a', '#d18cff', '#ffe066'][(Math.random() * 6) | 0], ph: Math.random() * 7 });
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i]; b.y -= b.vy; b.ph += 0.02;
      const bx = b.x + Math.sin(b.ph) * 9;
      if (b.y < -60) { B.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(60,60,60,0.55)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(bx, b.y + 11); ctx.quadraticCurveTo(bx + Math.sin(b.ph * 1.7) * 5, b.y + 24, bx, b.y + 38); ctx.stroke();
      ctx.fillStyle = b.hue;
      ctx.beginPath(); ctx.ellipse(bx, b.y, 11.5, 13.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.ellipse(bx - 3.6, b.y - 4.4, 3.4, 5, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    // butterflies
    const F = sceneFx.butterflies || (sceneFx.butterflies = (() => { const r0 = srand(505); const arr = []; for (let i = 0; i < 3; i++) arr.push({ x: r0() * W, y: H * (0.3 + r0() * 0.4), ph: r0() * 7, hue: ['#ff8ad4', '#ffd84a', '#9ad4ff'][i] }); return arr; })());
    for (const f of F) {
      f.ph += 0.045;
      f.x += Math.sin(t * 0.6 + f.ph) * 0.8 + 0.25;
      f.y += Math.cos(t * 0.9 + f.ph * 1.3) * 0.5;
      if (f.x > W + 30) f.x = -30;
      const flap = Math.sin(f.ph * 6);
      ctx.fillStyle = f.hue;
      ctx.beginPath(); ctx.ellipse(f.x - 4.5, f.y, 4.6, 2.4 + flap * 1.6, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(f.x + 4.5, f.y, 4.6, 2.4 + flap * 1.6, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(30,30,30,0.85)'; ctx.fillRect(f.x - 0.7, f.y - 2.6, 1.4, 5.4);
    }
    // occasional sparkle
    if (Math.random() < 0.1) {
      const spx = Math.random() * W, spy = H * (0.15 + Math.random() * 0.5);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(spx - 3.4, spy); ctx.lineTo(spx + 3.4, spy); ctx.moveTo(spx, spy - 3.4); ctx.lineTo(spx, spy + 3.4); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function sceneExcitedLive(W, H) {
    const horizon = H * 0.74;
    const F = sceneFx.excite || (sceneFx.excite = { rockets: [], parts: [], flash: 0, nextRocketAt: 0 });
    // launch a rocket every couple seconds
    if (Date.now() > F.nextRocketAt) {
      F.rockets.push({ x: W * (0.1 + Math.random() * 0.8), y: H + 20, vy: 5.1 + Math.random() * 1.5, targetY: H * (0.05 + Math.random() * 0.17), color: ['#ffd700', '#ff4fd8', '#4de8ff', '#8cff6a', '#ffffff', '#ff8a3a'][(Math.random() * 6) | 0] });
      F.nextRocketAt = Date.now() + 1300 + Math.random() * 1400;
    }
    // rockets rising
    for (let i = F.rockets.length - 1; i >= 0; i--) {
      const r = F.rockets[i];
      r.y -= r.vy;
      ctx.fillStyle = '#fff';
      ctx.fillRect(r.x - 1, r.y - 8, 2, 8);
      if (r.y <= r.targetY) {
        const n = 46;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + Math.random() * 0.16;
          const spd = 1.8 + Math.random() * 2.9;
          F.parts.push({ x: r.x, y: r.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: r.color, r: 2 + Math.random() * 1.9 });
        }
        F.flash = Math.min(0.6, F.flash + 0.4);
        if (sceneBedBoomFn) { try { sceneBedBoomFn(); } catch (e) {} }
        F.rockets.splice(i, 1);
      }
    }
    // exploding parts
    for (let i = F.parts.length - 1; i >= 0; i--) {
      const p = F.parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.021; p.vx *= 0.992; p.life -= 0.011;
      if (p.life <= 0) { F.parts.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + p.life * 0.8), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // ambient flash
    if (F.flash > 0.01) {
      const fg = ctx.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, W * 0.62);
      fg.addColorStop(0, 'rgba(255,255,255,' + (F.flash * 0.5).toFixed(3) + ')');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
      F.flash *= 0.9;
    }
  }

  // ---- live (per-frame animated) painters
  function sceneFireplaceLive(W, H) {
    const fx = W / 2, fy = H - H * 0.05 + 6;
    const flick = 0.3 + 0.13 * Math.sin(t * 5.1) + 0.09 * Math.sin(t * 11.7 + 1.3) + 0.06 * Math.sin(t * 17.3 + 4.1);
    let g = ctx.createRadialGradient(fx, fy - 42, 10, fx, fy - 42, W * 0.55);
    g.addColorStop(0, 'rgba(255,178,80,' + flick.toFixed(3) + ')');
    g.addColorStop(0.42, 'rgba(255,120,40,' + (flick * 0.45).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const layers = [
      { w: 116, h: 118, top: 'rgba(255,84,12,0.85)', bot: 'rgba(255,142,30,0.28)', ph: 0.0 },
      { w: 76, h: 82, top: 'rgba(255,192,64,0.95)', bot: 'rgba(255,172,42,0.36)', ph: 2.1 },
      { w: 33, h: 46, top: 'rgba(255,244,168,0.95)', bot: 'rgba(255,232,122,0.62)', ph: 4.2 },
    ];
    for (const L of layers) {
      const wob = Math.sin(t * 6 + L.ph) * 8 + Math.sin(t * 13.2 + L.ph * 2.4) * 3.5;
      const base = fy;
      ctx.beginPath();
      ctx.moveTo(fx - L.w / 2, base);
      ctx.quadraticCurveTo(fx - L.w * 0.42, base - L.h * 0.42, fx + wob * 0.35, base - L.h * 0.7);
      ctx.quadraticCurveTo(fx + wob, base - L.h, fx + L.w * 0.14, base - L.h * 0.52);
      ctx.quadraticCurveTo(fx + L.w * 0.4, base - L.h * 0.36, fx + L.w / 2, base);
      ctx.closePath();
      const fg = ctx.createLinearGradient(0, base, 0, base - L.h);
      fg.addColorStop(0, L.bot); fg.addColorStop(1, L.top);
      ctx.fillStyle = fg; ctx.fill();
    }
    const sp = sceneFx.sparks;
    if (sp.length < 44 && Math.random() < 0.6) sp.push({ x: fx + rand(-36, 36), y: fy - 4, vy: rand(1.1, 2.3), vx: rand(-0.5, 0.5), life: 1, r: rand(0.8, 2.3) });
    for (let i = sp.length - 1; i >= 0; i--) {
      const p = sp[i]; p.y -= p.vy; p.x += p.vx + Math.sin(t * 3 + p.y * 0.03) * 0.3; p.life -= 0.008;
      if (p.life <= 0 || p.y < 0) { sp.splice(i, 1); continue; }
      ctx.globalAlpha = p.life; ctx.fillStyle = p.life > 0.55 ? '#ffd87a' : '#ff8c3a';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function sceneUnderwaterLive(W, H) {
    for (let i = 0; i < 4; i++) {
      const bx = W * (0.17 + i * 0.22) + Math.sin(t * 0.3 + i * 1.7) * 34;
      const grad = ctx.createLinearGradient(bx, 0, bx - 95, H);
      grad.addColorStop(0, 'rgba(150,232,255,0.16)'); grad.addColorStop(1, 'rgba(150,232,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 64, 0); ctx.lineTo(bx - 34, H); ctx.lineTo(bx - 122, H); ctx.closePath(); ctx.fill();
    }
    const F = sceneFx.fish || (sceneFx.fish = (() => { const r0 = srand(9901); const arr = []; for (let i = 0; i < 6; i++) arr.push({ x: r0() * W, y: H * (0.3 + r0() * 0.42), s: 0.55 + r0() * 0.8, dir: r0() < 0.5 ? 1 : -1, ph: r0() * 7 }); return arr; })());
    for (const f of F) {
      f.x += f.dir * 0.55 * f.s; f.ph += 0.012;
      if (f.dir > 0 && f.x > W + 32) f.x = -32; else if (f.dir < 0 && f.x < -32) f.x = W + 32;
      const fy = f.y + Math.sin(f.ph) * 4;
      ctx.fillStyle = 'rgba(8,18,28,0.9)';
      ctx.beginPath(); ctx.ellipse(f.x, fy, 16 * f.s, 6 * f.s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(f.x - 14 * f.s * f.dir, fy); ctx.lineTo(f.x - 24 * f.s * f.dir, fy - 5 * f.s); ctx.lineTo(f.x - 24 * f.s * f.dir, fy + 5 * f.s); ctx.closePath(); ctx.fill();
    }
    const sr = srand(5150);
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const sx = sr() * W, sh = 56 + sr() * 92, sph = sr() * 7;
      const sway = Math.sin(t * 0.9 + sph) * 24;
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(16,66,42,0.9)';
      ctx.beginPath(); ctx.moveTo(sx, H); ctx.quadraticCurveTo(sx + sway * 0.4, H - sh * 0.5, sx + sway, H - sh); ctx.stroke();
      ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(26,100,58,0.85)';
      ctx.beginPath(); ctx.moveTo(sx, H); ctx.quadraticCurveTo(sx + sway * 0.4, H - sh * 0.5, sx + sway, H - sh); ctx.stroke();
    }
    const B = sceneFx.bubbles;
    if (B.length < 26 && Math.random() < 0.42) B.push({ x: W * (0.2 + Math.random() * 0.6), y: H - 24, r: 1 + Math.random() * 3.6, vy: 0.85 + Math.random() * 0.95, ph: Math.random() * 7 });
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i]; b.y -= b.vy; b.x += Math.sin(t * 2 + b.ph) * 0.35; b.ph += 0.08;
      if (b.y < 18) { B.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(190,236,255,0.62)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    }
    const J = sceneFx;
    if (!J.jelly && Date.now() > J.nextJellyAt) J.jelly = { x: W * (0.14 + Math.random() * 0.72), y: H * 0.96, ph: 0 };
    if (J.jelly) {
      const j = J.jelly; j.y -= 0.36; j.ph += 0.032;
      const pulse = 1 + 0.2 * Math.sin(j.ph);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#d6a4ff';
      ctx.beginPath(); ctx.ellipse(j.x, j.y, 22 * pulse, 15 / pulse, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(214,164,255,0.75)'; ctx.lineWidth = 1.6;
      for (let k = -1.6; k <= 1.6; k += 0.8) {
        ctx.beginPath(); ctx.moveTo(j.x + k * 8, j.y);
        ctx.quadraticCurveTo(j.x + k * 9 + Math.sin(j.ph * 1.7 + k) * 5, j.y + 26, j.x + k * 6, j.y + 46); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (j.y < -50) { J.jelly = null; J.nextJellyAt = Date.now() + 20000 + Math.random() * 22000; }
    }
  }
  function sceneVolcanoLive(W, H) {
    const peakX = W * 0.5, peakY = H * 0.3;
    const pulse = 0.62 + 0.26 * Math.sin(t * 2.2) + 0.12 * Math.sin(t * 6.7 + 1);
    const g = ctx.createRadialGradient(peakX, peakY + 4, 2, peakX, peakY + 4, 92);
    g.addColorStop(0, 'rgba(255,224,128,' + (0.95 * pulse).toFixed(2) + ')');
    g.addColorStop(0.35, 'rgba(255,142,40,' + (0.75 * pulse).toFixed(2) + ')');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.fillRect(peakX - 96, peakY - 12, 192, 124);
    const rng = srand(777);
    ctx.strokeStyle = 'rgba(255,152,54,' + (0.32 + 0.32 * pulse).toFixed(2) + ')';
    ctx.lineWidth = 1.4 + pulse; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 ? 1 : -1, len = (0.18 + rng() * 0.22) * H;
      const x0 = peakX + dir * (28 + rng() * 30), y0 = peakY + 5 + rng() * 9;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + dir * len * 0.4, y0 + len * 0.52, x0 + dir * len * 0.7, y0 + len); ctx.stroke();
    }
    const E = sceneFx.sparks;
    if (E.length < 34 && Math.random() < 0.5) E.push({ x: peakX + rand(-27, 27), y: peakY + 2, vy: rand(0.7, 1.8), vx: rand(-0.6, 0.6), life: 1, r: rand(0.7, 2.1) });
    for (let i = E.length - 1; i >= 0; i--) {
      const p = E[i]; p.y -= p.vy; p.x += p.vx + Math.sin(t * 3 + p.y * 0.05) * 0.4; p.life -= 0.007;
      if (p.life <= 0 || p.y < 0) { E.splice(i, 1); continue; }
      ctx.globalAlpha = p.life; ctx.fillStyle = p.life > 0.5 ? '#ffcf6e' : '#ff6a2a';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function sceneForestLive(W, H) {
    const mx = W * 0.78, my = H * 0.16;
    const mg = ctx.createRadialGradient(mx, my, 6, mx, my, 150);
    mg.addColorStop(0, 'rgba(235,244,255,0.36)'); mg.addColorStop(0.16, 'rgba(222,232,252,0.16)'); mg.addColorStop(1, 'rgba(222,232,252,0)');
    ctx.fillStyle = mg; ctx.fillRect(mx - 155, my - 155, 310, 310);
    drawMoonPhase(ctx, mx, my, 33);
    ctx.fillStyle = 'rgba(190,215,240,0.05)';
    for (let i = 0; i < 3; i++) {
      const fy = H * (0.55 + i * 0.13) + Math.sin(t * 0.24 + i * 2.1) * 9;
      const fx = ((t * 15 * (i + 1)) % (W * 2.4)) - W * 0.7;
      ctx.fillRect(fx, fy, W * 1.28, 24);
    }
    const F = sceneFx.ffly || (sceneFx.ffly = (() => { const arr = []; for (let i = 0; i < 14; i++) arr.push({ x: Math.random() * W, y: 0, ph: Math.random() * 7, t: Math.random() * 10, base: 0 }); return arr; })());
    for (const f of F) {
      f.t += 0.016; if (f.y === 0) f.base = H * (0.62 + Math.random() * 0.3);
      const y = f.base + Math.sin(f.t * 0.8 + f.ph) * 8;
      f.y = y;
      const a = 0.26 + 0.6 * (0.5 + 0.5 * Math.sin(f.t * 2.1 + f.ph));
      ctx.globalAlpha = a; ctx.fillStyle = '#d8ff9a';
      ctx.beginPath(); ctx.arc(f.x + Math.sin(f.t * 0.6 + f.ph) * 10, y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function sceneDesertLive(W, H) {
    ctx.strokeStyle = 'rgba(255,224,188,0.13)'; ctx.lineWidth = 1.35;
    for (let i = 0; i < 3; i++) {
      const y = H * (0.67 + i * 0.05);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) { const yy = y + Math.sin(x * 0.03 + t * 5 + i) * 1.7; ctx.moveTo(x, yy); ctx.lineTo(x + 9, yy); }
      ctx.stroke();
    }
    const T = sceneFx;
    if (!T.tumble && Date.now() > T.nextTumbleAt) T.tumble = { x: -30, y: H * 0.935 + rand(-7, 7), r: 13 + Math.random() * 8, spin: 0 };
    if (T.tumble) {
      const w = T.tumble; w.x += 2.6; w.spin += 0.075;
      ctx.strokeStyle = 'rgba(66,44,24,0.9)'; ctx.lineWidth = 1.6;
      ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.spin);
      for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(0, 0, w.r * (0.38 + k * 0.095), k * 1.3, k * 1.3 + 2.2); ctx.stroke(); }
      ctx.restore();
      if (w.x > W + 46) { T.tumble = null; T.nextTumbleAt = Date.now() + 12000 + Math.random() * 16000; }
    }
  }
  function sceneObservatoryLive(W, H) {
    const ww = Math.min(600, W * 0.52), wh = Math.min(400, H * 0.48);
    const wx0 = W / 2 - ww / 2, wy0 = H * 0.15;
    // the telescope cat: hidden kitty loafed at the floor, left of the telescope
    const lapX = W * 0.24, lapY = H * 0.875;
    obsKitty.x = lapX; obsKitty.y = lapY;
    const happy = Date.now() < (obsKitty.happyUntil || 0);
    ctx.fillStyle = '#04070d';
    const breathe = 1 + Math.sin(t * 1.7) * 0.022;
    ctx.beginPath(); ctx.ellipse(lapX, lapY - 7, 21 * breathe, 8.6 * breathe, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(lapX + 13.5, lapY - 11.5, 6.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(lapX + 9.6, lapY - 16.2); ctx.lineTo(lapX + 10.6, lapY - 20.3); ctx.lineTo(lapX + 13.4, lapY - 16.8);
    ctx.moveTo(lapX + 15, lapY - 16.8); ctx.lineTo(lapX + 17.4, lapY - 20.3); ctx.lineTo(lapX + 19, lapY - 16.3);
    ctx.fill();
    ctx.strokeStyle = '#04070d'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    const wag = happy ? Math.sin(t * 7.2) * 2.8 : Math.sin(t * 0.9) * 1.1;
    ctx.beginPath(); ctx.moveTo(lapX - 19, lapY - 6); ctx.quadraticCurveTo(lapX - 26, lapY - 5 + wag, lapX - 27.5, lapY - 11 + wag); ctx.stroke();
    // sleeping-cat eyes (or happy closed eyes when petted)
    ctx.strokeStyle = happy ? '#ff9ad4' : '#ffd87a'; ctx.lineWidth = 1.25;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(lapX + 15.4, lapY - 11.4, 1.35, happy ? Math.PI * 1.15 : 0.15, happy ? Math.PI * 1.85 : Math.PI - 0.15); ctx.stroke();
    ctx.globalAlpha = 1;
    if (happy) { ctx.globalAlpha = 0.16; ctx.fillStyle = '#ff9ad4'; ctx.beginPath(); ctx.ellipse(lapX, lapY - 8, 27, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    // moon with real phase, upper right of the window
    const mx = wx0 + ww * 0.74, my = wy0 + wh * 0.26;
    const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 62);
    mg.addColorStop(0, 'rgba(226,222,198,0.4)'); mg.addColorStop(1, 'rgba(226,222,198,0)');
    ctx.fillStyle = mg; ctx.fillRect(mx - 70, my - 70, 140, 140);
    drawMoonPhase(ctx, mx, my, 19);
    const S = sceneFx.obsStars || (sceneFx.obsStars = (() => { const r0 = srand(314); const arr = []; for (let i = 0; i < 26; i++) arr.push({ x: wx0 + r0() * ww, y: wy0 + r0() * wh * 0.72, ph: r0() * 7 }); return arr; })());
    for (const s of S) {
      const a = 0.28 + 0.64 * (0.5 + 0.5 * Math.sin(t * 2.3 + s.ph));
      ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x, s.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    const M = sceneFx;
    if (!M.meteor && Date.now() > M.nextMeteorAt) M.meteor = { x: wx0 + Math.random() * ww * 0.42, y: wy0 + Math.random() * wh * 0.28, vx: 7 + Math.random() * 4.5, vy: 2.8 + Math.random() * 1.8, life: 1 };
    if (M.meteor) {
      const m = M.meteor; m.x += m.vx; m.y += m.vy; m.life -= 0.03;
      ctx.globalAlpha = Math.max(0, m.life); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 3.6, m.y - m.vy * 3.6); ctx.stroke();
      ctx.globalAlpha = 1;
      if (m.life <= 0 || m.x > wx0 + ww + 60) { M.meteor = null; M.nextMeteorAt = Date.now() + 9000 + Math.random() * 14000; }
    }
    // banker lamp glow, bottom right
    const flick = 0.17 + 0.05 * Math.sin(t * 4.7) + 0.03 * Math.sin(t * 9.3 + 2);
    const lg = ctx.createRadialGradient(W - 95, H - 72, 6, W - 95, H - 72, 165);
    lg.addColorStop(0, 'rgba(255,196,96,' + flick.toFixed(3) + ')');
    lg.addColorStop(1, 'rgba(255,196,96,0)');
    ctx.fillStyle = lg; ctx.fillRect(W - 330, H - 330, 330, 330);
  }
  function sceneY2kLive(W, H) {
    const horizon = H * 0.64;
    const pulse = 0.42 + 0.3 * Math.sin(t * 1.7);
    const g = ctx.createLinearGradient(0, horizon - 15, 0, horizon + 15);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + pulse.toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, horizon - 15, W, 30);
    const glints = sceneFx.y2kGlints || (sceneFx.y2kGlints = (() => { const arr = []; for (let i = 0; i < 12; i++) arr.push({ x: Math.random(), y: Math.random() * 0.62, ph: Math.random() * 7 }); return arr; })());
    for (const gl of glints) { const a = 0.22 + 0.62 * (0.5 + 0.5 * Math.sin(t * 3.1 + gl.ph)); ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.fillRect(gl.x * W, gl.y * H, 2.3, 2.3); }
    ctx.globalAlpha = 1;
  }

  function drawScene(dt, now) {
    if (scene === 'none') return;
    const W = cvFront.width, H = cvFront.height;
    ctx = CTX_BACK;
    sceneCacheEnsure(W, H);
    if (sceneCache) ctx.drawImage(sceneCache, 0, 0);
    if (scene === 'fireplace') sceneFireplaceLive(W, H);
    else if (scene === 'underwater') sceneUnderwaterLive(W, H);
    else if (scene === 'volcano') sceneVolcanoLive(W, H);
    else if (scene === 'forest') sceneForestLive(W, H);
    else if (scene === 'desert') sceneDesertLive(W, H);
    else if (scene === 'observatory') sceneObservatoryLive(W, H);
    else if (scene === 'synthwave') sceneSynthwaveLive(W, H);
    else if (scene === 'matrix') sceneMatrixLive(W, H);
    else if (scene === 'bliss') sceneBlissLive(W, H);
    else if (scene === 'happy') sceneHappyLive(W, H);
    else if (scene === 'excited') sceneExcitedLive(W, H);
    else if (scene === 'cabin') sceneCabinLive(W, H);
    else if (scene === 'lavara') sceneLavaLampLive(W, H);
    else if (scene === 'train') sceneTrainLive(W, H);
    else if (scene === 'y2k') sceneY2kLive(W, H);
    else if (scene === 'noir') sceneNoirLive(W, H);
    else if (scene === 'library') sceneLibraryLive(W, H);
  }


  // ---------------------------------------------------------- effects master switch
  let effectsVisible = store.get('effects', true);
  function applyEffects(v) {
    effectsVisible = v;
    cvFront.style.display = v ? '' : 'none';
    cvBack.style.display = v ? '' : 'none';
  }
  const theaterBtn = settingsBar.querySelector('#mb-btn-theater');
  theaterBtn.addEventListener('click', () => {
    effectsVisible = !effectsVisible;
    store.set('effects', effectsVisible);
    applyEffects(effectsVisible);
    syncSettingsUI();
  });
  applyEffects(effectsVisible);

  // on-top master toggle: same as the popup's "All effects draw on top" checkbox
  const onTopBtn = settingsBar.querySelector('#mb-btn-ontop');
  const allTopNow = () => Object.keys(EGGS_TOP).every(k => eggTop[k] !== false);
  function syncOnTopBtn() {
    onTopBtn.textContent = allTopNow() ? '▲' : '▽';
    onTopBtn.title = allTopNow()
      ? 'everything draws on top (click to put behind UI)'
      : 'everything draws behind UI (click to put on top)';
  }
  onTopBtn.addEventListener('click', () => {
    const v = !allTopNow();
    Object.keys(EGGS_TOP).forEach(k => { eggTop[k] = v; });
    saveEggs();
    syncEggCheckboxes();
    syncOnTopBtn();
  });
  syncOnTopBtn();
  document.body.appendChild(settingsBar);
  function syncSettingsUI() {
    syncEggCheckboxes && syncEggCheckboxes();
    el('mb-btn-music').textContent = musicOn ? '🎵' : '🔇';
    el('mb-btn-speed').textContent = speed >= 10 ? '10x' : '1x';
    el('mb-btn-theater').textContent = effectsVisible ? '🎭' : '🫥';
    syncOnTopBtn();
    const FESTIVE_ICON = { none: '⬜', christmas: '🎄', halloween: '🎃', newyear: '🎇' };
    const FESTIVE_TITLE = { none: 'festive — off', christmas: 'festive — 🎄 christmas', halloween: 'festive — 🎃 halloween', newyear: 'festive — 🎇 new year' };
    const festIcon = FESTIVE_ICON[festive] || '⬜';
    el('mb-btn-festive').textContent = festIcon;
    el('mb-btn-festive').title = (FESTIVE_TITLE[festive] || FESTIVE_TITLE.none) + ' — click to cycle';
    const themeBtn = document.getElementById('mb-btn-theme');
    if (themeBtn) { const cur = (store.get('theme', 'sky')) || 'sky'; themeBtn.textContent = THEME_ICON[cur] || themeBtn.textContent; themeBtn.title = THEME_TITLE[cur] + ' — click to cycle'; }
    const sceneBtn = document.getElementById('mb-btn-scene');
    if (sceneBtn) {
      const cur = (store.get('scene', 'none')) || 'none';
      sceneBtn.textContent = (SCENE[cur] || SCENE.none).split(' ')[0];
      sceneBtn.title = (SCENE[cur] || SCENE.none) + ' — click to cycle';
    }
    el('mb-btn-theater').title = effectsVisible ? 'hide all characters & effects' : 'show all characters & effects';
  }
  document.getElementById('mb-btn-music').addEventListener('click', toggleMusic);
  document.getElementById('mb-btn-speed').addEventListener('click', toggleSpeed);
  document.getElementById('mb-btn-scene').addEventListener('click', () => {
    const cur = (store.get('scene', 'none')) || 'none';
    const idx = SCENE_ORDER.indexOf(cur);
    const next = SCENE_ORDER[(idx + 1) % SCENE_ORDER.length];
    setScene(next);
  });
  document.getElementById('mb-btn-theme').addEventListener('click', () => {
    const cur = store.get('theme', 'sky') || 'sky';
    const idx = THEME_ORDER.indexOf(cur);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    applyTheme(next);
    say('theme: ' + (THEME_TITLE[next] || next));
  });
  document.getElementById('mb-btn-config').addEventListener('click', openEggPanel);
  document.getElementById('mb-btn-festive').addEventListener('click', () => {
    const order = ['none', 'christmas', 'halloween', 'newyear'];
    festive = order[(order.indexOf(festive) + 1) % order.length];
    store.set('festive', festive);
    syncSettingsUI();
    say(festive === 'none' ? 'festive mode off' : festive === 'christmas' ? '🎄 Merry Christm’as mode' : festive === 'halloween' ? '🎃 spooky season' : '🎇 sparkle mode armed');
  });
  // restore persisted theme on load
  // ---------------------------------------------------------- scene of the day (opt-in)
  function applySceneOfDayIfEnabled(force) {
    if (!store.get('sceneOfDay', false)) return;
    const stamp = new Date().toDateString();
    if (!force && store.get('sceneOfDayApplied', '') === stamp) return;
    const seed = Math.abs(Math.sin(new Date().getTime() / 86400000));
    const pickables = SCENE_ORDER.filter(s => s !== 'none');
    const daily = pickables[Math.floor(seed * pickables.length) % pickables.length];
    store.set('sceneOfDayApplied', stamp);
    setScene(daily, true);
  }
  applySceneOfDayIfEnabled(false);

  const savedTheme = store.get('theme', 'sky') || 'sky';
  if (THEMES[savedTheme]) applyTheme(savedTheme); else syncSettingsUI();
  syncScenesUI();

  // ---------------------------------------------------------- console egg
  console.log('%c⚡ SPARK · MODEL BAY %c— zero clouds were consulted in the operation of this GPU', 'color:#b08cff;font-size:16px;font-weight:700', 'color:#8b98b4');
  console.log('%cpsst… a certain key sequence ↑↑↓↓←→←→BA awakens the stars. Twice for the portal.', 'color:#566284');

  // ---------------------------------------------------------- main loop
  let t = 0, lastTs = performance.now();
  let frameFailures = 0;
  function frame(ts) {
    if (ts === undefined) ts = lastTs;
    const dt = Math.min(.05, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts;
    const now = Date.now();

    // Each stage of the frame runs in its own try/catch, so one broken egg can
    // never stop the others. No host page is ever reloaded from here.
    const safe = (label, fn) => {
      try { fn(); } catch (err) {
        frameFailures++;
        if (frameFailures <= 3) console.warn('[eggs] ' + label + ' errored (other eggs keep running):', err);
      }
    };

    if (!effectsVisible) { requestAnimationFrame(frame); return; }
    safe('state', () => {
      const hyper = Date.now() < hyperUntil;
      const gpuF = ((window.__gpu || 0) / 100);
      t += (0.008 + gpuF * 0.05) * (hyper ? 3.2 : 1);
    });

    try { CTX_FRONT.clearRect(0, 0, cvFront.width, cvFront.height); } catch (e) {}
    try { CTX_BACK.clearRect(0, 0, cvBack.width, cvBack.height); } catch (e) {}

    safe('scene', () => drawScene(dt, now));

    safe('skyline', () => {
      ctx = layerOf('skyline');
      if (!eggOn('skyline') || scene !== 'none') return;
      ctx.save();
      const baseY = cvFront.height;
      if (!skyline.dark && Math.random() < 0.0008) skyline.dark = { idx: Math.floor(Math.random() * skyline.buildings.length), until: performance.now() + 15000 };
      if (skyline.dark && performance.now() > skyline.dark.until) skyline.dark = null;
      for (let bi = 0; bi < skyline.buildings.length; bi++) {
        const b = skyline.buildings[bi];
        const isDark = skyline.dark && skyline.dark.idx === bi;
        for (const w of b.windows) {
          if (Math.random() < 0.00028) {
            w.on = !w.on;
            const nbr = b.windows.find(o => o !== w && Math.abs(o.dx - w.dx) < 14 && Math.abs(o.dy - w.dy) < 5);
            if (nbr && Math.random() < 0.7) nbr.on = w.on;
          }
        }
        ctx.fillStyle = '#060a14';
        ctx.fillRect(b.x, baseY - b.h, b.w, b.h + 1);
        for (const w of b.windows) {
          if (!w.on || isDark) continue;
          const flick = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.7 + w.phase));
          const warmShift = Math.sin(t * 0.35 + w.phase * 2.7) > 0.3;
          ctx.globalAlpha = flick * 0.9;
          ctx.fillStyle = (w.warm !== warmShift) ? '#ffd880' : '#9cd4ff';
          ctx.fillRect(b.x + w.dx, baseY - b.h + w.dy, 5, 4);
          ctx.globalAlpha = 1;
        }
      }
      // the skyline cat: a silhouette sometimes sits on a rooftop, blinking
      const catNow = Date.now();
      if (skylineCat.until === 0 && catNow > skylineCat.nextAt) { skylineCat.until = catNow + 15000 + Math.random() * 12000; skylineCat.idx = Math.floor(Math.random() * skyline.buildings.length); }
      if (skylineCat.until > 0) {
        if (catNow > skylineCat.until) { skylineCat.until = 0; skylineCat.nextAt = catNow + 90000 + Math.random() * 160000; }
        else {
          const b = skyline.buildings[skylineCat.idx];
          const cx = b.x + b.w * 0.5, cy = baseY - b.h;
          ctx.fillStyle = '#04060b';
          ctx.beginPath(); ctx.ellipse(cx, cy - 4, 8, 4.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 6.4, cy - 6.8, 3.1, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx + 4.6, cy - 8.9); ctx.lineTo(cx + 5.4, cy - 12.1); ctx.lineTo(cx + 7, cy - 9);
          ctx.moveTo(cx + 7.7, cy - 9); ctx.lineTo(cx + 9.2, cy - 12.1); ctx.lineTo(cx + 10.3, cy - 8.9);
          ctx.fill();
          ctx.strokeStyle = '#04060b'; ctx.lineWidth = 2.1; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx - 6.8, cy - 4.4); ctx.quadraticCurveTo(cx - 12.5, cy - 6.6 - Math.sin(t * 1.7) * 2, cx - 13.2, cy - 10.5 - Math.cos(t * 1.7) * 2.4); ctx.stroke();
          const blink = Math.sin(t * 1.9 + skylineCat.idx) > 0.93 ? 0.16 : 1;
          ctx.fillStyle = '#ffd87a'; ctx.globalAlpha = 0.88 * blink;
          ctx.fillRect(cx + 5.9, cy - 7.6, 1.05, 1.5); ctx.fillRect(cx + 8.1, cy - 7.6, 1.05, 1.5);
          ctx.globalAlpha = 1;
        }
      }
      const beacon = skyline.buildings[skyline.beaconIdx];
      if (beacon) {
        const bx = beacon.x + beacon.w / 2, by = baseY - beacon.h;
        const blink = (Math.sin((ts || 0) * 0.006) > 0);
        if (blink) {
          ctx.save(); ctx.shadowColor = '#ff5a5a'; ctx.shadowBlur = 10;
          ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(bx, by - 2, 2.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
      ctx.restore();
    });

    safe('horizonGlow', () => {
      if (scene !== 'none') return;
      const nowDate = new Date();
      const hour = nowDate.getHours() + nowDate.getMinutes() / 60 + nowDate.getSeconds() / 3600;
      const st = sunTimes(nowDate);
      let sunGlow = 0;
      if (hour > st.sunrise - 1.25 && hour < st.sunrise + 1.25) sunGlow = Math.max(0, 1 - Math.abs(hour - st.sunrise) / 1.25);
      else if (hour > st.sunset - 1.25 && hour < st.sunset + 1.25) sunGlow = Math.max(0, 1 - Math.abs(hour - st.sunset) / 1.25);
      if (sunGlow > 0.02) {
        ctx = CTX_BACK;
        const g = ctx.createLinearGradient(0, cvFront.height * 0.55, 0, cvFront.height);
        g.addColorStop(0, 'rgba(255,180,130,0)');
        g.addColorStop(1, 'rgba(255,120,80,' + (0.28 * sunGlow) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, cvFront.height * 0.5, cvFront.width, cvFront.height * 0.5);
      }
    });

    safe('starfield', () => {
      ctx = layerOf('starfield');
      if (!eggOn('starfield') || scene !== 'none') { ctx.globalAlpha = 1; return; }
      const hyper = Date.now() < hyperUntil;
      for (const st of stars) {
        st.y += st.sp / 600 * (hyper ? 6 : 1);
        st.x += Math.sin(t + st.tw) * 0.00018;
        if (st.y > 1.02) { st.y = -0.02; st.x = Math.random(); }
        const a = 0.14 + 0.36 * (0.5 + 0.5 * Math.sin(t * 2 + st.tw));
        ctx.beginPath();
        ctx.fillStyle = hyper ? 'hsla(' + st.hue + ',90%,72%,' + (a + .15) + ')' : st.col;
        ctx.globalAlpha = hyper ? 1 : a;
        ctx.arc(st.x * cvFront.width, st.y * cvFront.height, st.r * (hyper ? 1.4 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    safe('events', () => updateEvents(dt, now));

    safe('flyersSpawn', () => {
      lastFlyer += dt * 1000;
      if (eggOn('flyers') && lastFlyer > flyerInterval()) { spawnFlyer(); lastFlyer = 0; }
    });

    safe('flyerDraw', () => {
      ctx = layerOf('flyers');
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.t += dt; f.x += f.vx;
        if (f.rot !== undefined) f.rot += f.vr;
        drawFlyer(f);
        if ((f.dir > 0 && f.x > cvFront.width + 90) || (f.dir < 0 && f.x < -90)) flyers.splice(i, 1);
      }
    });

    safe('particles', () => {
      ctx = layerOf('trail');
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += .09; p.life -= .022;
        if (p.life <= 0) p.life = 0;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.hue;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    frameFailures = 0;
    requestAnimationFrame(frame);
  }
  if (!reduced) requestAnimationFrame(frame);

  // ---------------------------------------------------------- pointer interactions
  // Clicks/drag on empty sky: drag = star-dust trail, click near a UFO = dodge,
  // near a whale = graze, on a comet = wish. Buttons/inputs are left alone.
  let drag = null;
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('button, a, input, select, textarea, #modelbay-settings')) return;
    const x = e.clientX, y = e.clientY;
    drag = { x, y };
    for (const f of flyers) {
      if (f.kind === 'ufo' || f.kind === 'mothership') {
        const dx = x - f.x, dy = y - f.y;
        if (Math.abs(dx) < 80 && Math.abs(dy) < 55) { dodge(f); return; }
      } else if (f.kind === 'comet') {
        const dx = x - f.x, dy = y - f.y;
        if (Math.abs(dx) < 60 && Math.abs(dy) < 60) { wish(); return; }
      }
    }
    if (whale) {
      const dx = x - whale.x, dy = y - whale.y;
      if (Math.abs(dx) < 80 && Math.abs(dy) < 45) graze(whale);
    }
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (eggOn('trail') && Math.random() < .55) particles.push({ x: e.clientX, y: e.clientY, vx: rand(-1.2, 1.2), vy: rand(-1.2, .6), r: rand(.8, 2.4), life: .7 + Math.random() * .5, hue: pick(['#ffd479', '#fff3b0', '#e2b3ff', '#9fd0ff']) });
  });
  document.addEventListener('pointerup', () => { drag = null; });

  // ---------------------------------------------------------- hook: spark burst
  const zapbtn = document.getElementById('zapbtn');
  if (zapbtn) zapbtn.addEventListener('click', e => {
    const rect = zapbtn.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.4; particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, r: 1 + Math.random() * 1.8, life: .9 + Math.random() * .6, hue: pick(['#ffd479', '#fff3b0', '#e2b3ff', '#9fd0ff']) }); }
    chime();
    say('⚡ zap!');
  });

  // ---------------------------------------------------------- API
  function purr() {
    if (!sfxOn) return; ensureCtx(); if (!actx) return;
    const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 22;
    const lfo = actx.createOscillator(); lfo.frequency.value = 11;
    const lg = actx.createGain(); lg.gain.value = 11;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = actx.createGain();
    o.connect(g); g.connect(master);
    const t0 = actx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.085, t0 + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
    o.start(t0); o.stop(t0 + 1.1); lfo.start(t0); lfo.stop(t0 + 1.1);
  }
  function petTelescopeKitty() {
    obsKitty.happyUntil = Date.now() + 2600;
    quip('kitty');
    purr();
    for (let i = 0; i < 10; i++) {
      particles.push({ x: obsKitty.x + (Math.random() - 0.5) * 40, y: obsKitty.y - 12, vx: (Math.random() - 0.5) * 1.6, vy: -0.6 - Math.random() * 1.4, life: 1, hue: '#ffb3d9', r: 1.4 + Math.random() * 1.6 });
    }
  }
  document.addEventListener('click', (e) => {
    if (scene !== 'observatory' || obsKitty.x < 0) return;
    const dx = e.clientX - obsKitty.x, dy = e.clientY - obsKitty.y;
    if (dx * dx + dy * dy < 30 * 30) petTelescopeKitty();
  });

  window.ModelBayEggs = {
    chime,
    setGPU(v) { window.__gpu = clamp(v | 0, 0, 100); },
    spawnFlyer, triggerAbduction, triggerWhale, triggerEyes, triggerShower, triggerISS,
    triggerMoon, triggerAurora, triggerTrain, triggerAstronaut, triggerPortal, triggerRain,
    triggerFireworks() { nextFireworkAt = 0; }, triggerEagle() { nextEagleAt = 0; }, triggerBalloon() { nextBalloonAt = 0; }, triggerLightning() { nextLightningAt = 0; }, triggerGopher() { gopher.state = 'surfacing'; gopher.x = cvFront.width * rand(0.15, 0.85); gopher.t = 0; }, triggerComet() { nextCometAt = 0; },
    triggerFireflies() { for (let i = 0; i < 8; i++) fireflies.push({ x: Math.random() * cvFront.width, y: cvFront.height * rand(0.5, 0.92), t: Math.random() * 10, phase: Math.random() * 6.28, drift: rand(0.2, 0.7) }); },
    triggerRocket() { nextRocketAt = 0; }, triggerRainbow() { nextRainbowAt = 0; }, triggerPaperPlane() { nextPlaneAt = 0; }, triggerTrain() { nextTrainPassAt = 0; }, triggerAsteroids() { nextAsteroidAt = 0; }, triggerBatSwarm() { nextBatSwarmAt = 0; }, triggerTrainPass() { nextTrainPassAt = 0; },
    triggerPumpkin() { if (!pumpkin) pumpkin = { x: cvFront.width * rand(0.15, 0.85), t: 0, life: 26 }; },
    wish, toggleMusic, toggleSpeed, openSettings: openEggPanel, get festive() { return festive; }, setFestive(m) { festive = m || 'none'; store.set('festive', festive); syncSettingsUI(); }, hyperspace() { hyperUntil = Date.now() + 20000; say('✦✦ STAR DRIVE ENGAGED'); chime(); },
    get musicOn() { return musicOn; }, get speed() { return speed; },
    get scene() { return scene; }, setScene(name) { setScene(String(name || '')); },
  };
})();
