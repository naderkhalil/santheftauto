# Cerebral Valley: measured geographic foundation

Retrieved 24 September 2026. This rebuild uses actual map geometry and measured bare-earth elevations, rather than the compressed, invented grid in the original expansion. The architecture is a detailed artistic reconstruction on those measured footprints. It is not a photogrammetric survey, and facade details and street furniture should not be described as pixel-perfect copies.

## Coordinate contract

- WGS84 origin: longitude **−122.42415**, latitude **37.77655**.
- TypeScript/game: **x east, z north, y up**, in metres. `y` is elevation above sea level, not elevation relative to the start.
- Blender source: **X east, Y north, Z up**. Standard glTF export maps north to **−Z**; the scene loader must account for that convention exactly once.
- Local projection: `x=(longitude-origin.longitude)×111320×cos(origin.latitude)`, `z=(latitude-origin.latitude)×111320`. This local equirectangular projection preserves the neighborhood's scale and ~9-degree street-grid rotation, with small projection approximation error.
- Terrain samples are pixel **centres**, 96 columns × 96 rows. Values are row-major **north to south**: row 0 is `maxZ`, column 0 is `minX`. Bilinear sampling in `cerebralGroundHeight()` is shared by the route, road surfaces and building frontages. Samples outside the raster clamp to its edge; the small eastern background beyond the start is outside the sampled raster, including part of Absinthe's parcel.

## Sources and what they establish

1. [OpenStreetMap public API](https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_map_data_by_bounding_box:_GET_/api/0.6/map): five rectangular map extracts, merged by node/way IDs. Street centreline coordinates, parcel outlines, park outlines, park paths and tagged building dimensions are used directly. The resulting JSON contains **230 named street segments, six parks, 1,489 buildings within 125 metres of the route, and ten reserved hero buildings**. Use `routeDistance` to control facade detail without changing footprint placement.
2. [USGS 3DEP Elevation ImageServer](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer): floating-point bare-earth raster, bilinear sampling, TIFF export. The requested bbox was longitude −122.4398 to −122.4229, latitude 37.7683 to 37.7803. The service expanded the latitude extent to preserve pixel aspect; the returned exact extent is saved in `cerebral-valley-dem-export.json` and its TIFF in `cerebral-valley-dem.tif`. Grid sampling is approximately **15.5 m east/west × 19.6 m north/south**. The downloaded image is a resampling of the USGS elevation mosaic, not an independent survey of every sidewalk step.
3. [USGS Elevation Point Query Service](https://epqs.nationalmap.gov/v1/json?x=-122.4327&y=37.7764&units=Meters&wkid=4326&includeDate=false): an independent central Alamo Square control returned **60.656631470 m**, source resolution **1 m**. It checks the raster's elevation convention.
4. [Café Réveille Lower Haight](https://www.cafereveille.com/lowerhaight): official location, **201 Steiner Street**. OSM places the cafe at **37.7710569, −122.4320710**, in the **northwest** corner building at Waller and Steiner. The previous course placed the cafe south of Waller, which was wrong.
5. [Absinthe Brasserie & Bar](https://www.absinthe.com/): **398 Hayes Street**, at Gough, east of the Octavia starting line. It is a background landmark, not an invented stop on the westbound itinerary.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). USGS source information is publicly available US government elevation data.

## Route and durable spatial facts

The polyline is **3,541.6 m** before playable corner rounding. It starts at the west side of Hayes/Octavia, climbs west on Hayes through Laguna, Buchanan, Webster and Fillmore, and reaches Steiner. It continues along Alamo Square's southern edge to Scott, goes north to Fulton, east to Steiner, south past the Painted Ladies, and west along Hayes again to Scott. That completes the entire real park perimeter.

From Scott it turns south across Fell and Oak to Page, then east through Pierce, Steiner and Fillmore, past **531–535 Page**, to Webster. It turns south across Haight to Waller, west to the **Café Réveille corner**, then south on Steiner to **Hermann**, finishing at Duboce Park's northeast corner. This respects the requested Page/Pierce and Page/Webster sequence, and uses **Waller**, not Walker.

The heights are recognizably different from the original invented course: Hayes/Octavia ~22 m, Hayes/Steiner ~69 m, Fulton/Steiner ~50 m, Page/Webster ~60 m, Réveille ~43 m and Duboce finish ~41 m. Page does not simply descend all the way east to Webster. The lower Hayes climb and Alamo's east/west slopes are visible in the real terrain.

## Reserved hero parcels

| Landmark | OSM way ID | Important orientation |
| --- | --- | --- |
| 710 Steiner | 261412896 | West-facing toward Alamo Square |
| 712 Steiner | 261412895 | West-facing toward Alamo Square |
| 714 Steiner | 261412900 | West-facing toward Alamo Square |
| 716 Steiner | 261412894 | West-facing toward Alamo Square |
| 718 Steiner | 261412879 | West-facing toward Alamo Square |
| 720 Steiner | 261412899 | West-facing toward Alamo Square |
| 722 Steiner, larger northern corner house | 261412887 | West frontage and northern return |
| 531–535 Page | 261432385 | Narrow ~7.8 m frontage faces **north**; long ~33 m footprint runs south |
| Café Réveille, 201 Steiner | 261429607 | Ground-floor corner of the building **north of Waller and west of Steiner** |
| Absinthe, 398 Hayes | 256720167 | Hayes frontage faces **south**, corner faces Gough to the west |

`hero: true` prevents the continuous neighborhood asset from filling these with generic facade pieces. The source data includes their footprints so replacement models retain correct parcel placement. `landmark.rotation` rotates a Blender asset authored with its front toward local **−Y** onto the outward facade normal; it is not a glTF world yaw.

## Measured versus interpreted

**Directly sourced:** OSM plan geometry; tagged heights, roof heights, roof shapes and building colours when present; park and path shapes; underlying USGS ground elevations. Preserve original identifiers for audit.

**Interpreted:** carriageway widths when OSM has none (typically 12.8 m, 16 m on Fell/Oak); sidewalks; missing heights (tagged levels × 3.25 m + 1 m, otherwise 11 m); individual facade details; store signs; roof ornament; doors, windows and vegetation. Some OSM heights conflict with floor counts: the data explicitly rejects an implausible tagged height when it exceeds 5.5 m per stated floor and retains the source of the replacement in `heightSource`.

Buildings use elevation at their street-facing frontage. This does not survey rear foundations or individual stoops. The 15–20 m terrain grid cannot resolve curbs, stairs or retaining walls; those require authored local details. A photo-accurate current tenant/sign inventory has not been claimed.

## Files and validation

- `art/references/cerebral-valley-layout.json`: full canonical source for Blender.
- `public/assets/cerebral-valley/layout.json`: identical runtime copy loaded only for this course.
- `src/cerebral-geography.ts`: lightweight route, terrain and selector-map data, coordinate conversion and shared interpolation.
- `src/cerebral-geography.test.ts`: real-coordinate controls, terrain agreement for route/streets/frontages, complete park lap and landmark ordering, hero parcel orientations, and exact source/runtime data agreement.

The source is deliberately restricted to street and building geometry and map tags needed for reconstruction; OSM editor account information from the API response is not retained in the published JSON.

## Extended distant neighborhood

`public/assets/cerebral-valley/background-buildings.json` and its source mirror `art/references/cerebral-valley-background-buildings.json` contain **1,668 additional actual OSM footprints** within 450 metres of the itinerary, plus five additional park outlines. They exclude every core-neighborhood building ID, so the renderer can add inexpensive distant shells without duplicating hero or near buildings. This fills the previously empty view across Duboce Park into the real surrounding blocks. The extract includes **336 parcels west/southwest of Duboce**. Heights use the same tagged-height/levels interpretation as the core. Their foundation is sampled at the parcel centroid; no individual distant facade survey is implied.
