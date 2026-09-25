# Cerebral Valley rebuild

The Cerebral Valley race now has a dedicated geographic and Blender asset pipeline. Its road network, mapped building outlines, park boundaries, and underlying ground elevations follow real public data. Detailed landmarks and continuous neighborhood architecture replace the expansion's generic district scenery. This is a reference-informed game reconstruction, not a pixel-perfect photographic survey of every building.

The route starts at Hayes/Octavia, climbs Hayes Street, completes Alamo Square's real perimeter, descends Scott to Page, passes Page/Pierce and 531 Page, turns south on Webster to **Waller**, passes Café Réveille at Steiner, and ends at Duboce Park. The source polyline is approximately **3.54 km** before the playable route's corner rounding.

## What is sourced and what is interpreted

| Element | Source-backed information | Interpretation and practical boundary |
| --- | --- | --- |
| Streets and buildings | OpenStreetMap centerlines, building polygons, source IDs, address tags, and available heights/levels | OSM mapping is not a fresh architectural survey. Missing road widths and building heights are inferred and their source is recorded. Sidewalks and curb construction are authored. |
| Ground | USGS 3DEP bare-earth elevations resampled to a 96 × 96 grid, shared by the route and scene | Grid spacing is approximately 15.5 × 19.6 m. Bilinear interpolation preserves neighborhood grades but cannot resolve each curb, stair, retaining wall, or rear foundation. A small eastern background area clamps to the DEM edge. |
| Parks | Mapped Alamo Square, Duboce Park, and Patricia's Green boundaries and paths | Grass treatment, furnishings, canopy spacing, and individual trees are authored. The eastern Alamo lawn stays open for the Painted Ladies view. |
| Eleven hero properties | Correct mapped parcels, facing directions, source-based placement, and inspected identifying architectural features | Roof/back detail, exact decorative measurements, some massing, and paint reflect available photographs and interpretation. Photographs come from different dates. No building was laser-scanned or reconstructed through photogrammetry. |
| Ordinary street walls | Actual mapped footprint polygons; known heights where present; inspected neighborhood architectural vocabulary | Most ordinary façades were not individually checked against a current photograph. Their windows, trim, doors, shopfronts, and paint are reference-informed library constructions. |
| Street life and natural assets | Original modeled street furniture, plus credited existing tree, sky, and asphalt assets | Parked cars, furniture positions, tree species, and the sky are scene dressing rather than a same-day street inventory or local sky measurement. |

Data, licenses, links, and individual reference observations are in [the asset source manifest](../public/assets/cerebral-valley/SOURCE.md), [geographic audit](../art/references/cerebral-valley-geography.md), [hero notes](../art/references/cerebral-heroes.md), and [neighborhood audit](../art/references/cerebral-neighborhood.md). No architectural reference photograph is embedded as a façade texture.

## Runtime ownership

| Component | Responsibility |
| --- | --- |
| [`src/cerebral-geography.ts`](../src/cerebral-geography.ts) | Shared origin, route anchors, map data, terrain grid, geographic projection, and `cerebralGroundHeight()` bilinear sampling. |
| [`src/courses.ts`](../src/courses.ts), [`src/course-route.ts`](../src/course-route.ts) | The course definition, playable route, checkpoint ordering, and route sampling used by the shared driving simulation. |
| [`src/course-experience.ts`](../src/course-experience.ts) | Selects the dedicated Cerebral world and presentation; owns race controls, timing, camera, minimap, neighborhood inspection UI, loading state, and this course's separate best-time version. Other expansion courses keep their existing scene path. |
| [`src/cerebral-world.ts`](../src/cerebral-world.ts) | Loads layout and Blender assets; builds terrain, streets, curbs, crossing paint, signs, and race markings; instances street-life and vegetation prototypes; manages spatial visibility and neighborhood/tree detail levels; defines six inspection cameras. |
| [`src/cerebral-presentation.ts`](../src/cerebral-presentation.ts) | Reuses the existing photographic sky and scanned road treatment, prepares local reflections and moving sun shadows, and configures ambient occlusion, subtle bloom, antialiasing, and output tone mapping. Low quality disables expensive effects and reduces detail distances. |
| [`src/atmosphere.ts`](../src/atmosphere.ts), [`src/surfaces.ts`](../src/surfaces.ts) | Shared HDR sky, sun/reflection behavior, and credited asphalt material loading. |

The model origin is **−122.42415 longitude, 37.77655 latitude**. Gameplay coordinates are **x east, z north, y elevation above sea level**. Native Blender uses **X east, Y north, Z elevation**. Standard glTF export produces **X east, Y elevation, negative Z north**. The Cerebral world is attached directly to the scene, outside the reflected root that still contains the vehicle. Do not mirror these GLBs again or add a second ground-height offset.

The runtime loads `heroes.glb`, both neighborhood levels, the street-life kit, the existing jacaranda, the geometry-only canopy LOD, and vegetation anchors. Hero geometry is culled by property/material bounds; the generated `heroes-lod.glb` is available but is **not currently selected by the runtime**. Neighborhood meshes carry `spatial_block` metadata for visibility and detail changes. Cars, street furniture, and trees share geometry/materials through instances grouped into spatial cells. Published metadata counts describe complete assets, not the number of triangles or draw calls visible in one camera frame.

## Asset and data ownership

The canonical geographic snapshot is [`art/references/cerebral-valley-layout.json`](../art/references/cerebral-valley-layout.json); [`public/assets/cerebral-valley/layout.json`](../public/assets/cerebral-valley/layout.json) is its identical runtime copy. The original exported elevation TIFF and service response are retained beside the canonical snapshot. The TypeScript geography is the lightweight runtime/test representation of that data. There is no checked-in one-command live OSM/USGS refresh importer; a future data refresh must update all representations together and pass the geographic controls.

- **Heroes:** [`tools/blender/build_cerebral_heroes.py`](../tools/blender/build_cerebral_heroes.py) produces [`art/source/cerebral-heroes.blend`](../art/source/cerebral-heroes.blend), the full and reduced-detail hero GLBs, metadata, and six architectural review images. It models 710–722 Steiner as seven distinct properties, 531–535 Page, Café Réveille, Absinthe, and 450 Hayes/a Mano. Its glyph-face ray audit checks that modeled addresses and signs have clear space in front of their letters.
- **Neighborhood and park grounds:** [`tools/blender/build_cerebral_neighborhood.py`](../tools/blender/build_cerebral_neighborhood.py) produces [`art/source/cerebral-neighborhood.blend`](../art/source/cerebral-neighborhood.blend), separate full and distant GLBs, vegetation anchors, metadata, and a per-building model log. The ten snapshot hero flags and the explicit 450 Hayes exclusion prevent duplicate ordinary buildings at those parcels.
- **Street-life prototypes:** [`tools/blender/build_cerebral_streetlife.py`](../tools/blender/build_cerebral_streetlife.py) produces [`art/source/cerebral-streetlife.blend`](../art/source/cerebral-streetlife.blend), the instanced vehicle/furniture kit, metadata, and its review image. Prototype study-row offsets are stripped before instancing in the game.
- **Canopy LOD:** [`tools/blender/build_cerebral_canopy.py`](../tools/blender/build_cerebral_canopy.py) simplifies the existing credited tree. It exports geometry without duplicating textures; runtime materials come from the original tree asset.

The surrounding park vistas include 1,668 additional mapped building footprints (83 park-facing parcels are promoted into the detailed Blender set) in `background-buildings.json`, drawn with modest roof and window detail. Parked cars on the course have collision stations for each visit, including the repeated Hayes leg; the car also follows the measured road cross-slope.

The detailed heroes contain original roughness/normal maps. Neighborhood materials include original clapboard, stucco, brick, roof, grass, and path maps. The sky, jacaranda texture set, and scanned asphalt retain their existing [shared credits](../public/assets/CREDITS.md).

## Six in-game inspection views

Open Cerebral Valley from the race picker and choose **Explore the Neighborhood** before starting the race. The six buttons use the same loaded scene and rendering pipeline as gameplay; **Back to the Race** returns to the starting preview.

| View | What to inspect |
| --- | --- |
| Hayes Valley | Continuous mixed storefronts, the contemporary 450 Hayes building, the actual rotated street grid, parked vehicles, and the westward climb. |
| Alamo Square | The real park boundary, varied ground elevation, open lawn, mapped paths, and surrounding street-wall continuity. |
| Painted Ladies | The west-facing sequence of six gables plus the separate 722 turreted house, individual colors and rooflines, windows, stairs, porches, and clear lawn sightline. |
| 531 Page | The narrow north-facing twin square-bay façade on its actual south-side Page parcel, readable address, and street-grade agreement. |
| Café Réveille | The northwest Waller/Steiner corner, white shopfront, pink signs, upper bays, furniture, and the southbound continuation toward Duboce. |
| Duboce Park | The approach and finish, open sloping park ground, path network, trees, and residential edges. |

Independent Blender architectural reviews are also available: [Painted Ladies row](../art/reviews/cerebral-painted-ladies.png), [Painted Lady detail](../art/reviews/cerebral-painted-lady-detail.png), [531 Page](../art/reviews/cerebral-page-531.png), [Réveille](../art/reviews/cerebral-reveille.png), [Absinthe](../art/reviews/cerebral-absinthe.png), and [450 Hayes](../art/reviews/cerebral-450-hayes.png). These are component studies with Blender lighting, not screenshots of the assembled game. Neighborhood and street-life studies are retained in the same review directory.

## Regenerating the assets

The generators were run with official **Blender 4.5.9 LTS**. They use Blender's bundled Python, NumPy, glTF exporter, and Draco encoder. No separate Python package installation is required for the geometry scripts. Run from the repository root and set a task-specific variable to your installed Blender executable. On macOS that may be `/Applications/Blender.app/Contents/MacOS/Blender`; the temporary mounted executable used for this build is not a durable project dependency.

```sh
CEREBRAL_BLENDER=/absolute/path/to/blender
"$CEREBRAL_BLENDER" --background --factory-startup -t 4 --python tools/blender/build_cerebral_heroes.py
"$CEREBRAL_BLENDER" --background --factory-startup -t 4 --python tools/blender/build_cerebral_neighborhood.py
"$CEREBRAL_BLENDER" --background --factory-startup -t 4 --python tools/blender/build_cerebral_streetlife.py
"$CEREBRAL_BLENDER" --background --factory-startup -t 4 --python tools/blender/build_cerebral_canopy.py
```

Run these sequentially on a memory-constrained machine. Blender regenerates the owned `.blend`, `.glb`, metadata, and review outputs; preserve any intended manual Blender edits before rerunning a generator. The canopy build requires the existing `public/assets/vegetation/jacaranda.glb` and its accompanying textures. The hero generator optionally uses macOS system fonts for café lettering and Absinthe script; if those paths are unavailable, Blender falls back to its bundled font. Fonts are converted to geometry rather than distributed as font files, and cross-platform regeneration may therefore change lettering appearance.

For geometry-only iteration, append `-- --skip-renders` to the hero command, or `-- --skip-render` to the neighborhood command. The hero generator also accepts `-- --450-only` to render only the contemporary Hayes building after exporting the full kit. [`tools/blender/review_cerebral_neighborhood.py`](../tools/blender/review_cerebral_neighborhood.py) produces additional neighborhood review context. Temporary context roads, lighting, and cameras in review scenes are not exported as a second street system.

After regeneration, run:

```sh
npm test
npm run build
npm run dev
```

The geographic tests cover the origin, terrain agreement, source/runtime snapshot agreement, route ordering, full Alamo lap, and key landmark orientations. Review all six in-game viewpoints and a driven route after geometry or data changes; a passing TypeScript build cannot detect a mirrored façade, an obstructed sign, a floating curb, or an incorrect visual silhouette. The hero metadata currently records **2,408 glyph-face samples with zero blocked samples**. That geometric check verifies visibility, not photographic exactness or business-logo identity.
