# Whimsical SF

A browser-playable arcade racer through a compact, recognizable San Francisco. Lap Union Square, climb Powell, enter Chinatown on Grant, and finish at the Ferry Building. Three exaggerated hills turn the coral coupe's wheels into hover pods for a glide over the city.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/. Use **Take Flight** to race or **Watch a Run** for an automatic demonstration using the driving simulation. The tour stops at the bay. Its **Union Square**, **The Westin**, **Post St**, **Powell St**, **Grant Ave**, and **The Bay** buttons preview those sections; drag to look around. **Union Square** frames the overall plaza, **The Westin** pauses across from the hotel, and **Post St** shows Apple and its neighbors. **Resume** returns to driving.

The menu's **Explore the City** postcard opens an illustrated downtown map with the course highlighted among San Francisco's neighborhoods, streets, waterfront piers and Bay Bridge. It uses local SVG artwork and simplified geography, with no map service required.

## Controls

- Hold W / Up: accelerate
- A, D / Left, Right: steer on the street and in the sky
- S / Down: brake; dive in flight
- Shift: boost; gain lift in flight
- Space: drift
- C: change chase camera
- R: restart
- Escape: pause
- M: mute

Hold the accelerator to build speed. Releasing it lets the car coast and slow down; brake before corners, then steer through the turn. The car keeps its heading until you steer. Hold drift with steering for tighter turns. Hover deploys automatically at a hill launch above 54 mph. Nine gold sun rings replenish boost, and wheels return upright before landing. Touch and standard gamepad controls are supported. **How to Play** includes optional auto-accelerate, three graphics settings, fullscreen, and best-time reset. Auto-accelerate holds the gas; you still steer and brake. Only **Watch a Run** drives the course for you.

## Course

The approximately **2.33 km city loop** follows:

**Post → Stockton → Geary → Powell → Bush → Grant → Washington → Embarcadero → Market / Ferry Building**

The opening lap passes all four sides of Union Square. Its raised granite terraces, Dewey Monument, seven date palms, four jacaranda canopies, corner hearts and café pavilions sit between the historic Westin St. Francis, Macy's and I. Magnin on Geary, and the individual Post and Stockton storefronts. Broad stairs, retaining walls and a southeast subway entrance give the square its elevation and street-level scale.

Apple faces south across Post, west of Stockton, with its public garden and Grand Hyatt behind it. Saks, Tiffany and the former Williams-Sonoma building complete the north frontage. Neiman Marcus occupies the southeast corner across Geary; Maiden Lane remains open between the smaller Stockton parcels. The previously empty outside corners now have authored hotel and retail buildings. [The geographic reference](art/references/union-square-layout.md) records the actual relationships and the game's approximate placements.

The map now renders with the correct geographic handedness: Apple appears to the right of Saks when looking north, and Post's turn onto Stockton reads as a right turn. The earlier view mirrored those relationships despite correctly named map coordinates. Buildings extend around their sides and backs: the north hotels reach Sutter, Macy's reaches O'Farrell, and the Stockton parcels continue toward Grant around an open Maiden Lane. Detailed corner street signs, newspaper dispensers and bicycle racks add close street furniture.

Powell's cable-car rails lead uphill to Bush and the Dragon Gate. Grant Avenue narrows into Chinatown's masonry storefronts, balconies, lanterns and green tiled roofs. Washington descends toward the bay; the Embarcadero connects to the Market Street finish.

The street connections and landmark relationships establish a more recognizable city. Block lengths, building dimensions, turns and hill profiles are compressed or exaggerated for play; this is not a survey-accurate reconstruction. Three flight sections remain, on Powell, Grant and Washington.

At the finish, the camera reveals the Ferry Building on its pier, animated turquoise water and the silver Bay Bridge behind it. Compact results preserve the waterfront view.

Manual-driving times use the separate local-storage key `whimsical-sf-manual-driving-best-v2`. Records from the former guided handling are preserved under their old key rather than compared with manual steering. Reset Best affects the current course only.

## Stack and assets

TypeScript, Three.js, Vite, deterministic custom arcade driving and Web Audio. No backend or paid service is required. Local Blender GLBs supply the Westin, Post frontage and surrounding hotels, Macy's/I. Magnin, Neiman Marcus, Stockton boutiques, Dewey Monument, date palms, Powell cable car and a street furniture kit. The three architectural groups have separate distant models with Draco compression. Seven palms and four CC0 jacarandas use instancing; the stepped plaza and its remaining furnishings use authored Three.js geometry. The wider city, player car, Chinatown and waterfront still use procedural geometry. Labels and many material details are generated locally.

The asphalt maps and photographic sky use CC0 source assets. Additional source assets from earlier prototypes remain in the repository; see [asset credits](public/assets/CREDITS.md) and the adjacent source notes. Google Fonts is optional; system fallbacks keep the game playable once local assets are available.

[BLENDER_ASSETS.md](BLENDER_ASSETS.md) documents the implemented asset pipeline, editable source files, placements, coordinate conventions and measured asset budgets. Blender review renders in `art/reviews/` include the north frontage, Apple, Neiman's rotunda, Maiden Lane, complete rear elevations and the street furniture. Local reflections, plaza shadows and contact shading support the game view. Apple has a level lot, and parcel reservations prevent duplicate background buildings and streets; the racing route and flight heights are retained.

## Verify

```sh
npm test
npm run build
```

Tests cover route geometry and driving behavior, including coasting to a stop, manual cornering, curb recovery, frame-rate consistency, braking, boost, collisions, the three flights, wheel retraction, airborne steering, controllable lift, slow driving and invalid inputs. Geographic regression checks protect Apple's level floor, Powell's full sidewalk grade, the accepted route elevations, and the open Maiden Lane gap. Camera-projection tests protect landmark order, the clockwise square lap and left/right driving controls in all four street headings.

The `#world` canvas exposes read-only data attributes for frame rate, draw calls, submitted triangles, texture count, hero asset loading, progress, altitude, airborne state, hover deployment, throttle, steering, speed and heading. `window.sfNightRun` provides read-only diagnostic snapshots.

## Recovery checkpoints

The corrected city orientation, full block returns and new Blender street furniture are saved at `union-square-orientation-v3`.

The preceding square, corrected parcels, terraces and storefront assets are saved at `union-square-fidelity-v2`. It predates the latest map handedness correction, deeper blocks and Blender street furniture.

Preserve these existing tags:

| Tag | Commit | Version |
| --- | --- | --- |
| `union-square-fidelity-v2` | `68520d0` | Wider square, corrected parcels and terraces before the renderer orientation fix |
| `union-square-blender-v1` | `ffae8dc` | First Westin, monument, palms and cable-car Blender pass, before the wider square corrections |
| `pre-art-direction-v2` | `3f03057` | Connected city loop before the Blender art pass |
| `pre-city-loop` | `d47bae0` | Previous linear course, smooth hill glides and Ferry Building/Bay Bridge finish |
| `whimsical-sf-v1` | `e147015` | First exaggerated-hill and hover-wheel version |
| `pre-whimsical-sf` | `8e7c7af` | Original sunny street-racing prototype |

To compare the previous course without changing this checkout:

```sh
git worktree add ../SF1-before-city-loop pre-city-loop
```
