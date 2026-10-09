# Native Cloudflare multiplayer deployment

Cloudflare Workers, static assets, and SQLite-backed Durable Objects are the
primary deployment path. This runs the game without a Node server, Docker, or
Render. Each room has one Durable Object that owns its simulation, players,
connections, and saved state. The existing [Node/Render runbook](launch.md)
remains a fallback; its process limits and load measurements do not describe
Cloudflare capacity or billing.

The approved spending budget is **$500**. The implementation does **not** configure
an enforced $500 billing cap. Use an account with the appropriate paid Workers /
Durable Objects access, verify its current pricing and usage limits, and set up
the operating controls below before opening broadly. Authentication, a successful
upload, and a local test run are separate from public gameplay validation.

## Architecture and protocol

`cloudflare/index.ts` is the stateless public router. The full eight-character
room code selects `ROOMS.idFromName(code)`, so all players in one race reach the
same `RaceRoom`. New rooms use different objects; no central room actor processes
every input or simulation tick. A room holds up to eight players. There is no
configured account-wide room count or dollar quota.

Placement returns a room code plus a random idempotency key. The client saves
that key before creation, and an uncertain create retries the same room object.
The object persists successful admissions before acknowledging them. An expired
object keeps a small `everCreated` marker so its old invite cannot silently
become a different race. Never change routing to select a random object per
request, and never retry an ambiguous create on a different object.

The create/join/claim response advertises `transport: duplex-v2`. The browser
then uses `/api/rooms/<code>/socket` for authenticated controls and compact room
updates on one WebSocket. Profile changes, Ready, Start, Leave, and rematch use
HTTP. HTTP heartbeats remain available, and controls fall back to HTTP when the
socket cannot send. After repeated duplex connection failures, the client can
read room state through `/events?wire=v2`; `/input` also supports the separate
input socket used by the Node transport. Keep every endpoint on the same
browser origin.

The room runs a 50 ms interval while a countdown/race is active, or an SSE client
needs a live stream. Racing sends compact updates at a target 20 Hz; full room
metadata is sent when it changes. Idle duplex lobbies do not require that
simulation interval and use hibernation-capable WebSockets. Heartbeats, commands,
and cleanup alarms still wake the object and can write storage, so idle rooms
must not be described as zero-cost.

Tokens travel in HTTP authorization headers or the first WebSocket claim
message, never socket or invitation URLs. Session generations retire old tabs,
and sequence numbers reject delayed inputs across transports. The public router
checks Origin, rejects cross-site browser requests, replaces internal routing
headers, and applies address-based rate limits. Each room additionally bounds
payloads, pending connections, sockets, and per-session input traffic. These
are abuse protections, not a global spending cap.

## Saved state and restart behavior

The actor stores a versioned room checkpoint in its SQLite-backed Durable Object
storage. Semantic changes such as admission, selections, readiness, Start,
Leave, and results are saved before successful acknowledgements. Active rooms
target a physics checkpoint every second and maintain a one-second watchdog
alarm. Idle rooms use a slower cleanup alarm. A process reset resumes from the
latest successfully saved checkpoint; progress since that write can be lost.

The checkpoint includes private claims, admission retry keys, revisions,
generations, input sequences, full dynamic physics, departed race entrants,
standings, and the original start/deadline times. Current members and their race
entrants recover the same player identity. Saved checkpoints are private server
data and must never be returned as a client snapshot or copied into public logs.

Recovery neutralizes every driver's controls and does not simulate the offline
gap. The race clock and deadline keep running, so a reset neither grants extra
time nor awards a fabricated finish. Valid retained duplex sessions keep their
readiness and generation. Other players reconnect within their existing grace
period; a restore does not mint another 30 seconds. Room lifetime remains two
hours. A per-room drain flag also survives hibernation and restart.

Normal client snapshots contain the roster, visible nicknames/cosmetics,
positions, readiness, and standings, without bearer tokens or retry keys.
Operations metrics are aggregate. Gameplay analytics is separately documented
in [README](../README.md#usage-analytics), including its nickname/lineup events;
invitation queries and credentials must not be added to those events. Treat
provider request logs as restricted operational data because room routes can
include an invitation code, and verify their retention/access settings.

## Local build and verification

Use the repository's Node 22 toolchain to build and run tests; it is a development
dependency, not the production server runtime.

```sh
npm ci
npm test
npm run test:multiplayer
npm run test:cloudflare
VITE_POSTHOG_ENABLED=false npm run build:cloudflare
npm run dev:cloudflare
```

Open `http://127.0.0.1:8787` for the local Worker. The usual `npm run dev` remains
the Vite/Node development path and does not validate Durable Object behavior.
Use independent browser sessions for host and guest. A loopback invite works
only on that computer.

`build:cloudflare` builds the frontend, prepares `dist-cloudflare`, type-checks
the Worker, and performs a Wrangler dry-run bundle. It does not publish.
`dev:cloudflare` runs the local Worker with Wrangler. `test:cloudflare` exercises
the native adapter with local workerd through Miniflare. The pinned Miniflare
line is **`5.20261006.1-alpha`**; its results are local development evidence, not
a guarantee about deployed Cloudflare timing, socket behavior, or billing.

With that local Worker running, exercise the native duplex transport:

```sh
npm run load:multiplayer -- --base http://127.0.0.1:8787 --rooms 2 --players 8 --duration 20 --transport duplex --wire v2 --inputs websocket
```

The runner accepts only loopback origins, creates its own rooms, and leaves only
its own players. It sends 20 Hz controls and two-second HTTP heartbeats, measures
after the countdown, and saves a JSON report. `--transport auto` negotiates the
advertised native duplex feed; `--transport sse` forces the fallback feed. Duplex
requires `--wire v2 --inputs websocket`. Use `--inputs http --transport sse` to
check HTTP controls with the fallback feed.

For server counters, provide the local Worker's operations token through the
`LOAD_WORKER_SECRET` environment variable, or select another environment variable
with `--secret-env`. Do not put the token in a URL or report. The runner discovers
Cloudflare's per-room metrics endpoint and aggregates only the rooms it created;
these are not account-wide metrics. Reports distinguish duplex/SSE client counts,
feed bytes, acknowledgement bytes, accepted controls, and HTTP heartbeat latency.
WebSocket controls have no per-input acknowledgement, so their latency remains
unmeasured. Actor eviction can reset counters, and native tick duration is not
reported when only tick counts are available. This local workload excludes
browser rendering, assets, TLS, internet latency, and Cloudflare billing.

The Cloudflare asset preparation excludes only the disabled course model
`assets/cerebral-valley/neighborhood.glb` from the playable asset tree: it is
about 29.8 MiB, above the 25 MiB per-asset upload limit. Its original file remains
in the normal build/source assets. This is not a blanket exclusion of large
game assets: any other file over the limit fails the preparation step. Hidden
files and precompressed `.br`/`.gz` sidecars are omitted from the upload, and
Cloudflare serves the prepared static files. HTML revalidates; built asset
scripts/styles use immutable caching. API, operations, and health paths run
through the Worker and bypass static caching.

Analytics configuration is baked into the frontend. The example above disables
tracking for local checks. Production builds default to the supplied public
project token and US host unless `VITE_POSTHOG_*` build settings override them.
Changing Worker runtime variables cannot change an existing browser bundle.

## Account, secrets, and first deployment

The checked-in Worker name is `whimsical-sf`, with `workers_dev: true` and preview
URLs disabled. Its custom domains are `santheftauto.com` and
`www.santheftauto.com`. The original
`whimsical-sf.nader-khalil.workers.dev` hostname remains enabled for existing
links. All three hostnames use the same Worker and Durable Object namespace.

```sh
npx wrangler login
npx wrangler whoami
npx wrangler secret put OPS_TOKEN
npm run deploy:cloudflare
```

Complete the browser login and verify the intended account. Generate a random
operations token of **at least 32 characters** and enter it at Wrangler's secret
prompt. Store it in the operator's password manager; never put it in the frontend,
`wrangler.jsonc`, a committed environment file, or a URL. The router rejects
operations access when the secret is absent or shorter than 32 characters.
For local operations checks, use a git-ignored `.dev.vars` file with a disposable
token. Local secrets do not configure the deployed Worker.

`deploy:cloudflare` rebuilds and then publishes the Worker/assets, so use the
intended production analytics settings for this command. Record the actual
account, Worker version/deployment identifier, source revision, and returned
HTTPS URL. Confirm `/healthz`, load the game, and run the deployed host/guest
checks below before sharing the URL widely.

Keep `PUBLIC_ORIGIN` unset: the requested Worker origin is the allowed browser
origin. This lets same-origin APIs and WebSockets work on both custom domains and
the original `workers.dev` hostname. Setting it to only one origin would reject
API requests from the other two even though their static pages still load.
Share `https://santheftauto.com/` for new games. Invitation links derive from the
current browser origin. Browser session storage is per-origin, so players should
finish an existing race on its original hostname rather than switch mid-race.

### Custom domain DNS

Namecheap remains the registrar. Its Custom DNS nameservers are
`brett.ns.cloudflare.com` and `sreeni.ns.cloudflare.com`; Cloudflare manages the
zone on its Free DNS/SSL plan. The two `custom_domain` routes in
`wrangler.jsonc` create Worker-managed DNS records and certificates. Use
`npx wrangler triggers deploy` to apply routing-only changes without replacing
the deployed game bundle. Do not create parking A records or a CNAME to
`workers.dev` for these names.

The migration preserved the five Namecheap forwarding MX records and the SPF
TXT record. Namecheap's old parking A record and `www` parking CNAME were
removed. Future email changes belong in Cloudflare DNS. Cloudflare's Always Use
HTTPS setting redirects HTTP requests to HTTPS while preserving paths and invite
queries; both apex and `www` serve the game directly.

After a DNS change, confirm the registrar delegation, Cloudflare zone activation,
valid HTTPS on both hostnames, `/healthz`, assets, and same-origin WebSockets.
For one bounded two-player room spanning both hostnames:

```sh
SF1_SMOKE_ORIGIN=https://santheftauto.com \
SF1_SMOKE_PEER_ORIGIN=https://www.santheftauto.com \
SF1_SMOKE_MODE=start \
SF1_SMOKE_REPORT=docs/checkpoints/2026-10-09/domain/custom-domain-smoke.json \
node --experimental-strip-types tools/smoke-cloudflare.ts
```

This checks room creation, joining, readiness, race start, movement, and cleanup;
it is not a full-race or load test. The smoke tool accepts only the three owned
production origins above. DNS caches can retain old answers during propagation.

### Link previews

`index.html` includes Open Graph and X/Twitter large-image card metadata in the
initial HTML, so sharing does not depend on JavaScript or loading the game.
All three hostnames use the public image at
`https://santheftauto.com/social/san-theft-auto-v2.jpg` and the title
"San Theft Auto — Race San Francisco". The canonical URL does not redirect
players or remove room queries from their actual invitation URLs.

The 1200 × 630 cover preserves the game's own cars and drivers over an actual
screenshot of the Blender-built Ferry Building and Bay Bridge. The source
screenshot is `art/social/city-waterfront.jpg`. To recapture it, start Vite with
`VITE_POSTHOG_ENABLED=false`, open `/art/social/city-capture.html` at 1200 × 630,
choose **Watch a Run → The Bay**, let the camera settle, then use **Hide interface
for screenshot**. Reload to restore the controls.

The composition source is `art/social/share-card.html`. Open it at 1200 × 630,
wait for `body[data-ready="true"]`, then capture the full viewport as JPEG.
Check the exported dimensions after resizing the browser. Only the exported
cover is published; authoring pages and the raw screenshot are outside the
production build entry points. Keep older versioned covers available for cached cards.

When replacing the artwork, use a new versioned filename and update both the
Open Graph and Twitter image URLs. Rebuild and deploy the assets, then verify
the raw HTML and image with a crawler user agent on the apex, `www`, and
`workers.dev` hostnames. Image requests must return 200 with `image/jpeg`, valid
HTTPS, and no authentication or bot challenge. Messaging apps and X may retain
previews they previously cached; a successful origin check does not purge those
third-party caches.

## Preserve the Durable Object namespace

The `ROOMS` binding targets the exported `RaceRoom` class. The checked-in
`v1-race-rooms` migration creates it as a SQLite-backed class. Keep that migration
history, the class/binding identity, and the deployed namespace stable. Later
changes append migrations with new tags; do not rewrite the original migration,
delete the class, or point production at a fresh namespace to work around a
deployment problem. Room codes, saved claims, and creation tombstones depend on
the original object identity.

The stored core schema is versioned and tied to `COURSE_VERSION`. A code rollback
must understand the stored schema and course state. Record a known compatible
Worker version before updating; restoring old code does not automatically
restore an older database. The legacy Node/Render backend does not share these
Durable Object rooms, so moving to it is a fresh-room migration with user-visible
room loss, not transparent failover.

## Operations and the $500 budget

| Endpoint or setting | Behavior |
| --- | --- |
| `GET /healthz`, `GET /readyz` | Public edge liveness and new-room policy; not a global room inventory or capacity guarantee |
| `GET /api/rooms/health` | Requires the operations bearer token; reports per-room architecture and new-room policy |
| `GET /ops/rooms/<code>/metrics` | Authenticated room health, connection counts, ticks, input counts, frames, and payload bytes |
| `POST /ops/rooms/<code>/drain` | Authenticated, persistent per-room admission/start/rematch drain; ongoing races continue |
| `vars.NEW_ROOMS_ENABLED = "false"` | Rejects new placement/creation while preserving committed create retries and existing rooms |

To stop expansion, set `NEW_ROOMS_ENABLED` to the string `"false"` in the deployed
configuration and publish it through the same release process. The router blocks
new placements. An already-issued placement still reaches its object, which
distinguishes a saved admission retry from a fresh create and refuses the latter.
Existing rooms can continue joining, racing, reconnecting, and rematching until
normal expiry. Single-player and static assets stay available. This is a manual
admission switch; it does not freeze already-running usage or create a hard bill
cap. A per-room drain is narrower and persists; no public resume endpoint exists.

Use a staged cost guard for the authorized $500 budget:

1. Configure available account usage/billing notifications at **$250, $375, and
   $450**, and assign an operator to act on them. Verify in the account that each
   notification was actually configured; a value in this document is not an alert.
2. Watch actual Workers requests/CPU, Durable Object duration and requests,
   SQLite storage/read/write usage, logs, and any other billable account services.
   Confirm the provider's current meter definitions and prices. Do not translate
   the earlier Node SSE MB/s result into a native Workers/DO bill or CPU capacity.
3. During initial rollout, review usage frequently and project the remaining
   budget from observed spend. Consider stopping new rooms around **$400 of
   incurred or forecast spend**, leaving a reserve for ongoing rooms and delayed
   reporting. Keep the audience small until real account measurements exist.
4. If growth exceeds the forecast, turn off new rooms, let active play wind down,
   and inspect the actual billable meters before reopening. A two-hour room
   lifetime bounds a room's life, but it does not bound total account dollars.

These thresholds are an operating recommendation, not configured automation or
an enforced account cap. Cloudflare [budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)
are evaluated **once per day** and can arrive **the day after crossing a
threshold**. They do not stop usage, and reporting can also lag. The
`cpu_ms: 30000` setting limits an invocation's CPU allowance; it is not a monthly
budget. Address-based rate limits and an eight-player room limit are also not
global quotas.

If a stronger automatic admission guard is later required, keep it outside the
20 Hz simulation/input path. A small set of admission shards can lease bounded
room-creation allowances for short windows from a budget controller; an exhausted
or unavailable allowance refuses only new room creation, while persisted retry
keys and existing rooms keep working. Such a design needs metering, lease expiry,
and overshoot analysis. It is **not implemented** here and would still require a
separate explanation of any enforceable dollar limit. Do not introduce a single
global actor call for every control packet or simulation tick.

## Deployed verification and rollback

Before declaring the game ready for broad public use:

- Verify the account, secret, actual HTTPS hostname, static asset upload, and
  canonical-origin behavior. Confirm operations requests fail without the token.
- Complete a host/guest race on separate devices and networks: early invite,
  live selections, readiness, host Start, countdown, independent driving, a real
  winner, final order/DNFs, and rematch. Test reload and session takeover.
- Check duplex WebSockets and the HTTP/SSE fallback through the deployed edge.
  Verify reconnection after an object restart and lobby readiness after a valid
  hibernated connection wakes. Confirm controls reset and the deadline persists.
- Confirm a lost create response retries the same room and player. Set the
  new-room switch off and verify existing rooms and admitted retries still work,
  while a fresh create is refused and single-player remains usable.
- Run a bounded, separately approved native workload and observe actual latency,
  duration/CPU, storage operations, socket behavior, and billing meters. The
  loopback-only runner supports the native duplex transport and per-room metrics,
  but its local results and the earlier Node load runs do not validate deployed
  Cloudflare scalability, charges, or a $500 operating envelope.
- Record the checks against the deployed version. Local Miniflare, dry-run
  bundling, and authentication alone leave this cloud validation pending.

For a problematic release, stop new rooms, keep the namespace intact, and deploy
the recorded compatible previous Worker version. Check storage schema/course
compatibility before rollback. Drain known rooms before incompatible changes and
wait for their active races to finish. There is currently no global room-inventory
or drain-all endpoint, so do not claim a bulk drain succeeded from edge health
alone. Existing objects must remain available for their members and normal
expiry. Recheck a fresh room and solo play before restoring new-room admission.
