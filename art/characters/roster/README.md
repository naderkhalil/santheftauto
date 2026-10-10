# San Theft Auto — cartoon character studies

The user approved the Mark Meshy prototype and requested the remaining six characters on October 9, 2026. This folder expands that same visual direction into distinct Dario Amodei, Sam Altman, Elon Musk, Jensen Huang, Mira Murati and Fei-Fei Li studies. Mark's archived originals remain locally in `../meshy-mark/`.

Each new character gets a photo-informed cartoon concept, one textured Meshy 7.1 source sculpt, an editable Blender workspace, and browser visual review. These are the high-resolution head-and-shoulders sources. The dense `*-meshy-v1.glb` and `*-meshy-v1.blend` originals are kept in an ignored local/external sculpt archive; several exceed GitHub's 100 MiB file limit. They are not bundled with a checkout. Git includes concepts, public model/import reports, review images and the optimized editable `*-runtime.blend` workspaces and GLBs in `../../runtime-cartoon/`. Full walking bodies, separate eye controls and animation rigs are later work.

**Completed:** all six concepts and 3D source studies are saved, with editable Blender files reopened and verified and all textures packed. Each was inspected in textured three-quarter, front clay and rear views. A second visual review found no major backside defects or broken glasses in those views. Meshy consumed 180 credits total. Provider task/account histories in `generation.json` and `roster-status.json` remain local and Git-ignored; public concepts, reports and the findings below accompany the committed optimized models. That source-study phase did not replace or deploy production assets. The subsequent user-approved game integration uses optimized derivatives in the shared runtime kit; see [the runtime workflow](../../runtime-cartoon/README.md).

| Character | Local dense Blender archive path (not in Git) | Exact concept prompt |
| --- | --- | --- |
| Dario Amodei | `dario/dario-meshy-v1.blend` | [Prompt](dario/concept-prompt.txt) |
| Sam Altman | `sam/sam-meshy-v1.blend` | [Prompt](sam/concept-prompt.txt) |
| Elon Musk | `elon/elon-meshy-v1.blend` | [Prompt](elon/concept-prompt.txt) |
| Jensen Huang | `jensen/jensen-meshy-v1.blend` | [Prompt](jensen/concept-prompt.txt) |
| Mira Murati | `mira/mira-meshy-v1.blend` | [Prompt](mira/concept-prompt.txt) |
| Fei-Fei Li | `feifei/feifei-meshy-v1.blend` | [Prompt](feifei/concept-prompt.txt) |

The models preserve distinct faces and silhouettes, and Jensen's leather finish carries into 3D. Cleanup remains: simplify dense hair, refine eyelids, separate eyes/glasses as needed, reduce sheen on fabric clothing, and clean lower bust boundaries. Mira's likeness is the most interpretive because her photo reference is profile-only. The original sculpt sources range from about 1.7 to 6.1 million triangles and must be optimized before gameplay.

`model-lineup.html` and `model-lineup.png` show actual screenshots of the six 3D models. The interactive gallery's **Concept lineup** is separately labeled as generated source illustrations. Browser checks covered all six source models, rapid character switching, material/view controls, and switching between the concept lineup and 3D studies; the scoped TypeScript check passed.

## Art direction

Use `../direction/mark-meshy-bust-input-v1.png` for rendering style and framing only. Each character's own photograph determines the likeness. Preserve differences in head shape, hairline, brow, eyes, nose, mouth, age and expression. Favor shaped facial planes, natural adult proportions, calm expressions and sculptural hair groups. Avoid generic shared faces, inflated features and mocking caricature.

Jensen's black jacket must read as leather through tailored seams, zipper detail, controlled sheen and characteristic folds. His tagline remains **“Fully accelerated.”** The other characters should have distinct clothing and silhouettes in the same visual world.

## Files and provenance

Each character subfolder contains:

- `concept-prompt.txt`: exact OpenAI image edit prompt using the user's selected API fallback.
- `concept.json`: input references, model/settings and concept review.
- `<id>-cartoon-bust-v1.png`: inspected concept used for the 3D request.
- `generation.json`: private local provider/account history, ignored by Git.
- `<id>-meshy-v1.glb` and `<id>-meshy-v1.blend`: local dense sculpt archive paths, ignored by Git.
- `model-stats.json` and `blender-import-report.json`: committed geometry/material measurements and verification that the archived workspace reopened with packed textures.
- Browser review screenshots and visual findings after generation completes.

Image generation uses the bundled imagegen CLI with `gpt-image-2`, high quality, 1024×1024, the approved Mark style reference and a person-specific likeness photograph. Photographs remain reference material outside the repository; source URLs are recorded in metadata. Meshy requests use the same settings as the approved Mark pilot: `meshy-7.1`, standard geometry, 4K textures, PBR maps, no remesh and image enhancement disabled. Each request costs 30 existing credits (180 for six). No subscription or credit purchase is part of this work.

`tools/generate-meshy-character.py` provides explicit create/status/download operations and refuses duplicate submissions. `tools/blender/import_meshy_character.py` imports a character folder without altering the source mesh or overwriting an existing Blender file. Both credentials remain in Git-ignored local files. See `../meshy-mark/README.md` for provider rights and retention references.

The original-source gallery at `http://127.0.0.1:3032/art/characters/roster/index.html` requires the ignored dense GLBs and a running development server. A clean checkout can view and edit the committed optimized models in `../../runtime-cartoon/` and reassemble the complete kit using `--all --assemble-only`. A full `--all` mesh/texture rebuild requires restoring the dense originals at the paths above. Review actual geometry in textured and clay views before carrying refinements into full-body game characters.
