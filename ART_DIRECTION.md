# SF / City Run — visual direction

## The target

A vivid California driving postcard: clean Pacific blue sky, warm afternoon sun, colorful painted architecture, crisp blue shadows, healthy greenery and a brilliant red car. The place should be recognizable from its street proportions, hills, cable cars and landmarks even with every label hidden. Keep the rendering grounded in material and lighting behavior, with an intentionally heightened color palette.

## What the first version got wrong

Gray atmospheric fog obscured the skyline. Too much ambient light flattened the buildings. Repeated window grids and similar building silhouettes dominated each view. Broad wet-road glare and nighttime effects competed with the city. Additional objects increased complexity without establishing a coherent visual hierarchy.

## Current correction

- A photographic clear blue HDR sky, with color direction matched to the scene, and lower-density blue distance haze.
- Warm directional sun, cooler shadow fill, architectural shadow casters.
- Color-preserving tone mapping; restrained bloom and vignette.
- Mostly dry asphalt; removed projected night headlight/taillight pools.
- Curated seafoam, coral, ochre, cream and periwinkle streetfronts with contrasting trim.
- Three curated Victorian hero facades, varied roofs, an articulated Union Square backdrop and a flowering plaza.
- Two optimized real jacaranda models with cutout leaf silhouettes and shadows.
- Brighter blue/teal glazing and richer vehicle/foliage colors.

## The next major asset pass

Build a single 150–250 m hero stretch to a consistent standard before expanding the map. Use street photography as reference for actual facade rhythms, door proportions, bay windows, curb widths, fixtures and street signs.

1. Author a small family of distinctive Victorian and Edwardian facades as clean 3D assets, plus the exact hero landmark visible in the chosen view. Include deep entrances, dimensional ornament and restrained weathering. Preserve separate modular pieces for reuse without making every building identical.
2. Use a properly modeled hero vehicle and suitable detailed foliage. Clean topology, normal maps, reflections and grounded contact shadows matter more than a large object count.
3. Build a material library at consistent real-world scale: painted wood, stucco, limestone, brick, glass, aged copper and asphalt. Texture wear should support each surface, not uniformly dirty every object.
4. Compose three views: the top-of-hill reveal, the street-level passage, and the landmark arrival. Review them both as still images and at race speed. A skyline vista must be geographically plausible for the direction of travel.
5. Export browser assets as optimized glTF/GLB with mesh compression, compact textures, sensible detail levels and reusable materials. Keep distant geometry simple and foreground geometry deliberate.

## Acceptance criteria

- An unlabelled screenshot evokes San Francisco through shape, street rhythm and setting.
- Materials retain color in sunlight; shadow details remain readable.
- Close buildings have distinct entrances, rooflines and storefronts.
- Trees read as foliage rather than geometric blobs, and plants meet the ground.
- The driver can read the racing line, rails, obstacles and checkpoints at speed.
- Visual improvements survive a moving-camera review without shimmer, clipping, floating details or abrupt pop-in.
- Measure frame rate and draw calls on the actual target device. Offer a reduced-effects mode without changing the course.

The current course remains a stylized authored interpretation. The sunny pass establishes its palette; a professional hero-asset pass is the next substantial step toward a showcase environment.
