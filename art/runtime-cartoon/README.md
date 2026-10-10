# Cartoon runtime characters

This folder stages the approved cartoon characters for the actual game. Git
includes the seven optimized `*-runtime.blend` workspaces with packed textures,
their matching GLBs, `baseline-racer-kit.glb`, and the assembled `racer-kit.glb`.
Dense originals remain in the ignored local paths `../characters/meshy-mark/`
and `../characters/roster/<id>/`; several exceed GitHub's 100 MiB file limit.
They are not bundled with a checkout and must never be deployed.

## Reproduce

Use Blender 4.5 LTS and keep `baseline-racer-kit.glb`, the prior kit whose vehicle
resources are copied exactly into the new export. A clean checkout can assemble
the complete kit from the committed optimized GLBs without dense source sculpts.
From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/build_cartoon_runtime.py -- --all --assemble-only
node tools/validate-racers.mjs art/runtime-cartoon/racer-kit.glb --baseline art/runtime-cartoon/baseline-racer-kit.glb --report art/runtime-cartoon/validation.json
```

To regenerate meshes and baked textures, first restore all original
`*-meshy-v1.glb` files from the local/external sculpt archive to the paths recorded
in the character reports, then run `--all` without `--assemble-only`. The dense
GLBs and their original `*-meshy-v1.blend` workspaces are intentionally ignored;
the archive is a separate input to that full rebuild, not a dependency of the
game or the clean-checkout assembly command.

For a single character rebuild with its dense source available, use `--driver mark`; add `--render-review` for Blender
portrait/cockpit renders. Per-character `*-runtime.blend` workspaces contain the
reduced meshes and shared baked textures; `*-report.json` records the source
checksum, triangle counts, bounds and texture dimensions. `assembly-report.json`
records the assembled kit checksum and preserved vehicle source. Concept and
model/import/runtime reports are public; provider/account histories such as
`generation.json`, `generation-status.json` and `roster-status.json` remain local.

The conversion keeps the approved silhouette, simplifies the portrait and
seated sculpture separately, creates fresh UV layouts, and projects the dense
source color, surface normals and material response onto the reduced geometry.
Both poses share one set of textures. Small cockpit arms/hands supplement the
approved bust. These are static portrait and seated assets, not walking rigs.
There are no complete walking bodies, skeletons or facial animations in this
export. Dario's driving variant is reduced independently from the dense source
to preserve his torso and curls.

## Measured export

The final 9 October 2026 kit, recorded in [`validation.json`](validation.json),
is **13,110,716 bytes (12.50 MiB)**, with **623,760 stored triangles** and
**52 stored material primitives**. Compared with `baseline-racer-kit.glb`, that
is 72.8% fewer triangles (2,296,496 previously), 188 fewer material primitives
(240 previously), and a 2.70 MiB larger download.

| Runtime part | Triangles | Material primitives | Triangle ceiling |
| --- | ---: | ---: | ---: |
| Preserved vehicle, wheels and steering | 57,814 | 24 | Exact baseline resources |
| Dario portrait | 89,999 | 1 | 92,000 |
| Other six portraits, each | 59,999–60,000 | 1 | 62,000 |
| Dario seated, including arms/hands | 37,135 | 3 | 40,000 |
| Other six seated drivers, each | 13,135–13,136 | 3 | 18,000 |

These are stored asset counts across one vehicle and fourteen character
variants, not simultaneous visible geometry or whole-frame draw calls. The game
shows one selected portrait or one selected driver per car. Multiple players,
shadows, contact shading, sponsor decals and culling determine submitted frame
work. Dario's larger budgets preserve his glasses, curls and torso; he must pass
the same framing, UV, normal and texture checks as the rest of the roster.

The shared download ceiling is 16 MiB. Each character has one 2048×2048 color
atlas, one 1024×1024 normal atlas and one 512×512 material-response atlas. Both
poses share these maps. All 21 atlases total **147 MiB of decoded RGBA8 pixels**
and approximately **196 MiB including complete GPU mipmaps**. This is a
theoretical full-roster texture estimate, not measured process or whole-game
memory. Actual GPU residency depends on which characters have rendered, and
the estimate excludes browser copies, geometry, render targets and city assets.

The validated kit SHA-256 is
`b1265f70988e32d1f23afa7e82bade066849e17757e670e0ad6a5f4fd6c9eebd`.
The vehicle's geometry, material parameters, hierarchy and pivots match the
baseline after resolving resource indices. The independent garage remains at
SHA-256 `cd56144d46860d947b21a346955569c56df485b581c83544c965415eb2a51617`.

## Review and publication

With the development server running, open
`/art/runtime-cartoon/index.html?kit=full&driver=mark&view=portrait`.
The review uses the game's studio lighting, portrait crop, car geometry and
seated transform. The `driver`, `view=portrait|car`, and
`angle=front|three-quarter|side|back` controls cover the full roster.
`kit=live` reviews the current local production export. Omitting `kit` opens the
one-character Mark trial.

Inspect the actual game selection screen and a multiplayer race as well as this
isolated page. Verify recognizable faces, clean eyes and hair, sleeve joins,
steering reach, and unchanged car customizations. The automated validator guards
mesh/UV/material contracts and budgets, not likeness.

After review, copy the assembled kit to `public/assets/models/racer-kit.glb` and
bump `RACER_ASSET_VERSION` in `src/racer-assets.ts`. The garage is independent and
must remain unchanged. Only the public kit is deployed; this page, editable
workspaces and source studies are development artifacts.

## Validation evidence

The staged kit and matching public copy passed the complete asset validator.
It decodes character positions, normals and UVs with the shipped Draco decoder,
checks embedded PBR maps and unique character artwork, enforces the measured
budgets and body bounds, and verifies exact vehicle and garage preservation.
The five final asset tests also cover shared geometry/textures, per-instance
material isolation, and disposal that keeps other players' resources alive.

The separate client regression run recorded 187 passes. The production
Cloudflare build, TypeScript checks and Workers deployment dry run pass, with
Vite's existing large-chunk advisory. Earlier same-day checks of the unchanged
backend recorded 82 server passes and 14 Cloudflare passes with one opt-in test
skipped; those were not rerun as part of the final asset replacement.

The portrait/cockpit visual gate included Blender and browser review, including
Dario's repaired seated silhouette from the front and side. The actual-game
browser smoke check then verified:

- A solo race start as Fei-Fei with the Terracotta car.
- Live shared character/car selections for host Jensen/Juniper and guest
  Mira/Buttercream, followed by both players reaching ready status.
- Host start moving both canvases into racing with the same timer and standings,
  and both distinct drivers/cars visible together.
- No console errors in either multiplayer tab.

See [shared selection](game-multiplayer-selection.png) and
[Jensen in the race](game-race-jensen.png), captured after the guest test tab
closed. This smoke check covered race entry;
it did not run through a full finish or establish physical-phone performance.
