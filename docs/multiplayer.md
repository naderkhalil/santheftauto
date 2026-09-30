# Private City Loop races

The release offers one playable map. Create a room from **Race Friends**, choose
a racer name, driver, car and sponsor, then copy the invite link. Friends open
the link, choose their cosmetics, and join. Everyone marks Ready; the host starts
a shared five-second countdown. Rooms hold 2–8 racers.

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

`src/racer-profile.ts` is the cosmetics catalogue. Four placeholder driver
identities have distinctive helmet colors and in-game name badges. The Sundrop
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
