# Experimental Mark bust — not approved

This isolated Blender/GLB experiment failed internal visual review against the user-selected cartoon concept. Its facial likeness, calm expression and overlapping curl shapes do not meet the approved direction. It must not replace a production character or be described as a faithful translation of the concept.

`../../characters/direction/mark-concept-cartoon-v1.png` is the approved visual target. The artwork is approved; this mesh is not.

`mark-prototype.blend` and `mark-prototype.glb` preserve the experiment. `index.html` / `preview.ts` are a development-only comparison viewer for future improved assets. They do not participate in the game's runtime or networking.

The proof was built by `tools/blender/prototype_cartoon_mark.py` using the existing CC0 MakeHuman topology as a donor, process-local adjustments, and newly authored hair/shoulder geometry. See `art/third-party/makehuman/SOURCE.md` for the donor provenance. No production roster files are rebuilt by this script.

Before continuing to the full body or other drivers, obtain a stronger starting mesh or a skilled character-modeling pass that matches the approved reference. Inspect actual exported geometry and materials in the browser. Passing a loader/build check is not a visual acceptance test.
