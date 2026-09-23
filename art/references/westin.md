# Westin St. Francis · Powell Street hero asset

Reference-led model authored in Blender, with an editable `.blend`, a reproducible Python generator and a self-contained glTF delivery asset. Dimensions fit the game's compressed Union Square while retaining the identifiable architectural hierarchy.

## References inspected

- [Westin St. Francis overview](https://en.wikipedia.org/wiki/Westin_St._Francis): 1904 and 1913 historic hotel; 1972 tower by William Pereira.
- [Powell frontage photograph](https://commons.wikimedia.org/wiki/File:Westin_st_francis_san_francisco.jpg). The full-resolution photograph was inspected as a modeling reference; it is not embedded in the game or redistributed as a texture.
- [Official hotel page](https://www.marriott.com/en-us/hotels/sfouw-the-westin-st-francis-san-francisco-on-union-square/overview/) identifies the property and location. This page returned a robot-access restriction; no claim is made to have inspected its photography.

## Architectural decisions grounded in the photograph

- Medium gray rusticated stone, with slightly warmer carved edges. The old yellow façade did not match the building.
- Three projecting historic pavilions and two strongly shadowed light courts. Pavilions extend ten meters farther toward Powell than the courts.
- Close vertical rhythm of eleven upper rows and the tall ground story; individual inset metal windows, dark reveals, actual window holes, sills and curtain variation.
- Rusticated corner quoins; string courses; upper-story carved tablets; projecting dentil cornices and the characteristic oxidized green copper roof edge.
- Tall arched shop openings and the deep bronze entry canopy, glazed ribs, pendant lamps, door hardware and raised hotel lettering.
- Tall rear concrete volumes with dark vertical slots, repeated horizontal spandrels and Pereira-style sculpted crowns.

The canopy details and compressed massing are interpretive game art rather than a survey or a claim of millimeter accuracy. US and California flags are modeled as modest pieces of folded cloth; the state bear motif is simplified at this scale.

## Delivery and budget

`tools/blender/build_westin.py` builds `art/source/westin.blend` and `public/assets/hero/westin.glb` using Blender. Maps are embedded; no runtime dependency on reference websites exists. Textures are original procedural material images: meter-scale stone joints and pores, normal and roughness maps, sixteen curtain-and-glass variations, and a small flag atlas. Static geometry is batched by material and by historic/tower mass. The delivered GLBs use Draco compression with the game’s local decoder. The close mesh is approximately 237,000 triangles across thirteen draws; the distant mesh is approximately 62,500 triangles with downsampled color maps and reduced material detail. Exact final counts and byte sizes live in the generated metadata.

Blender origin is the center of the historic Powell frontage at street level. Blender X runs across the front, +Y runs toward the rear, and +Z is up. The GLB export uses Y up; the game places it at `(-93, 22, -1.5)` with a `+π/2` Y rotation. The generator also exports a quantitative `westin.meta.json` and renders overview and entrance review images from the same delivery mesh under `art/reviews/`. Add `-- --skip-render` after the Blender command to regenerate assets without the review renders.

## Visual QA

The overview and street-level render were inspected. This caught and corrected a roof that incorrectly bridged the light courts, small ground-story spandrel gaps, over-repeated tower reflections, and an entrance sign crossing its canopy rib. Normal and roughness image channels were inspected numerically after export: the normals remain near `(0.5, 0.5, 1)` and stone roughness remains nonzero. The same model is then reviewed in the game lighting, camera and streaming loader.
