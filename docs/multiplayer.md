# Private City Loop races

**Start Race** opens **Single player** and **Multiplayer** choices. Single player
continues through the existing driver selection and car garage, with remembered
cosmetics and no required nickname or room service. Multiplayer creates a private
City Loop room before selection so the host can share its URL immediately.
Rooms hold **2–8 players, including the host**. A room invitation bypasses mode
choice; opening the link does not consume a slot until the guest presses
**Join room**. Old course parameters cannot redirect an invite to another race.

The invite and party strip remain visible while choosing a driver and car.
Friends see selected characters, cars and sponsors live, with distinct names
and markers even when several players choose the same character. An editable
nickname has a usable default. **Copy invite** confirms success or exposes a
selectable link if clipboard access is unavailable.

The multiplayer garage ends with **Ready to race**: it confirms the latest
choices and enters the room without a second Ready step. Editing selections
clears readiness. Required course and gameplay assets must be ready, with the
existing playable fallback accepted; optional sponsor artwork and the cosmetic
showroom do not block starting. The host presses **Start race · N players** when
at least two players have joined and everyone in the room is connected and
ready. The game does not guess how many friends were invited and never starts
automatically. New joins after the shared five-second countdown begins must
wait until the host reopens the room; there is no mid-race insertion or reserved
next-race place.

Closing setup retains membership. **Return to room** reopens it; leaving the
room is an explicit action. The host can remove an unresponsive player from the
lobby before starting. A room URL is still an invitation, so removal is not a ban.

The garage uses the same Victorian facade builders, timber PBR materials, HDR sky,
Neutral tone mapping and ambient occlusion as the city. `racer-kit.glb` contains
the playable open-cockpit car, four independent wheel pivots, and standing/seated
models of all seven drivers: Dario Amodei, Sam Altman, Elon Musk, Jensen Huang,
Mira Murati, Fei-Fei Li and Mark Zuckerberg. Setup, solo races and remote multiplayer cars use
that same kit. Paint and sponsor choices persist into gameplay. All three car
choices share the open-cockpit chassis and equal physics; the distinction is paint.

Editable source: `art/source/racers-and-garage.blend`. Rebuild with
`tools/blender/build_racer_assets.py`; this reuses the actual architecture helpers
from `build_cerebral_heroes.py`, detailed fixtures from `racer_garage.py`, and
character bodies from `racer_characters.py` and anatomical head sculpts from
`racer_faces.py`. The head mesh and facial morphs derive from the CC0 MakeHuman
base; source files and provenance are included with the editable art. The old art study remains
in Git for comparison.
The garage is a separate download, so racing peers do not load its buildings.
Both models use Draco compression with the existing local decoder; geometry
keeps 16-bit positions and 12-bit normals for close-up detail.
If the new kit fails to load, the existing procedural car remains as a playable
fallback and the console reports the failure.

Cars have equal handling and no player-to-player collisions. The starting grid
uses join order. Union Square shortcuts remain valid; the ordered Powell,
Chinatown, waterfront and finish checkpoints still apply. Timing and simulation
run on the server. A client submits controls, never its own location or result.
Races end after five minutes, or at most one minute after the first finisher.
A personal finish shows the recorded place and time while other players finish.
The final table shows the winner, finishers in the server's order, gaps and
DNFs with their reason and final progress. Equal recorded times share a place
using competition ranks (1, 1, 3); an all-DNF race has no winner. Leaving after
finishing preserves the result; leaving during the race records DNF instead of
erasing the entrant.

The host's **Race again** returns to the same room and invitation, retains
cosmetics and resets readiness. Everyone confirms again before the host starts
the next round. **Last results** preserves the most recent completed standings
separately from the new lobby roster. Multiplayer never updates solo personal
bests or displays a solo medal as the multiplayer result.

Q recovers onto the road. Escape, R and the room button open the room menu
without pausing or restarting the shared race. Changing tabs or losing the
connection releases controls. Refreshing reconnects to the same racer in that
tab, including during a race. Another tab taking over the same session releases
the previous tab's controls; it does not create a second racing car.

Disconnected lobby players retain their slot for 30 seconds and must confirm
Ready again after reconnecting. A racer missing for 30 seconds after Start
receives **DNF · Disconnected**, unless already finished. Rejoining does not
undo a DNF. The host role passes to the earliest joined connected player when
the host disconnects or leaves; reconnecting does not reclaim it automatically.
Empty rooms expire, with a two-hour maximum room lifetime. Native Cloudflare
rooms persist their state and recover from the latest checkpoint; the legacy
Node server keeps rooms in memory and loses them on restart.

## Development and hosting

Requires Node `>=22.21.0 <23` (native TypeScript stripping); `.node-version`
and the Docker image pin `22.23.3`.

```sh
npm install
npm run dev
```

Restart an already-running Vite process after first adding `vite.config.ts`.
The Vite plugin serves the room API on the same origin as the game. For another
device on the same Wi-Fi, open Vite's printed Network URL before creating a room.
A localhost invite only works on the same computer.

### Primary deployment: native Cloudflare

Cloudflare Workers serves the public API and assets, and one SQLite-backed
Durable Object owns each eight-player room. The complete invite code selects
the same object for every join, command, reconnect, and race update. New rooms
scale independently without a central simulation server. Placement keys and
admissions are durable, so retrying an uncertain create returns the original
room/player. Expired objects retain a creation marker rather than reusing an
old invitation for a different room.

```sh
npm run test:cloudflare
VITE_POSTHOG_ENABLED=false npm run build:cloudflare
npm run dev:cloudflare
```

The local native preview runs at `http://127.0.0.1:8787`. Follow the
[Cloudflare runbook](cloudflare.md) for login, the operations secret, paid account
configuration, the actual `workers.dev` URL, publishing, a custom domain, and
the $500 spending plan. No enforced billing cap is configured. Native local
tests use an alpha Miniflare release; public cloud timing, device play, and cost
still require deployed validation.

Cloudflare advertises a duplex WebSocket for room updates and controls, with
HTTP room actions and an SSE/HTTP fallback. Idle duplex rooms can hibernate;
active races run the same 20 Hz simulation. Semantic changes persist before
acknowledgement, and racing targets a checkpoint each second. On recovery,
the latest saved physics resumes with neutral inputs and the original running
clock/deadline. Retained valid duplex sessions keep their readiness; other
clients retain the existing reconnect grace. A reset does not grant more race
time. Keep the Durable Object namespace and migrations stable across releases.

### Legacy Node/Render fallback

Build and run the default single-process Node server:

```sh
npm ci
npm run build
npm start
```

`PORT` defaults to 3000; `HOST` defaults to `0.0.0.0`. With `SERVER_ROLE=single`,
one Node process serves `dist`, the room API, and racing simulation. Static-only
hosting and `vite preview` do not provide rooms.

For multiple race workers, `SERVER_ROLE=gateway` serves the public game and
forwards room traffic to private `SERVER_ROLE=worker` processes. Each worker
has a fixed two-character hex ID and exactly one instance. The room-code prefix
keeps joins, reconnects, streams, and inputs on that room's owner. Creation uses
a saved placement key so an uncertain retry cannot create another room on a
different worker. Add capacity with a new worker ID and gateway mapping;
never replicate a worker under the same ID or remove its mapping while rooms
remain. Rooms stay in memory and cannot fail over to an empty worker.

The separate Render blueprint proposes one public gateway and two private workers
in Oregon. It creates three paid services when applied and is not part of the
native Cloudflare deployment. The [Node/Render runbook](launch.md) covers the configuration,
local three-process cluster, load measurements, capacity limits, cache rules,
operations authentication, rollout, and rollback. Manually drain each worker
and wait for zero active races before deploying it; shutdown grace alone is
shorter than a newly started race's maximum duration.

Internet invitations require HTTPS on one public origin. Preserve that origin,
disable buffering and transformation on `/api/rooms/*/events`, permit long-lived
SSE responses, and forward WebSocket upgrades on `/api/rooms/*/input`.

Room actions and heartbeats use same-origin JSON HTTP requests. Driving inputs
use an authenticated WebSocket at a target 20 Hz, with HTTP fallback when the
socket is unavailable or backpressured. The SSE feed sends full room metadata
when it changes, compact racer updates during active racing at 20 Hz, and slower
heartbeats in idle rooms. The server serializes each room's frame once per wire
format and shares it across recipients; legacy full snapshots remain supported.
Clients reconstruct room state and smooth rendered positions.

The server runs the simulation, including parked traffic and checkpoint/recovery
rules. Random per-racer tokens travel in HTTP headers or the WebSocket's first
claim message, never in invitation or socket URLs. Input sequence numbers order
controls across both transports, and session generations prevent an older tab
from controlling a reclaimed racer. Payloads are bounded, input values clamped,
mutations origin-checked, and requests rate-limited. Anyone with a valid invite
can join its lobby until it is full.

### Analytics build configuration

Analytics uses the existing `VITE_POSTHOG_ENABLED`, `VITE_POSTHOG_KEY`, and
`VITE_POSTHOG_HOST` build-time settings. Production builds default to enabled
tracking with the supplied public project token and US ingestion host; the
development server defaults to disabled. An explicit `false` disables tracking.
For isolated local browser checks, build with
`VITE_POSTHOG_ENABLED=false npm run build` before starting the local cluster.

The Docker build exposes the same three settings as build arguments. For example:

```sh
docker build --build-arg VITE_POSTHOG_ENABLED=false -t city-loop:local .
```

Omitted or empty arguments preserve the application defaults. Use
`--build-arg VITE_POSTHOG_KEY=...` and `--build-arg VITE_POSTHOG_HOST=...` to select
another public browser token or ingestion host. These values are included in
the public bundle; never supply a personal API credential. `.env*` files are
excluded from the Docker build context. Changing runtime environment variables
on an already-built container or local server does not change browser tracking;
rebuild the image with the intended settings. Docker image execution remains
unverified in the current environment.

## Drivers, cars and sponsor artwork

`src/racer-profile.ts` is the cosmetics catalogue. The four unofficial parody
characters are Dario Amodei, Sam Altman, Elon Musk, and Jensen Huang. Original
full-body Blender sculpts are authored in `tools/blender/racer_characters.py`;
individually shaped jaws, noses, eyelids, mouths and hair distinguish them. Jensen's
leather, Dario's jersey, Sam's shirt and Elon's twill use embedded color, normal
and roughness maps, with garment folds and construction details in the geometry.
Standing and seated versions use the same facial and material definitions. See
the [driver art pipeline](../BLENDER_ASSETS.md#playable-drivers) for rebuilding and
close-up review. All four stand in one frame,
with named downward-pointing selection markers for the local player and friends.
The markers update live and support multiple racers choosing the same founder.
Saved IDs for the former four placeholders migrate to the new roster.
`src/racer-showroom.ts` renders the lineup and a large, rotatable preview of the
actual game car on asphalt. The portrait lineup has a seamless warm backdrop;
the garage uses the city's Pacific daylight and local building reflections.
Native-resolution multisampling, SMAA and projection-correct ambient occlusion
keep close-up silhouettes, glass and trim smooth. The menu redraws when a model,
selection, sponsor or camera changes, rather than continuously rendering a static
scene. Sponsor changes update the hood and doors immediately. Sundrop Roadster,
Comet Sport and Tide Roadster share one open cockpit body and equal physics. Each choice is sent to every racer and shown on their opponent cars.

NVIDIA, Roboflow and SF Compute logos live in `public/assets/sponsors`, with
official source URLs recorded in [the asset sources](../public/assets/sponsors/SOURCES.md).
The catalogue sets each brand's full `logo`, optional compact `tileLogo`,
`name`, `mark`, `color`, `background`, and optional `logoPadding`. The garage
uses square brand tiles: NVIDIA's white vertical lockup on green, Roboflow's
light symbol on purple, and SF Compute's black symbol on white. Full logos
appear on the hood and both doors, centered with padding on a 2:1 decal canvas
(512 × 256) with their original proportions. NVIDIA uses extra clear space. Saved Orbit, Sprout and Spark selections migrate to
NVIDIA, Roboflow and SF Compute, respectively.
Independent removes sponsor decals. There are no advertiser payments, uploads,
campaign scheduling or impression analytics in this version.

## Verification

```sh
npm test
npm run test:multiplayer
npm run build
```

Room checks cover host authorization, capacity, readiness and profile revisions,
cosmetic locking, input validation, token isolation, origin checks, shared
countdown and timing, recovery, disconnects, host handoff, full simulated races,
immutable results and rematches. Transport and application tests also cover
compact frames, WebSocket authentication and fallback-compatible ordering,
fixed worker ownership, capacity/drain behavior, and static cache/compression
rules. Integration tests open temporary localhost ports.

Validate the complete host/guest flow in independent browser sessions: early
invitation, live selections, readiness, host Start, two separately controlled
cars on the same map, personal finish, final standings and rematch. Include a
refresh, a disconnect, late/full/expired invites, a failed clipboard copy and
solo play with the room service unavailable. Check ties and departed racers in
the final order. A simulated server race alone does not validate the rendered
multiplayer experience.

Real remote-network latency, eight-device load and public HTTPS deployment need
separate release validation. Local tests and same-computer browser sessions do
not establish them. The implementation decisions and acceptance criteria are in
[the multiplayer flow PRD](multiplayer-flow-prd.md).
