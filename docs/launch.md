# City Loop multiplayer launch runbook

**Native Cloudflare Workers + Durable Objects is the primary deployment path.**
Use [the Cloudflare runbook](cloudflare.md) for its build, login, secrets, native
tests, publishing, durable room recovery, and $500 budget controls. That path
does not use Docker, a Node server, or the Render blueprint below. Local checks
do not replace deployed cloud gameplay and billing validation.

The rest of this document describes the **legacy Node/Render fallback** and its
local measurements. Applying that separate blueprint creates **three paid
Standard services** and requires an actual Render account/provider decision.
Do not apply it as part of the native Cloudflare release. Its room limits,
shutdown procedure, memory-only persistence, and bandwidth estimates apply only
to the Node deployment; they are not native Workers/DO capacity or cost claims.

## Legacy Node/Render topology and room ownership

[`render.yaml`](../render.yaml) defines these services in **Oregon**:

| Service | Role | Exposure | Instances |
| --- | --- | --- | --- |
| `city-loop` | Gateway and built game assets | Public HTTPS | One initially |
| `city-loop-races-00` | Race worker, ID `00` | Render private network | Exactly one |
| `city-loop-races-01` | Race worker, ID `01` | Render private network | Exactly one |

The shared environment group generates `WORKER_SECRET`. The gateway uses each
private service's `hostport` as `ROOM_WORKER_00` / `ROOM_WORKER_01`. Keep this
secret out of the client build, URLs, analytics, logs, and committed files.
Operations accept `OPS_TOKEN` as a bearer token; it defaults to the worker secret
when no separate value is configured. Private workers require the shared secret
for room requests. Their minimal `/healthz` endpoint contains no room data.

A worker owns its rooms in memory. The first two hex characters of a room code
select its worker; commands, reconnects, streams, and WebSocket input all return
to that owner. Before creating a room, the client obtains a placement key and
saves it before submitting the create request. The key includes the worker ID.
Retrying an uncertain create must use that same key and owner, even after a
gateway restart or a change in the worker pool. Only a definitive rejection
with `admitted: false` allows requesting another placement. Do not implement
automatic failover of existing rooms to an empty worker.

**Never autoscale replicas of a worker service with the same ID.** A load balancer
would send the same room to different in-memory owners. Scale out by creating a
new private worker with an unused two-character uppercase hex ID, such as `02`,
and adding `ROOM_WORKER_02` to every gateway. Give each worker exactly one
instance. Preserve all existing worker mappings while their rooms remain; a
worker being retired must drain and have its rooms expire or be deliberately
closed before its mapping is removed. Avoid reusing retired IDs, because old
invitations and saved placement keys can still exist.

The blueprint starts at `MAX_ROOMS=16` and `MAX_PLAYERS=128` per worker, below
the locally tested 32-room point to leave headroom. These are admission limits,
not a measured guarantee for a Render Standard instance. They allow at most
eight players in each room and bound total admitted players. Validate these
values on the actual host before a broad rollout; lower them if timing degrades.

## Build and local validation

Use the Node 22 line specified by `.node-version` and `package.json`.
The image pins Node `22.23.3`; the permitted runtime range is
`>=22.21.0 <23`. The server uses native TypeScript stripping.

```sh
npm ci
npm test
npm run test:multiplayer
VITE_POSTHOG_ENABLED=false npm run build
npm run start:cluster:local
```

The separate local cluster serves the gateway at `http://127.0.0.1:4100` and
workers at ports `4101` and `4102`, leaving the usual preview/server ports alone.
It generates a shared secret for its child processes. Stop it with Ctrl-C; its
short shutdown timeout is for disposable local rooms. Room links using loopback
work only on that computer. The analytics setting above applies at **build
time**; setting a Vite variable only when starting an already-built server cannot
change the JavaScript bundle. Build production with the intended production
analytics configuration.

In another terminal, exercise the cluster with disposable rooms:

```sh
npm run load:multiplayer -- --base http://127.0.0.1:4100 --rooms 2 --players 8 --duration 20 --wire v2 --inputs websocket --out docs/checkpoints/2026-10-08/launch/local-cluster-v2-ws.json
```

The harness only accepts loopback origins. It creates and cleans up its own
players, drives 20 Hz inputs, reads the actual SSE feed, and sends HTTP
heartbeats. Use `--inputs http` to check the fallback or `--wire v1` for a
full-snapshot comparison. Scale the local run gradually with `--rooms`; do not
benchmark a process currently used for interactive QA. Its room range is 1–64,
player range is 2–8, and measured duration is 1–120 seconds, after countdown.

Protected diagnostics require an existing environment variable containing the
probe secret, selected with `--secret-env LOAD_WORKER_SECRET`. The local cluster
launcher does not expose its generated secret, so a gateway smoke run can lack
private server counters. For complete per-worker measurements, use a dedicated
local worker with an explicitly managed secret and record server and generator
runtimes separately. Gateway metrics do not aggregate worker tick/input counters.

See [load methodology and measured checkpoints](checkpoints/2026-10-08/launch/load-testing.md).
The final local validation on Node 22.23.3 passed 158 gameplay tests, 67 server
tests, and the production build. Browser checks exercised two-player live picks,
Ready gating, mouse Start, shared countdown, and in-race reload recovery through
the gateway. The full-server message and its solo-selection fallback were also
verified. [Shared race](checkpoints/2026-10-08/launch/shared-race.png) and
[capacity fallback](checkpoints/2026-10-08/launch/capacity-fallback.png) screenshots
record those checks. Failure tests cover a lost create response, a stopped
worker, and an explicitly drained worker with an ongoing race.

Those runs measure server/API behavior on one computer. They exclude browser
rendering, internet latency, TLS overhead, CDN behavior, and hosting-plan
performance. WebSocket inputs have no per-message acknowledgement: the harness
reports no invented input RTT; heartbeat RTT is measured independently.

Docker is unavailable in the current local environment. The Dockerfile has
been reviewed, but the image is **unverified** until a Docker-capable CI runner
builds it and checks its runtime. Before deployment, run:

```sh
docker build -t city-loop:launch .
docker run --rm --name city-loop-launch -p 127.0.0.1:4200:3000 -v city-loop-leaderboard:/data city-loop:launch
```

In a separate terminal, check `/healthz`, `/readyz`, the root page, and a fresh
two-player room on `http://127.0.0.1:4200`. The default image role is `single`,
so this validates the image independently of Render. Also exercise gateway and
private-worker roles with the deployment's environment shape in CI or staging.
Stop and remove only this named disposable container when finished. Its named
volume retains the single-process leaderboard at `/data/leaderboard.json`
across container replacement. Back up the volume; do not share its JSON store
between concurrent servers. `LEADERBOARD_DATA_FILE` can select another writable
mounted path. The gateway/worker cluster does not provide a shared leaderboard;
use the native Cloudflare deployment for the production global board.

## Edge and cache configuration

Keep the browser, room API, SSE, and WebSocket endpoints on the same public
origin. Render provides the initial HTTPS endpoint. Set `PUBLIC_ORIGIN` on the
gateway when the final canonical origin is known, and verify origin rejection
and invitations against that exact hostname. The blueprint trusts one controlled
proxy hop. Verify Render's forwarding behavior before launch; if another proxy
is added, explicitly validate and configure the trusted hop count. Do not trust
an arbitrary client-supplied leftmost forwarding address.

An optional Cloudflare/custom-domain setup requires authorization for the real
account and domain. Do not assume it exists or change DNS as part of local
validation. Apply these rules to any edge:

| Path/content | Required behavior |
| --- | --- |
| Hashed `/assets/*-<hash>.js` and `.css` | Honor `public, max-age=31536000, immutable` |
| HTML, including `/` | Revalidate; honor `Cache-Control: no-cache` |
| Other static assets | Honor bounded origin cache policy; currently one hour |
| `/api/*`, `/ops/*`, `/healthz`, `/readyz` | Bypass cache; never cache authenticated responses |
| `/api/rooms/*/events` | Disable buffering, transformation, and response compression; permit a long-lived stream |
| `/api/rooms/*/input` | Forward WebSocket upgrades and permit long-lived sockets |

Builds generate Brotli and gzip sidecars for suitable text assets. Static
responses retain the original MIME type, vary on `Accept-Encoding`, and use
representation-specific ETags. The server only serves `dist`; runtime source
files are not a public directory. Tests cover compressed content, conditional
requests, HEAD, caching, hidden files, traversal, and unsupported methods.

## Drain before every worker deployment

Automatic deployments are disabled in the blueprint. Keep them disabled until
the deploy process can perform the drain sequence. A race can consume a
five-second countdown plus 300 seconds of racing, **305 seconds in total**.
Render's maximum shutdown delay is 300 seconds, and this server's default
signal deadline is 280 seconds. SIGTERM grace alone therefore cannot guarantee
finishing a race that has just started.

1. Send authenticated `POST /ops/drain` to each worker being updated while the
   old process is still serving. Draining refuses new admissions and starts;
   existing races, controls, and streams remain active.
2. Poll that worker's authenticated `GET /ops/metrics` until
   `health.activeRaces === 0`. Countdown rooms count as active races.
3. Only then trigger the worker deployment. Keep its gateway mapping unchanged.
4. Verify the replacement's version, health, private routing, and capacity.
   A newly started process accepts rooms again; drain is not persisted.

For example, this script can run **inside the target worker's Render Shell**.
It uses that worker's environment, prints only race counts, and never deploys:

```sh
node --input-type=module <<'NODE'
const origin = `http://127.0.0.1:${process.env.PORT || 10000}`;
const token = process.env.OPS_TOKEN || process.env.WORKER_SECRET;
if (!token) throw Error('Operations token is missing');
async function request(path, method = 'GET') {
  const response = await fetch(origin + path, {
    method, headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error(`Operations request failed: ${response.status}`);
  return response.json();
}
await request('/ops/drain', 'POST');
const deadline = Date.now() + 10 * 60_000;
for (;;) {
  const metrics = await request('/ops/metrics');
  if (metrics.role !== 'worker' || !Number.isInteger(metrics.health?.activeRaces)) {
    throw Error('Expected worker race metrics');
  }
  console.log({ activeRaces: metrics.health.activeRaces });
  if (metrics.health.activeRaces === 0) break;
  if (Date.now() >= deadline) throw Error('Drain did not complete; do not deploy');
  await new Promise(resolve => setTimeout(resolve, 2000));
}
NODE
```

Rooms are in memory. Even after active races finish, deploying a worker loses
its lobbies, results, invitations, and any race still active if the drain was
skipped or forced. Plan a maintenance window when preserving those rooms is
important; the current implementation does not migrate them. A drain cannot
be undone through the public operations API; restarting after races finish
creates a fresh accepting process.

For a compatible gateway-only change, keep workers alive and retain all their
mappings. Gateway replacement may reconnect streams and sockets, but must not
change a room's owner. For protocol or course changes that are not backward
compatible, drain both workers first and use a coordinated maintenance rollout.
Do not mix incompatible client and worker versions in live rooms.

## Metrics, alerts, and traffic bursts

Authenticated `/ops/metrics` and aggregate JSON logs expose these signals.
Collect **each worker**, because the gateway's report does not include their
simulation counters. Public `/healthz` is a liveness check and remains 200 when
full or draining; use `/readyz` and authenticated accepting/capacity data for
readiness and admission decisions. Workers require secret authentication for
`/readyz`. Do not restart a healthy worker just because its room slots are full.

| Signal | Initial operator action |
| --- | --- |
| `api.lastTickMs`, `totalTickMs / ticks`, `maxTickMs` | Track against the 50 ms tick interval; investigate sustained execution near/exceeding that budget |
| `api.lastTickLagMs`, `maxTickLagMs` | Investigate repeated missed scheduling windows; lifetime maxima alone are not a percentile |
| `eventLoop.p99Ms`, `eventLoop.overloaded` | Alert on sustained delay; the default overload gate trips after three samples over 100 ms and clears after five good samples |
| `health.activeRooms`, `activePlayers`, `availableSlots`, `accepting` | Add headroom before slots exhaust; distinguish full, draining, and overloaded |
| `api.streams`, `wireV2Streams`, `streamBytes`, `streamFrames` | Track feed bandwidth and unexpected stream loss/reconnect behavior |
| `input.connections` and input counters | Compare accepted input rate with expected active racers; investigate rejected inputs and socket loss |
| `memory.rssBytes`, `heapUsedBytes` | Alert before the actual plan's memory limit; watch sustained growth across room churn |

Measure deltas for cumulative counters. Tick percentiles are not supplied by
the current API. Configure uptime, error-rate, and capacity alerts in the
authorized hosting/monitoring account, and establish thresholds from staging
measurements rather than treating these local observations as production SLOs.
Keep tokens, room codes, player names, and invitation URLs out of monitoring.

Set a monthly spending ceiling before provisioning. Check the current compute,
included transfer, and excess-transfer prices in the actual Render account;
three fixed service plans do not cap bandwidth charges. Configure spending
notifications at 50%, 80%, and 100% of the approved budget wherever the provider
supports them, and verify whether any limit is an alert or an enforced cutoff.
Leave automatic scaling disabled. Record who can authorize another worker.

Bandwidth is material for this game: the local 16-room/128-player workload used
4.805 MB/s of SSE payload, about 17.3 GB per hour of continuous racing per worker.
Two equally busy workers would produce about 34.6 GB/hour before TLS, HTTP,
static assets, or other traffic. This is a workload projection, not a bill or
measured public usage. Track actual transfer after the first staging races and
use static caching to avoid repeatedly serving the large game assets. When
the budget is close, drain new multiplayer admissions while existing races
finish; keep solo play available. Do not rely on a room-count limit as a dollar cap.

During a burst, let capacity/overload admission gates reject additional rooms
while existing racers continue. If needed, manually drain an affected worker;
keep its forwarding path available. Lower `MAX_ROOMS` / `MAX_PLAYERS` for the
next replacement after draining, and add a new unique worker ID if capacity
has been validated. Configuration changes normally restart a process, so do
not reduce limits by triggering an immediate live-race deployment. Keep the
gateway and static assets up so single-player remains usable. Do not move
existing rooms to another worker or repeatedly restart an overloaded owner.

## Rollout and rollback checklist

- Obtain the actual Render account and approval for the three paid services;
  confirm budget, region, and initial capacity settings before applying the blueprint.
- Pass gameplay/server tests, a production build, and Docker image smoke checks.
  Record the source revision and immutable image/release identifier.
- Validate the two-worker topology in staging: new room placement on both IDs,
  owner-affine retries/reconnects, private-worker access, and authenticated ops.
- Validate public HTTPS with independent devices and networks: copy/open an
  invitation, live character/car selections, Ready gating, host Start, shared
  countdown, independent driving on the same map, finish/DNF order, and rematch.
  Complete a real winning lap; a synthetic all-DNF run is insufficient.
- Check WebSocket input, HTTP fallback, SSE immediacy, reload, host handoff,
  full/late/expired invites, and single-player when room admission is unavailable.
- Verify cache headers/compression through the actual edge, origin enforcement,
  proxy address handling, and that private operations are not publicly readable.
- Run a controlled workload on the intended worker size behind its real proxy
  using separately approved staging infrastructure. The loopback-only harness
  must not be casually pointed at production or presented as a remote test.
- Prove the manual drain sequence completes before restart. Confirm the expected
  loss of old in-memory rooms and clear handling of stale invitations afterward.
- Roll out to a small audience first, watch per-worker metrics, and raise limits
  only with evidence from that environment.

For rollback, stop new admission with drain, wait for active races to finish,
then redeploy the recorded compatible previous release. Preserve worker IDs,
private mappings, secrets, and the public origin. Roll back the gateway and
workers together when their protocols differ. Never run two live copies of the
same worker ID as a rollback strategy. A rollback restores software, not lost
in-memory rooms or results. Verify health, a fresh host/guest race, and solo
play before reopening broadly.

Current evidence does not establish a public launch, successful Docker image,
remote-network responsiveness, eight-device rendering performance, or capacity
on the paid hosting plan. Those remain release gates.

## Mobile rendering

Phones and touch-first tablets select the mobile rendering profile before any
renderer, reflection buffer, or asset loader is created. iPadOS desktop-mode
user agents are included. This profile caps the main canvas at one million
pixels, uses direct rendering without postprocessing/shadows/HDR, loads only
existing building LODs, and stages asset groups to reduce decode peaks. Driver
and car selection use a static 2D preview instead of a second WebGL renderer.
Race physics, checkpoints, and leaderboard verification use the same code.

`public/assets/models/racer-kit-mobile.glb` preserves the desktop model graph
and geometry with embedded textures limited to 512 pixels. Regenerate it with
`python3 tools/prepare-mobile-assets.py` (Pillow required). Its decoded RGBA
texture payload is 21 MiB instead of 147 MiB; GPU mipmap estimates are 28 MiB
instead of 196 MiB. The mobile file is requested directly, so the original
textures are never decoded on that path.

Use `?graphics=mobile` for desktop QA of the same conservative path. It cannot
force a phone back to desktop allocations. Browser viewport emulation and
macOS Safari checks do not replace testing on a physical iPhone/iPad. For a
release check, load a fresh page, select a driver/car, race through the course,
open results/leaderboards, and return from a backgrounded tab. A lost graphics
context presents a reload action instead of leaving an unresponsive canvas.
