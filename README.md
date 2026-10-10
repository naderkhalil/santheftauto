# San Theft Auto

**[Play at santheftauto.com](https://santheftauto.com)**

A browser racing game built around San Francisco: its neighborhoods, steep
streets, recognizable landmarks, and a few exaggerated hill flights. Race solo,
share a room with friends, or take a slower drive through the city.

![San Theft Auto — racers in front of the San Francisco waterfront](public/social/san-theft-auto-v2.jpg)

We are building San Francisco incrementally, one map and neighborhood at a time.
Racing is the playable foundation for the project’s
[longer-term open-world direction](#direction-and-roadmap).

## Play today

**City Loop is the only enabled course.** It runs from Union Square up Powell,
through Chinatown, and down to the Ferry Building. Street connections and
landmarks draw from the real city; distances, hills, and handling are adapted
for an arcade racer.

| Mode | What you can do |
| --- | --- |
| Single player | Choose a driver and car, race the course, and improve your local best time. |
| Multiplayer | Create a private room for **2–8 players**, share its URL, and race friends on the same map. |
| Free drive | Explore Union Square’s streets and terraces, find five postcards, and continue toward the bay without a timer. |
| Watch a Run | Follow an automatic drive or jump to scenic views of Union Square, the Westin, Chinatown, and the waterfront. |

Multiplayer shows everyone’s driver, car, and sponsor choices live. Each player
confirms readiness; the host starts the current room when everyone is ready.
The server controls driving, checkpoints, and finish times. Cars share the map
without player-to-player collisions, and the results show finishing order and
DNFs. The host can start a rematch in the same room.

The race collection also shows six **Coming soon** routes: VC Circle, Cerebral
Valley, Golden Gate Surfride, Lands End, Presidio Run, and Golden Gate → Hawk Hill.
Their experimental code and assets are in the repository, but the current game
does not launch them. See the [route plans](docs/city-races-prd.md) and
[Cerebral Valley rebuild notes](docs/cerebral-valley-rebuild.md).

Basic controls: **W / Up** to accelerate, **A/D or Left/Right** to steer,
**S / Down** to brake or reverse, **Shift** to boost, **Space** to drift, and
**Q** to recover. Touch and standard
gamepads are supported. The [game guide](docs/game-guide.md) covers flight,
exploration, graphics options, and scenic stops; the
[multiplayer guide](docs/multiplayer.md) covers rooms, reconnects, and results.

## Direction and roadmap

Racing gives each neighborhood a useful first test: roads must connect, turns
must read clearly, hills must feel good to drive, and landmarks must hold up
both at street level and at speed. Solo and shared races make those maps
playable while we improve their geometry, art, performance, and handling.

The immediate work is to strengthen City Loop and develop the experimental
routes into coherent, playable neighborhoods. More complete maps and connections
between them provide the groundwork for a fuller San Francisco.

The longer-term goal is a **Grand Theft Auto–style open-world game set in
San Francisco**. Broader open-world systems are a future aspiration, dependent
on building out enough of the city. The available modes above describe the
current racing release.

## Run locally

Use **Node 22.21.0 or later in the 22.x line** and npm. The repository pins
Node **22.23.3** in [.node-version](.node-version). Exported game assets are
included; Blender is needed only when regenerating them.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally [localhost:5173](http://localhost:5173).
The development server includes the room API, so **local multiplayer works with
this same command**. No Cloudflare account is needed. Test with separate browser
tabs or sessions. For another device on the same Wi-Fi, open Vite’s printed
Network URL before creating the room; a localhost invite works only on its
own computer.

To run the built game with the included single-process Node room server:

```sh
VITE_POSTHOG_ENABLED=false npm run build
npm start
```

The default address is [localhost:3000](http://localhost:3000). `npm run preview`
serves the static build only and does **not** supply multiplayer rooms.

## Where things live

The game uses **TypeScript, Three.js, Vite, Web Audio, and a shared arcade driving
simulation**. The public deployment serves the site through Cloudflare Workers,
with one Durable Object per multiplayer room. The Node server supports local
development and an alternative hosting path.

| Area | Source |
| --- | --- |
| Game entry, camera, rendering, controls, and UI | [src/main.ts](src/main.ts), [src/style.css](src/style.css) |
| Shared driving rules and City Loop route | [src/driving.ts](src/driving.ts), [src/route.ts](src/route.ts), [src/playground.ts](src/playground.ts) |
| Multiplayer client, protocol, and motion | [src/multiplayer.ts](src/multiplayer.ts), [src/multiplayer-protocol.ts](src/multiplayer-protocol.ts), [src/room-interpolation.ts](src/room-interpolation.ts) |
| Authoritative rooms and hosting adapters | [server/](server/), [cloudflare/](cloudflare/) |
| City and landmark rendering | [src/city-loop.ts](src/city-loop.ts), [src/union-square.ts](src/union-square.ts), [src/waterfront.ts](src/waterfront.ts) |
| Drivers, cars, and garage previews | [src/car.ts](src/car.ts), [src/racer-profile.ts](src/racer-profile.ts), [src/racer-showroom.ts](src/racer-showroom.ts) |
| Editable models, generators, and shipped assets | [art/source/](art/source/), [tools/blender/](tools/blender/), [public/assets/](public/assets/) |

## Contributing

Contributions are welcome, especially city and landmark improvements, clearer
onboarding, driving feel, accessibility, multiplayer reliability, and rendering
performance. Start with a focused change that can be reviewed and played on its
own. For a new neighborhood or major system, describe the intended scope in an
issue before building it.

- **City and art:** use the [Blender pipeline](BLENDER_ASSETS.md), retain editable
  sources and regeneration steps, and record geographic references and asset
  provenance. Include before/after views and note changes to asset size or detail.
- **Gameplay and multiplayer:** keep client and server behavior consistent.
  Include relevant regression checks; for room changes, exercise host and guest
  in independent sessions through selection, start, finish, and rematch.
- **UI and performance:** show the affected flow, viewport, and browser. Compare
  rendering measurements in the same scene so visual improvements remain playable.
- **Pull requests:** explain the problem, the resulting behavior, and what you
  verified. Keep generated assets and their source changes together when needed.

Run checks relevant to your change:

```sh
npm test
npm run test:multiplayer
npm run build
```

Cloudflare changes also use `npm run test:cloudflare` and the
[local Worker workflow](docs/cloudflare.md#local-build-and-verification).
Waterfront asset changes use `node tools/validate-waterfront.mjs`.
The [game guide](docs/game-guide.md#verify) describes existing coverage and
read-only browser diagnostics. Publishing is separate from local development;
see the [Cloudflare runbook](docs/cloudflare.md) or the
[Node hosting runbook](docs/launch.md).

## Usage analytics

Development tracking is off by default. Production builds use the supplied
public PostHog project configuration. **For a fork, disable tracking with
`VITE_POSTHOG_ENABLED=false` or set your own `VITE_POSTHOG_KEY` and
`VITE_POSTHOG_HOST` before building.** Settings are build-time values. See
[.env.example](.env.example) and the [analytics guide](docs/analytics.md) for the
recorded events, nickname/lineup data, and privacy handling.

## Assets and licensing

The project combines original Blender models and generated geometry with
third-party materials, scenery, geographic references, and brand artwork.
Playable cars and drivers use the same Blender kit in selection and racing.
The seven cartoon drivers come from approved image concepts and textured 3D
sculpts, optimized in Blender; dense source studies stay outside the deployed
game. Playing or building the game does not require an image-generation or
3D-generation API key. The current characters are portraits and seated racers. Full walking
bodies and animation rigs are future work for the broader city game.
Sources and attribution are recorded in [asset credits](public/assets/CREDITS.md),
[sponsor artwork sources](public/assets/sponsors/SOURCES.md), and the
[Blender pipeline](BLENDER_ASSETS.md).

**There is currently no project-wide license file.** Individual dependency and
asset licenses apply to their respective material; they do not establish a
blanket license for the repository or its brand artwork. License clarification
is needed before treating the whole project as freely reusable open-source work.

## More documentation

- [Detailed game guide and historical checkpoints](docs/game-guide.md)
- [Multiplayer behavior and local setup](docs/multiplayer.md)
- [Multiplayer flow and acceptance criteria](docs/multiplayer-flow-prd.md)
- [City race plans](docs/city-races-prd.md)
- [Cerebral Valley development](docs/cerebral-valley-rebuild.md)
- [Map quality audit](docs/map-quality-audit.md)
- [Blender assets and rebuilding](BLENDER_ASSETS.md)
