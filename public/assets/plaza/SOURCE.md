# Union Square plaza assets

Original geometry authored for this game in Blender 4.5.9 LTS. These models contain no downloaded geometry or photographic texture pixels. The shape language is reference-informed and adapted to the game's compressed city; this is not a surveyed reconstruction.

## Assets and authored sources

- `dewey-monument.glb`: dressed granite stepped base, slender drum shaft, a layered acanthus-and-volute capital, and bronze Victory. The sculpture has a swept folded gown, raised trident, outstretched laurel wreath, trailing foot and supporting bronze sphere.
- `date-palm.glb`: a Canary Island date-palm study with diamond leaf scars, pruned petiole crown, arched fronds and individually modeled folded pinnae. Twelve placements share its six geometry/material batches using GPU instancing.
- Editable source files: `art/blender/dewey-monument.blend` and `art/blender/date-palm.blend`.
- Reproducible authoring script: `tools/blender/create_plaza.py`. Run with Blender's `--background --python` flags from the project root.

Both exports use metres with a ground-contact origin and glTF +Y up. The monument's figure looks local +Z. The game places the monument at `(0, 23.30, 0)` with a 90-degree Y rotation. Palms are placed on their lawn or terrace bases, with modest rotation/scale variation.

## References consulted

1. [Dewey Monument, Wikipedia](https://en.wikipedia.org/wiki/Dewey_Monument) — column and sculpture proportions, stone construction, subject and attributes. The article reports a roughly 25.9 m column and 2.7 m figure; the game enlarges the figure slightly to preserve recognition from the driving camera.
2. [Victory in Union Square, close photograph](https://commons.wikimedia.org/wiki/File:%27Victory%27._Union_square,_San_Francisco_(5572909790)_crop.jpg) — **inspected** to establish the lifted trident, sideways wreath, floating pose, orb, face profile and windblown drapery. Photo used only for reference and is not included in exported assets.
3. [Dewey Monument, Union Square, full-height photograph](https://commons.wikimedia.org/wiki/File:Dewey_Monument,_Union_Square.jpg) — **inspected** for the column's slenderness, articulated Corinthian capital, stone drum seams and stepped pedestal. Photo used only for reference and is not included in exported assets.

The planting is a botanical approximation, rather than a scan of an individual Union Square tree. Paving maps in `src/union-square.ts` are original generated material patterns with 1.8 m × 0.9 m slabs. Handrails, bins and uplights are original game geometry. They are deliberately kept inside the existing plaza footprint.

## Runtime budgets

- Dewey Monument: 26,342 triangles, 4 material draws.
- Date palm: 26,802 triangles per tree, 6 instanced material draws for all 12 trees.
- Both files are self-contained GLBs. Procedural fallback geometry remains available until each asset's load completes. Low graphics disables plaza shadow casting.
