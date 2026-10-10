# Character art direction — Mark prototype

Status: the user approved the Mark cartoon, the first Meshy bust, and the remaining six character studies, then requested game integration. Optimized 3D portraits and seated racers are now prepared in `../../runtime-cartoon/`; the actual game uses their shared runtime kit. Full walking bodies, facial animation and rigs remain future work. The earlier procedural bust is a rejected experiment.

The built-in image generator had returned `404 Route not found`, both with and without a reference image. Its scheduled retries remain paused at the user's request. The API credential and private workflow history in `generation-status.json` stay in Git-ignored local files and are not part of the published art assets. The concepts, exact prompts and public modeling/runtime reports are included in Git.

## Generated studies

- `mark-concept-v1.png`: initial likeness study. Recognizable face and natural body proportions, but the broad grin, nearly frontal portraits, and photographic surface texture needed refinement. Prompt: `mark-concept-prompt.txt`.
- `mark-concept-v2.png`: review candidate. Calmer closed-mouth expression, distinct front and three-quarter views, and cleaner painted facial shapes. Prompt: `mark-concept-refinement-prompt.txt`. Inputs were the first study and the original likeness photograph.
- `mark-concept-cartoon-v1.png`: cartoon comparison candidate. Cleaner contours, larger graphic eyes, grouped curls, and broad shaded shapes; retains the relaxed smile, wardrobe and three-view composition. Prompt: `mark-concept-cartoon-prompt.txt`. Input was the painterly v2 concept.
- `mark-cartoon-turnaround-v1.png`: front, left-facing profile and back head-and-shoulders studies derived from the approved cartoon. Prompt: `mark-cartoon-turnaround-prompt.txt`; generated with `gpt-image-2`, high quality, 1536×1024. Visually inspected as a modeling reference candidate; user approval of this new sheet is pending. Reconcile landmarks and silhouettes during modeling rather than assuming the generated views are geometrically exact.

These retained studies are the committed copies. Duplicate image-generator
outputs under `output/imagegen/` remain local and ignored.

The cartoon style and 3D bust direction are approved. The standing illustration remains an art-direction study, not a rigging reference. Existing rejected models are not the template for the current roster.

## 3D pilot status

The procedural bust in `../cartoon-mark/` failed visual review: its face is generic and stiff, the neck is poorly shaped, and the curls do not reproduce the approved drawing. Keep it isolated from the live game and do not use it as the template for the roster.

The user authorized a Meshy 7.1 image-to-3D pilot, which succeeded on October 9, 2026 and consumed 30 credits. Its input is `mark-meshy-bust-input-v1.png`, a visually inspected single-bust adaptation of the approved concept; the exact adaptation prompt is `mark-meshy-bust-input-prompt.txt`. The downloaded dense GLB, original Blender workspace and private provider history are preserved locally in `../meshy-mark/` and ignored by Git. Its original-source gallery requires those archived files. The user approved the Mark model visually and requested the other six characters, now complete in `../roster/`. Git includes their concepts, public reports and review images, plus optimized editable portraits and cockpit upper bodies in `../../runtime-cartoon/`. Walking bodies and rigs remain future work. The approved concept remains the authority if generated references or meshes disagree with it.

Meshy's API documentation lists a textured Meshy 7.1 image-to-3D task with 2K or 4K textures at 30 prepaid credits. This pilot uses existing credits; no credit purchase or subscription was made by the agent. Exact dollar cost and the minimum top-up remain unverified. Provider ownership/distribution references are recorded in `../meshy-mark/README.md` for the future open-source release. Use a single-character input for a single-image request; do not feed a sheet of three heads as though it were one object.

- [API pricing](https://docs.meshy.ai/en/api/pricing)
- [Image-to-3D documentation](https://docs.meshy.ai/en/api/image-to-3d)
- [Account and API keys](https://www.meshy.ai/developers/keys)
- [Credits and subscription settings](https://www.meshy.ai/settings/subscription)

## Visual target

Start with one recognizable, appealing Mark Zuckerberg. Use the selected cartoon's clear shaded planes, expressive graphic eyes, grouped curls, natural adult proportions and calm closed-mouth expression. Preserve his distinctive forehead, eye spacing, longer nose and tapered jaw. Clothing is a charcoal cotton crewneck, dark jeans, and understated off-white sneakers. Do not return to photographic skin texture or bulky primitive-based figures.

The first deliverable is a concept sheet with a large three-quarter bust, a straight-on face study, and a relaxed full-body view of the same character. The exact generation prompt is in `mark-concept-prompt.txt`.

Likeness reference already viewed: `/private/tmp/sf-founder-photo-reference/mark.jpg`. Source metadata: `/private/tmp/sf-founder-photo-reference/sources.json`, Wikipedia page ID 2844938. This is a reference photograph, not a runtime asset or the proposed art style. If the temporary reference disappears, recover it from its recorded public source and inspect it again before generating.

Reference source: https://upload.wikimedia.org/wikipedia/commons/9/93/P20260929DT-1655_%2855561811540%29_%28cropped%29.jpg

## Review before expansion

Evaluate likeness and appeal at both full size and the selection screen's actual size. Check natural shoulder/neck proportions, relaxed eyes and mouth, airy grouped curls, subtle skin shading, and consistency across the three views. Reject inflated shoulders, plastic skin, helmet hair, rigid grins, or generic faces. Existing sculpt renders are rejected studies, not approved design references.

Show the first concept to the user before rebuilding the roster. Once the direction is approved, develop one matching Blender prototype, inspect it seated in the car and in the selector, then extend the style to the other six characters. An image-to-3D result would only be a starting mesh and still require modeling and cleanup.

## Game integration

`tools/blender/build_cartoon_runtime.py` converts the approved Meshy sources to
lightweight 3D portraits and seated racing models. The actual selection screen
uses `#mp-portrait-mount` and the interactive 3D showroom with soft studio light;
players can rotate the selected character. The car preview, local driver and
multiplayer opponents use matching seated variants. The generated illustrations
remain source references, not replacement 2D portraits in the game.

The converter rebakes source color and surface detail onto reduced meshes,
keeps the original vehicle resources intact, and stages the complete kit in
`art/runtime-cartoon/` for visual and automated review before copying it to
`public/assets/models/racer-kit.glb`. See [the runtime workflow](../../runtime-cartoon/README.md)
and [the Blender pipeline](../../../BLENDER_ASSETS.md). The roster/profile
protocol and friend-selection markers retain their existing behavior.

A clean checkout includes the optimized `*-runtime.blend` workspaces, matching
GLBs, vehicle baseline and assembled kit. Reassemble them with
`--all --assemble-only`. A full `--all` mesh/texture rebuild additionally requires
the ignored dense `*-meshy-v1.glb` originals from the local/external sculpt
archive; several original GLB/Blender files exceed GitHub's 100 MiB limit.
