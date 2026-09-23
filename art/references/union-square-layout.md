# Union Square: location and massing reference

Checked 23 September 2026 against Apple's own store page and announcement, and the current OpenStreetMap map extract. This is an art-direction reference for a compressed game map, not a measured survey. Store tenancies can change; the buildings, street relationships, and distinctive silhouettes matter more than a particular tenant's sign.

## Orientation and method

The game uses +X east, +Z north, and +Y up. Powell is X = -75; Stockton is X = 75; Post is Z = 65; Geary is Z = -65. The real street grid is rotated relative to geographic north.

The approximate game-coordinate bounds below were derived by an affine mapping from three OSM street-center intersections:

| Intersection | Latitude | Longitude | Game X, Z |
| --- | ---: | ---: | --- |
| Powell / Post | 37.7882931 | -122.4084335 | -75, 65 |
| Stockton / Post | 37.7885009 | -122.4067939 | 75, 65 |
| Powell / Geary | 37.7873704 | -122.4082462 | -75, -65 |

This preserves sides and approximate frontage proportions. It deliberately stretches the block to fit the existing course, so these are **authoring coordinates, not physical dimensions**. OSM building heights are reference hints, not independently verified measurements. Keep the game's 12.7 m street-and-sidewalk clearance when placing new facades.

## Apple and the north side of the square

Apple Union Square is **north of Post, west of Stockton**, at the east end of the north frontage. Its main glass entrance faces south across Post toward Union Square. The previous game building was in the correct general quadrant, but its width, presentation, missing neighbors, and detached surroundings made the corner read incorrectly. Do not move it across Stockton or to the opposite side of the square.

Apple's official announcement specifically describes the glass doors opening to Post Street and the square, and a public plaza **north of the store**. That rear plaza has Ruth Asawa's San Francisco Fountain and a roughly 50-foot green wall. The green wall belongs to the outdoor plaza composition; it should not read as a solid green back wall sealing off the retail room. The Grand Hyatt rises immediately behind this store/plaza complex, on the **west side of Stockton**.

| Building, west to east | Approximate X bounds | Approximate Z bounds | OSM height | Key placement |
| --- | ---: | ---: | ---: | --- |
| Saks building, 384–398 Post | -67 to -14 | 78 to 130 | 27 m | North of Post, immediately east of Powell |
| Tiffany building, 350–360 Post | -14 to 9 | 79 to 130 | 42 m | Narrower, taller middle frontage |
| Former Williams-Sonoma building, 340 Post | 9 to 21 | 79 to 132 | 17 m | Narrow lower frontage between Tiffany and Apple |
| Apple, 300 Post | 28 to 63 | 79 to 111 | 15 m | South-facing store; east edge meets Stockton sidewalk |
| Ruth Asawa fountain | 54 to 59 | 119 to 125 | — | Outdoor rear plaza, near Stockton |
| Grand Hyatt, 345 Stockton | 32 to 61 | 133 to 184 | 94 m | Tall tower behind Apple, west of Stockton |
| Beacon Grand / former Sir Francis Drake, 450 Powell | -66 to -29 | 130 to 183 | 62 m | Behind Saks, east of Powell; not the northwest exterior corner |

For the new facade, the official Apple store photograph is the visual authority. It shows a strong metal portal, solid side walls, exceptionally large clear sliding glass doors, visible mezzanine, interior stairs, and street trees. Avoid a generic all-glass greenhouse with many small vertical mullions.

## All four exterior corners must have city fabric

| Exterior corner | Actual relationship | Game treatment |
| --- | --- | --- |
| Northwest: west of Powell, north of Post | Chancellor Hotel and adjacent historic Post/Powell frontages; the Inn at Union Square and Kensington Park are farther west | Occupied masonry frontage, with doors, shop windows and hotel height. Chancellor footprint is roughly X -112 to -86, Z 111 to 132, height 52 m. A lower corner frontage connects it back toward Post. |
| Northeast: east of Stockton, north of Post | The 278 Post corner retail building, formerly Nike, fronts the corner. Taj Campton Place stands farther north on Stockton, across from Grand Hyatt. | Corner retail building around X 90–120, Z 83–130; Campton Place roughly X 86–127, Z 139–168, height 33 m. Do not substitute Grand Hyatt on this side of Stockton. |
| Southwest: west of Powell, south of Geary | Elkan Gunst Building / Geary retail at the immediate corner; Handlery Union Square Hotel farther west on Geary | Continue both the Powell and Geary street walls. Handlery's Geary address is 351 Geary; its map point is around X -153, Z -80. Do not put the entire Handlery identity on the immediate corner. |
| Southeast: east of Stockton, south of Geary | Neiman Marcus / City of Paris site | A distinct southeast building, with its curved historic corner and rotunda identity, rather than labeling the entire east side of Union Square as Neiman Marcus. |

The old `city-loop.ts` omission `if (a < 90 && c < 90) continue` excludes both the square **and the entire block immediately northeast across Stockton/Post**. Its grid begins at Geary, so it also has no interior-block generator for the southeast exterior corner. The broad outer-city exclusion then prevents other background buildings from filling these holes. Use explicit authored exterior parcels rather than relying on that broad exclusion.

## Stockton's east side and Geary

Neiman Marcus is **south of Geary and east of Stockton**, approximate footprint X 85–180, Z -132 to -79, reference height 28 m. The previous long `NEIMAN MARCUS` frontage at X 94, Z 0 was on the wrong block.

The actual square-facing east side is a series of smaller retail buildings, with **Maiden Lane breaking the frontage approximately midway**. These ground-floor tenant points help identify the parcel order; they are not a requirement to reproduce every current brand.

| Approximate position | Reference identity | Useful architectural distinction |
| --- | --- | --- |
| X 90, Z 52 | Breitling at Post / Stockton | North corner return toward Post |
| X 89, Z 11 | Gucci | Taller northern storefront block, north of Maiden Lane |
| X 89, Z -12 | Tory Burch, 222 Stockton | Lower southern masonry parcel |
| X 88, Z -36 | Moncler | Separate storefront rhythm |
| X 89, Z -51 | Bvlgari at Geary / Stockton | South corner **north of Geary**, distinct from Neiman Marcus diagonally opposite |

OSM records a roughly 40 m building at 234–240 Stockton, an 18 m building at 218–222 Stockton, and a 25 m building at the 180 Geary corner. This varied roofline and the open Maiden Lane entrance should replace one continuous, uniform department-store slab.

Macy's occupies the south frontage, west of Stockton. Its main OSM footprint is approximately X -40–65, Z -184 to -79, reference height 45 m. There are separate smaller parcels at the Powell end rather than one identical facade stretched across the entire block.

## The square is a terraced plaza

The current game has a central raised platform, but its five identical shallow steps on all four sides flatten the real composition. The real plaza has several terraces, retaining walls, different stair runs, and entrances from sidewalks at differing elevations. It is also built above the underground garage.

The OSM park is tagged with an elevation of 24 m. More useful for visual composition are the mapped **17- and 18-step flights on the Stockton side**, **six-step flights at the central terraces**, and retaining walls. These counts substantiate a visibly stronger elevation change on the east side than the old uniform stair treatment. They do not establish a surveyed elevation for every sidewalk.

Recommended game interpretation: preserve the driven road surface, establish a coherent raised central plaza, and make the Stockton edge clearly step down through retaining walls and broad stair openings. Use roughly 0.15–0.17 m risers as an artistic working scale; do not claim that an exact two- or three-metre lift matches a survey. Keep access routes, cafes and palms grounded on their respective terrace surfaces.

The cafes/pavilions are chiefly on the **east and west sides**, not two generic kiosks lined up across Post. Reference footprint positions include east-side Miller & Lux Provisions around X 53, Z 13, and west-side cafe/bakery pavilions around X -49, Z -13 and X -52, Z 13. The square's southeast transit entrance also gives that corner a real, occupied purpose.

## Sources and image use

- [Apple Union Square store page](https://www.apple.com/retail/unionsquare/) — address, geographic coordinates, official current storefront photograph.
- [Official Apple storefront image](https://rtlimages.apple.com/cmc/dieter/store/16_9/R075.png?resize=1440:806&output-format=jpg&output-quality=85&interpolation=progressive-bicubic) — visual reference only; do not package this photograph as a game texture.
- [Apple's 2016 Union Square design announcement](https://www.apple.com/newsroom/2016/05/19Apple-Union-Square-Highlights-New-Design-Elements-Community-Programs/) — south-facing entrance, north public plaza, green wall and Asawa fountain. The public HTML was accessible during the audit; some browser routes may redirect.
- [OpenStreetMap Union Square map](https://www.openstreetmap.org/#map=18/37.78827/-122.40749) — surrounding streets, footprints, named buildings, steps and retaining walls. Reference data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright).
- Selected map features: [Apple](https://www.openstreetmap.org/way/332223480), [Grand Hyatt](https://www.openstreetmap.org/way/32863494), [Saks](https://www.openstreetmap.org/way/32863589), [Tiffany](https://www.openstreetmap.org/way/35536963), [former Williams-Sonoma](https://www.openstreetmap.org/way/148758720), [Beacon Grand](https://www.openstreetmap.org/way/32863429), [Chancellor](https://www.openstreetmap.org/way/79375215), [Campton Place](https://www.openstreetmap.org/way/35536860), [Macy's](https://www.openstreetmap.org/way/32863633), [Neiman Marcus](https://www.openstreetmap.org/way/332521036), [park](https://www.openstreetmap.org/way/25278818), [18-step east stair](https://www.openstreetmap.org/way/115921784), [17-step east stair](https://www.openstreetmap.org/way/616479991).
- [Union Square history](https://en.wikipedia.org/wiki/Union_Square,_San_Francisco) — background on the garage and 2002 reconstruction; secondary context, not a dimensional authority.

These references guide newly authored geometry. Architectural photographs are not licensed runtime assets merely because they are publicly viewable.
