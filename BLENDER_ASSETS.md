# Blender art pipeline — implemented

The reference-based art stretch covers the four Union Square frontages, surrounding corner buildings, complete block returns and the Embarcadero waterfront. The game loads original Blender models for the Westin, Post Street and nearby hotels, Macy's/I. Magnin, Neiman Marcus, Stockton boutiques, Dewey Monument, date palms, Powell cable car, close street furniture, Ferry Building, historic piers and Bay Bridge. Four canopy trees reuse the credited CC0 jacaranda model. Gameplay, terrain, streets, plaza terraces and collisions stay in TypeScript/Three.js. The wider city and Chinatown retain procedural architecture; bay water and animated vessels also remain runtime geometry and effects.

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
| Post Street and outside corners | 440,182 | 154,016 | 206 / 23 in each level | 3,255,840 bytes (3.25 MB) | 2,445,972 bytes (2.45 MB) |
| Geary stores and Stockton boutiques | 285,078 | 114,808 | 96 / 22 in each level | 4,319,032 bytes (4.32 MB) | 3,702,640 bytes (3.70 MB) |
| Street signs, newsracks and bike racks | 54,592 | — | 32 / 10 | 405,940 bytes (0.41 MB) | — |

All three groups use Draco geometry compression. The north files each embed six images; the south/east files each embed nine. Their distant versions retain the texture payload, so their file-size reduction is smaller than their triangle reduction. The street kit has no image textures; 22 lettering nodes remain independent of its ten shared material meshes. The four jacarandas share one 75,735-triangle CC0 model with external local WebP maps; see `public/assets/vegetation/SOURCE.md` for its existing asset budget.

### Added waterfront groups

Measured from the final exports with `node tools/validate-waterfront.mjs`. All five GLBs are Draco-compressed and contain their required images. Mesh counts describe exported source meshes; runtime batching, instancing, culling and extra render passes determine submitted draws.

| Group | Close triangles | Distant triangles | Exported meshes close / distant | Materials | Spatial sections | Close GLB bytes | Distant GLB bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ferry Building and terminal canopies | 313,258 | 90,844 | 142 / 142 | 16 | 13 | 6,333,928 | 1,453,596 |
| PortWalk, historic piers and Pier 7 | 213,012 | 95,892 | 314 / 180 | 16 | 41 | 2,318,316 | 1,263,180 |
| Bay Bridge and eastern islands | 75,660 | — | 64 / — | 8 | 21 | 618,396 | — |

Close and distant sections match for each paired asset, so a wing or pier can switch without drawing both levels. The Ferry distant model also uses smaller maps. The bridge has a single modest geometry level. Forty-three PortWalk palms reuse the original 26,802-triangle date-palm asset through spatially grouped instancing: 29 original anchors and 14 along the southern continuation. Their repeated geometry is separate from the table's GLB budgets. These asset budgets are not frame-rate measurements.

## Editable sources and references

- `art/source/westin.blend`; generator `tools/blender/build_westin.py`; references `art/references/westin.md`; reviewed renders `art/reviews/westin-overview.png` and `westin-entrance.png`.
- `art/blender/dewey-monument.blend` and `date-palm.blend`; generator `tools/blender/create_plaza.py`; references and geometry notes in `public/assets/plaza/SOURCE.md`.
- `art/source/cable-car.blend`; generator `tools/blender/create_cable_car.py`; reference notes in `public/assets/models/cable-car-SOURCE.md`; review image `art/source/cable-car-study.png`.
- `art/source/north-square.blend`; generator `tools/blender/build_north_square.py`; review renders `art/reviews/north-square.png` and `art/reviews/apple-post-street.png`. Includes Post's four main parcels, Apple's visible interior and garden, Hyatt, Beacon Grand, Chancellor, Inn at Union Square, Kensington Park, 278 Post, Campton Place, Elkan Gunst and Handlery. Complete side/rear elevations, the Sutter service block and the southwest returns toward O'Farrell fill the deeper blocks.
- `art/source/union-square-frontages.blend`; generator `tools/blender/build_square_frontages.py`; reference notes `art/references/union-square-frontages.md`; review renders `art/reviews/square-frontages-overview.png`, `art/reviews/neiman-rotunda-study.png`, `art/reviews/maiden-lane-continuity.png` and `art/reviews/square-frontages-rear-returns.png`. Includes Macy's glass atrium and rear terracotta body through O'Farrell, the I. Magnin marble wing, Neiman Marcus and its modeled rotunda, and five Stockton boutique parcels with complete returns toward Grant. Maiden Lane remains open through the block.
- `art/source/square-street-details.blend`; generator `tools/blender/build_square_street_details.py`; review renders `art/reviews/square-street-signs.png` and `art/reviews/square-newsracks.png`. Includes four corner street-name assemblies, two detailed newspaper dispensers with fictional cover artwork, and three galvanized bicycle racks. Placement and coordinate notes are in `public/assets/square-street-details/README.md`.
- `art/source/ferry-building.blend`; generator `tools/blender/build_ferry_building.py`; exports `public/assets/waterfront/ferry-building.glb` and `ferry-building-lod.glb`; metadata `ferry-building.meta.json`. Reviews: `art/reviews/ferry-building-overview.png`, `ferry-building-arcades.png` and `ferry-building-clocktower.png`. Includes recessed two-storey arcades, three central portals, a 75 m clock tower with four clock faces and pale layered crown, roof monitor and rear terminal canopies.
- `art/source/embarcadero.blend`; generator `tools/blender/build_embarcadero.py`; exports `public/assets/waterfront/embarcadero.glb` and `embarcadero-lod.glb`; geometry/planting metadata `embarcadero.json`; original generated paving source `embarcadero-paving.png`. Reviews: `art/reviews/embarcadero-piers.png`, `embarcadero-pier7.png` and `embarcadero-south-continuation.png`. Includes Piers 1, 1½, 3 and 5, Pier 7's open timber promenade, granite PortWalk, seawall, bikeway, maritime lamps, benches, bollards, north Gate B, the level Ferry apron and the southern promenade continuation.
- `art/source/bay-bridge.blend`; generator `tools/blender/build_bay_bridge.py`; export `public/assets/waterfront/bay-bridge.glb`; metadata `bay-bridge.meta.json`. Reviews: `art/reviews/bay-bridge.png` and `bay-bridge-tower.png`. Includes four open steel towers, two suspension spans, central anchorage, two road decks, trusses, hangers, Yerba Buena Island and low Treasure Island.
- **`art/source/waterfront.blend`** is the assembled, editable master, created by `tools/blender/assemble_waterfront.py` after the three component generators. Collections separate the Ferry Building, Embarcadero/piers, bridge/islands, linked date palms and review context. `art/reviews/waterfront-master.png` is its composed Blender render. The browser loads the separate GLBs, not this master; review water, roads, lights and camera are not exported game assets.
- `art/references/waterfront.md` records architectural reference sources, the corrected pier order and bridge direction, local coordinate agreement and game-adapted spacing.
- `art/references/union-square-layout.md` records the verified street relationships, approximate placement bounds, public references and geographic source attribution. `src/plaza-layout.ts` is the shared source for terrace elevations and seven palm/four jacaranda placements.

The Blender architecture, sculpture, palms, cable car, street furniture and generated texture pixels are original project assets. Public museum elevations and photographs were used as visual references, not embedded as copied textures or meshes. Newspaper covers are original fictional artwork. The jacaranda is a separately licensed CC0 source model. OpenStreetMap supplied geographic reference data, credited to its contributors under the ODbL; the game includes no OSM map tiles. The depicted landmarks/transit system are not sponsors. See `public/assets/CREDITS.md` for source attribution and decoder licensing.

## Rebuild

Authored and exported using official Blender 4.5.9 LTS for Apple silicon. Use a locally installed Blender executable, for example:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_westin.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/create_plaza.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/create_cable_car.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_north_square.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_square_frontages.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_square_street_details.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_ferry_building.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_embarcadero.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_bay_bridge.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/assemble_waterfront.py
```

The scripts save editable `.blend` files and export runtime GLBs. Some also render review images, which may take several minutes. Run the three waterfront component scripts before the master assembly; the original `create_plaza.py` date-palm source is also required for its planting collection. Blender was run from the official disk image; in the development session the executable is `/private/tmp/sf-blender-mount/Blender.app/Contents/MacOS/Blender`, rather than `/Applications`. Substitute your installed executable in the examples. Blender is not a runtime dependency of the browser game. Generated source backups (`.blend1`) are ignored.

Generated normal/roughness images must have their **Non-Color** colorspace set before writing pixel buffers. Changing it afterward can clear the generated pixels. This was caught and fixed during the Westin's actual game review.

## Coordinates and runtime

All models use metres. Map coordinates remain separate from the renderer so the established route and hill profiles do not need to change:

| Space | East | North | Up | Use |
| --- | --- | --- | --- | --- |
| Semantic city/map | +X | +Z | +Y | Route, terrain, gameplay, existing scene geometry and two frontage GLBs |
| Physical Blender source | +X | +Y | +Z | Saved north/south block scenes, street furniture and waterfront sources |
| Canonical/render world | +X | −Z | +Y | Three.js camera, lights, street furniture and waterfront GLBs |

Using semantic +Z north directly with an ordinary Three.js camera mirrored the city on screen: east appeared on the left when looking north. `src/coordinates.ts` now provides the explicit `(x,y,z) → (x,y,−z)` conversion. Existing city geometry and animated objects live beneath `cityRoot.scale.z = -1`. The camera stays outside that group; its semantic position is stored separately and converted at the render boundary. Directional light positions, targets and reflection-capture positions are converted as well. Projection regression tests cover Apple/Saks, Apple/Neiman, the first clockwise corner and actual steering in all four street headings.

The two frontage generators save physically oriented, readable Blender scenes with +Y north. For export they temporarily remove the source objects' Y reflection, producing semantic +Z-north GLBs for the reflected city root. Their signs are counter-reflected individually along each sign's local horizontal baseline before batching. Existing local hero objects also use local X compensation to preserve readable lettering and asymmetric details. Do not mirror an entire text atlas: compensate each label within its own cell or mesh.

The new street furniture generator instead follows normal Blender-to-glTF conversion throughout. Its exported north is already −Z; `src/main.ts` attaches it directly to the scene, outside `cityRoot`, with identity rotation and scale. Its 22 sign/newspaper lettering nodes use proper rotations and need no reflection. Adding it under the legacy reflection group would put it on the wrong side of the square.

The waterfront uses the same normal Blender-to-glTF conversion and loads **outside `cityRoot`**. Embarcadero and Bay Bridge vertices carry canonical world positions and load at identity. The Ferry Building retains a local origin and receives only canonical translation `(730, 2.3, -250)`, with no rotation, reflection or scale. Its west frontage is local −X and its long wings extend north/south. The assembled Blender master applies the equivalent native offset `(730, 250, 2.3)`.

Individual hero objects use ground-contact origins. The two frontage sets encode semantic world X/Z coordinates relative to the square's 22 m street datum; the street kit encodes canonical world X/Z relative to that same datum. Placements below are semantic unless explicitly marked canonical.

| Asset | Placement / orientation |
| --- | --- |
| Westin | Position `(-93,22,-1.5)`, Y rotation `π/2`; exported local +Z faces the square. The origin is the frontage center. |
| Monument | Position `(0,24.40,0)`, Y rotation `π/2`; stands on the raised central plaza. |
| Palms | Seven terrace placements, with roots on their respective soil levels from `PLAZA_LEVELS`; modest rotation and scale variation. |
| Jacarandas | Four north-garden placements at Y=25.66, with 9.3–10.6 m canopy heights; shared geometry/materials. |
| Cable car | Existing Powell obstacle at world Z=139; route frame supplies position, pitch and yaw. +Z is forward. Existing 2.25 × 7.2 m obstacle envelope retained. |
| North frontage and corner group | Runtime translation `(0,22,0)`, no rotation. Apple lies north of Post and west of Stockton; Hyatt is behind it. |
| South/east frontage group | Runtime translation `(0,22,0)`, no rotation. Macy's is south of Geary, Neiman Marcus southeast across Geary, and the Stockton parcels leave Maiden Lane open. |
| Street furniture kit | Canonical translation `(0,22,0)`, identity rotation/scale, directly under the scene. Four crossing-street signs, Post newsracks and Stockton bicycle racks occupy pedestrian space. |
| Ferry Building | Canonical translation `(730,2.3,-250)`, identity rotation/scale. Faces Market to the west; approximately 190 m long with a 75 m tower. |
| Embarcadero and historic piers | Canonical identity. Pier centers in semantic north coordinates: 1 at 740, 1½ at 805, 3 at 875, 5 at 965; Pier 7 at 1070 extends east to about X=938. All numbered piers are north of Washington at 700. |
| Bay Bridge and islands | Canonical identity. Semantic west anchorage `(710,-680)` to eastern end `(2570,-252)`, south of the Ferry Building and extending east-northeast toward Yerba Buena. |
| PortWalk palms | Forty-three anchors from `public/assets/waterfront/embarcadero.json`: 29 in `palmAnchors` plus 14 in `southernPalmAnchors`. All use X=626 with authored deck heights; canonical north is negated at placement. Instanced heights vary from 14.5 to 16.9 m. |

`src/westin.ts` loads the hotel and switches to its distant mesh at 290m with hysteresis, or explicitly on Performance graphics. Repeated materials are shared between the two levels. The Draco WebAssembly decoder is bundled locally under `/assets/draco/`; no CDN dependency is required.

`src/north-square.ts` switches to its distant model at 270 m, with 12% hysteresis, and batches by material within spatial cells. `src/square-frontages.ts` switches at 235 m with the same hysteresis; it batches opaque materials while retaining separate transparent building panes for sorting. Performance graphics explicitly select their distant models. Materials are shared between close and distant levels.

`src/plaza-assets.ts` renders seven palms as six instanced meshes and shares the jacaranda model across four placements. `src/street-assets.ts` replaces the cable car visual in its existing route frame. Imported architecture, the monument and palms retain their procedural fallback until loading succeeds. The jacarandas have no separate tree fallback. Scene startup waits for the local asset attempts before capturing reflections and revealing the game.

`src/square-street-details.ts` loads the kit before the startup reflection capture, controls shadow casting with graphics quality, and culls the complete kit beyond 370 m, or 230 m in Performance mode. These furnishings are scenery; they do not add driving obstacles.

`src/waterfront-assets.ts` loads the five waterfront GLBs and palms before startup reflection capture. It batches by spatial `asset_section` and material, including correct material ranges for multi-material meshes. Ferry and pier sections switch to their distant geometry beyond 310 m from their bounds, or explicitly on Performance graphics. Non-bridge sections are hidden beyond 2,100 m, or 1,250 m in Performance; bridge sections remain eligible for ordinary frustum culling. Palm groups use 170 m cells, visibility distances of 1,400/800 m and shadows only within 320 m. Close and distant groups never start visible together. Waterfront material names carry the `Waterfront /` prefix, selecting the harbor reflection capture; Ferry distant maps retain distinct materials.

`src/waterfront-layout.ts` reserves the visible ground east of X=604 between semantic north −770 and 1,130 for the modeled quay. `src/city-loop.ts` lowers the previous terrain underneath and omits conflicting generic cross-street surfaces, while the race ribbon and physics elevations stay unchanged. The Ferry apron is level, the Market opening remains clear and the quay follows the northern approach grade. The PortWalk continues south to −770 with the same paving, seawall, bikeway, lamps and planting, covering the shoreline visible in wide finish views without adding named landmarks. Runtime and master assembly combine both palm-anchor arrays. The 450 m Market-to-Washington spacing is stretched relative to reality: north Ferry Plaza/PortWalk fills that stretch, while the actual pier order stays north of Washington. This is local geographic compression and adaptation, not a survey or complete port reconstruction. No new waterfront free-driving district or gameplay colliders are introduced.

`src/harbor-water.ts` supplies realtime water color, ripples, glints, the Ferry reflection and moving vessels. These effects and boats are runtime Three.js work, separate from the Blender architecture. The former procedural Ferry Building and rotated bridge stage have been replaced by the new assets.

The plaza perimeter is Y=22.34, the central paving Y=24.40 and the north terrace Y=25.12. These are art-directed elevations, not survey measurements. Broad stair runs, retaining walls, side access ramps, east/west cafes and the southeast transit entrance replace the old uniform five-step platform. The Apple lot and public garden are level at Y=22; the terrain still follows the exaggerated Powell sidewalk beside opaque hotel foundations. Parcel reservations prevent background buildings and non-racing cross streets from cutting through the authored architecture. `sampleRoute`, `routePoint` and the accepted flight height profiles are unchanged.

## Lighting and presentation

The scene captures reflections at Union Square, Chinatown and the waterfront. Westin and Union Square materials retain the plaza reflection; waterfront architecture and palms retain the harbor capture; the moving scene/car use the relevant district. The square gets a stable broad shadow footprint. High and Cinematic graphics include contact shading; Performance disables the expensive shadow/post effects. Stone normal/roughness maps, modeled reveals, bevels and real glass depth do the close-up work. A restrained plaza bounce light keeps the Ferry Building's west-facing arcade readable under the established sun.

The menu looks across the square toward the modeled Westin. **Watch a Run → Union Square** pauses in the plaza overview; **The Westin** frames the hotel and **Post St** frames Apple and the north frontage. Drag to inspect; **Resume** returns to the moving driving camera. Racing still follows the existing 2.33km loop with three hills and hover flights.

**Embarcadero** pauses at the Washington waterfront approach. **The Bay** and the race finish frame the Ferry Building with the bridge beyond; `waterfrontFinishView` adjusts field of view and camera distance for narrow screens. `data-waterfront-assets="blender"` on the game canvas confirms that the waterfront load completed.

The contact-shading pass reuses the main render's shadow map and excludes transparent panes and alpha-cut leaf cards from its normal override. This avoids duplicate shadow rendering and incorrect solid-glass/rectangular-leaf occlusion while retaining the complete geometry in the visible scene and dynamic shadows.

## Scope and next assets

This is a reference-informed, compressed interpretation. No claim of photogrammetry or survey-level dimensional accuracy is made. The square now has distinct architecture on every side, but the wider city, people and ordinary vehicles still show the earlier procedural style. The next useful art work is Dragon Gate and Grant storefronts, then close street life and the other neighborhoods, judged in the actual racing camera.

The entire pre-art game is preserved at `pre-art-direction-v2` (`3f03057`), the first Westin-focused Blender pass at `union-square-blender-v1` (`ffae8dc`), and the preceding wider square at `union-square-fidelity-v2`. The last of these predates the map handedness correction, complete block expansion and Blender street furniture. Keep those tags when iterating or comparing versions.

## Waterfront asset validation

`node tools/validate-waterfront.mjs` passes on the five delivered waterfront GLBs. It checks container lengths, buffer views, embedded images, finite declared position bounds, material references, acyclic scene graphs, positive transforms, geographic bounds and matching close/distant sections. Both distant exports reduce triangle counts and stay within the intended asset bounds; the Ferry simplified canopy has no below-ground spike. This inspection uses glTF declarations and transforms, not independent Draco decoding. The actual browser loader provides runtime decode verification.

`src/waterfront.test.ts` covers the Market-facing Ferry and clear approach, unchanged route heights, historic pier order, palm clearance and projected finish framing at 705 × 833, 1280 × 720 and 390 × 844. Saved Blender reviews establish asset appearance separately from game rendering. The historic test counts and frame rates below describe earlier Union Square checkpoints, not this waterfront expansion.

All 81 tests passed, including the existing driving, flight and square checks. After the southern extension, the three waterfront tests, asset validator, production build and TypeScript checks passed again. The production build retains the existing large-bundle advisory.

The live-browser review on this Mac sampled 60 fps at 705 × 833 in High graphics at the Washington approach and initial Ferry finish. After the southern extension and Blender render completed, the final Ferry view sampled 54 fps, with 932 draws and 2,547,311 submitted triangles across render passes; no console warnings or errors were reported. The automatic drive from Washington reached the 2,328.2 m finish and stopped. Both 390 × 844 and 1280 × 720 finish views retained the building; the final wide view confirmed the southern paving, bikeway, lamps and palms continue through the previous bare seam. Viewport overrides were reset. These are local desktop observations, not physical-phone benchmarks or a guaranteed frame rate.

## Earlier square block-expansion validation

Recorded on 23 September 2026, before the playground, city infill and Blender waterfront:

- All 35 tests and the production build pass, including screen projection, clockwise turns, left/right controls, route geometry and all three flight transitions.
- The five updated GLBs have valid container lengths and the expected triangle counts; no negative node scales leak into either architectural export or the canonical street kit. North sign geometry passes 4,502 outward glyph-clearance checks with zero letters buried by walls or cornices.
- The complete automatic run reached 2,328.2 m and stopped at the Ferry Building. Reviewed the Post frontage, Westin, square overview, Stockton/Neiman corner, Geary, Chinatown and bay in the live browser. No browser warnings or errors were reported in the final check.
- A 390 × 844 viewport check verified the menu composition and square-tour controls; the override was reset. This was desktop viewport emulation, not a physical-phone benchmark. High graphics and auto acceleration off were retained.
- On this Mac at 705 × 776, High graphics sampled about 40 fps on the Powell approach, 48 fps at the settled Post portrait and 60 fps at the bay. Post submitted 6,347,743 triangles and 1,534 draws across all render passes. These are local observations, not a frame-rate guarantee. The expansion is heavier than the preceding checkpoint; farther block culling remains an optimization opportunity.

The saved modeling reviews establish asset appearance separately from these browser observations.

## Earlier wider square checkpoint validation

These observations describe the preserved `union-square-fidelity-v2` checkpoint, before the latest expansion and orientation correction:

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
