"""Rebuild drivers while preserving the approved car and garage geometry.

Run with Blender --background --python tools/blender/rebuild_racer_characters.py.
The original complete kit builder also remains available for a clean rebuild.
"""
from pathlib import Path
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
SOURCE = ROOT / 'art/source/racers-and-garage.blend'
KIT = ROOT / 'public/assets/models/racer-kit.glb'
# Keep the current pair intact until both exports finish. Staging beside each
# destination preserves relative paths inside the editable Blender source.
STAGED_SOURCE = SOURCE.with_name('racers-and-garage.staging.blend')
STAGED_KIT = KIT.with_name('racer-kit.staging.glb')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version = 0
for obj in list(bpy.data.objects):
    if obj.name.startswith(('Standing_', 'Seated_')):
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)

from racer_characters import build_actors
from racer_surfaces import finalize_actors

print('Sculpting revised drivers', flush=True)
actors = build_actors()
print('UV mapping and batching final character surfaces', flush=True)
finalize_actors(actors)
vehicle = bpy.data.objects.get('Vehicle')
if vehicle is None:
    raise RuntimeError('Editable source is missing the approved Vehicle root')
bpy.ops.object.select_all(action='DESELECT')
for root in [vehicle, *actors]:
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
print('Exporting runtime kit with embedded garment maps', flush=True)
bpy.ops.export_scene.gltf(
    filepath=str(STAGED_KIT), export_format='GLB',
    use_selection=True, export_apply=True, export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_normal_quantization=12,
    export_draco_texcoord_quantization=14,
)
bpy.ops.wm.save_as_mainfile(filepath=str(STAGED_SOURCE), compress=True)
STAGED_SOURCE.replace(SOURCE)
STAGED_KIT.replace(KIT)
print('RACER_CHARACTERS_READY', flush=True)
