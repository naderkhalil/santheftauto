"""Review real racer sculptures without rebuilding or saving the artist source.

Example:
  Blender --background --python tools/blender/review_racer_characters.py -- \
    --input art/source/racers-and-garage.blend --output art/reviews/racers-before.png

The contact sheet has four columns, front above three-quarter. Matching neutral
studio light and camera scale expose geometry/material differences fairly.
Accepts the source .blend or exported .glb; neither input is modified.
"""
import argparse
from array import array
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
IDENTITIES = [('dario', 'DARIO AMODEI'), ('sam', 'SAM ALTMAN'),
              ('elon', 'ELON MUSK'), ('jensen', 'JENSEN HUANG')]


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'art/source/racers-and-garage.blend')
    parser.add_argument('--output', type=Path, default=ROOT / 'art/reviews/racers-portraits.png')
    parser.add_argument('--panel-width', type=int, default=512)
    parser.add_argument('--row-height', type=int, default=680)
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--lineup', action='store_true', help='Also render all four complete standing models.')
    parser.add_argument('--validate-only', action='store_true', help='Inspect source roots/bounds without rendering.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not 128 <= args.panel_width <= 2048 or not 256 <= args.row_height <= 2048:
        parser.error('Review dimensions must stay between 128/256 and 2048 pixels.')
    if not 1 <= args.samples <= 256:
        parser.error('Samples must be between 1 and 256.')
    return args


def descendants(root):
    return [root, *root.children_recursive]


def bounds(root):
    points = [obj.matrix_world @ Vector(corner) for obj in descendants(root)
              if obj.type == 'MESH' for corner in obj.bound_box]
    if not points:
        raise RuntimeError(f'{root.name} contains no mesh geometry.')
    lower = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    upper = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    if not all(math.isfinite(value) for value in (*lower, *upper)):
        raise RuntimeError(f'{root.name} has non-finite bounds.')
    return lower, upper


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, location, target, power, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    point_at(obj, target)


def label(body, x, z, material, size=.043):
    data = bpy.data.curves.new('Review label / ' + body, 'FONT')
    data.body = body
    data.align_x = 'CENTER'
    data.size = size
    data.space_character = 1.12
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.scene.collection.objects.link(obj)
    # Overlay sits just inside the camera, ahead of every studio light. The
    # light-to-actor paths never cross it, so Eevee cannot project text shadows
    # onto faces or garments (Cycles-only shadow flags are not enough here).
    obj.location = (x, -7, z)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    if hasattr(obj, 'visible_shadow'):
        obj.visible_shadow = False
    obj.data.materials.append(material)
    return obj


def main():
    args = arguments()
    source, output = args.input.resolve(), args.output.resolve()
    if source.suffix.lower() == '.blend':
        bpy.ops.wm.open_mainfile(filepath=str(source))
    elif source.suffix.lower() in ('.glb', '.gltf'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(source))
    else:
        raise RuntimeError('Input must be a .blend, .glb, or .gltf file.')
    scene = bpy.context.scene
    actors = []
    source_report = []
    for ident, display in IDENTITIES:
        name = 'Standing_' + ident
        actor = bpy.data.objects.get(name)
        if actor is None:
            raise RuntimeError(f'Missing required artist root: {name}')
        actors.append(actor)
        lower, upper = bounds(actor)
        source_report.append({'root': name, 'label': display,
                              'meshObjects': sum(obj.type == 'MESH' for obj in descendants(actor)),
                              'blenderBounds': [list(lower), list(upper)]})
    print(json.dumps({'source': str(source), 'actors': source_report}), flush=True)
    if args.validate_only:
        return
    # Hide the garage, vehicle, seated variants, and any original scene lighting.
    for obj in scene.objects:
        obj.hide_render = True
    for actor in actors:
        for obj in descendants(actor):
            obj.hide_render = False
    for actor, x in zip(actors, [-1.26, -.42, .42, 1.26]):
        actor.location.x = x
        actor.location.y = actor.location.z = 0
    bpy.context.view_layer.update()
    top = max(bounds(actor)[1].z for actor in actors)
    upper, lower = top + .10, top - 1.11
    center = (upper + lower) / 2
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = args.samples
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_samples'):
        scene.eevee.taa_samples = args.samples
    scene.render.resolution_x = args.panel_width * 4
    scene.render.resolution_y = args.row_height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    try:
        scene.view_settings.look = 'None'
    except TypeError:
        pass
    scene.world = bpy.data.worlds.new('Review / neutral warm gray')
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.72, .73, .71, 1)
    background.inputs['Strength'].default_value = .7
    area('Review / broad key', (-3, -4, 4.5), (0, 0, 1.5), 500, 4)
    area('Review / soft fill', (3, -2.5, 2.5), (0, 0, 1.5), 260, 3)
    area('Review / edge light', (1, 2.5, 3.8), (0, 0, 1.5), 350, 3)
    camera_data = bpy.data.cameras.new('Review / orthographic portrait camera')
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0, -8, center)
    point_at(camera, (0, 0, center))
    camera_data.type = 'ORTHO'
    # Blender's orthographic scale is horizontal for landscape images.
    camera_data.ortho_scale = (upper - lower) * scene.render.resolution_x / scene.render.resolution_y
    camera_data.clip_start, camera_data.clip_end = .1, 30
    scene.camera = camera
    ink = bpy.data.materials.new('Review / label ink')
    ink.use_nodes = True
    nodes = ink.node_tree.nodes
    nodes.clear()
    shader = nodes.new('ShaderNodeEmission')
    shader.inputs['Color'].default_value = (.035, .043, .044, 1)
    ink.node_tree.links.new(shader.outputs[0], nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    paper = bpy.data.materials.new('Review / label strip')
    paper.use_nodes = True
    nodes = paper.node_tree.nodes
    nodes.clear()
    shader = nodes.new('ShaderNodeEmission')
    shader.inputs['Color'].default_value = (.63, .64, .61, 1)
    paper.node_tree.links.new(shader.outputs[0], nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    strip_mesh = bpy.data.meshes.new('Review / label strip')
    half_width = camera_data.ortho_scale / 2
    strip_mesh.from_pydata([(-half_width, -6.95, lower), (half_width, -6.95, lower),
                          (half_width, -6.95, lower + .106), (-half_width, -6.95, lower + .106)], [], [(0, 1, 2, 3)])
    strip = bpy.data.objects.new('Review / label strip', strip_mesh)
    scene.collection.objects.link(strip)
    strip.data.materials.append(paper)
    if hasattr(strip, 'visible_shadow'):
        strip.visible_shadow = False
    labels = [label(display, actor.location.x, lower + .038, ink)
              for actor, (_, display) in zip(actors, IDENTITIES)]
    headings = [label('', actor.location.x, upper - .046, ink, .027) for actor in actors]
    output.parent.mkdir(parents=True, exist_ok=True)
    row_paths = []
    rows = []
    for name, angle in [('front', 0), ('three-quarter', 32)]:
        for actor in actors:
            actor.rotation_euler.z = math.radians(angle)
        for heading in headings:
            heading.data.body = 'FRONT' if angle == 0 else 'THREE-QUARTER / 32 DEGREES'
        scene.render.filepath = str(output.with_name(output.stem + '-' + name + '.png'))
        bpy.ops.render.render(write_still=True)
        row_paths.append(scene.render.filepath)
        # Read the rendered PNG so the composite uses exactly those displayed pixels.
        image = bpy.data.images.load(scene.render.filepath, check_existing=False)
        pixels = array('f', [0]) * (len(image.pixels))
        image.pixels.foreach_get(pixels)
        rows.append(pixels)
        bpy.data.images.remove(image)
    width, height = scene.render.resolution_x, scene.render.resolution_y
    sheet = bpy.data.images.new('Review / front and three-quarter contact sheet', width=width, height=height * 2, alpha=False)
    # Blender pixel arrays start at the bottom: quarter below, front above.
    sheet.pixels.foreach_set(rows[1] + rows[0])
    sheet.filepath_raw = str(output)
    sheet.file_format = 'PNG'
    sheet.save()
    if args.lineup:
        for actor in actors:
            actor.rotation_euler.z = 0
        for heading in headings:
            heading.hide_render = True
        for text in labels:
            text.location.z = -.13
        strip.hide_render = True
        camera.location.z = (top - .2) / 2
        point_at(camera, (0, 0, camera.location.z))
        camera_data.ortho_scale = 4.1
        scene.render.resolution_y = round(scene.render.resolution_x * (top + .36) / 4.1)
        scene.render.filepath = str(output.with_name(output.stem + '-lineup.png'))
        bpy.ops.render.render(write_still=True)
        row_paths.append(scene.render.filepath)
    report = {'source': str(source), 'sourceUnmodified': True,
              'coordinateConvention': 'Game Y-up/+Z-front becomes Blender Z-up/-Y-front.',
              'lighting': 'Identical neutral area lights; orthographic front and 32-degree views; AgX no exposure adjustment.',
              'actors': source_report, 'contactSheet': str(output), 'renders': row_paths,
              'pixels': [width, height * 2], 'engine': scene.render.engine}
    output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print('RACER_REVIEW_READY ' + str(output), flush=True)


if __name__ == '__main__':
    main()
