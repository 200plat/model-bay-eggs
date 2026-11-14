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
    all: { on: Object.fromEntries(Object.keys(EGGS_TOGGLE).map(k => [k, 1])), top: {trail: 1}, festive: 'newyear' },
  };
  // ---------------------------------------------------------- preview renderers
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
  function drawPreviewFrame() {
    if (previewKey && previewsRef && previewsRef[previewKey]) {
      const p = previewsRef[previewKey];
      drawEggPreview(previewKey, p.ctx, p.w, p.h, performance.now() / 1000);
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
          <div class="mbp-body" id="mbp-grid"></div>
          <div class="mbp-legend">▲ = draws on top of UI  ·  ▽ = behind UI&nbsp;&nbsp;·&nbsp;&nbsp;<button id="mbp-portal" style="cursor:pointer;background:#1a2338;border:1px solid #223049;color:#cdd6ec;border-radius:.4rem;padding:.1rem .55rem;font-size:.75rem;vertical-align:middle">🌀 portal</button></div>
          <div class="mbp-foot">
            <label class="mbp-check"><input type="checkbox" id="mbp-ontop-all"> <span>All effects draw <b>on top</b> of UI</span></label>
            <label class="mbp-check"><input type="checkbox" id="mbp-enable-all" checked> <span><b>Enable all</b> effects</span></label>
            <div class="mbp-row"><button id="mbp-reset">reset defaults</button></div>
          </div>
        </div>`;
      modal.style.cssText = 'position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(4,8,18,.55);backdrop-filter:blur(4px)';
      modal.querySelector('.mbp-card').style.cssText = 'background:#131a28;border:1px solid #223049;border-radius:1rem;min-width:420px;max-width:780px;max-height:86vh;overflow:auto;box-shadow:0 10px 60px rgba(0,0,0,.6);color:#e8ecf4;font-family:ui-sans-serif,system-ui,sans-serif';
      modal.querySelector('.mbp-head').style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:.8rem 1rem;border-bottom:1px solid #223049;font-weight:700;letter-spacing:.02em;position:sticky;top:0;background:#131a28;z-index:1';
      modal.querySelector('.mbp-head button').style.cssText = 'cursor:pointer;background:none;border:none;color:#8b98b4;font-size:1.1rem';
      modal.querySelector('.mbp-body').style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:.4rem .6rem;padding:.9rem 1rem';
      modal.querySelector('.mbp-themes').style.cssText = 'display:flex;flex-wrap:wrap;gap:.35rem;padding:.7rem 1rem;border-bottom:1px solid #223049';
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
  function closeEggPanel() { const m = document.getElementById('modelbay-eggpanel'); if (m) m.style.display = 'none'; previewKey = null; if (previewRaf) cancelAnimationFrame(previewRaf); }

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

  function drawCow(x, y, ang, p, kick) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1.35, 1.35);
    const glow = Math.min(1, p * 1.4), a = 0.55 + glow * 0.4;
    ctx.strokeStyle = 'rgba(228,255,244,' + a + ')'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const lx = -9 + i * 6, swing = Math.sin(kick + i * 1.7) * (4 + Math.sin(kick * 2) * 1.5); ctx.beginPath(); ctx.moveTo(lx, 5); ctx.lineTo(lx + swing, 13); ctx.stroke(); }
    ctx.fillStyle = 'rgba(228,255,244,' + a + ')';
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 6.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10.5, -3.4, 4.6, 3.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8.6, -6.2); ctx.lineTo(7.4, -9.6); ctx.moveTo(12.3, -6.7); ctx.lineTo(13.6, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10.5, -1); ctx.quadraticCurveTo(-15, 3 + Math.sin(kick * 2) * 2.4, -13, 8.5); ctx.stroke();
    ctx.restore();
  }

  function updateEvents(dt, now) {
    // fireflies
    if (eggOn('fireflies')) {
      ctx = CTX_FRONT;
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
      ctx = CTX_FRONT;
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
      ctx = CTX_FRONT;
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
    // festive: halloween (bats + boo)
    if (festive === 'halloween' && eggOn('bats')) {
      ctx = CTX_FRONT;
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
    if (moon) { moon.t += dt; const a = Math.min(1, moon.t / 3) * Math.min(1, (moon.life - moon.t) / 3); ctx.save(); ctx.globalAlpha = a * .9; const g = ctx.createRadialGradient(cvFront.width - 130, cvFront.height * .16, 0, cvFront.width - 130, cvFront.height * .16, 60); g.addColorStop(0, '#fdf6d8'); g.addColorStop(.45, '#e8e0b8'); g.addColorStop(1, 'rgba(232,224,184,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cvFront.width - 130, cvFront.height * .16, 44, 0, Math.PI * 2); ctx.fill(); ctx.restore(); if (moon.t > moon.life) moon = null; }
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
    if (eggOn('cow')) { cowWanderer.t += dt; cowWanderer.x += cowWanderer.dir * 22 * dt; } if (cowWanderer.x > cvFront.width * .8 && cowWanderer.dir > 0) cowWanderer.dir = -1; if (cowWanderer.x < cvFront.width * .1 && cowWanderer.dir < 0) cowWanderer.dir = 1; drawCow(cowWanderer.x, cvFront.height * .92, 0, 1, cowWanderer.t * 1.6);
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
    <button type="button" id="mb-btn-eye" title="hide the other toolbar icons (animations keep running)">👁</button>
    <button type="button" id="mb-btn-music" title="toggle ambient music">🎵</button>
    <button type="button" id="mb-btn-speed" title="warp speed: 1x / 10x event rate">1x</button>
    <button type="button" id="mb-btn-theme" title="egg theme">⬜</button>
    <button type="button" id="mb-btn-theater" title="hide all characters and effects (animations pause invisibly)">🎭</button>
    <button type="button" id="mb-btn-ontop" title="toggle all effects on top of UI / behind UI">▽</button>
    <button type="button" id="mb-btn-festive" title="festive — off — click to cycle">⬜</button>
    <button type="button" id="mb-btn-config" title="easter egg settings — toggle each event">⚙️</button>`;
  settingsBar.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:10;display:flex;gap:.35rem;transition:gap .25s';
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
    el('mb-btn-theater').title = effectsVisible ? 'hide all characters & effects' : 'show all characters & effects';
  }
  document.getElementById('mb-btn-music').addEventListener('click', toggleMusic);
  document.getElementById('mb-btn-speed').addEventListener('click', toggleSpeed);
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
  const savedTheme = store.get('theme', 'sky') || 'sky';
  if (THEMES[savedTheme]) applyTheme(savedTheme); else syncSettingsUI();

  // ---------------------------------------------------------- console egg
  console.log('%c⚡ SPARK · MODEL BAY %c— zero clouds were consulted in the operation of this GPU', 'color:#b08cff;font-size:16px;font-weight:700', 'color:#8b98b4');
  console.log('%cpsst… a certain key sequence ↑↑↓↓←→←→BA awakens the stars. Twice for the portal.', 'color:#566284');

  // ---------------------------------------------------------- main loop
  let t = 0, lastTs = performance.now();
  let frameFailures = 0;
  function frame(ts) {
    if (ts === undefined) ts = lastTs;
    const dt = Math.min(.05, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts;

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

    safe('skyline', () => {
      ctx = CTX_BACK;
      if (!eggOn('skyline')) return;
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
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;
      let sunGlow = 0;
      if (hour > 4.5 && hour < 8.5) sunGlow = Math.max(0, 1 - Math.abs(hour - 6.5) / 2);
      else if (hour > 16.5 && hour < 21) sunGlow = Math.max(0, 1 - Math.abs(hour - 18.75) / 2.25);
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
      if (!eggOn('starfield')) { ctx.globalAlpha = 1; return; }
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

    safe('events', () => updateEvents(dt, Date.now()));

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
      ctx = CTX_FRONT;
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
  };
})();
