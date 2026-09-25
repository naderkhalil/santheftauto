# Patricia's Green: Hayes opening landmark

This separate Blender asset replaces the previous generic park surface in the neighborhood kit. It preserves the source park and path geometry, keeps the northern approach open, and adds close detail at a human scale. It is an authored reconstruction of the landscape, not a current photographic inventory of every municipal fixture.

## Geographic controls

- **OpenStreetMap way 28015862**, Patricia's Green, is retained in the canonical `cerebral-valley-layout.json` snapshot. Its four mapped corners are (−28.059, −81.887), (−7.831, −78.670), (−22.085, 10.698), (−42.287, 7.481), in the project's east/north metre coordinates. The park is approximately 20.5 m wide and 90.5 m long, rotated with Octavia.
- All **21 source path pieces** are retained: the long loop, curved crosspaths, the circular Hayes-side exhibition plaza around (−29.07, −4.11), and sidewalk connectors. Path widths, paving construction and edging are interpreted; the mapped centreline locations are preserved.
- Surface elevations use the same USGS 3DEP bilinear ground sampler as the neighborhood generator. Close surfaces are finely subdivided across and along the paths so a curved walkway follows the terrain rather than floating as a planar slab.
- [Hayes Valley's public description](https://en.wikipedia.org/wiki/Hayes_Valley,_San_Francisco) identifies the green between Fell and Hayes, seating, a children's play structure, and a **changing** public-art exhibition. The reconstruction therefore does not assert that any historical sculpture is the current installation. The circular exhibition plaza is kept open.

No reference photograph or downloaded external model is distributed with this asset. Materials, fine geometry and sign lettering are original. Search results for the historical 2008 Koilos installation were insufficient evidence for a current sculpture, so that installation is not modeled.

## Authored landscape details

The readable features are pale perimeter walks and fine saw cuts, green lawn panels, dark flush mowing edges, the mapped north circular plaza, ten timber-and-metal benches facing into the park, a modest park-name sign, tree planting rings, sparse low southern planting and low natural play stones. The exact bench inventory, sign graphics, play stones, planting species and paving colors are **interpretations**, not verified current fixtures. Tree rings and small canopy anchors are placed outside the central lawns and away from the northern circle; their number and position are composition choices rather than a tree survey.

The source `.blend` and GLB contain **no mature tree models**. The metadata supplies six explicit tree anchors with heights 5.5–6 m and intended canopy widths 3.7–4.2 m for the runtime's existing credited tree instances. The simple canopies in the review PNGs are review-only placeholders and are not exported. They indicate placement and scale, not production vegetation quality.

## Ownership and regeneration

- Generator: `tools/blender/build_cerebral_patricias_green.py`.
- Editable source: `art/source/cerebral-patricias-green.blend`.
- Runtime asset and dimensional metadata: `public/assets/cerebral-valley/patricias-green.glb` and `patricias-green.meta.json`.
- Review images: `art/reviews/cerebral-patricias-green-aerial.png` and `cerebral-patricias-green-hayes.png`.
- The neighborhood generator skips Patricia's Green's old surface, furniture and eight old vegetation anchors. It also excludes OSM building **60824061**, now owned by the separate detailed Anina asset. Adjacent buildings 60824059 and 60824057 remain. The unbuilt patio east of 60824061 needs no building deletion.

Run with Blender 4.5.9 LTS:

```sh
"$CEREBRAL_BLENDER" --background --factory-startup -t 4 --python tools/blender/build_cerebral_patricias_green.py
```

Append `-- --skip-render` to omit the review PNGs. The script shares the neighborhood generator's original material and mesh primitives but does not execute its district build. Geometry uses native Blender X east, Y north, Z elevation. Standard glTF export gives X east, Y elevation, **negative Z north**, so runtime placement is direct, outside the reflected vehicle root. The parked scenery and introductory camera are owned by the runtime integration.
