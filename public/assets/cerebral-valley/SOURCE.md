# Cerebral Valley asset sources

Rebuilt September 24, 2026. This directory contains a geographically grounded, original game reconstruction of Hayes Valley, Alamo Square, Page Street, Lower Haight, and Duboce Park. The map and ground use public geographic data. Architecture, landscape dressing, and street furniture are modeled interpretations; this is not a pixel-exact or photogrammetric survey of every façade.

## Geographic data

`layout.json` is the runtime copy of the canonical [`art/references/cerebral-valley-layout.json`](../../../art/references/cerebral-valley-layout.json) snapshot. It preserves source feature IDs, mapped geometry, height provenance, and the sampled ground grid.

| Source | Included information | Attribution and limits |
| --- | --- | --- |
| [OpenStreetMap API](https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_map_data_by_bounding_box:_GET_/api/0.6/map) | Street centerlines, building outlines, park boundaries and paths, addresses, and available height/level tags; five map extracts retrieved September 24, 2026 | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). OSM geometry is mapped public data, not a newly commissioned building survey. No OSM map tiles or editor account information are included. |
| [USGS 3DEP Elevation ImageServer](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer) | Bare-earth elevation resampled to a 96 × 96 floating-point grid and interpolated for road, park, and building placement | Public US government elevation data. Samples are approximately 15.5 m × 19.6 m apart; this grid cannot resolve individual curbs, stoops, or foundation steps. |
| [USGS Elevation Point Query Service](https://epqs.nationalmap.gov/v1/json?x=-122.4327&y=37.7764&units=Meters&wkid=4326&includeDate=false) | Independent central Alamo Square elevation control | The point query returned 60.656631470 m from a source reporting 1 m resolution; this does not make the exported game grid a 1 m survey. |

The WGS84 origin is **longitude −122.42415, latitude 37.77655**. Blender uses X east, Y north, Z elevation; standard glTF uses X east, Y elevation, **negative Z north**. Building elevations are already baked into the assets. The runtime loads them outside the reflected vehicle/city root. Ground samples beyond the DEM bounds clamp to its edge, affecting a small eastern background area near Absinthe.

Detailed source and sampling notes: [geographic audit](../../../art/references/cerebral-valley-geography.md).

## Original modeled assets

| Files | Authored content and editable source |
| --- | --- |
| `heroes.glb`, `heroes-lod.glb`, `heroes.meta.json` | Eleven separately placed buildings: 710, 712, 714, 716, 718, 720, and 722 Steiner; 531–535 Page; Café Réveille at 201 Steiner; Absinthe at 398 Hayes; and 450 Hayes/a Mano. Original geometry, lettering, and generated PBR roughness/normal maps. Source: [`cerebral-heroes.blend`](../../../art/source/cerebral-heroes.blend), generator: [`build_cerebral_heroes.py`](../../../tools/blender/build_cerebral_heroes.py). |
| `neighborhood.glb`, `neighborhood-lod.glb`, `neighborhood.meta.json` | Continuous architecture on mapped building polygons, with distinct close and distant detail, plus park grounds and mapped path surfaces. Original materials and façade library. Source: [`cerebral-neighborhood.blend`](../../../art/source/cerebral-neighborhood.blend), generator: [`build_cerebral_neighborhood.py`](../../../tools/blender/build_cerebral_neighborhood.py). Ordinary façades are reference-informed interpretations, not individually photographed replicas. |
| `vegetation-anchors.json` | Authored tree placements inside mapped parks, avoiding mapped paths; the runtime also places street trees and preserves the open eastern Alamo lawn. These are not a surveyed tree inventory. |
| `streetlife.glb`, `streetlife.meta.json` | Original sedan, hatchback, estate car, parking meter, hydrant, bicycle, and litter-bin prototypes, instanced by the runtime. Source: [`cerebral-streetlife.blend`](../../../art/source/cerebral-streetlife.blend), generator: [`build_cerebral_streetlife.py`](../../../tools/blender/build_cerebral_streetlife.py). Parked vehicles and furnishings are authored dressing, not a record of actual parked cars or every municipal fixture. |
| `canopy-lod.glb`, `canopy-lod.meta.json` | A geometry-only distant reduction of the existing credited Poly Haven jacaranda model. It shares that model's original material textures at runtime. Generator: [`build_cerebral_canopy.py`](../../../tools/blender/build_cerebral_canopy.py). |

The ten hero flags in the geography snapshot reserve the initial landmarks. The neighborhood generator additionally excludes OSM way **28015901**, replaced by the 450 Hayes hero. OSM IDs for all eleven hero placements are recorded in `heroes.meta.json`. That metadata also records the geometry counts and the lettering clearance audit. Geometry totals are whole asset totals, not per-frame rendering measurements.

## Inspected architectural references

Photographs were used for visual observation. Their pixels are not copied into the modeled buildings or generated material maps.

- **Painted Ladies:** [Carol M. Highsmith, Library of Congress](https://www.loc.gov/item/2013630348/), inspected through its photographic search preview. Six regular gabled houses and the distinct broader 722 Steiner turreted house are modeled separately.
- **531–535 Page:** [Zumper property exterior](https://www.zumper.com/apartment-buildings/p675594/531-535-page-street-lower-haight-san-francisco-ca), used to distinguish the actual twin square-bay building from unrelated property photographs in search results.
- **Café Réveille:** [Eater SF, Patricia Chang exterior photographs](https://sf.eater.com/2018/2/23/17046478/cafe-reveille-lower-haight-steiner-open-bean-there), and [official Lower Haight location](https://www.cafereveille.com/lowerhaight). The café occupies the northwest corner of Waller and Steiner.
- **Absinthe:** [official restaurant site](https://www.absinthe.com/) exterior references; the rounded corner and glass fan canopy belong at the building's southwest Hayes/Gough corner.
- **450 Hayes:** [Handel Architects project photographs and description](https://handelarchitects.com/project/450-hayes). Warm vertical wood, graphite framing, irregular projecting windows, four stories, and two wings around an internal courtyard inform the model. The modeled south frontage follows the actual 39.75 m Hayes edge rather than the much wider diagonal bounding box.
- **Souvla and ordinary Hayes frontages:** [Souvla official Hayes Valley location](https://www.souvla.com/location/souvla-hayes-valley/) and [Hayes Street looking west near Octavia](https://commons.wikimedia.org/wiki/File:View_of_Hayes_Street_West_from_near_Octavia.jpg).
- **Neighborhood architecture and parks:** [home along Duboce Park](https://commons.wikimedia.org/wiki/File:Home_along_Duboce_Park_in_San_Francisco.jpg), [Duboce Park](https://commons.wikimedia.org/wiki/File:DubocePark.jpg), and [Alamo Square aerial photograph](https://commons.wikimedia.org/wiki/File:Alamo_Square,_San_Francisco_from_the_air_in_May_2010.jpg).

Detailed observations and remaining interpretations: [hero notes](../../../art/references/cerebral-heroes.md) and [neighborhood modeling audit](../../../art/references/cerebral-neighborhood.md).

## Existing shared natural assets

These retain their existing licenses and credits; they are not newly authored Cerebral Valley scans.

- **Jacaranda Tree**, [Poly Haven](https://polyhaven.com/a/jacaranda_tree), Rico Cilliers with guidance by Rob Tuytel, **CC0 1.0**. Existing game adaptation plus the new distant reduction are reused for the district. This shared model is not evidence that every represented street tree is a jacaranda. [Original processing and license notes](../vegetation/SOURCE.md).
- **Kloofendal 43d Clear (Pure Sky)**, [Poly Haven](https://polyhaven.com/a/kloofendal_43d_clear_puresky), Greg Zaal, **CC0 1.0**. Existing original HDR sky; its photograph is not a San Francisco-specific sky capture. [Sky source and orientation notes](../sky/SOURCE.md).
- **Asphalt 02**, [Poly Haven](https://polyhaven.com/a/asphalt_02), **CC0 1.0**. Existing `asphalt-color.jpg`, `asphalt-normal.jpg`, and `asphalt-roughness.jpg` road surface maps. Runtime tiling and shading are adjusted for this district. [Shared asset credits](../CREDITS.md).
- **Draco decoder**, Google Draco via the Three.js distribution, **Apache License 2.0**. [Bundled license](../draco/LICENSE). Three.js uses the MIT license.

Depicted businesses and landmarks are not sponsors or endorsers. Current paint, signage, window dimensions, individual landscape species, and furnishings have not all been independently surveyed. See the [rebuild and regeneration guide](../../../docs/cerebral-valley-rebuild.md) for runtime ownership and inspection views.

The surrounding district is retained in `background-buildings.json`: 1,668 additional OSM polygons with the same source and height-provenance rules. `neighborhood-parcels.json` lists the 1,559 Blender neighborhood parcels, including 83 added around Duboce Park, so the runtime omits duplicate background shells.
