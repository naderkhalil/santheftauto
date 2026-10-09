# Local multiplayer load measurement

`tools/load-multiplayer.ts` measures the real HTTP room API and multiplayer feed on an
explicit loopback origin. It creates its own rooms, admits 2–8 players per room,
opens one feed per player, confirms the course/profile revisions, starts the
rooms, waits through the shared countdown, then drives each racer using the
existing demonstration autopilot. It sends inputs at a target 20 Hz and a client
heartbeat every two seconds. No browser, user session, or existing room is used.

The current runner negotiates Cloudflare's `duplex-v2` transport from admission
responses and sends bounded-feed acknowledgements: immediately for snapshots,
then every five frames or after 500 ms on the next frame. Legacy Node servers use
SSE plus an input socket. `--transport duplex` requires the native duplex path;
`--transport sse` explicitly exercises the fallback. `--wire v1` and
`--inputs http` also use SSE. The default is `--transport auto`.

The default target is `http://127.0.0.1:4100`; the isolated launch measurements use
`http://127.0.0.1:4103`. Non-loopback targets, embedded
credentials, URL paths, redirects, and query strings are rejected. Start a
dedicated server process first; avoid benchmarking the instance used by browser
QA. Server and generator should be separate processes. Room creation follows the
placement contract when available and retains each returned idempotency key.
Admission retries use the same key. A capacity 503 stops further admission;
already-created rooms still run and are cleaned up. Finally, the runner sends
Leave only using its own tokens, guests before hosts, and closes its streams.

## Reproduce

Requires a compatible Node runtime with native TypeScript stripping. The tool
uses Node core APIs, the game's existing `ws` dependency, and local game/protocol
modules. The generator runtime is recorded in each report; server runtime must
be recorded separately when it differs.

```sh
node --experimental-strip-types tools/load-multiplayer.ts --help
node --experimental-strip-types tools/load-multiplayer.ts --base http://127.0.0.1:4103 --rooms 2 --players 8 --duration 20 --wire v2 --out docs/checkpoints/2026-10-08/launch/load-2-rooms-v2-ws.json
node --experimental-strip-types tools/load-multiplayer.ts --base http://127.0.0.1:4103 --rooms 16 --players 8 --duration 20 --wire v2 --out docs/checkpoints/2026-10-08/launch/load-16-rooms-v2-ws.json
node --experimental-strip-types tools/load-multiplayer.ts --base http://127.0.0.1:4103 --rooms 32 --players 8 --duration 20 --wire v2 --out docs/checkpoints/2026-10-08/launch/load-32-rooms-v2-ws.json
```

Use `--base http://127.0.0.1:PORT` for another dedicated local port and `--wire v1`
for the full-snapshot comparison. Inputs default to the WebSocket fast path;
`--inputs http` measures the HTTP fallback. If the health endpoint is protected, put its
probe secret in `LOAD_WORKER_SECRET`, or name another existing environment
variable with `--secret-env`. The tool never prints or stores this secret,
session tokens, invitation codes, or nickname rosters.

Cloudflare operations use the same environment value as a Bearer token. The
runner first identifies `perRoom: true` from the protected health endpoint, then
reads `/ops/rooms/<code>/metrics` only for its own newly created rooms. Reports
retain metrics by room index, without room codes. They sum accepted inputs and
delivery counters for those actors; they do not imply a global room census.
Tick durations remain `null` because the native adapter currently exposes counts
without CPU timing samples. Counter resets during actor eviction invalidate
counter-delta measurements.

Run Cloudflare load checks with isolated temporary persistence and a frozen
bundle, or ensure a dedicated Wrangler instance does not reload during the run.
Multiple Wrangler processes must not share a persistence directory. Source edits
can restart a watched runtime, so a run interrupted by reload is invalid. The
initial Cloudflare attempt in `load-cloudflare-interrupted-reload.json` captures
such an interruption: workerd stopped during reload with `SQLITE_BUSY_RECOVERY`,
and cleanup requests could not reach it. It is not a capacity result.

The duration is the racing measurement window, after admission and countdown.
Each run also needs setup and cleanup time. The runner reports progress every
ten seconds. Ctrl-C stops scheduling and begins cleanup; a forced process kill
can prevent cleanup. Do not treat a partial run as a successful capacity result.

## What the report means

- Request p50/p95/p99 values measure end-to-end command response time observed
  by the local generator. Setup, warmup, measurement, and cleanup have separate
  buckets. Failed requests remain in the distributions and status counts.
- Payload bandwidth counts HTTP JSON, SSE, and duplex WebSocket body bytes,
  including separate outbound feed and acknowledgement counters. It excludes
  HTTP headers, connection framing, TLS, retransmissions, static assets, and
  analytics traffic. It is not a complete network-interface bandwidth reading.
- Delivered inputs per client per second is checked against the 20 Hz target.
  WebSocket delivery uses the server's accepted-input counter delta; enqueued
  client frames are reported separately. The HTTP fallback permits at most one
  input request outstanding per client. Busy-client skips and WebSocket buffer
  backpressure are counted rather than building an unbounded request queue.
- SSE and duplex feeds are parsed, and wire-v2 frames use the production
  decoder. Arrival intervals and `Date.now() - serverNow` are local timing
  observations, not internet latency guarantees. A disconnected stream is
  counted as an error; the generator does not silently hide it with reconnects.
- Server tick counters come from the health endpoint when available. Mean tick
  duration uses the start/end counter delta. A server's `maxTickMs` is cumulative
  since boot; it is not a measured-window percentile. No tick p95/p99 is invented
  from an average or maximum. Generator event-loop delay is reported separately.
- WebSocket inputs have no per-message acknowledgement. Their latency is
  intentionally null. HTTP heartbeats provide measured command RTT; a socket
  send callback is not presented as a server acknowledgement.

The generator and server run as separate processes, but share the same local CPU
and operating system. Generator CPU contention can affect the server, and both
also compete with any concurrent browser or development work.

These tests establish a local server workload envelope. They do not establish
public launch capacity, device rendering performance, two-device play across
different networks, reverse-proxy behavior, or performance of a particular
hosting plan. Re-run on the proposed worker size behind its real proxy before
raising production room limits.

## Native Cloudflare measurement record

An isolated frozen production bundle ran in local workerd with SQLite-backed
room actors and the configured native rate-limit bindings. It used a unique
temporary persistence directory, with no file watcher. Node 22.21.0, macOS;
Miniflare 5.20261006.1-alpha. These are local workload checks, not Cloudflare
edge capacity or billing measurements.

| Run | Rooms / players | Measured racing | Heartbeat RTT p50 / p95 / p99 (ms) | Feed body MB/s | Accepted inputs / player / s | Errors / cleanup failures |
| --- | --- | ---: | --- | ---: | ---: | --- |
| Native duplex | 2 / 16 | 20 s | 6.95 / 19.23 / 75.88 | 0.741 | 19.74 | 0 / 0 |
| SSE + HTTP fallback smoke | 1 / 2 | 3 s | 6.15 / 6.47 / 6.47 | 0.022 | 19.66 | 0 / 0 |

The duplex run accepted 6,320 inputs, sent 1,536 feed acknowledgements, and
reported no input scheduling skips. All 16 players left successfully. Native
metrics confirmed eight sockets and zero SSE streams in each room. The fallback
smoke used two SSE streams and HTTP controls; both players left successfully.
Its 118 measured input requests had p50 / p95 / p99 round-trip times of
2.99 / 7.83 / 9.90 ms. Three seconds verifies fallback operation, not sustained
capacity. Both modes deliberately retain two-second HTTP heartbeat probes for
measured command latency.

Reports: [native duplex](load-cloudflare-2-rooms-duplex.json),
[fallback smoke](load-cloudflare-fallback-smoke.json). Native tick timings and
WebSocket input latency are unmeasured and remain `null` in the reports.

The separate native integration suite has 13 default scenarios, plus an opt-in
complete race that drives both players in real time through normal WebSocket
controls. It is intentionally excluded from the quick default suite:

```sh
SF1_FULL_RACE=1 node --experimental-strip-types --test --test-name-pattern 'full race finishes' cloudflare/integration.test.ts
```

## Legacy Node measurement record

Completed on 8 October 2026 against a dedicated single-process server at
`127.0.0.1:4103`, configured for 32 rooms/256 players. Server: Node 22.23.3.
Generator: Node 22.21.0, macOS. Each main run measured 20 seconds of active racing
after the shared countdown, with eight players in every room. The generator and
server were separate processes on the same development machine; these are not
measurements of a hosted worker plan. Other development/browser work was not
disabled. Freshly created test rooms only were used.

| Rooms / players | Snapshot wire | Heartbeat RTT p50 / p95 / p99 (ms) | SSE body MB/s | Mean server tick (ms) | Accepted inputs per player/s | Errors |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 2 / 16 | v1 full | 3.32 / 6.46 / 8.86 | 4.144 | 3.19 | 19.60 | 0 |
| 2 / 16 | v2 compact | 3.38 / 6.18 / 7.39 | 0.600 | 3.11 | 19.60 | 0 |
| 16 / 128 | v2 compact | 15.53 / 21.12 / 27.88 | 4.805 | 15.66 | 19.59 | 0 |
| 32 / 256 | v2 compact | 32.96 / 44.07 / 53.81 | 9.579 | 32.11 | 19.60 | 0 |

MB is decimal. All four runs used WebSocket inputs and HTTP heartbeats. Every
created player left successfully (16, 16, 128, and 256 respectively), with zero
input scheduling/backpressure skips. Accepted-input counts came from the server,
not from socket send callbacks. The approximately 19.6 Hz delivered rate reflects
the observed roughly 51 ms local scheduling interval around a 50 ms target.

The two-room comparison reduced SSE body traffic by **85.5%** with v2. This is a
format comparison using the current server in both runs, not a historical server
benchmark. At 32 rooms, the mean tick used 32.11 ms of the target 50 ms interval;
the final sampled server event-loop p99 was 46.04 ms and overload protection had
not triggered. That is substantially less timing margin than the 16-room run.
The 32-room stream payload alone was about **76.6 Mbit/s** before transport
overhead, which must be included in deployment bandwidth planning.

Raw reports:

- [Two rooms, v1 + WebSocket](load-2-rooms-v1-ws.json)
- [Two rooms, v2 + WebSocket](load-2-rooms-v2-ws.json)
- [Sixteen rooms, v2 + WebSocket](load-16-rooms-v2-ws.json)
- [Thirty-two rooms, v2 + WebSocket](load-32-rooms-v2-ws.json)

A separate [capacity smoke run](load-capacity-33-requested.json) requested 33
rooms with two players each. The server admitted 32 rooms and refused the 33rd
placement with `503 SERVICE_BUSY`. The admitted 64 players completed a two-second
measurement and all 64 left successfully. Its one reported error is the expected
capacity response; the runner exited successfully. This checks admission and
cleanup behavior, not another peak-throughput claim.

These short runs do not prove sustained peak capacity or network play quality.
Use the measured 32-room result as a tested local load point; retain a conservative
production admission cap until the same checks pass on the selected worker size.
