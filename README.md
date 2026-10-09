# Whimsical SF

A browser-playable arcade racer through a compact, recognizable San Francisco. Lap Union Square, climb Powell, enter Chinatown on Grant, and finish at the Ferry Building. Three exaggerated hills turn the coral coupe's wheels into hover pods for a glide over the city. Union Square also opens into a small driving playground, with reachable terraces and five postcards to discover.

## Multiplayer

**Start Race** offers **Single player** or **Multiplayer**. Multiplayer creates
a private City Loop room for 2–8 players, including the host, before driver
selection. Copy the invitation while choosing; friends see each other's driver,
car and sponsor selections live. Each player confirms **Ready to
race** from the garage, then the host starts everyone currently in the room.
There is no expected invite count or automatic start.

The room server controls driving, checkpoints and finish times. Selected cars
and drivers race together without player-to-player contact. Results show the
winner, shared finishing order and DNFs, retaining racers who left; the host can
reopen the same room for another race. See [multiplayer setup](docs/multiplayer.md)
for the full flow, hosting, sponsor artwork, reconnects and verification.
Internet invitations require the game and its room server to run together on a
public HTTPS origin; local play does not establish internet validation.

## Usage analytics

Production builds send anonymous page views, page leaves, and session IDs to
[PostHog project 398694](https://us.posthog.com/project/398694). Open **Web analytics**
there for unique visitors, visits (sessions), page views, and visit duration. In
**Product analytics**, `$pageview` with **Unique users** counts visitors; unique
`$session_id` values count sessions. Returning browsers retain an anonymous ID in
local storage. These are browser-based estimates, not identified people; another
device, cleared storage, or an ad blocker affects the counts.

The supplied public project token is configured by default with the US ingestion
host. If the project is in the EU, set `VITE_POSTHOG_HOST=https://eu.i.posthog.com`
and use `https://eu.posthog.com/project/398694`. Optional build-time overrides are
listed in [.env.example](.env.example); copy them into `.env.local` and rebuild.
`VITE_POSTHOG_KEY` overrides the public project token. No personal API key or
project ID is needed in the browser.

Tracking is off in `npm run dev` and on in production builds, including
`npm run preview`. Set `VITE_POSTHOG_ENABLED=false` to disable it, or `true` to
explicitly enable development testing. After deploying, visit the site and check
PostHog's **Activity** for `$pageview` events with a `$session_id`.

Analytics loads independently of the game. It does not record replays, input
values, driver names, or automatic button clicks. URL query strings and fragments
(including private room codes) are removed from event URL/referrer properties
before sending. Page-leave events provide visit-duration data when the browser
can deliver them.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/. Use **Take Flight** to race or **Watch a Run** for an automatic demonstration using the driving simulation. The tour stops at the bay. Its **Union Square**, **The Westin**, **Post St**, **Powell St**, **Bush St**, **Grant Ave**, **Washington St**, **Embarcadero**, and **The Bay** buttons preview those sections; drag to look around. **Union Square** frames the overall plaza, **The Westin** pauses across from the hotel, and **Post St** shows Apple and its neighbors. **Bush St** and **Washington St** pause at the uphill corner and bayward outlook. **Embarcadero** pauses at the waterfront approach, and **The Bay** frames the Ferry Building and bridge. **Resume** returns to driving.

**Explore Union Square** starts an untimed drive on the square's southern promenade. Drive onto the plaza, climb its stairs and ramps, and explore the surrounding streets. This mode uses manual acceleration even when Auto Accelerate is enabled for races.

Races have temporary gold chevrons around all eight curves, 50 m and 25 m approach boards, and a next-turn card with street names and speed-aware braking cues. Every marker stays outside the racing road and has no collision body. Explore Union Square removes the markers and turn card; the city, plaza entrances and existing driving remain open. Scenic driving shows the course markings, while architectural portrait stops keep them hidden.

The menu's **Explore the City** postcard opens an illustrated downtown map with the course highlighted among San Francisco's neighborhoods, streets, waterfront piers and Bay Bridge. It uses local SVG artwork and simplified geography, with no map service required.

**Choose a Race** opens the seven-route collection. Alongside The City Loop, six new playable courses have their own maps, scenery, ordered checkpoints, and personal bests:

| Race | Route |
| --- | --- |
| VC Circle | Salesforce Tower → SoMa → a complete South Park lap |
| Cerebral Valley | Hayes between Gough and Octavia → Anina and Patricia’s Green → Alamo Square skyline glide → Steiner and Page → 531 Page → Webster → Waller/Steiner and Café Réveille → Duboce Park |
| Golden Gate Surfride | Panhandle → Golden Gate Park → Irving → Mollusk → Hook Fish → Ocean Beach |
| Lands End | Legion of Honor → coastal trail → Sutro Baths → Cliff House → Ocean Beach |
| Presidio Run | Arguello Gate → Inspiration Point → coastal overlook → Crissy Field |
| Golden Gate → Hawk Hill | Crissy Field → Fort Point → Golden Gate Bridge → Battery Spencer → Hawk Hill |

The bridge race includes **The Fog Run**: steer through three glowing beacons before continuing to Marin. A missed beacon returns to the fog entrance while retaining race time. Q recovers to the road, Escape pauses, and R restarts the selected race. Keyboard, touch, and standard gamepad controls work on the new courses; Auto Accelerate remains optional. For this release, these six additional courses are marked **Coming soon** and cannot be launched, including through old direct links. Their source and assets are preserved for future releases.

**Cerebral Valley** has a dedicated rebuild with real OpenStreetMap street/building footprints, USGS hill elevations, Blender architecture and street furniture, mature scanned trees, and photographic daylight. **Explore the Neighborhood** opens nine landmark views. Its 2.622 km route starts before Patricia’s Green and Anina, climbs Hayes, glides across Alamo Square toward the seven Painted Ladies and downtown skyline, then passes 531 Page and the actual Réveille corner. See [the rebuild notes](docs/cerebral-valley-rebuild.md) for asset regeneration and measured-versus-interpreted detail.

The five other new races remain their first playable versions, with procedural scenery and compressed geography. Their itineraries and future ideas are documented in [the race PRDs](docs/city-races-prd.md).

## Controls

- Hold W / Up: accelerate
- A, D / Left, Right: steer on the street and in the sky
- S / Down: brake; keep holding after stopping to reverse throughout City Loop; dive in flight
- Shift: boost; gain lift in flight
- Space: drift
- C: change chase camera
- Q / **Unstick**: recover onto nearby clear pavement without losing time or earned progress
- R: restart
- Escape: pause
- M: mute

Hold the accelerator to build speed. Releasing it lets the car coast and slow down; brake before corners, then steer through the turn. The car keeps its heading until you steer. Hold drift with steering for tighter turns. Hover deploys automatically at a hill launch above 54 mph. Nine gold sun rings replenish boost, and wheels return upright before landing. Touch and standard gamepad controls are supported. **How to Play** includes optional auto-accelerate, three graphics settings, fullscreen, and best-time reset. Auto-accelerate holds the gas during races; you still steer and brake, and untimed exploration always uses manual gas. Only **Watch a Run** drives the course for you.

## Union Square playground

The car can leave the asphalt throughout the square and its neighboring blocks. Plaza terraces, the broad Geary steps, the Stockton flight, the Post entrance and the side ramps have driving surfaces that follow the visible architecture. Curbs and steps jostle the car; rolling off a terrace produces a small gravity-driven hop. Small handrails, café tables, parasols and chairs knock aside with a light clatter and settle on the paving; they do not stop the car or count as crashes. Buildings, the monument, planters, café pavilions, subway entrance and parked cars remain solid. Glancing contact with solid edges or the district boundary preserves motion along the surface, so you can keep driving and steer away.

Find **five golden postcards** on the square's paving. The local map shows buildings, streets, stairs, gardens, your car and the remaining postcards; the HUD keeps count. Restarting the drive restores all five and resets displaced furniture. Returning to the street keeps the furniture where it landed. If you get wedged against an object, hold S after braking to reverse, or use **Q / Return to Street**. Recovery preserves the run's elapsed time and statistics.

Temporary streetworks barricades mark the boundaries of this first explorable district. Powell remains connected to the racing course: head north to continue toward Chinatown, the three existing hill glides and the bay, or turn back before the climb to return to the square. This is a bounded playground around Union Square; the rest of the city retains the established racing corridor.

The plaza is also open during a race. Union Square shortcuts count toward a valid race. Cross the first Powell checkpoint, then the remaining checkpoints in order. Untimed exploration does not set a personal best.

## Course

The approximately **2.33 km city loop** follows:

**Post → Stockton → Geary → Powell → Bush → Grant → Washington → Embarcadero → Market / Ferry Building**

The opening lap passes all four sides of Union Square. Its raised granite terraces, Dewey Monument, seven date palms, four jacaranda canopies, corner hearts and café pavilions sit between the historic Westin St. Francis, Macy's and I. Magnin on Geary, and the individual Post and Stockton storefronts. Broad stairs, retaining walls and a southeast subway entrance give the square its elevation and street-level scale.

Apple faces south across Post, west of Stockton, with its public garden and Grand Hyatt behind it. Saks, Tiffany and the former Williams-Sonoma building complete the north frontage. Neiman Marcus occupies the southeast corner across Geary; Maiden Lane remains open between the smaller Stockton parcels. The previously empty outside corners now have authored hotel and retail buildings. [The geographic reference](art/references/union-square-layout.md) records the actual relationships and the game's approximate placements.

The map now renders with the correct geographic handedness: Apple appears to the right of Saks when looking north, and Post's turn onto Stockton reads as a right turn. The earlier view mirrored those relationships despite correctly named map coordinates. Buildings extend around their sides and backs: the north hotels reach Sutter, Macy's reaches O'Farrell, and the Stockton parcels continue toward Grant around an open Maiden Lane. Detailed corner street signs, newspaper dispensers and bicycle racks add close street furniture.

The blocks beyond Sutter now form connected street walls: 169 detailed building parcels across 41 blocks replace isolated center buildings and vacant strips around Powell/Bush, behind Grant and along the Washington descent. Narrow service alleys, paved sidewalks, corner crossings, tree wells, street signs and the same scanned asphalt on side streets complete the ground plane. Storefronts step with the hills; bay windows, cornices, fire escapes and rooftop equipment give turns and glides a finished view. These neighborhood buildings are original procedural architecture, not replicas of each real address.

Powell's cable-car rails lead uphill to Bush and the Dragon Gate. Grant Avenue narrows into Chinatown's masonry storefronts, balconies, lanterns and green tiled roofs. Washington descends toward the bay; the Embarcadero connects to the Market Street finish.

The street connections and landmark relationships establish a more recognizable city. Block lengths, building dimensions, turns and hill profiles are compressed or exaggerated for play; this is not a survey-accurate reconstruction. Three flight sections remain, on Powell, Grant and Washington.

The waterfront is built from original Blender assets. Market faces the Ferry Building's long arcaded wings and 75 m clock tower, with a layered pale crown and four modeled clock faces. A jointed granite PortWalk, seawall, bikeway, maritime lamps and 43 date palms complete the shoreline. The paving and planting continue south of Market toward the bridge, giving the wide finish view a complete waterfront edge. Piers 1, 1½, 3 and 5 sit north of Washington, followed by Pier 7's open timber promenade near Broadway. The stretch between Washington and Market remains a furnished north Ferry Plaza and PortWalk; its game distance is stretched, so the named piers have not been moved into that gap. [Waterfront references and placement notes](art/references/waterfront.md) record the geographic interpretation.

At the finish, the camera reveals the Ferry Building above animated turquoise water, with the silver Bay Bridge crossing south of it toward Yerba Buena Island. The bridge has four open steel towers, two suspension spans, a central anchorage and two road decks. Compact results preserve the view; portrait framing pulls back to retain the tower and wings. Bay movement, ferries and sailboats remain realtime Three.js effects.

City Loop with valid plaza shortcuts uses the separate local-storage key `whimsical-sf-shortcuts-race-best-v4`. Older ordered-street-gate scores remain under `whimsical-sf-playground-race-best-v3`. Multiplayer does not update solo personal bests. Earlier manual-driving records remain under `whimsical-sf-manual-driving-best-v2`, and records from the former guided handling remain under their older key. Reset Best affects the current course only.

## Stack and assets

TypeScript, Three.js, Vite, deterministic custom arcade driving and Web Audio. Solo play requires no backend. Private multiplayer rooms use the included Node server; no paid service is required. Local Blender GLBs supply the Westin, Post frontage and surrounding hotels, Macy's/I. Magnin, Neiman Marcus, Stockton boutiques, Dewey Monument, date palms, Powell cable car, street furniture, Ferry Building, Embarcadero piers and Bay Bridge. Major architectural groups have separate distant models with Draco compression. Plaza and waterfront palms and four CC0 jacarandas use instancing; the stepped plaza and its remaining furnishings use authored Three.js geometry. The wider city, player car, Chinatown, bay water and vessels still use procedural geometry or shaders. Labels and many material details are generated locally.

The asphalt maps and photographic sky use CC0 source assets. Additional source assets from earlier prototypes remain in the repository; see [asset credits](public/assets/CREDITS.md) and the adjacent source notes. Google Fonts is optional; system fallbacks keep the game playable once local assets are available.

[BLENDER_ASSETS.md](BLENDER_ASSETS.md) documents the implemented asset pipeline, editable source files, placements, coordinate conventions and measured asset budgets. Blender review renders in `art/reviews/` include the north frontage, Apple, Neiman's rotunda, Maiden Lane, complete rear elevations and the street furniture. Local reflections, plaza shadows and contact shading support the game view. Apple has a level lot, and parcel reservations prevent duplicate background buildings and streets; the racing route and flight heights are retained.

Open [art/source/waterfront.blend](art/source/waterfront.blend) to inspect the complete editable waterfront, organized into Ferry Building, piers, bridge, palms and review context. Its separate source files and rebuild scripts are listed in [the Blender pipeline](BLENDER_ASSETS.md). [The assembled review](art/reviews/waterfront-master.png) is a Blender render; the browser renders the exported GLBs with its own lighting and animated water.

## Verify

```sh
npm test
npm run build
node tools/validate-waterfront.mjs
```

Tests cover route geometry and driving behavior, including coasting to a stop, manual cornering, curb recovery, frame-rate consistency, braking, boost, collisions, the three flights, wheel retraction, airborne steering, controllable lift, slow driving and invalid inputs. Geographic regression checks protect Apple's level floor, Powell's full sidewalk grade, the accepted route elevations, and the open Maiden Lane gap. Camera-projection tests protect landmark order, the clockwise square lap and left/right driving controls in all four street headings.

Playground checks cover continuous terrace and stair surfaces, car-width access to all five postcards, solid obstacles and parked cars, reversing and recovery, small terrace drops, ordered race gates, return through the Powell corridor, and a complete race with all three glides. World driving is checked at 30, 60 and 120 Hz. Additional checks cover knockable furniture, prop reset, and sliding along boundaries without losing all forward momentum. City parcel checks protect continuous street frontage, facade separation, all street corridors and rounded route clearances, while preserving the authored square and Chinatown.

Waterfront checks protect the Market approach, existing street elevations, pier order, planting clearance and finish framing at wide and narrow aspect ratios. The asset validator checks the five GLB containers, declared bounds, positive transforms, matching close/distant sections and reduced distant geometry. It does not independently decode Draco or establish browser performance.

The `#world` canvas exposes read-only data attributes for frame rate, draw calls, submitted triangles, texture count, hero asset loading, progress, altitude, airborne state, hover deployment, throttle, steering, speed and heading. Additional attributes report world X/Y/Z, whether the car is in the playground, untimed free-drive mode and the postcard count. `data-waterfront-assets="blender"` marks completed waterfront asset loading. `window.sfNightRun` provides read-only diagnostic snapshots.

## Recovery checkpoints

The complete city-map and manual-driving version before opening the square is saved at `pre-union-square-playground` (`4cb84f4`).

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
