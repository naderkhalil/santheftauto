# Jacaranda tree

- Asset: [Jacaranda Tree, Poly Haven](https://polyhaven.com/a/jacaranda_tree)
- Authors: Rico Cilliers (asset), Rob Tuytel (guidance).
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Metadata: https://api.polyhaven.com/files/jacaranda_tree
- Original model: https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/jacaranda_tree/jacaranda_tree_1k.gltf
- Downloaded September 20, 2026.

This game adaptation repairs duplicate and unreferenced scan vertices, removes duplicate trunk faces, simplifies the three original primitives with meshoptimizer, quantizes normals, and resizes/compresses textures to 1024 px WebP. The original leaf opacity map is combined with its diffuse map to preserve cutout foliage and correct shadows. Original branch/trunk texture coordinates, normals, material divisions, and tree silhouette are retained.

`jacaranda.glb`: 75,735 triangles (15,738 branches; 4,997 trunk; 55,000 leaves), 157,340 vertices, approximately 4.57 MB. Nine external WebP textures total approximately 1.79 MB. Simplification errors reported by meshoptimizer: branches 0.073%, trunk 0.172%, leaves 0.359% of primitive extent.

Two instances in the game share the same geometry, materials, and textures. Original geometry and textures are CC0; this is an independent modification, not an endorsement by Poly Haven or the authors.
