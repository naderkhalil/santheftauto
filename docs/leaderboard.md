# Persistent City Loop leaderboards

Solo and multiplayer have separate global boards. Players must enter a name and
choose to post after finishing. Blank names and the default “Racer” are rejected.
Each accepted run is retained; the board shows the fastest twenty, a requested
player result even outside that list, and the nearest other result for comparison.
Equal millisecond times share a competition rank (1, 1, 3).

Names, chosen drivers, times, ranks and submission/result timestamps are public.
The API never returns race tickets, session credentials or private room codes.
Retrying the same unexpired solo ticket or multiplayer round/player returns the
existing record without changing its name or adding another run.

## Verification

Before a solo race, `POST /api/leaderboard/solo/start` accepts the current
`courseVersion` and returns a one-hour ticket. The browser records driving inputs.
After a finish, `POST /api/leaderboard/solo/finish` sends the ticket, name, driver
and input replay. The server reconstructs the race with the shared physics,
checkpoints, obstacles and collectibles, derives the finish time, and checks
that enough real time elapsed after ticket issuance. Client-supplied times,
positions and checkpoints do not establish a result. Tickets allow at most five
verification attempts; successful retries do not replay the inputs.

For multiplayer, `POST /api/rooms/<code>/leaderboard` requires the player's bearer
token and current `X-Room-Generation`, plus `{ name, roundId }`. The room service
uses its authoritative frozen entrant or saved result. Unfinished races and DNFs
cannot be submitted. The room actor forwards only that verified result to the
leaderboard's private binding. The edge does not route public requests to its
internal recording endpoint.

Replay validation does not establish a human identity or prevent a bot from
driving a valid race. There is no account system or one-record-per-person rule.

## Storage and operation

Cloudflare stores records, hashed solo tickets and request budgets in the SQLite
`Leaderboard` Durable Object, bound as `LEADERBOARD` and named `city-loop-v1`.
The additive `v2-leaderboard` migration creates it without replacing the existing
`RaceRoom` namespace. Entries survive eviction and deployments. Only expired
tickets and rate-limit records are pruned; accepted entries are retained.

Public reads are limited to 120 per address per minute; ticket starts and finish
submissions each have a limit of 10. Ticket starts are also capped at 120 per
address per hour, with at most 10,000 unexpired tickets in the actor. Request
bodies are limited to 2 MiB and five seconds; replay validation has bounded input
and simulation workloads. These controls do not impose an account billing cap.

`npm run dev` and the single-process `npm start` backend use the same service
with an atomically replaced, ignored `.leaderboard-data.json` file. Preserve this
file to keep local results. Set `LEADERBOARD_DATA_FILE` to choose another path.
The Docker image uses `/data/leaderboard.json`, writable by its unprivileged
`node` user; mount a named volume at `/data` to retain results across container
replacement. Back up that volume along with the application configuration.
It is a single-process store: the optional legacy
Node gateway/worker cluster does not provide a shared leaderboard. Cloudflare is
the persistent production deployment path.

`GET /api/leaderboard?mode=solo` (or `multiplayer`) reads a board. Optional
`entryId` includes that public record as `own`; optional `timeMs` selects a nearby
comparison without creating a record. Static `npm run preview` does not supply
the API. Use Vite, the Node server, or `npm run dev:cloudflare` for local checks.

Run `npm run test:multiplayer` and `npm run test:cloudflare` for service,
persistence, authorization and native storage coverage.
