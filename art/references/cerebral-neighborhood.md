# Cerebral Valley neighborhood modeling audit

The model uses the local origin **37.77655 N, 122.42415 W**. Editable Blender geometry is X east, Y north, Z elevation, in metres. Its glTF naturally becomes X east, negative Z north, Y elevation. Load it directly, with no additional city-root reflection and no arbitrary elevation offset.

## Inspected visual references

On 2026-09-24 the following public photographs were retrieved and visually inspected before modeling:

- [Hayes Street looking west near Octavia](https://commons.wikimedia.org/wiki/File:View_of_Hayes_Street_West_from_near_Octavia.jpg): narrow continuous retail frontages, recessed tall shop panes, awning depths, modest ground-floor signage, mature street trees, curb parking and a dense sequence of 2–4 storey buildings. The photo is historical, so its tenants are not assumed current.
- [Souvla Hayes Valley, official location page](https://www.souvla.com/location/souvla-hayes-valley/): the official March 2026 Nicola Parisi exterior photograph was inspected. The model reproduces its slim graphite framing, pale oak entrance, high transom, small six turquoise letter plaques, wall lamps and exterior counter at the business node within the mapped 511–529 Hayes parcel (OSM 258156316). Original geometry represents the room behind the glass; no photo pixels are reused. Patxi's neighboring location is corroborated by its mapped current business node and its black-and-gold projecting sign is informed by the inspected Hayes photograph.
- [Patxi's official location directory](https://patxispizza.com/location/) explicitly listed **PATXI'S HAYES VALLEY, 511 Hayes St., San Francisco, CA 94102** when read on 2026-09-24, corroborating that the historical sign reference still corresponds to a listed business. Its current location link is [Hayes Valley](https://patxispizza.com/location/hayes-valley/).
- [Home along Duboce Park](https://commons.wikimedia.org/wiki/File:Home_along_Duboce_Park_in_San_Francisco.jpg): horizontal painted clapboard, projecting curved bays, cream double-hung sash windows, pane curtains, layered roof cornice, dentils and parapet balustrade. The neighborhood library follows these architectural proportions; it does not assert that every neighboring facade matches this particular house.
- [Duboce Park](https://commons.wikimedia.org/wiki/File:DubocePark.jpg): open rolling lawn descending toward the street, gray-tan winding paths, mature irregular tree groups around the edges, and Victorian roofs framing the park. No spherical or cone-tree placeholders are included in the landscape asset.
- [Alamo Square from the air, May 2010](https://commons.wikimedia.org/wiki/File:Alamo_Square,_San_Francisco_from_the_air_in_May_2010.jpg): tightly packed low-rise blocks and the proportions of the park within the surrounding street network. The low-resolution oblique photograph is insufficient to infer exact paths, so the model uses the mapped park boundary and paths instead.

## Measured geometry and limits

`cerebral-valley-layout.json` records the public data sources, retrieval, OSM IDs, route, surveyed building footprint polygons, building heights where mapped, and a 96×96 USGS elevation sample grid. The generator uses those exact footprint polygons rather than filling blocks with evenly spaced invented boxes. Ground, park lawns and park paths sample the same bilinear elevation grid used by the game. Heights absent from the source remain explicitly marked as interpretations in the layout data.

The detailed facade library supplies original bay-window geometry, deep projecting casings, sash windows, angled bay side panes, cornices, dentils, stoops, iron balusters, roof coping, chimneys and returning elevations. Exterior paint and facade ornament on ordinary parcels are **reference-informed interpretations**. They have not been individually verified against a current street-level photograph, and this asset is not represented as a pixel-exact photographic survey of every house. A reproducible per-building log identifies each modeled footprint and its detail tier.

The final park-perimeter pass adds surveyed background footprints within 55 metres of Alamo Square or Duboce Park and promotes their architecture to the close-detail tier. This adds 83 previously distant parcels around Duboce; Alamo's surrounding parcels were already in the core dataset. Park-facing frontage orientation is inferred from each actual polygon's outward edges toward the nearest surveyed park boundary, because the closest named street can be behind a house. The inclusion manifest `neighborhood-parcels.json` lets the runtime omit the corresponding distant substitute buildings. It is written after successful asset export.

Building wall bottoms extend down to the sampled terrain at each footprint vertex, while the surveyed roof elevation and horizontal floors remain fixed. This creates the exposed lower wall/foundation that anchors wide parcels on the steep park slopes. The final source and both detail levels include these terrain footings.

Alamo Square way **389112749** is tagged `amenity=toilets`, `building=yes` in the original OSM extract. It is a park restroom, not residential infill. Its exact footprint now receives a dedicated low amenity model in both detail levels: interpreted 3.35 m total height, muted stucco, flush metal doors and high ventilation. The source and published layout explicitly record that the height is interpreted because OSM supplies no height; the former 11 m Victorian default was incorrect. The model has no bay windows, stoop, residential cornice or chimney.

The playable Alamo path has a wider asphalt footprint than the mapped footpath. Three procedurally placed benches intruded into it, at semantic coordinates **(−1014.912, −91.004)**, **(−1043.667, −134.586)** and **(−813.772, −70.488)**. These interpreted seats are omitted in both detail levels. Their centres were respectively 1.223 m, 0.957 m and 1.604 m from the live rounded race route, inside the 4.2–4.4 m road half-width. The remaining seven Alamo benches and all other park furniture are retained. Suppressions are recorded in the model log and use position matching so unrelated paths cannot silently inherit an exclusion after a source ordering change.

The ten original hero parcels are excluded using the shared layout's `hero: true` flag. The additional 450 Hayes/a Mano parcel (OSM 28015901) is explicitly reserved for its accurate contemporary hero model. Separately modeled Painted Ladies, 531 Page Street, Café Réveille, Absinthe and 450 Hayes assets occupy their surveyed locations.

## Technical construction

- Original PBR maps describe clapboard joints, fine stucco texture, red brick mortar, roof shingles, decomposed granite and grass blade mottling. No reference-photo pixels are placed in the game texture atlases.
- Meshes are grouped by spatial block and identical material, with their original semantic roles retained as metadata. The independently built distant asset uses exact footprint silhouettes, compact sash panes, coping and unchanged park terrain rather than decimating away random fragments of the detailed joinery.
- `vegetation-anchors.json` places tree anchors in the surveyed park boundaries, outside mapped path corridors, with irregular canopy spacing. The game supplies its existing textured tree models at these positions.
- Review scenes include temporary road context solely for judging facade orientation and terrain fit. That road context is excluded from exported GLBs.

Build with `tools/blender/build_cerebral_neighborhood.py`. Outputs are `art/source/cerebral-neighborhood.blend`, `public/assets/cerebral-valley/neighborhood.glb`, its LOD, metadata and vegetation anchors, plus architectural review renders in `art/reviews`.
