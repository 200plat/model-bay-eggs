# Model Bay — Easter Eggs

A zero-dependency canvas + Web Audio easter-egg layer for any HTML page.

Drop in:
```html
<script src="easter-eggs.js"></script>
```

Everything happens with no HTML/CSS requirements: fixed canvas behind/on top, auto-created toolbar bottom-left, auto-created canvas top-right, twinkling stars, flyers, sky events, sounds.

## Files

- `easter-eggs.js` — the whole library
- `bare.html` — truly minimal page that includes only eggs.js (open in browser to watch "nothing" happen)
- `demo.html` — a settings/museum page with one button per egg

## Public API (`window.ModelBayEggs`)

```js
ModelBayEggs.setGPU(0..100);        // fake load → stars speed up
ModelBayEggs.hyperspace();          // Star Drive rainbow for 20s
ModelBayEggs.toggleMusic();         // mute / unmute
ModelBayEggs.toggleSpeed();         // 1x ↔ 10x event rate
ModelBayEggs.openSettings();        // open egg panel
ModelBayEggs.festive();             // returns 'none' | 'christmas' | 'halloween' | 'newyear'
ModelBayEggs.setFestive(mode);      // set festive mode
ModelBayEggs.triggerAbduction / triggerWhale / triggerComet / triggerRocket / triggerRainbow /
ModelBayEggs.triggerFireworks / triggerGopher / triggerBalloon / triggerLightning /
ModelBayEggs.triggerTrain / triggerTrainPass / triggerEyes / triggerShower / triggerISS /
ModelBayEggs.triggerMoon / triggerAurora / triggerTrain / triggerAstronaut / triggerPortal /
ModelBayEggs.triggerRain / triggerPumpkin / triggerPaperPlane / triggerAsteroids / triggerBatSwarm /
ModelBayEggs.triggerComet / triggerFireflies / (and more)
```

## Controls on page load

- **Konami code** `↑↑↓↓←→←→BA` → 20s Star Drive; twice within 5s → Portal
- **Bottom-left toolbar**: 👁 show/hide icons · 🔇 music · 1x/10x warp · theme cycle · 🎭 hide/show all effects · ▲▽ on-top/behind · 🎄 festive · ⚙️ settings panel
- **⚙️ settings panel**: preset themes (minimal, sky life, ground life, spooky, festive, nature, everything) + per-egg toggle + ▲/▽ layer button + animated previews per row

## Notes

- `prefers-reduced-motion` disables animation
- `localStorage` keys: `modelbay:*` (plain key: value strings)
- Audio is muted until first user gesture; master volume is deliberately low (0.055)
- No dependencies, no build step, no images
