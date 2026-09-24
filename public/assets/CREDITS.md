# Asset credits

This project includes material scans distributed by [Poly Haven](https://polyhaven.com/) under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Poly Haven describes its asset licensing at [polyhaven.com/license](https://polyhaven.com/license).

| Source asset | Included local files | Use |
| --- | --- | --- |
| [Asphalt 02 — `asphalt_02`](https://polyhaven.com/a/asphalt_02) | `asphalt-color.jpg`, `asphalt-normal.jpg`, `asphalt-roughness.jpg` | Road color, surface normal detail, and roughness; the game adds its own varied surface roughness. |
| [White Plaster Rough 01 — `white_plaster_rough_01`](https://polyhaven.com/a/white_plaster_rough_01) | `plaster-color.jpg`, `plaster-normal.jpg` | Masonry surface source maps. The current foreground streetscape uses the normal map with its own architectural colors. |
| [Brick Wall 001 — `brick_wall_001`](https://polyhaven.com/a/brick_wall_001) | `brick-color.jpg`, `brick-normal.jpg` | Color and normal detail for brick building facades. |

The local filenames are project-specific names for maps from those material assets. Material tiling, colors, normal strength, reflections, and wetness are adjusted by the game's rendering code.

Most background building and furnishing geometry is constructed in code. Foreground architecture around Union Square is authored in Blender. Four plaza canopy trees reuse the optimized CC0 jacaranda model. Window interiors, facade patterns, signs, and other procedural textures are separate from the Poly Haven scans. Depicted businesses and landmarks are not sponsors or endorsers of this project.

## Natural scenery

- **Jacaranda Tree** — [Poly Haven](https://polyhaven.com/a/jacaranda_tree), Rico Cilliers with Rob Tuytel guidance, CC0. Optimized from the original model and instanced four times on the current plaza's north garden terrace; [source and processing details](vegetation/SOURCE.md). The older source note describes the earlier two-instance placement.
- **Kloofendal 43d Clear (Pure Sky)** — [Poly Haven](https://polyhaven.com/a/kloofendal_43d_clear_puresky), Greg Zaal, CC0. Original photographic HDR sky; [source and orientation details](sky/SOURCE.md).

## Original Blender hero models

- **Westin St. Francis** — original modeled geometry and generated stone/window maps. References: [Westin source notes](../../art/references/westin.md).
- **Dewey Monument and date palms** — original modeled/sculpted geometry. [Plaza source notes](plaza/SOURCE.md).
- **Powell combination cable car** — original modeled geometry, lettering and oak material. [Cable car source notes](models/cable-car-SOURCE.md).
- **Post Street and outside square corners** — original architecture, modeled lettering, furniture, foliage and generated material maps in `north-square/north-square.glb`, with a separate distant GLB. Source: `art/source/north-square.blend`; generator: `tools/blender/build_north_square.py`. Includes Apple, its public garden, Saks, Tiffany, the former Williams-Sonoma building, Grand Hyatt, Beacon Grand, Chancellor, Inn at Union Square, Kensington Park, 278 Post, Campton Place, Elkan Gunst and Handlery, with deeper side/rear elevations toward Sutter and O'Farrell. Apple's official [store photograph](https://www.apple.com/retail/unionsquare/) and [design announcement](https://www.apple.com/newsroom/2016/05/19Apple-Union-Square-Highlights-New-Design-Elements-Community-Programs/) are reference material, not copied runtime textures.
- **Geary department stores and Stockton boutiques** — original geometry, modeled lettering, generated stone maps and stained-glass geometry in `square-frontages/square-frontages.glb`, with a separate distant GLB. Source: `art/source/union-square-frontages.blend`; generator: `tools/blender/build_square_frontages.py`. Includes Macy's through O'Farrell, the I. Magnin wing, Neiman Marcus and rotunda, and five distinct Stockton parcels extending toward Grant with an open Maiden Lane. Architectural references include [Niles Bolton Associates: Neiman Marcus Union Square](https://www.nilesbolton.com/neiman-marcus-union-square) and [Macy's Union Square history](https://en.wikipedia.org/wiki/Macy%27s_Union_Square). The cream terracotta rear mass and Gothic parapet reference the earlier O'Connor Moffat building described in that history. [Frontage reference notes](../../art/references/union-square-frontages.md) record the interpretation. Reference photographs are not embedded in the game.
- **Union Square street furniture** — original Blender geometry for four street-name assemblies, two newspaper dispensers and three bicycle racks in `square-street-details/square-street-details.glb`. Source: `art/source/square-street-details.blend`; generator: `tools/blender/build_square_street_details.py`. Newspaper names, cover text and skyline graphics are original fictional artwork. Fonts are converted to geometry; the exported kit contains no font files, image textures or third-party photographs. Street names and placements follow the geographic audit. [Kit notes](square-street-details/README.md).

## Geographic and plaza references

Street relationships, approximate building footprints, named parcels and stairs were checked against [OpenStreetMap](https://www.openstreetmap.org/#map=18/37.78827/-122.40749). Reference data **© OpenStreetMap contributors**, available under the [Open Database License](https://www.openstreetmap.org/copyright). The game's newly authored geometry compresses and adapts these relationships; it does not include OSM map tiles. [The geographic audit](../../art/references/union-square-layout.md) lists the individual source features, mapping method and limitations.

The terraced plaza composition also references the public [Union Square overview photograph](https://commons.wikimedia.org/wiki/File:San_Francisco_Union_Square.jpg). Its pixels are not used as a runtime texture. Terrace elevations, planted beds, seven palm placements, four jacaranda placements, furnishings and the subway entrance are an original game interpretation rather than a surveyed reconstruction.

## Runtime decoder

The locally bundled Draco WebAssembly decoder and wrapper are from the Three.js glTF decoder distribution (Google Draco, Apache License 2.0). [License](draco/LICENSE). Three.js itself uses the MIT license.
