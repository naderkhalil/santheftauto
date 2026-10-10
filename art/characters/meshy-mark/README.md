# Mark cartoon — Meshy pilot

This folder records the approved high-resolution head-and-shoulders source and its visual-review history. The dense originals, local paths `mark-meshy-v1.glb` and `mark-meshy-v1.blend`, are preserved in the ignored sculpt archive rather than Git; the Blender file exceeds GitHub's 100 MiB limit. They are not files loaded by the game. Git includes the optimized editable workspace `../../runtime-cartoon/mark-runtime.blend` and matching GLB, plus the concepts, model/import reports and review images here. A full walking body and animation rig remain future work.

Status: generation succeeded and the GLB was downloaded and visually inspected from front, three-quarter, profile and back in the browser. The pilot consumed 30 credits. The user approved the result on October 9, 2026: “This is excellent. Now do the rest of the characters.” This approved the visual direction; optimized racing variants were built subsequently. The original-source gallery at `http://127.0.0.1:3032/art/characters/meshy-mark/index.html` requires the ignored dense GLB and a running development server. For a clean-checkout review, use the committed models and viewer in `../../runtime-cartoon/`.

The result is substantially closer to the cartoon than the earlier procedural bust. It carries the recognizable narrow face, relaxed mouth and grouped curls into real geometry. Facial planes are softer than the drawing; the hair is repetitive toward the back, and the temporary lower bust boundary is uneven. This is useful source material for cleanup, not a runtime-ready asset: `model-stats.json` records 2,193,516 triangles, one mesh/material, three textures, and no skeleton or animation; the GLB is about 81 MB. Review screenshots are saved as `review-front.png`, `review-three-quarter.png`, `review-profile-clay.png` and `review-back.png`.

The local archive path `mark-meshy-v1.blend` contains the dense editable Blender workspace. It was saved and reopened successfully with the original mesh/material preserved and all three textures packed. The committed `blender-import-report.json` records verification; `import_into_blender.py` reproduces the import when the archived GLB is available, without overwriting an existing workspace. No remeshing or sculpt edits have been applied to the archived original. A second visual review also identified a rounded nose tip and soft eyelids as refinement targets, alongside sharper brow/cheek/jaw planes and less regular back curls.

## Input and generation

- Approved direction: `../direction/mark-concept-cartoon-v1.png`.
- Single-view input: `../direction/mark-meshy-bust-input-v1.png`, isolated from the approved concept with the user's selected OpenAI API image workflow (`gpt-image-2`, high quality, 1024×1024).
- Exact image edit prompt: `../direction/mark-meshy-bust-input-prompt.txt`.
- Additional modeling guide: `../direction/mark-cartoon-turnaround-v1.png`.
- Provider task/account history: local, Git-ignored `generation.json`. Public request settings are described below; `model-stats.json`, `blender-import-report.json` and `../../runtime-cartoon/mark-report.json` retain model and conversion evidence.

One Meshy 7.1 standard image-to-3D request was submitted with 4K textures and PBR maps, no remesh, and image enhancement disabled to preserve the artwork. The documented cost is 30 credits. The API key remains in the ignored, owner-readable `.env.meshy.local` file; it must never be included in art metadata or committed.

## Review gate

Inspect the actual GLB from front, three-quarter, profile and back. Compare the long nose, tapered jaw, eye spacing, calm mouth, ear placement, grouped curls, and neck/shoulder proportions with the approved cartoon. Inspect clay mode as well as textures: painted details alone do not establish good geometry. Review triangle count, material setup and texture memory before planning game integration. A successful API request is not visual approval.

The standalone viewer loads the archived local path `mark-meshy-v1.glb`; it requires restoring that original and is intentionally unavailable without it. Production models, the roster and multiplayer behavior are independent of this preview. The [runtime workflow](../../runtime-cartoon/README.md) documents `--all --assemble-only` from committed optimized GLBs; full `--all` mesh/texture regeneration additionally needs the dense sculpt archive.

## Provider provenance

The user supplied a Meshy API key and authorized this one-character pilot. Meshy's [API pricing](https://docs.meshy.ai/en/api/pricing), [image-to-3D reference](https://docs.meshy.ai/en/api/image-to-3d), [terms](https://www.meshy.ai/terms-of-use), and [pricing FAQ](https://www.meshy.ai/pricing) were checked on October 9, 2026. The terms include API services, assign paid-plan output to the customer to the extent permitted by law, and the pricing FAQ permits paid customers to distribute and sell models. The sources do not explicitly settle every asset relicensing choice for the future open-source release; keep this provenance with any distributed model. No asset has been published to Meshy's Community.

Download generated output promptly: Meshy's [asset-retention policy](https://docs.meshy.ai/en/api/asset-retention) gives non-Enterprise API assets a three-day retention period.
