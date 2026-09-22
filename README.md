# Whimsical SF

A browser-playable arcade racer through a compact, recognizable San Francisco. Lap Union Square, climb Powell, enter Chinatown on Grant, and finish at the Ferry Building. Three exaggerated hills turn the coral coupe's wheels into hover pods for a glide over the city.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/. Use **Take Flight** to race or **Watch a Run** for an automatic demonstration using the driving simulation. The tour stops at the bay. Its **Union Square**, **Powell St**, **Grant Ave**, and **The Bay** buttons preview those sections; drag to look around.

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

The course guides the car around street corners; steering chooses your line within the road. Brake or drift through tight turns. Hover deploys automatically at a hill launch above 54 mph. Nine gold sun rings replenish boost, and wheels return upright before landing. Touch and standard gamepad controls are supported. **How to Play** includes auto-accelerate, three graphics settings, fullscreen, and best-time reset.

## Course

The approximately **2.33 km city loop** follows:

**Post → Stockton → Geary → Powell → Bush → Grant → Washington → Embarcadero → Market / Ferry Building**

The opening lap passes all four sides of Union Square. Its open granite terraces, Dewey Monument, palm trees, corner hearts and red café umbrellas sit between the historic Westin St. Francis, Macy's, the Apple pavilion and surrounding storefronts. Powell's cable-car rails lead uphill to Bush and the Dragon Gate. Grant Avenue narrows into Chinatown's masonry storefronts, balconies, lanterns and green tiled roofs. Washington descends toward the bay; the Embarcadero connects to the Market Street finish.

The street connections and landmark relationships establish a more recognizable city. Block lengths, building dimensions, turns and hill profiles are compressed or exaggerated for play; this is not a survey-accurate reconstruction. Three flight sections remain, on Powell, Grant and Washington.

At the finish, the camera reveals the Ferry Building on its pier, animated turquoise water and the silver Bay Bridge behind it. Compact results preserve the waterfront view.

City-loop times use the separate local-storage key `whimsical-sf-city-loop-best-v1`. Previous-course records are preserved rather than compared with this longer course. Reset Best affects the current course only.

## Stack and assets

TypeScript, Three.js, Vite, deterministic custom arcade driving and Web Audio. No backend or paid service is required. The current city, landmarks, vehicle, furnishings and bridge are procedural geometry; labels and many material details are generated locally. **No Blender-authored models have been imported for this version.**

The asphalt maps and photographic sky use CC0 source assets. Additional source assets from earlier prototypes remain in the repository; see [asset credits](public/assets/CREDITS.md) and the adjacent source notes. Google Fonts is optional; system fallbacks keep the game playable once local assets are available.

[BLENDER_ASSETS.md](BLENDER_ASSETS.md) describes the next art pass: reference-led hero models exported as efficient GLB assets, while the route and gameplay stay in code.

## Verify

```sh
npm test
npm run build
```

Tests cover route geometry and driving behavior, including frame-rate consistency, braking, boost, collisions, the three flights, wheel retraction, airborne steering, controllable lift, slow driving and invalid inputs.

The `#world` canvas exposes read-only data attributes for frame rate, draw calls, progress, altitude, airborne state and hover deployment. `window.sfNightRun` provides read-only diagnostic snapshots.

## Recovery checkpoints

Preserve these existing tags:

| Tag | Commit | Version |
| --- | --- | --- |
| `pre-city-loop` | `d47bae0` | Previous linear course, smooth hill glides and Ferry Building/Bay Bridge finish |
| `whimsical-sf-v1` | `e147015` | First exaggerated-hill and hover-wheel version |
| `pre-whimsical-sf` | `8e7c7af` | Original sunny street-racing prototype |

To compare the previous course without changing this checkout:

```sh
git worktree add ../SF1-before-city-loop pre-city-loop
```
