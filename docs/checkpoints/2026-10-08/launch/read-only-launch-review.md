# Launch review of server and static delivery

Review scope: the current working-tree Node entry point, runtime configuration,
room transport, gateway, static file helper, asset URLs, and package commands.
This review did not modify app, server, analytics, or package files. The load
runner and its raw reports are the separate measurement evidence.

| Area | Observed implementation | Release implication |
| --- | --- | --- |
| Runtime | `package.json` constrains Node to `>=22.21.0 <23`; the entry point runs TypeScript directly. The dedicated benchmark server uses Node 22.23.3. | Pin the deployment runtime to the tested Node release and use the lockfile install. A host's default older Node cannot be assumed to run this entry point. |
| Static caching | HTML revalidates. Hashed JS/CSS receive one-year immutable caching. Other named assets receive one-hour freshness. ETags and precompressed Brotli/gzip variants are supported. The production build now generates compression sidecars. | Deploy the complete build, including sidecars. Changed non-hashed public assets need versioned URLs or an explicit cache policy; racer kit/garage URLs already carry a version, while asphalt texture URLs do not. The whole 123 MB public asset directory is not the initial download size. |
| Room transport | API responses are uncached; SSE uses `no-cache, no-transform` and disables proxy buffering. WebSocket controls use the existing session claim and ordered input sequence. | The public proxy must pass upgrades and long-lived unbuffered streams. Localhost payload/latency measurements do not test TLS termination, CDN behavior, proxy timeouts, or internet jitter. |
| Shared address admission | The former input-upgrade limit of 120/minute per address would reject a 128-player shared-address burst. It was raised to a configurable default of 600/minute before the 16/32-room runs. | Keep the admission budget intentional for large shared-NAT groups. It still limits bursts; it is not a promise that arbitrary numbers of players can join simultaneously. The harness does not forge client IPs to bypass it. |
| Deployment drain | A worker stops accepting new rooms and waits for active races, but SIGTERM has a bounded default of 280 seconds. A race can take five seconds of countdown plus up to 300 seconds of driving. Rooms/results remain in process memory. | Prefer an explicit authenticated pre-deploy drain and wait for `activeRaces = 0` before replacement. A forced deadline or crash can still end rooms. Prefix routing supplies room ownership, not room-state migration or durable history. |
| Worker capacity | Runtime defaults are 32 rooms/256 players per worker, with overload sampling and a capacity response. The benchmark generator and server share one Mac's CPU. | Treat those defaults as admission limits, not production capacity certification. Repeat the same bounded workload on the intended worker class, with the public gateway/proxy, before increasing limits. |

The remaining deployment checks are concrete: confirm the real host's pinned
runtime and worker size, verify WebSocket/SSE through its HTTPS proxy, exercise a
drained rollout, and play from two independent devices/networks. None of the
local report files claims those checks have passed.
