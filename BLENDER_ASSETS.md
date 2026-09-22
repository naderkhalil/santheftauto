# Blender asset pass

Blender is the next tool for improving landmark shapes, proportions and material detail. The new street layout, camera, lighting and driving remain in TypeScript/Three.js. **The current game uses procedural landmark and vehicle geometry; no Blender-authored models have been imported for this version.** The steps below are an authoring plan, not an implemented asset pipeline.

## First three models

| Priority | Asset | What the model should improve |
| --- | --- | --- |
| 1 | Westin St. Francis | Historic façade proportions, three wings and recessed courts, carved cornices, entrance canopy and distinct modern towers behind. Model all visible returns. |
| 2 | Dewey Monument and Victory | A recognizable bronze figure, wreath and trident, believable drapery, Corinthian capital and granite pedestal. Keep the column slender and the sculpture legible from street level. |
| 3 | Dragon Gate | Correct three-opening silhouette, layered tile roofs, curved eaves, ceramic ridges, carved supports and guardian lions. Preserve the playable central clearance. |

Collect several reference views for each asset, including a frontal view, side view and roof silhouette. Separate observations from approximate dimensions. Match recognizable proportions first; fit the approved model into the game's deliberately compressed footprint. Do not infer that the entire city is accurate because an individual landmark has improved.

## Authoring contract

- Work in metres. Blender may remain Z-up while editing; export glTF/GLB with **+Y up** and confirm the Three.js result. The game uses +X east and +Z north.
- Apply object scale and rotation before export. Put the asset root at its ground-contact center, local Y=0 in the exported model; document its front direction. Use one explicit placement transform in the game.
- Keep the existing landmark footprint and all road/sidewalk clearances. Use simple separate collision proxies only where gameplay needs them; decorative geometry must not redefine the course.
- Name the root and parts consistently, such as `westin_root`, `westin_historic`, `westin_tower`, `dewey_victory` and `dragon_gate_roof`. Keep reusable windows and trim modular during authoring.
- Export a self-contained **GLB**. Keep the editable `.blend`, references and export settings with the asset source notes. Record the source and license of every imported component or texture.

## Browser rendering budget

Build at least two levels of detail: a close driving/menu model and a simpler distant model. Preserve outline and major openings in both. Proposed starting targets are 60–100k triangles for the complete Westin, 12–25k for the monument and 25–50k for Dragon Gate at the close level, then roughly one quarter of that for the distant level. These are working budgets to validate on the game's target devices, not measured requirements.

Use a small material set and atlases. Aim for about 4–6 opaque material draws per landmark, with transparent glass kept separate. Join static meshes by compatible material for export; repeated windows should use shared geometry or a baked façade. Avoid a separate draw call for every pane, roof tile or carving.

Bake sculpted and repeated surface detail into PBR maps: base color, tangent-space normal, roughness, metallic where needed, and optional ambient occlusion. Start with 1K–2K texture sets. Keep sun shadows out of base color so the game lighting remains consistent. Use opacity masks sparingly and avoid stacked transparent layers. Mesh and texture compression are later integration choices and require their corresponding runtime decoders.

## Integration and acceptance

1. Export one landmark and inspect scale, axis conversion, normals, UVs and material appearance in a glTF viewer and the game.
2. Load it with Three.js `GLTFLoader`, place it at the existing landmark transform, and replace that procedural landmark only. Retain the procedural version as a development fallback while reviewing.
3. Wire distance-based LOD selection and quality settings explicitly; exporting several meshes does not enable LOD automatically.
4. Compare the same menu, street approach, corner and flight views before and after. Look for a stronger silhouette and recognizable details at actual racing speed.
5. Measure frame time, draw calls, triangles, texture memory and loading time on desktop and a representative phone. Check that physics, clearances, finish view and current best-time storage are unaffected.

Approve the Westin pass before scaling this workflow to the rest of the city. More detailed assets will help most when the composition, route and recognizable local features already work.
