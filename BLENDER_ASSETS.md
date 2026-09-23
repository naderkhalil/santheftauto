# Blender art pipeline — implemented

The reference-based art stretch now covers the four Union Square frontages and surrounding corner buildings. The game loads original Blender models for the Westin, Post Street and nearby hotels, Macy's/I. Magnin, Neiman Marcus, Stockton boutiques, Dewey Monument, date palms and Powell cable car. Four canopy trees reuse the credited CC0 jacaranda model. Gameplay, terrain, streets, plaza terraces and collisions stay in TypeScript/Three.js. The wider city, Chinatown and waterfront still use the preceding procedural architecture.

## Delivered models

| Asset | Close triangles | Runtime draws | Delivery |
| --- | ---: | ---: | --- |
| Westin historic hotel and rear towers | 236,697 | 13 | 5.28 MB Draco GLB |
| Westin distant model | 62,536 | 13 | 875 KB Draco GLB, reduced texture resolution |
| Dewey Monument and Victory | 26,342 | 4 | Self-contained GLB |
| Canary Island date palm | 26,802 per tree | 6 total for seven trees | Instanced from one GLB |
| Powell combination cable car | 27,628 | 7 | 1.92 MB self-contained GLB |

These are geometry/material budgets, not whole-frame performance numbers. Shadow and contact-shading passes submit some geometry again. The Westin exceeds the initial speculative 60–100k target because the current close version retains carved relief, deep window reveals and articulated returns; its distant version sheds that work. Future optimization can bake more trim into maps.

### Added frontage groups

The following counts come from the exported GLBs and adjacent metadata. Sizes are exact file bytes; approximate MB values use decimal units. The source mesh count is **not** a whole-frame draw count: runtime loaders combine materials, keep some transparent panes separate and, for the north group, preserve spatial culling.

| Group | Close triangles | Distant triangles | Exported meshes / materials | Close GLB | Distant GLB |
| --- | ---: | ---: | --- | --- | --- |
| Post Street and outside corners | 283,658 | 101,301 | 87 / 22 in each level | 2,291,064 bytes (2.29 MB) | 1,683,512 bytes (1.68 MB) |
| Geary stores and Stockton boutiques | 152,876 | 62,674 | 56 / 22 in each level | 3,429,320 bytes (3.43 MB) | 3,053,004 bytes (3.05 MB) |

Both groups use Draco geometry compression. The north files each embed six images; the south/east files each embed nine. Their distant versions retain the texture payload, so their file-size reduction is smaller than their triangle reduction. The four jacarandas share one 75,735-triangle CC0 model with external local WebP maps; see `public/assets/vegetation/SOURCE.md` for its existing asset budget.

## Editable sources and references

- `art/source/westin.blend`; generator `tools/blender/build_westin.py`; references `art/references/westin.md`; reviewed renders `art/reviews/westin-overview.png` and `westin-entrance.png`.
- `art/blender/dewey-monument.blend` and `date-palm.blend`; generator `tools/blender/create_plaza.py`; references and geometry notes in `public/assets/plaza/SOURCE.md`.
- `art/source/cable-car.blend`; generator `tools/blender/create_cable_car.py`; reference notes in `public/assets/models/cable-car-SOURCE.md`; review image `art/source/cable-car-study.png`.
- `art/source/north-square.blend`; generator `tools/blender/build_north_square.py`; review renders `art/reviews/north-square.png` and `art/reviews/apple-post-street.png`. Includes Post's four main parcels, Apple's visible interior and garden, Hyatt, Beacon Grand, Chancellor, adjoining Post buildings, 278 Post, Campton Place, Elkan Gunst and Handlery.
- `art/source/union-square-frontages.blend`; generator `tools/blender/build_square_frontages.py`; review renders `art/reviews/square-frontages-overview.png` and `art/reviews/neiman-rotunda-study.png`. Includes Macy's glass atrium, the I. Magnin marble wing, Neiman Marcus and its modeled rotunda, and five Stockton boutique parcels.
- `art/references/union-square-layout.md` records the verified street relationships, approximate placement bounds, public references and geographic source attribution. `src/plaza-layout.ts` is the shared source for terrace elevations and seven palm/four jacaranda placements.

The Blender architecture, sculpture, palms, cable car and generated texture pixels are original project assets. Public museum elevations and photographs were used as visual references, not embedded as copied textures or meshes. The jacaranda is a separately licensed CC0 source model. OpenStreetMap supplied geographic reference data, credited to its contributors under the ODbL; the game includes no OSM map tiles. The depicted landmarks/transit system are not sponsors. See `public/assets/CREDITS.md` for source attribution and decoder licensing.

## Rebuild

Authored and exported using official Blender 4.5.9 LTS for Apple silicon. Use a locally installed Blender executable, for example:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_westin.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/create_plaza.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/create_cable_car.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_north_square.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_square_frontages.py
```

The scripts save editable `.blend` files and export runtime GLBs. Some also render review images, which may take several minutes. Blender was originally run from the official disk image; it is not a runtime dependency of the browser game. Generated source backups (`.blend1`) are ignored.

Generated normal/roughness images must have their **Non-Color** colorspace set before writing pixel buffers. Changing it afterward can clear the generated pixels. This was caught and fixed during the Westin's actual game review.

## Coordinates and runtime

All models use metres and glTF +Y up. Individual hero objects use ground-contact origins; the two frontage sets encode world X/Z coordinates relative to the square's 22 m street datum. Blender source coordinates may be Z-up; the export handles axis conversion.

| Asset | Placement / orientation |
| --- | --- |
| Westin | Position `(-93,22,-1.5)`, Y rotation `π/2`; exported local +Z faces the square. The origin is the frontage center. |
| Monument | Position `(0,24.40,0)`, Y rotation `π/2`; stands on the raised central plaza. |
| Palms | Seven terrace placements, with roots on their respective soil levels from `PLAZA_LEVELS`; modest rotation and scale variation. |
| Jacarandas | Four north-garden placements at Y=25.66, with 9.3–10.6 m canopy heights; shared geometry/materials. |
| Cable car | Existing Powell obstacle at world Z=139; route frame supplies position, pitch and yaw. +Z is forward. Existing 2.25 × 7.2 m obstacle envelope retained. |
| North frontage and corner group | Runtime translation `(0,22,0)`, no rotation. Apple lies north of Post and west of Stockton; Hyatt is behind it. |
| South/east frontage group | Runtime translation `(0,22,0)`, no rotation. Macy's is south of Geary, Neiman Marcus southeast across Geary, and the Stockton parcels leave Maiden Lane open. |

`src/westin.ts` loads the hotel and switches to its distant mesh at 290m with hysteresis, or explicitly on Performance graphics. Repeated materials are shared between the two levels. The Draco WebAssembly decoder is bundled locally under `/assets/draco/`; no CDN dependency is required.

`src/north-square.ts` switches to its distant model at 270 m, with 12% hysteresis, and batches by material within spatial cells. `src/square-frontages.ts` switches at 235 m with the same hysteresis; it batches opaque materials while retaining separate transparent building panes for sorting. Performance graphics explicitly select their distant models. Materials are shared between close and distant levels.

`src/plaza-assets.ts` renders seven palms as six instanced meshes and shares the jacaranda model across four placements. `src/street-assets.ts` replaces the cable car visual in its existing route frame. Imported architecture, the monument and palms retain their procedural fallback until loading succeeds. The jacarandas have no separate tree fallback. Scene startup waits for the local asset attempts before capturing reflections and revealing the game.

The plaza perimeter is Y=22.34, the central paving Y=24.40 and the north terrace Y=25.12. These are art-directed elevations, not survey measurements. Broad stair runs, retaining walls, side access ramps, east/west cafes and the southeast transit entrance replace the old uniform five-step platform. The Apple lot and public garden are level at Y=22; the terrain still follows the exaggerated Powell sidewalk beside opaque hotel foundations. Parcel reservations prevent background buildings and non-racing cross streets from cutting through the authored architecture. `sampleRoute`, `routePoint` and the accepted flight height profiles are unchanged.

## Lighting and presentation

The scene captures reflections at Union Square, Chinatown and the waterfront. Westin and Union Square materials retain the plaza reflection; the moving scene/car use the relevant district. The square gets a stable broad shadow footprint. High and Cinematic graphics include contact shading; Performance disables the expensive shadow/post effects. Stone normal/roughness maps, modeled reveals, bevels and real glass depth do the close-up work.

The menu looks across the square toward the modeled Westin. **Watch a Run → Union Square** pauses in the plaza overview; **The Westin** frames the hotel and **Post St** frames Apple and the north frontage. Drag to inspect; **Resume** returns to the moving driving camera. Racing still follows the existing 2.33km loop with three hills and hover flights.

The contact-shading pass reuses the main render's shadow map and excludes transparent panes and alpha-cut leaf cards from its normal override. This avoids duplicate shadow rendering and incorrect solid-glass/rectangular-leaf occlusion while retaining the complete geometry in the visible scene and dynamic shadows.

## Scope and next assets

This is a reference-informed, compressed interpretation. No claim of photogrammetry or survey-level dimensional accuracy is made. The square now has distinct architecture on every side, but the wider city, people and ordinary vehicles still show the earlier procedural style. The next useful art work is Dragon Gate and Grant storefronts, then close street life and the other neighborhoods, judged in the actual racing camera.

The entire pre-art game is preserved at `pre-art-direction-v2` (`3f03057`), and the first Westin-focused Blender pass at `union-square-blender-v1` (`ffae8dc`). Keep those tags when iterating or comparing versions.

## Validation of the wider square assets

- All four new close/distant GLBs pass structural inspection: correct container lengths and chunk alignment, in-range buffers/views/accessors, finite ordered declared position bounds, valid primitive/material references and acyclic scene graphs.
- Every new primitive declares Draco compression; all four files embed their images and use no external image URI. This is structural inspection, not an independent decoder conformance test.
- GLB triangle counts agree with the generated metadata: north 283,658/101,301; south/east 152,876/62,674.
- The 30 route/driving/tour tests pass, including new Apple floor, Powell sidewalk, fixed route-height and parcel-reservation checks. TypeScript passes.
- `art/reviews/north-square.png`, `apple-post-street.png`, `square-frontages-overview.png` and `neiman-rotunda-study.png` are Blender review renders. They do not establish browser frame rate or physical-device performance.
- Browser validation after the lighting fix: the automatic run completed all 2,328 m and stopped at the Ferry Building. Observed 60 fps on this Mac in High graphics along Geary, at Washington/Embarcadero, and at the bay. Inspected the plaza overview, Post Street storefront, and 390 × 844 layout; the temporary viewport was reset. These are local observations, not physical-phone benchmarks.
- The Post Street portrait stabilized at 60 fps; its total submitted frame geometry fell from about 7.61M to 5.71M triangles after the AO fix. These totals include shadow and postprocessing passes, not unique scene geometry. The browser reported no warnings/errors. Performance mode retains the complete block silhouettes; High was restored and auto acceleration remained off.

## Earlier Westin pass validation

These observations describe the preserved `union-square-blender-v1` checkpoint, not a benchmark of the expanded square:

- Production build passes; all 28 route/driving/tour tests pass.
- All five delivered GLBs have valid containers, finite declared bounds and embedded images; no external texture fetches are required.
- In-app browser: full automatic 2,328m run reached the bay; inspected the Powell cable car, dedicated Westin view and phone-width controls. No runtime errors in the final checks.
- Observed on this Mac in High graphics: 60 fps around the square and at the bay; a waterfront approach sample was 54 fps. Phone-width viewport check also held 60 fps on this same machine; this is not a physical-phone benchmark.
- All three graphics modes were switched successfully, then High was restored. Auto acceleration remained off.
- Generic city geometry is now batched into 144 m cells. A geometry probe reduced menu-visible generic city triangles from 3.67M to 1.03M and shadow submissions to 523k while preserving its vertices/materials. Submitted whole-frame triangles still include extra rendering passes.
