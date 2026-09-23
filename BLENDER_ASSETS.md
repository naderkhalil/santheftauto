# Blender art pipeline — implemented

The first reference-based art stretch is live around Union Square. The game loads original Blender models for the Westin St. Francis, Dewey Monument, date palms and Powell cable car. Gameplay, terrain, streets and collisions stay in TypeScript/Three.js. The rest of the city still uses the procedural architecture from the preceding checkpoint.

## Delivered models

| Asset | Close triangles | Runtime draws | Delivery |
| --- | ---: | ---: | --- |
| Westin historic hotel and rear towers | 236,697 | 13 | 5.28 MB Draco GLB |
| Westin distant model | 62,536 | 13 | 875 KB Draco GLB, reduced texture resolution |
| Dewey Monument and Victory | 26,342 | 4 | Self-contained GLB |
| Canary Island date palm | 26,802 per tree | 6 total for twelve trees | Instanced from one GLB |
| Powell combination cable car | 27,628 | 7 | 1.92 MB self-contained GLB |

These are geometry/material budgets, not whole-frame performance numbers. Shadow and contact-shading passes submit some geometry again. The Westin exceeds the initial speculative 60–100k target because the current close version retains carved relief, deep window reveals and articulated returns; its distant version sheds that work. Future optimization can bake more trim into maps.

## Editable sources and references

- `art/source/westin.blend`; generator `tools/blender/build_westin.py`; references `art/references/westin.md`; reviewed renders `art/reviews/westin-overview.png` and `westin-entrance.png`.
- `art/blender/dewey-monument.blend` and `date-palm.blend`; generator `tools/blender/create_plaza.py`; references and geometry notes in `public/assets/plaza/SOURCE.md`.
- `art/source/cable-car.blend`; generator `tools/blender/create_cable_car.py`; reference notes in `public/assets/models/cable-car-SOURCE.md`; review image `art/source/cable-car-study.png`.

Models and texture pixels are original project assets. Public museum elevations and photographs were used as visual references, not embedded as copied textures or meshes. The depicted landmarks/transit system are not sponsors. See `public/assets/CREDITS.md` for existing CC0 sources and decoder licensing.

## Rebuild

Authored and exported using official Blender 4.5.9 LTS for Apple silicon. Use a locally installed Blender executable, for example:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/build_westin.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/create_plaza.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/create_cable_car.py
```

The scripts save editable `.blend` files and export runtime GLBs. Some also render review images, which may take several minutes. Blender was run from the official disk image during this pass; it is not a runtime dependency of the browser game. Generated source backups (`.blend1`) are ignored.

Generated normal/roughness images must have their **Non-Color** colorspace set before writing pixel buffers. Changing it afterward can clear the generated pixels. This was caught and fixed during the Westin's actual game review.

## Coordinates and runtime

All models use metres, ground-contact origins and glTF +Y up. Blender source coordinates may be Z-up; the export handles axis conversion.

| Asset | Placement / orientation |
| --- | --- |
| Westin | Position `(-93,22,-1.5)`, Y rotation `π/2`; exported local +Z faces the square. The origin is the frontage center. |
| Monument | Position `(0,23.30,0)`, Y rotation `π/2`; stands on the existing central plaza elevation. |
| Palms | Twelve terrace placements; roots at Y=23.53, modest rotation and scale variation. |
| Cable car | Existing Powell obstacle at world Z=139; route frame supplies position, pitch and yaw. +Z is forward. Existing 2.25 × 7.2 m obstacle envelope retained. |

`src/westin.ts` loads the hotel and switches to its distant mesh at 290m with hysteresis, or explicitly on Performance graphics. Repeated materials are shared between the two levels. The Draco WebAssembly decoder is bundled locally under `/assets/draco/`; no CDN dependency is required.

`src/plaza-assets.ts` renders all palms as six instanced meshes. `src/street-assets.ts` replaces the cable car visual in its existing route frame. Each imported asset leaves its procedural fallback in place until its load succeeds. Scene startup waits for the local asset attempts before capturing reflections and revealing the game.

## Lighting and presentation

The scene captures reflections at Union Square, Chinatown and the waterfront. Westin and Union Square materials retain the plaza reflection; the moving scene/car use the relevant district. The square gets a stable broad shadow footprint. High and Cinematic graphics include contact shading; Performance disables the expensive shadow/post effects. Stone normal/roughness maps, modeled reveals, bevels and real glass depth do the close-up work.

The menu now looks across the square toward the modeled Westin. **Watch a Run → The Westin** pauses in a dedicated architectural view. Drag to inspect; **Resume** returns to the moving driving camera. Racing still follows the existing 2.33km loop with three hills and hover flights.

## Scope and next assets

This is a reference-informed, compressed interpretation. No claim of photogrammetry or survey-level dimensional accuracy is made. Surrounding frontages, people and ordinary vehicles still show the earlier procedural style. The next useful art work is the remaining three square frontages, then Dragon Gate and Grant storefronts, judged in the actual racing camera.

The entire pre-art game is preserved at `pre-art-direction-v2` (`3f03057`). Keep that tag when iterating or comparing versions.

## Validation of this pass

- Production build passes; all 28 route/driving/tour tests pass.
- All five delivered GLBs have valid containers, finite declared bounds and embedded images; no external texture fetches are required.
- In-app browser: full automatic 2,328m run reached the bay; inspected the Powell cable car, dedicated Westin view and phone-width controls. No runtime errors in the final checks.
- Observed on this Mac in High graphics: 60 fps around the square and at the bay; a waterfront approach sample was 54 fps. Phone-width viewport check also held 60 fps on this same machine; this is not a physical-phone benchmark.
- All three graphics modes were switched successfully, then High was restored. Auto acceleration remained off.
- Generic city geometry is now batched into 144 m cells. A geometry probe reduced menu-visible generic city triangles from 3.67M to 1.03M and shadow submissions to 523k while preserving its vertices/materials. Submitted whole-frame triangles still include extra rendering passes.
