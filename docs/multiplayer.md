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
models of all four drivers. Setup, solo races and remote multiplayer cars use
that same kit. Paint and sponsor choices persist into gameplay. All three car
choices share the open-cockpit chassis and equal physics; the distinction is paint.

Editable source: `art/source/racers-and-garage.blend`. Rebuild with
`tools/blender/build_racer_assets.py`; this reuses the actual architecture helpers
from `build_cerebral_heroes.py`, detailed fixtures from `racer_garage.py`, and
continuous character sculpts from `racer_characters.py`. The old art study remains
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
Empty rooms expire, with a two-hour maximum room lifetime. Rooms and results
are held in memory and disappear on server restart.

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
full-body Blender sculpts are authored in `tools/blender/racer_characters.py`;
face proportions, shaped hair, tailored outfits and biographies distinguish them. All four stand in one frame,
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

Room checks cover host authorization, capacity, readiness and profile revisions,
cosmetic locking, input validation, token isolation, origin checks, shared
countdown and timing, recovery, disconnects, host handoff, full simulated races,
immutable results and rematches. The HTTP transport test opens a temporary
localhost port.

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
