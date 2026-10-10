# MakeHuman anatomical source assets

These are unchanged asset files from the official
[MakeHuman repository](https://github.com/makehumancommunity/makehuman), pinned to
commit [`a8bc2d54ff0ac92e78ff71431b1023eda42bf482`](https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482).
`provenance.json` records each vendored file's upstream path, exact download URL,
byte length, upstream Git blob SHA-1, and local SHA-256.

## License

The MakeHuman Team released the bundled base mesh, targets, and modifiers under
**Creative Commons CC0 1.0 Universal**. The original [license overview](LICENSE.md)
explicitly identifies those asset categories in section C; the complete CC0
statement is preserved as [LICENSE.ASSETS.md](LICENSE.ASSETS.md). The individual
mesh and target headers also state their CC0 release and identify the original
contributors and copyright holders.

The project's source-code license is distinct from its asset license. This
folder vendors asset data and license documents only. No MakeHuman program code,
third-party community asset pack, or MPFB add-on is included or required.

## Use in San Theft Auto

`base.obj` is the authored hm08 human mesh, including anatomical face edge loops,
UV coordinates, body geometry, and fitting helpers. The full indexed source is
kept so target indices remain reproducible; only the head/neck portion and needed
helpers are used by the driver authoring pipeline. The complete unclothed human
source is not exported as a playable model.

Selected `.target` files contain zero-based vertex indices followed by additive
X/Y/Z offsets. The builder applies its chosen weighted offsets to the original
vertex array before extracting and positioning each driver's head. Keep the
source vertex order unchanged. Original upstream files remain unmodified here;
the generated meshes and project-specific proportions live in the Blender build.

`tools/blender/racer_faces.py` handles that adaptation. Project-authored hair,
garments, skin materials, and clothing textures are maintained separately. The
resulting seven faces are stylized interpretations of the named drivers, not
photogrammetry, scans, or portraits supplied by MakeHuman. No photographic face
or garment textures are copied from MakeHuman.

When adding a new morph, copy only the needed asset from the pinned upstream
revision and update `provenance.json`. The manifest should match the importer’s
actual source dependencies; the full upstream target library is not vendored.
