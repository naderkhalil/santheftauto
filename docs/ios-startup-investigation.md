# iOS Safari startup crash investigation

Status: investigation, not a confirmed root cause. This audit examines the original graphics in commit `990926f`. The temporary visual downgrade is being reverted. No physical iPhone/iPad crash log or measured process-memory trace was available for this audit.

## Verified asset expansion

The compressed download size substantially understates the loading workload. A read-only Python audit parsed the GLB JSON, summed accessor storage (`count × component bytes × components`), and read embedded/external image dimensions with Pillow. Image estimates use `width × height × 4` for decoded RGBA. These figures are allocation estimates, **not measured resident memory**; they exclude parser objects, decoder/WASM heaps, compressed buffers, batching copies, GPU copies, HDR images, and render targets. Shared images can change actual residency.

| Original asset/group | Download | Decoded accessor arrays | RGBA image estimate |
| --- | ---: | ---: | ---: |
| Racer kit, all seven drivers | 12.50 MiB | 30.79 MiB | 147.00 MiB |
| Westin, near and distant | 5.86 MiB | 22.45 MiB | 13.88 MiB |
| North Square, near and distant | 5.44 MiB | 41.51 MiB | 3.00 MiB |
| Store frontages, near and distant | 7.65 MiB | 27.78 MiB | 16.50 MiB |
| Ferry Building, near and distant | 7.43 MiB | 27.02 MiB | 12.25 MiB |
| Embarcadero, near and distant | 3.41 MiB | 18.91 MiB | 2.00 MiB |
| Jacaranda | 4.35 MiB | 4.20 MiB | 36.00 MiB |
| **17 boot GLBs audited, total** | **51.16 MiB** | **181.34 MiB** | **231.62 MiB** |
| Racer garage, loaded later in setup | 6.24 MiB | 52.52 MiB | 0.50 MiB |

The boot total also includes the cable car, Bay Bridge, street details, Dewey monument, and date palm. It is a selected asset audit, not an exhaustive process-memory inventory. The racer kit contains 21 images: seven sets of 1024², 2048², and 512² pixels. Decoding all seven sets accounts for 147 MiB before GPU mipmaps. Initially, only visible model textures need GPU upload; claiming that all seven drivers are immediately uploaded to the GPU would be incorrect.

## Verified loading order and lifetime

- `src/main.ts` constructs city, landmarks, street details, waterfront, and the car before awaiting their readiness together. Image/Draco decoding and geometry preparation can overlap. No per-stage physical-device timings have been measured yet.
- The car requests the entire racer kit at startup. `src/racer-assets.ts` caches the promise and full source scene for subsequent cloning, retaining unused drivers as well as the selected one.
- Near and distant architectural exports both load during startup. North Square/frontages clone and merge geometry. Waterfront preparation additionally expands indexed geometry into nonindexed arrays and merges them. Source arrays, intermediate arrays, and merged output can overlap; `.dispose()` does not itself erase JavaScript typed arrays.
- The main renderer creates the full postprocessing pipeline, but Three.js generally allocates render-target GPU storage on first use, not merely when `WebGLRenderTarget` is constructed. `applyQuality()` runs before the first composer render. Initial high-resolution target **descriptors alone are not evidence of a GPU allocation spike**.
- `RacerShowroom` is constructed only on the driver/car setup steps, after initial loading. It creates a second WebGL renderer, a four-sample half-float composer, its own lighting/reflections, and the 52.52 MiB decoded garage geometry. It persists after setup closes and is disposed only on `pagehide`. This can explain a later setup/race-transition failure, but cannot explain a crash before the initial menu appears.

## Likely mechanism, still unproven

The strongest source-level suspect for an **initial loading-screen termination** is the peak from overlapping decoded images, geometry preparation, and GPU upload. The audited inputs alone represent roughly 413 MiB of decoded arrays/images before other allocations. This is consistent with resource pressure, but does not establish an iOS memory limit or prove a WebKit process kill.

A GPU/driver failure during reflection baking or the first render is a separate possibility. The pipeline uses half-float render targets, depth textures, shadow maps, and multisampling. Those features are not evidence of a Safari defect by themselves; the failure stage, context-loss events, and device logs must distinguish the hypotheses.

## Best targets that preserve the artwork

1. **Load the selected full-resolution driver, not the complete roster.** Split the vehicle, seated drivers, and portraits into independently loadable assets without changing geometry or image resolution. Other selections load on demand. This addresses the largest verified decoded-image cost while preserving the actual characters.
2. **Bound startup concurrency.** Stage creation/decoding of asset groups, and defer distant exports until the complete near scene is ready. Keep original near models visible while distant models load. Longer loading is acceptable evidence gathering; no lower-detail replacements are required.
3. **Remove geometry-copy peaks.** Preserve indices when batching compatible primitives, release temporary source references promptly, and avoid simultaneously retaining expanded, cloned, and merged versions. Validate draw output and material grouping against the original.
4. **Reuse or release showroom GPU resources.** Retain the same 3D portraits and cars while avoiding simultaneous permanent city/showroom renderer allocations—for example, share the renderer or dispose/recreate setup resources at controlled transitions. This targets setup crashes, not initial loading.
5. **Release completed reflection workspaces.** After the final bake, retain the resulting reflection textures but release PMREM scratch buffers and capture targets if they will not be used again. Remove unnecessary depth attachments from full-screen-only postprocessing targets. These are smaller savings and need rendering regression checks.

GPU-compressed textures at the original resolution are another candidate, but require an appropriate codec/device compatibility test and visual comparison; they should not be described as automatically lossless.

## Physical-device evidence needed

- Device model, iOS/iPadOS version, Safari version/context, and whether failure occurs before the menu, entering driver selection, entering the garage, or starting the race.
- Last persisted startup stage and timestamp; asset completion/duration markers; console errors, unhandled rejections, and `webglcontextlost` events from the same failed attempt.
- A Safari remote-inspection recording where possible, plus device Console/Analytics logs identifying a WebContent/GPU process termination, `JetsamEvent`, or GPU reset. This separates process termination from a handled JavaScript exception or a loading timeout.
- Renderer dimensions/pixel ratio, WebGL limits, and relevant float-buffer/multisample capabilities. Actual process-memory observations should be recorded separately from the estimates above.
- Repeat on the same physical device with one change at a time: original baseline, serialized loading, then selected-driver loading. Compare successful completion and peak memory while keeping identical artwork and rendering settings.

Desktop browser emulation or a phone-sized viewport can validate layout and code paths, but cannot establish the cause of an iOS process crash.
