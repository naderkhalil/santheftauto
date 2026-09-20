# SF / City Run

A browser-playable arcade time trial down Powell Street, from California Street on Nob Hill, past Union Square, to Market Street. The approximately 1.3 km course is a stylized, fictional closed race route: its hills, distances, street positions, and architecture are adapted for play rather than surveyed from San Francisco.

The city now includes recognizable interpretations of the Westin St. Francis, Beacon Grand, Union Square and its Dewey Monument, Apple Union Square, and the Flood Building, with Salesforce Tower, 181 Fremont, and the Transamerica Pyramid in the surrounding skyline. Narrow sidewalks, cable car tracks, detailed cable cars, bay windows, fire escapes, storefront displays, street signs, and curbside objects give the drive a distinctly San Francisco setting. A wooden cable-car turntable, Hallidie Plaza signs, and diagonal Market Street rails complete the southern end.

Clear Pacific blue sky, warm afternoon sunlight, crisp cool shadows, saturated painted facades, flowering gardens, scanned masonry, and a scarlet coupe establish the visual direction. The road has a mostly dry, textured finish; architectural detail casts real shadows. A scenic drive mode lets you explore the same environment without racing the clock.

## Run locally

Requires Node.js 22.18+ for the test command's built-in TypeScript support and a modern browser with hardware-accelerated WebGL.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. The game runs in your browser; no account, backend, or API keys are required.

## Play or explore

Choose **Take the Wheel** to run the downhill time trial. Pass all four checkpoints, manage boost, avoid the parked vehicles and roadwork, and beat the best time saved in your browser.

Choose **Take a Scenic Drive** for an automatic, slower tour. Drag horizontally on the scene to look around, pause to inspect a view, or jump directly to Nob Hill, Beacon Grand, Union Square, or Market Street. The tour continues past the race finish to visit the turntable before looping. **Let's Race** starts a fresh time trial, and **×** or **Escape** returns to the main menu.

## Controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Accelerate | W / ↑ | Right trigger |
| Brake | S / ↓ | Left trigger |
| Steer | A / D or ← / → | Left stick |
| Drift | Space | X / square (west button) |
| Boost | Shift | A / cross (south button) |
| Pause / resume race | Escape | Menu / Start |
| Restart race | R | Use pause menu |
| Switch chase camera | C | — |
| Mute | M | — |

Touch controls appear on touchscreens. **How to Play** includes graphics settings, fullscreen, and optional automatic acceleration. With automatic acceleration enabled, braking overrides the throttle. Boost recharges over time; release the button after depletion to rearm it. Races and scenic drives pause when the window loses focus or the browser tab becomes hidden.

Best time, sound choice, graphics setting, and acceleration preference are saved locally when browser storage is available. Nothing is uploaded.

## Graphics settings

Open **How to Play** and click the graphics button to cycle **High → Cinematic → Performance**.

| Setting | What changes |
| --- | --- |
| **High** | Default balance for driving. Includes soft shadows, bloom, color grading, and post-process antialiasing, with a moderate rendering resolution. |
| **Cinematic** | Higher rendering resolution plus ambient occlusion for additional depth around architectural details. Best suited to stronger graphics hardware and scenic exploration. |
| **Performance** | Lower rendering resolution and a shorter detailed-city view distance. Disables shadows and post-processing and reduces selected lighting effects. |

The same course, landmark geometry, and driving simulation are available in each mode. Desktop browsers are the primary target; frame rate, touch controls, and gamepad behavior depend on the device and browser.

## Build and verify

```sh
npm test
npm run build
npm run preview
```

`npm test` runs deterministic driving and race-progression checks. The production build is emitted into `dist/` and can be served by static website hosting. A local preview is not a public deployment.

## Project structure

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Application, race flow, input, cameras, quality modes, effects, HUD, and tour integration. |
| `src/route.ts` | Course elevation, centerline, district names, and checkpoints. |
| `src/world.ts` | Modular architecture, window-interior atlas, shops, road geometry, street details, barriers, and material/color instancing. |
| `src/landmarks.ts` | Westin St. Francis, Beacon Grand, Union Square, monument, palms, and Flood Building. |
| `src/skyline.ts` | Landmark towers and the surrounding skyline. |
| `src/streetlife.ts` | Cable cars, parked vehicles, street signs, signals, sidewalk furnishings, and vehicle obstacle descriptors. |
| `src/citylife.ts` | 44 ambient residents and spectators, including a few walkers, plus animated gulls; people stay off the racing surface. |
| `src/atmosphere.ts` | Photographic Pacific-style daylight sky, procedural fallback, fog, lighting, and captured city reflections. |
| `src/vegetation.ts` | Optimized CC0 jacaranda models, shared geometry, cutout leaf shadows, and distance culling. |
| `src/surfaces.ts` | Scanned asphalt textures and spatially varied road roughness. |
| `src/car.ts` | Coupe geometry, materials, wheels, lights, and vehicle animation. |
| `src/tour.ts` | Scenic-drive progression, obstacle-aware lane selection, landmark jumps, and camera poses. |
| `src/driving.ts` | Arcade simulation, boost, swept collisions, hill jumps, and race timing. |
| `src/driving.test.ts` | Deterministic simulation and race checks. |
| `src/audio.ts` | Synthesized engine, tires, wind, race cues, and positional cable-car bells using Web Audio. |
| `src/style.css` | Responsive menus, HUD, settings, scenic-drive controls, and results. |

## Assets and scope

Most architecture, vehicles, signage geometry, and furnishings are constructed in code. Two optimized CC0 jacaranda tree models from Poly Haven and a photographic daylight HDR sky provide detailed natural assets. Asphalt, brick, and plaster surface maps include real CC0 scans from Poly Haven; see [asset credits](public/assets/CREDITS.md) for all source pages and file mapping. Other textures, including window interiors and storefront lettering, are generated procedurally. There are no purchased asset packs or copied game models.

The unbranded player car and fictional generic storefronts are original interpretations. Real landmark names identify the places being depicted; no sponsorship or endorsement is implied. Three.js and other dependencies retain their own licenses. The interface uses Google Fonts (Barlow Condensed and DM Sans), with system-font fallbacks.

This build contains one Powell course and its scenic tour, with ambient people on the sidewalks and plaza and gulls overhead. It does not yet include additional neighborhoods, multiplayer, a server leaderboard, recorded replays, or a live traffic system; pedestrians are lightweight ambient animation rather than a full crowd simulation. The vehicle handling is an arcade model, and the city is an authored interpretation rather than a geographically exact reconstruction.

## Extending the game

Keep route data, visual scenery, and collision descriptors separate. Block out the hills and turns of a new neighborhood with the driving model before detailing its architecture. The existing storefronts, window atlas, street furnishings, and material pipeline can be reused while adding the landmarks that distinguish each course. Any future sponsor placement should use an agreed location and approved brand assets after a sponsor is committed.

See [the visual direction and hero-asset plan](ART_DIRECTION.md) for the intended look, remaining asset work, and visual acceptance criteria.
