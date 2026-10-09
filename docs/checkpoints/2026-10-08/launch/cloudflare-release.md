# Cloudflare release verification — October 8, 2026

## Multiplayer motion repair

The current deployment is `98905fc1-dbc6-489b-9906-43b884672d9f`, superseding
the initial launch versions below. Evidence is in
[multiplayer-motion](../multiplayer-motion/). Both players must reload to obtain
the new browser bundle, `index-3FJHGtxZ.js`.

Road rendering previously discarded the smoothed world position and used raw
network progress. Local and remote racers also chased the newest packet with
exponential damping, which pulses even at a steady server update rate. The
client now interpolates complete poses on a bounded 100 ms playback timeline;
the car and camera use the same world position. The server separately records
the physics sample time, so heartbeats cannot relabel old positions as new.
Recovery cuts the playback path, and race results/collision counters remain
authoritative. There is no extrapolation through obstacles or change to scoring.

Closed setup screens no longer rebuild on every racing snapshot. Distant peers
reduce driver and shadow detail, restoring both nearby. Graphics quality now
also sets the post-processing buffer resolution instead of retaining the
initial, higher pixel ratio.

Validation: 179 frontend tests passed, followed by all three network-driving
tests after adding a production parked-car regression (two impacts, reversing,
recovery, then passing the car). All 81 server tests and 14 native Cloudflare
tests passed; the opt-in local full race was skipped. The
[public full-race check](../multiplayer-motion/public-smoke.json) completed in
64.390 s and 66.356 s, with identical ordered results, bounded motion history,
zero invalid poses or protocol errors, and both automated players cleaned up.
Synthetic coverage includes repeated packet stalls and a 15-minute stream
without accumulating playback delay. Same-computer browser checks cover live
selection, shared starts, visible peers, impacts, and recovery; they are not
cross-device latency or frame-rate guarantees.

Public game: https://whimsical-sf.nader-khalil.workers.dev/

The website, Worker, SQLite-backed `RaceRoom` namespace, rate limit bindings, and
private operations secret are deployed to the user's Cloudflare account. The
user confirmed the paid plan and requested billing alerts were set. The CLI
does not have billing-read permission, so that account setup is user-confirmed,
not independently verified here. The $500 monthly budget is not a hard cap.

## Evidence

- Frontend and server regression suites passed; native workerd checks cover
  persistence, hibernation, restart, authorization, slow connections, bounded
  uploads, and host stability. See the adjacent test logs.
- A full local native race completed with two genuine driving input streams,
  ordered finishes, a measured gap, identical results, and host-only rematch.
- The [public smoke](cloudflare-public-smoke.json) completed the same flow over
  HTTPS/WSS against the deployed service: 64.342s and 66.304s, gap 1.962s, no
  protocol errors, and both test players left successfully. This was one room
  and two automated players, not a production capacity test.
- Two real browser tabs created/joined a public invitation, saw each other's
  driver/car choices, readied, started, drove on the same map, reloaded into the
  existing race, and rematched. Screenshots: [lobby](cloudflare-public-lobby.png)
  and [shared race](cloudflare-public-race.png).
- The first browser Start request timed out; both clients recovered via the
  fallback and the race ran. Its cause was not established. A subsequent start
  entered the full countdown immediately. That round retained two native
  WebSockets, zero SSE streams, and no rejected controls. Targeted failure
  diagnostics were added for future investigation; do not describe the first
  delay as a proven server bug or claim it was conclusively fixed.
- Public health and playable assets returned 200. Operations access without a
  token and foreign-origin admission returned 403. Authenticated per-room
  metrics worked. All browser and automated test players were cleaned up.
- The short local native load check covered two rooms and 16 racers for 20
  seconds, with zero errors. It does not establish internet capacity or billing.

## Release identity and remaining launch checks

The initial upload version was `7119810d-c9ca-4507-9749-9c1dfd862c47`. Adding the
operations secret produced `d67adcd0-4163-4cb4-9555-73cf686d4145`, on which the
public full-race smoke passed. The final diagnostics version is
`f078936a-6875-4015-bad9-a171b8a30f10`; its upload is recorded in
[the final deployment log](cloudflare-final-deploy.txt). The base Git revision and exact release file
fingerprints are in [the source record](cloudflare-release-source.json); this
release includes uncommitted work from multiple authorized chats.

The final diagnostics change passed 167 frontend tests, both TypeScript checks,
the production build, and a focused native two-player selection/start/driving
test. After deployment, public health, the final HTML/script bundle, and
authenticated operations health all returned 200.

The operations credential is stored locally in the git-ignored,
owner-readable `.cloudflare-ops-token.local`; its value is not in this report.
Move it into the operator's password manager for team use.

Before the broad announcement, have two people finish a race on separate
devices/networks and watch actual Cloudflare usage. Those checks were not
performed by this same-computer acceptance run. Follow the
[Cloudflare runbook](../../../cloudflare.md) for billing alerts, stopping new
rooms, recovery, and compatible rollback. The initial public hostname is ready;
no custom domain was requested or configured.
