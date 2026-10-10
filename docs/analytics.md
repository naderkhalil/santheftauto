# Usage analytics

The browser integration lives in [src/analytics.ts](../src/analytics.ts), with
race event definitions and deduplication in
[src/game-analytics.ts](../src/game-analytics.ts).

## Configure a fork or local build

There is no built-in PostHog project key. Without a nonempty
`VITE_POSTHOG_KEY`, the SDK does not initialize and no analytics events are sent.
A fresh checkout therefore builds and runs without tracking. With a key,
production builds enable tracking unless `VITE_POSTHOG_ENABLED=false`;
development requires both a key and `VITE_POSTHOG_ENABLED=true`.

For a new Cloudflare deployment, copy the blank configuration template:

```sh
cp .env.example .env.cloudflare.local
```

Set your own public project key in `VITE_POSTHOG_KEY` in that ignored file.
`npm run build:cloudflare` and `npm run deploy:cloudflare` use Vite's `cloudflare`
mode and load it; these remain production builds. Ordinary `npm run build` and
`npm run dev` do not load this deployment file. CI can supply the same variables
in the build environment instead. For other production builds, supply the key
at build time or through an ignored `.env.production.local` file.

`VITE_POSTHOG_HOST` defaults to `https://us.i.posthog.com`; EU projects should use
`https://eu.i.posthog.com`. Set `VITE_POSTHOG_ENABLED=false` to disable tracking
even when a key is configured, including during local Worker checks:

```sh
VITE_POSTHOG_ENABLED=false npm run build:cloudflare
```

These settings are baked into the frontend at build time. Changing environment
variables only when starting an already-built server does not change its
tracking configuration. Public browser project tokens are expected in the
bundle; personal API credentials must not be placed there.

## What is collected

When tracking is enabled, the browser sends page views, page leaves, and session
IDs to the configured PostHog project. Open that project’s **Web analytics** for
unique visitors, visits (sessions), page views, and visit duration. In
**Product analytics**, `$pageview` with **Unique users** counts visitors; unique
`$session_id` values count sessions. Returning browsers retain an anonymous ID in
local storage. These are browser-based estimates, not identified people; another
device, cleared storage, or an ad blocker affects the counts.

`npm run preview` serves the tracking settings of the existing build; it does not
change them. For development testing, provide your own key and
`VITE_POSTHOG_ENABLED=true` in the environment for `npm run dev`. After deploying
with tracking enabled, visit the site and check the configured project's
**Activity** for `$pageview` events with a `$session_id`.

Analytics loads independently of the game. It records race nicknames and the
lineup explicitly through the gameplay events below; it does not record replays,
other input values, or automatic button clicks. URL query strings and fragments
(including private room codes) are removed from event URL/referrer properties
before sending. Room credentials are never included in gameplay events.
Page-leave events provide visit-duration data when the browser can deliver them.

### Loading diagnostics

The restored full-graphics game records bounded `startup_started`,
`startup_stage`, `startup_complete`, `startup_failed`, and
`startup_interrupted` events through the same optional analytics integration.
Checkpoints distinguish asset loading, reflection baking, and the first render.
Reports include the build revision, browser/OS versions when available,
viewport, pixel ratio, graphics preference, elapsed time, pending asset-group
names, and allowlisted failure/error types. They contain no error messages,
stacks, room codes, nicknames, or raw URLs. Existing URL sanitization still applies.

A small report is also kept in session storage, independently of analytics.
An unfinished report recovered within 30 minutes is an **interrupted startup**,
not proof of a crash: a lost lifecycle event can leave the same marker. Normal
page navigation is marked separately. `startup_complete` follows game setup
and two animation-frame callbacks; it is not evidence of sustained GPU stability.
If Safari kills the page, live telemetry may be lost; reopening the same tab can
recover its last persisted stage when Safari preserves session storage.

Open `?diagnostics=1` to expose the sanitized current report and recovered prior
interruption under **Loading diagnostic report → Copy report**. The panel is
absent during ordinary play. It does not change graphics settings. Inspect
`startup_failed` or `startup_interrupted` in PostHog Activity, filtering `os = ios`
and the deployed `buildVersion`; the public ingestion key cannot read these events.

If the game cannot stay open, visit `?diagnostics=report` **in the same tab**.
This reads the last stored report without loading the game, starting another
attempt, or overwriting the failure marker. It still depends on Safari retaining
session storage and the report being less than 30 minutes old.

### Finishes and playing together

| Event | When it is recorded |
| --- | --- |
| `game_started` | A solo race begins its countdown, or a multiplayer entrant first receives the active countdown/race. Opening setup alone does not count. |
| `game_finished` | The player actually finishes a race. Multiplayer uses the server's finish time. |
| `game_dnf` | The browser receives its own multiplayer did-not-finish result. This never counts as a finish. |

Free exploration and Watch a Run are excluded. Each browser reports only its
own race events. Repeated snapshots and reconnects in the same browser tab are
deduplicated across reloads when session storage is available. A fresh rematch
has a new `game_id`; reopening results does not create another start.

Every event includes `game_id`, `mode` (`solo` or `multiplayer`), `course`,
`player_id`, `player_name`, `player_count` (including the player), `friends_count`
(other players), `participant_names`, `friend_names`, and `participants` (IDs
paired with names). Finishes add `finish_seconds`; DNFs add `dnf_reason`.
Multiplayer participants come from the frozen starting lineup, including anyone
who later leaves. Names are the nicknames players entered, not verified real
identities or selected character names. Duplicate nicknames remain separate
participants. PostHog still uses its anonymous browser ID for counting visitors;
it does not identify or merge people by nickname.

To analyze play and completion in PostHog:

1. **People who finish:** In **Product analytics → Trends**, select
   `game_finished` and **Unique users**. Use **Total count** for completed runs.
2. **Completion rate:** Build a funnel from `game_started` to `game_finished`,
   holding `game_id` constant so the finish must belong to the same race.
3. **How many friends they played with:** Select `game_started`, filter
   `mode = multiplayer`, and break down by `friends_count`.
4. **Who played together:** In **Activity**, select `game_started` and add
   `game_id`, `player_name`, `participant_names`, and `friends_count` as columns.
   Events with the same `game_id` belong to the same race. Filter by that ID to
   see each player's finish or DNF, or export the table.

Deploy both the frontend and room server for these events. Multiplayer game IDs
are random round identifiers, not invitation codes; older servers with
code-derived IDs are deliberately excluded from gameplay tracking. Collection
starts after deployment and cannot reconstruct earlier games. Ad blockers,
unavailable storage, or closing/disconnecting before a result arrives can cause
missing or repeated browser events, so these are usage analytics rather than an
authoritative results archive.
