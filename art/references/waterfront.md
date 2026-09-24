# Waterfront reference and scene layout

Reference audit: 2026-09-23. These are art references, not measured survey data. The game stretches and simplifies the street network; preserve the real landmark order even when distances change.

## Verified sources

- [San Francisco Ferry Building](https://en.wikipedia.org/wiki/San_Francisco_Ferry_Building): 1898 A. Page Brown building, 245-foot / 75-metre clock tower, four 22-foot / 6.7-metre clock faces, arched arcades on both long elevations. Its 660-foot / 200-metre Great Nave is an interior dimension, not an exact exterior footprint. The page's lead photograph shows the Ferry Building facing Market, with Bay Bridge on the right behind it.
- [Enlarged 2026 west elevation by Daniel Lu](https://en.wikipedia.org/wiki/File:Ferry_Building_San_Francisco_from_Hyatt_Regency_with_R-Evolution_and_Bay_Bridge_2026_dllu.jpg): inspected in the browser at full view. Clear photographic reference for the two-storey arcade, three-portal central pavilion, plain clock shaft and layered crown; CC BY-SA 4.0. Used for observation only.
- [National Park Service: Central Embarcadero Piers Historic District](https://www.nps.gov/places/central-embarcadero-piers-historic-district.htm): Piers 1, 1½, 3 and 5 lie **between Washington and Broadway**, north of the Ferry Building. They have two-storey stucco-covered Beaux-Arts bulkheads, two-storey arches, east-extending timber/concrete finger piers and steel/timber transit sheds. Historic sheds extended more than 700 feet east. The site's photo is credited to Tom Hilton, CC BY 2.0; it is a reference, not a shipped texture.
- [Pier Fishing in California: Pier 7](https://www.pierfishing.com/pier-7-san-francisco/): local guide by Ken Jones. Pier 7 is a 840-foot / 256-metre public fishing pier near Broadway, with timber decking, ornamental iron rails, iron-and-wood benches, Embarcadero lights and concrete pilings; its end widens. The pier is an open promenade, not a warehouse.

## Visible architectural cues

Ferry Building: pale warm-gray masonry; strongly horizontal wings; low dark green/blue-gray hipped roof; a projecting central pavilion with **three large portals**; **small lower-storey arches and large upper-storey arched glazed windows**, with transom bars and fanlights; layered cornices; slender, mostly plain square clock shaft below the clock with narrow slits; an open belfry above the clock and then a **pale stepped taper with two smaller open lanterns** and a narrow finial. Avoid the old model's giant turquoise pyramidal roof and single very tall central doorway. Keep the real 75-metre tower proportion instead of enlarging it independently of the body. Exact masonry profiles and bay counts are model adaptations.

Pier bulkheads: cream/gray stucco, monumental arched portals, plain pilasters, classical parapets, and dark glazed doors; the fronts are formal but only two storeys. Behind them, long industrial sheds with repeated tall grid windows, gabled roofs and open paved aprons make a different silhouette from city blocks.

Public realm: a continuous paved PortWalk, water-edge railing and granite/concrete seawall, bollards, maritime lamps, benches and tree/palm planting. Preserve open space as designed pavement with furnishings, not blank terrain. The Ferry's north Gate B is near the north end; Golden Gate ferry Gates C/D are behind the central building; Gates E–G are south. Do not relocate Pier 2/Waterbar north of the Ferry Building.

## Coordinate agreement

Semantic city coordinates: +X east, +Z north in TypeScript. Blender asset coordinates: +X east, +Y north, +Z up. Standard glTF export produces world coordinates (x, elevation, -north), so these world-baked assets load outside the reflected city root at identity.

| Scene feature | Suggested semantic location | Geographic relationship |
| --- | --- | --- |
| Ferry tower | (730, 250) | Faces west along Market Street |
| Ferry wings | north/south of tower, total approximately 190 m | Long axis follows waterfront |
| North Ferry Plaza / PortWalk | north of Ferry through z700 | Stretched public promenade fills game distance |
| Washington terminus | (590, 700) | Meets waterfront south of historic pier group |
| Pier 1 | around z740 | First pier immediately north of Washington |
| Pier 1½ | around z805 | North of Pier 1 |
| Pier 3 | around z875 | North of Pier 1½ |
| Pier 5 | around z965 | North of Pier 3 |
| Pier 7 | around z1070, projects east | Open wooden promenade by Broadway |
| Bay Bridge west anchorage | (710, -680) | South of Ferry; never directly across Washington |
| Bay Bridge eastern end | (2570, -252) | Runs east-northeast toward Yerba Buena Island |

The 450-metre in-game Market-to-Washington separation is stretched relative to the real waterfront. Add credible open PortWalk detail between those anchors; do not fill it by moving the numbered piers to the wrong side of Washington. The bridge is the **silver western double suspension crossing**: four open steel towers, two main cable spans, a central concrete anchorage, and two road decks. From Market it should fall to the right of the Ferry Building, with open water remaining in the middle of the Washington approach.

## Asset provenance

New waterfront assets are original Blender models built from these reference observations and game-adapted dimensions. Reference photographs are not copied into the game. This is a recognizable, artist-built waterfront rather than a photogrammetric reconstruction or a claim of surveyed accuracy.
