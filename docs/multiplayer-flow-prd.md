# Multiplayer onboarding and race results PRD

Implemented specification · 8 October 2026

Players choose **Single player** or **Multiplayer** before choosing their driver. Multiplayer creates a private room immediately, keeps its invite visible throughout selection, and lets friends see one another choosing. Every player confirms their own setup; the host starts when everyone currently in the room is ready. The race shares one course, one countdown and one authoritative finishing order.

The flow and room lifecycle are implemented. The acceptance criteria below remain the release checklist; implementation does not imply that every device or network scenario has been verified. See the [verification checkpoint](checkpoints/2026-10-08/multiplayer/README.md) for completed checks and remaining validation.

This first release is private **City Loop racing for 2–8 players, including the host**. Preserve the existing driver lineup, garage, car models and selection controls. The multiplayer work wraps that experience and completes room entry, start rules, racing feedback and results.

## Core decisions

| Question | Decision |
| --- | --- |
| When does a room exist? | Before multiplayer character selection. The invite is available while the host is still choosing. |
| How many invitees must arrive? | There is no expected invite count. An invite does not reserve a slot. |
| Who starts? | The host explicitly presses **Start race · N players**. Never auto-start when everyone becomes ready. |
| What blocks Start? | Fewer than two joined players, or any admitted player still choosing, loading or reconnecting. Eight is a limit, not a target. |
| Must players move through setup together? | No. Each chooses at their own pace. Only starting the race requires everyone to be ready. |
| Can two players choose the same driver? | Yes. Names and player markers distinguish them. Cosmetics have equal handling. |
| Do cars race together? | Yes: every player sees the other racers, their selected drivers and cars, on the same City Loop. Retain no player-to-player contact for this release. |
| What determines a result? | The server validates checkpoints and finish crossings and publishes the same result order to everyone. Leaving cannot erase a result. |

## Entry and selection

### Choose how to play

The main Play action opens two clear choices in the existing visual style:

- **Single player** — “Chase your best time.”
- **Multiplayer** — “Create a room. Invite your friends. Race together.”

Keep **Join with a code** as a secondary action. A valid room URL bypasses this mode choice. Do not make someone find multiplayer inside a later character or car screen.

Single player goes straight to the existing Driver → Car sequence. Restore remembered selections, require no nickname, and use **Start race** from the car screen. Room-service failures must not stop solo play. Mode choice is explicit on each new setup; remembered cosmetics do not silently choose multiplayer.

### Create a room

Choosing Multiplayer creates a room and opens Driver selection. Show a short **Creating your room…** state while the server responds. Guard repeated clicks; a timeout must not silently create several rooms on retry. Use an idempotent creation request or an equivalent recovery mechanism.

Use the remembered nickname, or assign a usable name such as **Racer 1**, with inline editing. Name entry must not become another mandatory screen. A room exists only after the server acknowledges creation. Failure leaves a clear **Try again** action and a route back to mode choice.

On success, update the page URL to `/?room=<code>` on the actual game origin and show the invite immediately. Keep the invite and party list visible on Driver, Car and Room screens. Remove unrelated course parameters from invitations; this release always joins City Loop. Do not put a private player token in the URL.

### Join from an invite

An invite opens a compact **Join room** view, showing the room code and **2–8 players**. Restore a nickname if available, allow inline editing, and offer one **Join room** action. This click admits the player; simply opening a link does not consume a slot or block Start. After joining, open Driver with the room visible. Join retries must also be idempotent: if admission succeeds but its response is lost, retry recovers the same identity and slot rather than creating an invisible player that blocks Start.

If the same browser tab holds a valid session for that room, reconnect to that identity directly instead of creating a second player. Nickname equality is not identity; two friends with the same name must remain separate racers. Allow one active controller per identity. Explicitly opening/restoring that session in a new tab takes over; the older tab releases controls, stops automatic reconnects, and shows **This racer is active in another tab**. Use a connection generation so routine stream retries reuse their existing claim and cannot take control back from a newer tab.

Join failures preserve the intended room code and offer a relevant recovery:

| State | Copy and action |
| --- | --- |
| Invalid or expired | “This room is no longer available.” **Try another code** / **Create a room**. |
| Full | “This room has 8 players.” **Try again**; do not silently create a different room. |
| Countdown or race underway | “This race has started. Join when the host opens the next race.” **Try again**; no mid-race insertion. |
| Results | “The group is finishing up.” **Try again** after the host reopens the room. |
| Connection failure | “We couldn’t reach the room.” **Try again** with the entered name preserved. |

Do not promise a reserved place or automatic next-race admission. New spectators and a waiting queue are later features.

### Choose together

Reuse the other agent’s Driver and Car screens. Surround them with a persistent, compact room strip:

- **Room A1B2C3D4 · 2/8 players**, a visible selectable invitation and **Copy invite**.
- One party entry per admitted player, showing nickname, driver, car, and **Choosing driver**, **Choosing car**, **Loading**, **Loading failed**, **Ready**, or **Reconnecting**.
- Explicit **You** and **Host** labels. A friendly empty state: “Send the link while you choose.”

The existing driver markers show who is currently selecting each character. Changing a character immediately updates the local preview and broadcasts the selected character to peers. This is a committed click/tap/keyboard selection, not incidental mouse hover. Car and sponsor changes also update the party summary. Stack multiple player markers legibly on a shared character; do not force exclusive picks.

Each client stays on its own step when a friend joins, changes a pick or becomes ready. Preserve focus, camera position and the user’s in-progress controls. Updating the roster must not rebuild the entire selection screen.

Driver ends with **Choose car**. The multiplayer Car screen ends with **Ready to race**, which submits the latest profile, confirms readiness, and opens the room in one action. The host follows the same path. There is no second Ready click in the room.

Saved/default choices are valid choices, but they do not imply readiness. Ready explicitly confirms them. Changing any profile choice or pressing **Change selection** clears readiness and makes the player choose/confirm again. Returning to view the same choices without editing need not clear readiness. Required course and gameplay assets load before setup admits or restores room membership; approved playable fallbacks count as loaded. Sponsor artwork remains optional and cannot strand the room. Startup names the loading stage and applies a 30-second asset deadline. A timeout or failure without an approved fallback keeps setup blocked and shows **Retry loading**, which reloads the page. Hidden invitation tabs can progress without waiting indefinitely for an animation frame. The room protocol also represents loading and failed-loading states; those players cannot be marked Ready.

## Waiting room and host start

The room preserves the invitation and every player’s current selections. A ready guest sees **You’re ready · Waiting for the host** and **Change selection**. A ready host sees one Start action and a reason whenever it is disabled:

| Room state | Host action and supporting text |
| --- | --- |
| Host alone | Disabled **Start race** — “Invite at least one friend.” |
| Someone choosing | Disabled **Start race** — “Waiting for Maya to finish choosing.” |
| Someone loading | Disabled **Start race** — “Maya is loading the course.” |
| Someone reconnecting | Disabled **Start race** — “Waiting for Maya to reconnect · 23s.” |
| Everyone ready | **Start race · 3 players** — “Everyone here is ready. Start when your group has arrived.” |

For longer lists, use names for the first two blockers and “and N others.” Guests never receive a Start button. No setting asks how many people the host sent the link to.

The host may explicitly **Remove from room** for another player before Start, including someone unresponsive. This is a separate roster action and never silently bundled into Start. The removed player gets a clear explanation; their session is invalidated. The invitation remains usable for a new join while the lobby is open; this is not a ban system. The host uses **Leave room** for themselves.

Disconnected lobby players retain their slot for 30 seconds, with readiness cleared immediately. At expiry they leave the active lobby; reconnecting before expiry restores the same selection and requires Ready again. Explicit removal also frees the slot. The host role passes to the earliest joined connected player if the host disconnects or leaves, with **You’re now the host** shown to the successor. Reconnection does not reclaim that role automatically.

Closing setup keeps room membership and returns to a visible **Return to room** action. It does not start a solo race or quietly leave. Returning to solo requires leaving the room; retained cosmetic choices remain available.

## Countdown and racing

Start is a server operation, not a client-side navigation event. The server atomically verifies the host, lobby phase, at least two connected entrants, and every entrant’s ready profile and loaded course version. It then freezes the entrant list, each player’s confirmed cosmetics, and the round identifier.

A join processed before Start adds a choosing player and blocks that Start attempt. A join processed after Start is rejected as underway. A profile change accepted before Start clears Ready and blocks the attempt. A change after Start is rejected. Use readiness/profile revisions so an old Ready request cannot confirm a newer, unseen profile. Keep the room visible with a useful reason when Start is rejected.

Everyone transitions to the same starting grid, with selected characters visibly seated in their selected cars and names above opponents. Preserve the existing **five-second shared countdown**. Inputs cannot move cars before the server’s start time. The host sees the same countdown as everyone else and receives no early start. Clock synchronization must account for network delay; receiving a snapshot late must not shift that player’s visible countdown by a full transit delay.

The first frame of racing should already contain all entrants, even if their high-detail cosmetics use an approved temporary fallback. Do not launch a player into an empty solo scene while peers finish loading. Preload required assets before setup and share the racer kit with selection and opponents; do not add an unbounded loading screen after Start.

During the race:

- Use the existing authoritative server driving simulation, City Loop map, ordered checkpoints, recovery and starting-grid rules. All clients agree on the round and course version.
- Show the local place, total entrants, race clock and a compact standings list. Place follows valid checkpoint progress, not a straight-line distance to the finish.
- Render remote cars, selected drivers, paint and sponsors with stable identity labels and smooth motion. Multiple identical characters remain distinguishable by name/player marker.
- Keep equal vehicle performance and no car-to-car contact. Make “No car-to-car contact” discoverable before Start.
- Pause/room menus do not pause the shared race. Release controls when the menu opens, focus is lost, or the connection drops. Prevent local restart from creating a separate run.
- Reconnecting racers return to the same round and car, using current server state. A disconnect after Start does not restart the countdown or delay the remaining racers. A 30-second absence becomes **Did not finish · Disconnected** unless the player already finished.
- The race can continue with one remaining connected racer after a valid start. If nobody finishes, show **No finisher this race**, not an invented winner.

## Finish and results

Crossing the finish gives immediate personal feedback: **You finished 2nd** and the recorded time. If others are still racing, retain the live standings and show **Waiting for 2 racers · 0:42 left**. Use the existing finish-camera view; a new spectator camera is not required for this release. Do not let this personal finish screen claim the entire race has ended.

Retain the existing race limits: five minutes from the shared start, shortened to at most 60 seconds after the first finisher. Remaining racers become **Did not finish** when the deadline expires. A DNF must enter a finished/results presentation and release controls just as a finisher does. There is no endless wait on the race screen.

When every frozen entrant is finished or DNF, every client receives the same final results:

1. Winner headline and selected driver/car, or **Photo finish · Joint winners**, or **No finisher this race**.
2. The local player’s placement and time, clearly highlighted without displacing the overall winner.
3. The full race order: place, nickname, driver/car, finish time, gap to the winner, and status. Every entrant remains listed even after leaving.

Finishers sort by server-recorded finish time. Improve timing to estimate the finish crossing within a simulation step. If results are still exactly equal at supported precision, award a shared place and use competition ranks (1, 1, 3). Stable row order inside a tie is only presentation; do not award a win by join order. Display enough time precision to explain distinct places, and **Tied** for shared places.

DNFs follow finishers and show **DNF**, a reason (**Time limit**, **Disconnected**, or **Left race**) and final valid progress. They do not receive a finishing place or a fabricated time. Sort DNF rows by checkpoint and course progress, then stable entrant order when those match. A racer leaving after finishing retains their time and placement; leaving before finishing records DNF instead of deleting them.

Freeze a round result independently of active room membership. It stays unchanged through disconnects, host changes, reopening the lobby and the following round, for the room’s lifetime. New rounds have different identifiers. Keep the most recent completed result accessible as **Last results** while the room is open. Server restart/room expiry may end access in this first release; permanent race history is out of scope.

The host’s **Race again** reopens the same room and invitation with remaining players’ choices retained and readiness reset. Preserve disconnected members whose existing 30-second grace has not expired; do not reset that timer. They block Start while reconnecting, then return unready or leave at expiry under the normal lobby rules. Explicit departures and expired sessions do not regain a slot through rematch. Everyone can confirm unchanged choices in one click or choose **Change selection**. The host still explicitly starts the next round. Guests see **Waiting for the host** until the room reopens. Preserve the previous result separately from the new lobby roster.

## Interaction quality

Use a persistent setup shell and short transitions instead of successive unrelated dialogs. The invite and party strip stay spatially stable between Driver and Car. Existing Painted Ladies/garage art direction belongs to the selection work; this PRD does not replace it or require a new gathering scene.

Use one prominent progression action per stage. Keep Back, Change selection, Leave room and code entry secondary. Maintain keyboard/gamepad focus when friends update their selections; touch controls should have comfortable targets. Announce joins, readiness and host changes politely to assistive technology without announcing every network snapshot. Pair status colors with words. Honor reduced motion.

Copy invitation provides brief **Link copied** feedback. If the clipboard is unavailable, expose and select the invitation in the currently visible room strip, with **Copy this link** guidance. A hidden input in another step is not an acceptable fallback. The link may be manually shared; this work does not send invitations on the user’s behalf.

At narrow widths, wrap the invite controls, retain the local selection and primary action, and put the party list in a compact expandable section. Do not cover characters with eight overlapping names or require horizontal scrolling for basic actions. Preserve all eight entrants in an accessible list.

## Existing foundation and implementation boundaries

The implementation extends the existing private rooms, live profiles, host-only starts, shared countdown, authoritative simulation and rematches. Its responsibilities are divided as follows:

| Area | Implementation responsibility |
| --- | --- |
| `src/multiplayer.ts` entry and setup | Expose mode before Driver; create/join before selection; keep invitations visible; replace separate Car → Room → Ready actions with one Ready confirmation. |
| `src/multiplayer.ts` presentation | Persistent party state, clear start blockers, disconnect grace, finished-waiting state, final results, DNF transition and one-click rematch confirmation. |
| `src/multiplayer-protocol.ts` | Versioned selection/readiness/loading state, round entrants, server-issued rank and result records, DNF reasons, host removal, connection/session semantics. |
| `server/rooms.ts` | Atomic roster lock; readiness revision checks; preserve entrants/results after Leave; explicit tie policy; lobby removal and reconnect rules. |
| `server/http.ts` | Safe retry/idempotency, meaningful connection liveness, and consistent failure responses; assess trusted proxy and per-player input limits for deployment. |
| `src/main.ts` | Integrate shared start, finishing and DNF states; prevent solo/restart/pause actions from breaking a live room. |
| Selection implementation | Preserve `racer-showroom.ts`, driver/car panel design, profile catalogue, Blender files and generated assets. Reuse the existing showroom API. |

Selection work saved through `acaf121` supplied the integration baseline. The driver lineup, garage, profile catalogue, Blender sources and generated assets remain the selection implementation's responsibility.

`src/multiplayer.ts` and `src/multiplayer.css` remain shared integration points. The room flow now wraps the selection screens, with reusable markup and presentation helpers in `src/multiplayer-ui.ts`. Future changes should coordinate ownership before modifying selection controls or their layout. Room lifecycle, protocol and transport changes remain separate from the showroom and asset pipeline.

## Release verification

| Scenario | Acceptance criterion |
| --- | --- |
| First solo run | Play → Single player → Driver → Car → Start; no required name, room or network service. |
| Host with a friend | Host obtains a usable invite before finishing selection; guest joins that same room directly. |
| Live choosing | In two independent browser sessions, either player changing driver, car or sponsor updates the other screen without navigation or focus loss. Duplicate driver choices work. |
| Ready and Start | The final Car action confirms readiness once. Host alone starts. Start stays disabled for one player, an unready player or a loading/disconnected player. Two ready players can start without filling eight slots. |
| Arrival races Start | Concurrent join/start and profile-change/start requests yield one valid server state; no unready entrant is silently included or dropped. |
| Start synchronization | All admitted racers see the same grid and server start time; no client moves early. Validate assets ready, background tabs and a disconnect during countdown. |
| Actual competition | Two independently controlled browser sessions see each other moving, overtaking and finishing on the same map with matching selected cars and drivers. A simulated server race alone does not satisfy this. |
| Connection recovery | Refresh resumes the same entrant. Lost controls release promptly. Host transfer is visible. Lobby reconnect resets Ready; late new visitors never enter an active round. |
| Stable result order | A winner who leaves remains the winner. DNF and departed entrants stay listed. Equal-time finishes follow the documented tie rule on every client. |
| Race completion | Personal finish waits correctly; deadline DNF exits driving; all-DNF races have no winner. Server supplies the complete entrant order and statuses. |
| Rematch | Same invite and retained cosmetics; all Ready flags reset; host explicitly starts a new round; last results remain unchanged. |
| Service and UI failures | Creation retry avoids duplicate rooms; expired/full/underway invites have working recovery; denied clipboard exposes a visible link; solo works during a room outage. |
| Capacity and access | Test eight participants, 320px layout, keyboard/controller/touch navigation, reduced motion and status announcements. |
| Internet use | Test devices on different networks against the deployed server, including latency and brief packet loss. A localhost link or same-computer tabs are not internet validation. |

For a controlled network with up to 100 ms round-trip latency, target peer selection updates within 300 ms and visible countdown skew within 150 ms. Test at 200 ms round-trip latency and a temporary disconnection as degraded conditions; controls must recover and results must remain identical. These are proposed acceptance targets to measure, not claims about current performance.

The local checkpoint records 146 passing gameplay tests, 22 passing multiplayer tests and a successful production build, plus observed two-player browser behavior. Continue recording browser evidence for remaining checklist items and any later deployed two-device race; the checkpoint separates completed checks from pending validation.

## Implementation sequence and release gate

1. Retained the selection checkpoint and established the shared-screen integration boundary.
2. Added the room/round contract for readiness, frozen entrants, stable results, timing, reconnect and host removal.
3. Integrated mode entry, early room creation, persistent invite/party state and one-action Ready around the selection UI.
4. Integrated countdown, in-race standings, personal finish, final results and rematch presentation.
5. Complete the remaining browser and device validation recorded in the checkpoint before public release, including remote-network and eight-device checks.

Public invitations require the existing Node room server and game to run together behind HTTPS with working streamed responses. Static hosting alone cannot deliver multiplayer. Room state remains in one server process for this release; restarts lose active rooms. Review proxy-aware rate limits so multiple rooms behind one proxy are not mistaken for one abusive player.

Public matchmaking, accounts, permanent leaderboards, new tracks, car-contact physics, live spectators, matchmaking queues and new character/garage artwork are outside this release.
