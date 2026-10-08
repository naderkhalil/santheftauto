# Private City Loop races

**Start Race** opens directly on driver selection, followed by the car garage.
Solo players do not need to enter a name. **Invite Friends** opens the optional
nickname and room creation/join form; a room invite opens that form directly.
Friends see each other's selections live. Everyone marks Ready; the host starts
a shared five-second countdown. Rooms hold 2–8 racers.

The garage uses the same Victorian facade builders, timber PBR materials, HDR sky,
Neutral tone mapping and ambient occlusion as the city. `racer-kit.glb` contains
the playable open-cockpit car, four independent wheel pivots, and standing/seated
models of all four drivers. Setup, solo races and remote multiplayer cars use
that same kit. Paint and sponsor choices persist into gameplay. All three car
choices share the open-cockpit chassis and equal physics; the distinction is paint.

Editable source: `art/source/racers-and-garage.blend`. Rebuild with
`tools/blender/build_racer_assets.py`; this reuses the actual architecture helpers
from `build_cerebral_heroes.py`. The old art study remains in Git for comparison.
The garage is a separate download, so racing peers do not load its buildings.
If the new kit fails to load, the existing procedural car remains as a playable
fallback and the console reports the failure.

Cars have equal handling and no player-to-player collisions. The starting grid
uses join order. Union Square shortcuts remain valid; the ordered Powell,
Chinatown, waterfront and finish checkpoints still apply. Timing and simulation
run on the server. A client submits controls, never its own location or result.
Races end after five minutes, or one minute after the first finisher. Remaining
racers receive DNF. The host can reopen the lobby for a rematch.

Q recovers onto the road. Escape opens the room menu without pausing the race.
Changing tabs releases the controls. An interrupted connection can reconnect
with the same identity; refreshing preserves the session in that tab. A racer
missing for 30 seconds receives DNF. The host role passes to a connected racer
when the current host disconnects. Empty rooms expire, with a two-hour maximum
room lifetime. Rooms and results are held in memory and disappear on server restart.

## Development and hosting

Requires Node 22.21 or newer (native TypeScript stripping).

```sh
npm install
npm run dev
```

Restart an already-running Vite process after first adding `vite.config.ts`.
The Vite plugin serves the room API on the same origin as the game. For another
device on the same Wi-Fi, open Vite's printed Network URL before creating a room.
A localhost invite only works on the same computer.

Production:

```sh
npm ci
npm run build
npm start
```

`PORT` defaults to 3000; `HOST` defaults to `0.0.0.0`. This single Node process
serves both `dist` and `/api/rooms`. Static-only hosting and `vite preview` do not
provide rooms. To share internet invites, deploy this process behind HTTPS with
an origin-preserving proxy. Allow streaming responses, disable buffering on
`/api/rooms/*/events`, and allow long-lived requests. Use one server instance;
room affinity/shared state is required before scaling across instances.
No paid service or external account is required by the implementation.

Transport uses same-origin JSON control requests and a 20 Hz streamed snapshot
feed. Clients smooth rendered positions. The server runs the existing simulation,
including parked traffic and checkpoint/recovery rules. Authentication uses random
per-racer bearer tokens in headers; invite links contain only a random room code.
Incoming payloads are bounded, input values clamped, input sequences ordered,
mutations origin-checked, and requests rate-limited. Invite links are bearer
invitations: anyone with a valid room code can join a lobby until it is full.

## Drivers, cars and sponsor artwork

`src/racer-profile.ts` is the cosmetics catalogue. The four unofficial parody
characters are Dario Amodei, Sam Altman, Elon Musk, and Jensen Huang. Original
full-body 3D figures are authored in `src/founder-figures.ts`; outfits, props,
poses and playful biographies distinguish them. All four stand in one frame,
with named downward-pointing selection markers for the local player and friends.
The markers update live and support multiple racers choosing the same founder.
Saved IDs for the former four placeholders migrate to the new roster.
`src/racer-showroom.ts` renders the lineup and a large, rotatable preview of the
actual game car on asphalt. Sponsor changes update its hood and doors immediately. The Sundrop
Coupe, Comet Sport (wing/stripes), and Tide Roadster (open roof/roll hoops) share
physics. Each choice is sent to every racer and shown on their opponent cars.

Fictional Orbit, Sprout and Spark logos live in `public/assets/sponsors` and are
explicitly labeled demo sponsors. Replace or add approved local SVG/PNG artwork,
then set the sponsor's `logo` path, `name`, `mark`, `color`, and `background` in the
catalogue. Artwork uses a 2:1 canvas (512 × 256); keep the mark centered with
padding. The same artwork appears in the garage, on the hood and both doors.
Independent removes sponsor decals. There are no advertiser payments, uploads,
campaign scheduling or impression analytics in this version.

## Verification

```sh
npm test
npm run test:multiplayer
npm run build
```

Room tests cover host authorization, capacity, readiness, cosmetic locking,
input validation, token isolation, origin checks, shared countdown and timing,
recovery, disconnects, host handoff, full simulated races, and rematches. The HTTP
transport test opens a temporary localhost port. Browser validation uses two
separate tabs as host and guest. Real remote-network latency and eight-device
load testing remain release validation; local testing does not establish them.
