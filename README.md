# Whimsical SF

A browser-playable arcade racer through a wonderfully impossible San Francisco. Three enormous hills launch a coral coupe into the sky; its wheels fold into hover pods, then return for landing.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/. Use **Take Flight** to race or **Watch a Run** for an automatic demonstration. The demo follows the real driving simulation and avoids obstacles. Landmark buttons jump between sections; drag the city to look around.

## Controls

- W / Up: accelerate
- A, D / Left, Right: steer on the street and in the sky
- S / Down: brake; dive in flight
- Shift: boost; gain lift in flight
- Space: drift
- C: change chase camera
- R: restart
- Escape: pause
- M: mute

Hover deploys automatically at a launch above 54 mph. Collect gold sun rings for boost. Touch and standard gamepad controls are supported. How to Play includes auto-accelerate, three graphics settings, fullscreen and best-time reset.

## Course

The 1.3 km Powell Skyway runs from Nob Hill through Union Square to Market. Its three aerial sections, tall narrow Victorian towers, rooftops, and landmark arrangement are deliberate fantasy. The route preserves SF character rather than literal cartography.

## Stack and assets

TypeScript, Three.js, Vite, deterministic custom arcade driving and Web Audio. No backend or paid service is needed. Geometry, labels, particles and UI are generated locally. Scanned surfaces, photographic sky and trees are CC0; see `public/assets/CREDITS.md` and the adjacent source notes. Google Fonts is optional; system fallbacks keep the game playable offline once local assets load.

## Verify

```sh
npm test
npm run build
```

Physics tests cover frame-rate consistency, braking, boost, collisions, all three flights, wheel retraction, airborne steering, controllable lift, slow driving, and invalid inputs.

The `#world` canvas exposes read-only data attributes for frame rate, draw calls, progress, altitude, airborne state and hover deployment. `window.sfNightRun` provides read-only diagnostic snapshots.

## Recover the previous prototype

The original sunny driving build is committed and tagged `pre-whimsical-sf` (`8e7c7af`). To compare without changing this checkout:

```sh
git worktree add ../SF1-before-whimsy pre-whimsical-sf
```

Do not delete this tag; it is the requested recovery point.
