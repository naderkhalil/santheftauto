"""Import the unmodified Meshy source for an isolated Blender cleanup workspace.

Run with Blender's --background --python, optionally passing a folder after --.
No remeshing, simplification, sculpting, or material edits are performed.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


folder = Path(__file__).resolve().parent
if "--" in sys.argv:
    arguments = sys.argv[sys.argv.index("--") + 1:]
    if arguments:
        folder = Path(arguments[0]).resolve()

driver = folder.name
source = folder / f"{driver}-meshy-v1.glb"
destination = folder / f"{driver}-meshy-v1.blend"
report_path = folder / "blender-import-report.json"
if not source.is_file():
    raise FileNotFoundError(source)
if destination.exists():
    raise FileExistsError(f"Refusing to replace an existing Blender workspace: {destination}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=False, import_shading="NORMALS")

# Keep source transforms intact. Blender's importer handles glTF's Y-up basis.
model_objects = list(bpy.context.scene.objects)
model_collection = bpy.data.collections.new(f"{driver} — Meshy source (unmodified)")
bpy.context.scene.collection.children.link(model_collection)
for obj in model_objects:
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    model_collection.objects.link(obj)
for collection in list(bpy.data.collections):
    if collection != model_collection and not collection.objects and not collection.children:
        bpy.data.collections.remove(collection)

meshes = [obj for obj in model_objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("The imported source contains no meshes.")
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
center = (minimum + maximum) / 2
extent = max(maximum - minimum)
bpy.context.scene.cursor.location = center
for obj in model_objects:
    obj.select_set(False)
bpy.context.view_layer.objects.active = meshes[0]

# Save a usable overview in every 3D workspace without adding scene lights/cameras.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type != "VIEW_3D":
            continue
        space = area.spaces.active
        space.shading.type = "MATERIAL"
        space.shading.use_scene_world = False
        space.shading.use_scene_lights = False
        space.shading.studiolight_rotate_z = .35
        space.shading.studiolight_intensity = .8
        space.overlay.show_floor = False
        space.overlay.show_axis_x = False
        space.overlay.show_axis_y = False
        space.clip_start = max(extent / 1000, .0001)
        space.clip_end = max(extent * 100, 100)
        space.region_3d.view_location = center
        space.region_3d.view_distance = extent * 1.8
        space.region_3d.view_rotation = Vector((-4, -7, 1.5)).to_track_quat("Z", "Y")
        space.region_3d.view_perspective = "ORTHO"

bpy.ops.file.pack_all()


def inspect_scene():
    mesh_data = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        mesh_data.append({
            "object": obj.name,
            "vertices": len(mesh.vertices),
            "polygons": len(mesh.polygons),
            "triangles": len(mesh.loop_triangles),
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            "modifiers": [modifier.type for modifier in obj.modifiers],
        })
    textures = []
    for image in bpy.data.images:
        if image.type in {"RENDER_RESULT", "COMPOSITING"}:
            continue
        textures.append({
            "name": image.name,
            "size": list(image.size),
            "packed": bool(image.packed_file or image.packed_files),
            "color_space": image.colorspace_settings.name,
        })
    return {
        "meshes": mesh_data,
        "mesh_count": len(mesh_data),
        "vertices": sum(mesh["vertices"] for mesh in mesh_data),
        "triangles": sum(mesh["triangles"] for mesh in mesh_data),
        "material_count": len(bpy.data.materials),
        "textures": textures,
        "all_textures_packed": all(texture["packed"] for texture in textures),
        "collections": [collection.name for collection in bpy.data.collections],
        "cameras": sum(obj.type == "CAMERA" for obj in bpy.context.scene.objects),
        "lights": sum(obj.type == "LIGHT" for obj in bpy.context.scene.objects),
    }


before_save = inspect_scene()
if not before_save["all_textures_packed"]:
    raise RuntimeError("At least one imported texture was not packed.")
bpy.ops.wm.save_as_mainfile(filepath=str(destination), check_existing=False, compress=True)
bpy.ops.wm.open_mainfile(filepath=str(destination))
after_save = inspect_scene()
if before_save != after_save:
    raise RuntimeError("Scene verification changed after reopening the Blender file.")

report = {
    "source": source.name,
    "destination": destination.name,
    "blender_version": bpy.app.version_string,
    "geometry_modified": False,
    "materials_modified": False,
    "reopened_and_verified": True,
    "file_bytes": destination.stat().st_size,
    **after_save,
}
report_path.write_text(json.dumps(report, indent=2) + "\n")
print("CHARACTER_BLENDER_IMPORT " + json.dumps(report))
