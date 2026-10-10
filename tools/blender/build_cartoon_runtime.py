"""Optimize approved Meshy busts without touching their source sculpts.

Blender --background --python tools/blender/build_cartoon_runtime.py -- --driver mark
Blender --background --python tools/blender/build_cartoon_runtime.py -- --all

The runtime Vehicle is copied from an archived GLB, byte-for-byte per resource.
Only staged art/runtime-cartoon output is written; publication is a separate step.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/runtime-cartoon'
IDS = ['dario', 'sam', 'elon', 'jensen', 'mira', 'feifei', 'mark']
BASELINE = OUT / 'baseline-racer-kit.glb'


def read_glb(path):
    data = path.read_bytes()
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + length])
    binary_length, kind = struct.unpack_from('<II', data, 20 + length)
    assert kind == 0x004E4942
    return doc, data[28 + length:28 + length + binary_length]


class Assembly:
    """Copy reachable glTF resources and their exact encoded buffer payloads."""
    def __init__(self):
        self.doc = {'asset': {'version': '2.0', 'generator': 'San Theft Auto approved cartoon runtime'},
                    'scene': 0, 'scenes': [{'nodes': []}]}
        self.binary = bytearray()
        self.used, self.required = set(), set()

    def add(self, path, root_names):
        source, binary = read_glb(path)
        cache = {}

        def clone(kind, index):
            key = (kind, index)
            if key in cache:
                return cache[key]
            target = self.doc.setdefault(kind, [])
            result_index = len(target)
            cache[key] = result_index
            value = copy.deepcopy(source[kind][index])
            target.append(value)
            if kind == 'nodes':
                if 'mesh' in value:
                    value['mesh'] = clone('meshes', value['mesh'])
                if 'children' in value:
                    value['children'] = [clone('nodes', child) for child in value['children']]
                assert 'skin' not in value and 'camera' not in value
            elif kind == 'meshes':
                for primitive in value['primitives']:
                    primitive['attributes'] = {name: clone('accessors', item) for name, item in primitive['attributes'].items()}
                    for field, table in [('indices', 'accessors'), ('material', 'materials')]:
                        if field in primitive:
                            primitive[field] = clone(table, primitive[field])
                    for name, extension in primitive.get('extensions', {}).items():
                        self.used.add(name)
                        if name == 'KHR_draco_mesh_compression':
                            extension['bufferView'] = clone('bufferViews', extension['bufferView'])
                            self.required.add(name)
                        else:
                            raise ValueError('Unsupported mesh extension: ' + name)
            elif kind == 'accessors':
                if 'bufferView' in value:
                    value['bufferView'] = clone('bufferViews', value['bufferView'])
                assert 'sparse' not in value
            elif kind == 'bufferViews':
                assert value.get('buffer', 0) == 0
                offset, length = value.get('byteOffset', 0), value['byteLength']
                self.binary.extend(b'\0' * (-len(self.binary) % 4))
                value['buffer'], value['byteOffset'] = 0, len(self.binary)
                self.binary.extend(binary[offset:offset + length])
            elif kind == 'materials':
                def textures(obj):
                    if not isinstance(obj, dict):
                        return
                    for field, child in obj.items():
                        if field.endswith('Texture') and isinstance(child, dict) and 'index' in child:
                            child['index'] = clone('textures', child['index'])
                        elif field == 'extensions':
                            self.used.update(child)
                        textures(child)
                textures(value)
            elif kind == 'textures':
                if 'source' in value:
                    value['source'] = clone('images', value['source'])
                if 'sampler' in value:
                    value['sampler'] = clone('samplers', value['sampler'])
                assert not value.get('extensions'), 'Encoded source textures must be standard PNG/JPEG'
            elif kind == 'images':
                value['bufferView'] = clone('bufferViews', value['bufferView'])
            return result_index

        for name in root_names:
            indices = [i for i, node in enumerate(source['nodes']) if node.get('name') == name]
            assert len(indices) == 1, (path, name, indices)
            self.doc['scenes'][0]['nodes'].append(clone('nodes', indices[0]))

    def save(self, path):
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        self.doc['extensionsUsed'] = sorted(self.used)
        self.doc['extensionsRequired'] = sorted(self.required)
        encoded = json.dumps(self.doc, separators=(',', ':')).encode()
        encoded += b' ' * (-len(encoded) % 4)
        length = 12 + 8 + len(encoded) + 8 + len(self.binary)
        path.write_bytes(struct.pack('<III', 0x46546C67, 2, length) +
                         struct.pack('<II', len(encoded), 0x4E4F534A) + encoded +
                         struct.pack('<II', len(self.binary), 0x004E4942) + self.binary)


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def source_path(driver):
    return (ROOT / 'art/characters/meshy-mark/mark-meshy-v1.glb' if driver == 'mark'
            else ROOT / f'art/characters/roster/{driver}/{driver}-meshy-v1.glb')


def simple_material(name, rgb, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    material.diffuse_color = (*rgb, 1)
    return material


def garment_color(portrait):
    # Sample an authored shirt patch rather than guessing a different sleeve
    # hue. bpy byte-image pixels are display encoded; shader values are linear.
    target = xyz((.30, 1.18, .18))
    vertex = min(portrait.data.vertices, key=lambda item: (item.co - target).length_squared)
    loop = next(loop for loop in portrait.data.loops if loop.vertex_index == vertex.index)
    uv = portrait.data.uv_layers.active.data[loop.index].uv
    image = next(node.image for node in portrait.data.materials[0].node_tree.nodes
                 if node.type == 'TEX_IMAGE' and node.label == 'BASE COLOR')
    x, y = int(uv.x * image.size[0]) % image.size[0], int(uv.y * image.size[1]) % image.size[1]
    offset = (y * image.size[0] + x) * image.channels
    rgb = tuple(image.pixels[offset + channel] for channel in range(3))
    linear = tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in rgb)
    print('GARMENT_SAMPLE ' + repr((portrait.name, list(uv), rgb, linear)), flush=True)
    return linear


def driving_arms(driver, parent, garment):
    # These restrained, low-poly sleeves sit below the authored shoulders and
    # mostly inside the cockpit. Faces, hair, necks and clothing stay Meshy art.
    skin_colors = {'mark': (.72, .44, .29), 'dario': (.64, .39, .24), 'sam': (.72, .48, .33),
                   'elon': (.76, .52, .36), 'jensen': (.58, .34, .19),
                   'mira': (.63, .36, .23), 'feifei': (.66, .40, .25)}
    sleeve = simple_material(driver + ' / driving sleeves', garment, .42 if driver == 'jensen' else .8)
    skin = simple_material(driver + ' / driving hands', skin_colors[driver], .65)
    groups = []
    for side in [-1, 1]:
        shoulder = xyz((side * .24, .795, -.055))
        elbow = xyz((side * .29, .64, .19))
        wrist = xyz((side * .16, .775, .44))
        for start, end, radius in [(shoulder, elbow, .075), (elbow, wrist, .066)]:
            direction = end - start
            bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=radius, radius2=radius * .85,
                                           depth=direction.length, location=(start + end) / 2)
            obj = bpy.context.object
            obj.rotation_mode = 'QUATERNION'
            obj.rotation_quaternion = direction.to_track_quat('Z', 'Y')
            obj.data.materials.append(sleeve)
            obj.parent = parent
            groups.append(obj)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=elbow)
        obj = bpy.context.object
        obj.scale = (.075, .075, .075)
        obj.data.materials.append(sleeve)
        obj.parent = parent
        groups.append(obj)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=xyz((side * .16, .78, .47)))
        obj = bpy.context.object
        obj.scale = (.036, .055, .048)
        obj.data.materials.append(skin)
        obj.parent = parent
        groups.append(obj)
    material_groups = [(material, [obj for obj in groups if obj.data.materials[0] == material]) for material in [sleeve, skin]]
    for material, selected in material_groups:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = selected[0]
        bpy.ops.object.join()
        selected[0].name = material.name
        for face in selected[0].data.polygons:
            face.use_smooth = True


def decimate(obj, triangles):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # glTF's importer welds XYZ+normal, leaving coincident vertices at normal
    # splits. Connect the low copy by position BEFORE collapse, so independent
    # seams cannot drift into little UV/geometry fragments. Geometry Nodes
    # avoids allocating a multi-million-face editable BMesh for this step.
    group = bpy.data.node_groups.new('Runtime position weld', 'GeometryNodeTree')
    group.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    entry = group.nodes.new('NodeGroupInput')
    weld = group.nodes.new('GeometryNodeMergeByDistance')
    weld.inputs['Distance'].default_value = .00001
    exit_node = group.nodes.new('NodeGroupOutput')
    group.links.new(entry.outputs['Geometry'], weld.inputs['Geometry'])
    group.links.new(weld.outputs['Geometry'], exit_node.inputs['Geometry'])
    modifier = obj.modifiers.new('Connect geometric seams before simplification', 'NODES')
    modifier.node_group = group
    before = len(obj.data.vertices)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.node_groups.remove(group)
    print(f'POSITION_WELD {obj.name}: {before} -> {len(obj.data.vertices)}', flush=True)
    if obj.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.calc_loop_triangles()
    modifier = obj.modifiers.new('Runtime silhouette reduction', 'DECIMATE')
    modifier.ratio = min(1, triangles / len(obj.data.loop_triangles))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    # Dense source normals do not describe the collapsed triangles. Keeping
    # them produces broad triangular shading patches on faces and shirts.
    if obj.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    # Source texture/normal seams can leave coincident geometric vertices.
    # Fresh baking no longer needs those splits; weld them before UV packing.
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=.00001)
    bmesh.ops.dissolve_degenerate(mesh, edges=list(mesh.edges), dist=.000001)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()
    for edge in obj.data.edges:
        edge.use_seam = False
        edge.use_edge_sharp = False


def bake_atlas(driver, source, portrait, driving):
    """Reproject source art onto fresh UVs instead of interpolating its seams."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = .006
    scene.render.bake.max_ray_distance = .025
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = False
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    material = bpy.data.materials.new(driver + ' / approved cartoon')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    nodes = material.node_tree.nodes
    images = {}
    for label, size, color_space in [('BASE COLOR', 2048, 'sRGB'), ('NORMAL MAP', 1024, 'Non-Color'), ('METALLIC ROUGHNESS', 512, 'Non-Color')]:
        image = bpy.data.images.new(driver + ' / ' + label, width=size, height=size, alpha=False)
        image.colorspace_settings.name = color_space
        image.generated_color = (.5, .5, 1, 1) if label == 'NORMAL MAP' else (0, 0, 0, 1)
        image.file_format = 'JPEG'
        image_node = nodes.new('ShaderNodeTexImage')
        image_node.label = label
        image_node.image = image
        images[label] = image_node
    for obj, left, width in [(portrait, 0, .75), (driving, .75, .25)]:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for gutter in [.001, .0005, .0002, .00005]:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(75), island_margin=gutter,
                                    margin_method='FRACTION', area_weight=.25)
            bpy.ops.object.mode_set(mode='OBJECT')
            for loop in obj.data.uv_layers.active.data:
                loop.uv.x = left + .008 + loop.uv.x * (width - .016)
                loop.uv.y = .008 + loop.uv.y * .984
            obj.data.calc_loop_triangles()
            uv_area = 0
            for triangle in obj.data.loop_triangles:
                a, b, c = [obj.data.uv_layers.active.data[index].uv for index in triangle.loops]
                uv_area += abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)) / 2
            print(f'ATLAS_COVERAGE {driver} {obj.name}: {uv_area:.4f}, gutter {gutter}', flush=True)
            if uv_area >= width * .35:
                break
        if uv_area < width * .12:
            raise RuntimeError('UV packing lost too much atlas density; do not publish this bake')
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for face in obj.data.polygons:
            face.use_smooth = True
    source_material = source.data.materials[0]
    source_nodes = source_material.node_tree.nodes
    source_links = source_material.node_tree.links
    source_shader = next(node for node in source_nodes if node.type == 'BSDF_PRINCIPLED')
    source_output = next(node for node in source_nodes if node.type == 'OUTPUT_MATERIAL')
    combine = source_nodes.new('ShaderNodeCombineColor')
    combine.mode = 'RGB'
    combine.inputs['Red'].default_value = 1
    for channel, socket_name in [('Green', 'Roughness'), ('Blue', 'Metallic')]:
        socket = source_shader.inputs[socket_name]
        if socket.is_linked:
            source_links.new(socket.links[0].from_socket, combine.inputs[channel])
        else:
            combine.inputs[channel].default_value = socket.default_value
    emission = source_nodes.new('ShaderNodeEmission')
    source_links.new(combine.outputs['Color'], emission.inputs['Color'])
    for label, bake_type in [('BASE COLOR', 'DIFFUSE'), ('NORMAL MAP', 'NORMAL'), ('METALLIC ROUGHNESS', 'EMIT')]:
        source_links.new(emission.outputs[0] if bake_type == 'EMIT' else source_shader.outputs[0], source_output.inputs['Surface'])
        for node in nodes:
            node.select = False
        nodes.active = images[label]
        images[label].select = True
        for target in [portrait, driving]:
            for obj in [source, portrait, driving]:
                obj.hide_render = obj not in [source, target]
            bpy.ops.object.select_all(action='DESELECT')
            source.select_set(True)
            target.select_set(True)
            bpy.context.view_layer.objects.active = target
            print(f'BAKE {driver} {target.name} {label}', flush=True)
            cage, distance = (.0015, .012) if driver == 'dario' and target == portrait else (.006, .025)
            bpy.ops.object.bake(type=bake_type, use_selected_to_active=True,
                cage_extrusion=cage, max_ray_distance=distance, use_clear=False,
                margin=8, normal_space='TANGENT', pass_filter={'COLOR'})
    for target in [portrait, driving]:
        target.hide_render = False
    links = material.node_tree.links
    links.new(images['BASE COLOR'].outputs['Color'], shader.inputs['Base Color'])
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(images['NORMAL MAP'].outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(images['METALLIC ROUGHNESS'].outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], shader.inputs['Roughness'])
    links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
    return material


def build_actor(driver):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    source = source_path(driver)
    print(f'IMPORT {driver}: {source}', flush=True)
    bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True, import_shading='NORMALS')
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert len(meshes) == 1, 'Source study is expected to use one authored surface'
    source_sculpt = meshes[0]
    source_sculpt.name = driver + ' / dense projection source'
    portrait = source_sculpt
    bpy.context.view_layer.objects.active = portrait
    portrait.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    points = [portrait.matrix_world @ Vector(corner) for corner in portrait.bound_box]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    scale = 1 / (high.z - low.z)
    center = (low + high) / 2
    for vertex in portrait.data.vertices:
        vertex.co.x = (vertex.co.x - center.x) * scale
        vertex.co.y = (vertex.co.y - center.y) * scale
        vertex.co.z = (vertex.co.z - low.z) * scale + 1
    portrait.data.update()
    garment = garment_color(source_sculpt)
    portrait = source_sculpt.copy()
    portrait.data = source_sculpt.data.copy()
    bpy.context.collection.objects.link(portrait)
    decimate(portrait, 90000 if driver == 'dario' else 60000)
    portrait.name = driver + ' / portrait sculpture'
    standing = bpy.data.objects.new('Standing_' + driver, None)
    bpy.context.collection.objects.link(standing)
    portrait.parent = standing
    seated = bpy.data.objects.new('Seated_' + driver, None)
    bpy.context.collection.objects.link(seated)
    # Dario's extremely dense, disconnected curls hit a collapse lower bound
    # when reducing the portrait a second time, deleting the torso instead.
    # Derive this driving mesh independently from the untouched dense source.
    driving_source = source_sculpt if driver == 'dario' else portrait
    driving = driving_source.copy()
    driving.data = driving_source.data.copy()
    bpy.context.collection.objects.link(driving)
    driving.parent = seated
    driving.name = driver + ' / driving sculpture'
    decimate(driving, 36000 if driver == 'dario' else 12000)
    lower = min(vertex.co.z for vertex in driving.data.vertices)
    upper = max(vertex.co.z for vertex in driving.data.vertices)
    if abs(lower - 1) > .03 or abs(upper - 2) > .03:
        raise RuntimeError(f'Driving silhouette lost its torso/crown: {lower}, {upper}')
    bake_atlas(driver, source_sculpt, portrait, driving)
    bpy.data.objects.remove(source_sculpt, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    for vertex in driving.data.vertices:
        vertex.co.z -= .5
    driving_arms(driver, seated, garment)
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for face in obj.data.polygons:
                face.use_smooth = True
    path = OUT / f'{driver}-runtime.glb'
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_cameras=False, export_lights=False,
        export_image_format='JPEG', export_jpeg_quality=88,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=12,
        export_draco_texcoord_quantization=14)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{driver}-runtime.blend'), compress=True)
    report = {'driver': driver, 'source': str(source.relative_to(ROOT)),
              'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'file_bytes': path.stat().st_size, 'meshes': [], 'textures': []}
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        obj.data.calc_loop_triangles()
        report['meshes'].append({'name': obj.name, 'vertices': len(obj.data.vertices),
            'triangles': len(obj.data.loop_triangles), 'materials': len(obj.data.materials),
            'bounds_blender': [list(point) for point in obj.bound_box]})
    for img in bpy.data.images:
        if img.type not in ['RENDER_RESULT', 'COMPOSITING']:
            report['textures'].append({'name': img.name, 'size': list(img.size)})
    (OUT / f'{driver}-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('CARTOON_ACTOR_READY ' + json.dumps(report), flush=True)


def assemble(drivers):
    result = Assembly()
    result.add(BASELINE, ['Vehicle'])
    for driver in drivers:
        result.add(OUT / f'{driver}-runtime.glb', ['Standing_' + driver, 'Seated_' + driver])
    path = OUT / ('racer-kit.glb' if drivers == IDS else f'{drivers[0]}-trial-kit.glb')
    result.save(path)
    report = {'file': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
              'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'drivers': drivers,
              'vehicle_preservation': 'Exact source node transforms/materials and encoded geometry copied; only resource indices change.',
              'source_vehicle_sha256': hashlib.sha256(BASELINE.read_bytes()).hexdigest()}
    (OUT / 'assembly-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('CARTOON_KIT_READY ' + json.dumps(report), flush=True)
    return path


def render_review(driver='mark', kit=None):
    """Render actual optimized exports, including the unchanged cockpit fit."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = kit or OUT / ('racer-kit.glb' if (OUT / 'racer-kit.glb').exists() else f'{driver}-trial-kit.glb')
    bpy.ops.import_scene.gltf(filepath=str(kit))
    imported = list(bpy.context.scene.objects)
    vehicle = bpy.data.objects['Vehicle']
    seated = bpy.data.objects['Seated_' + driver]
    standing = bpy.data.objects['Standing_' + driver]
    seated.scale = (.88, .88, .88)
    seated.location = xyz((-.35, .30, -.37))
    world = bpy.context.scene.world = bpy.data.worlds.new('Soft studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.75, .76, .71, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .45
    for name, location, power, size in [('Key', (-3, -4, 5), 450, 4),
            ('Fill', (3, -2, 3), 220, 4), ('Rim', (2, 2, 4), 350, 3)]:
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.shape, light.size = power, 'DISK', size
        obj = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (xyz((0, 1.2, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('Review camera', bpy.data.cameras.new('Review camera'))
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera.data.type = 'ORTHO'
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    for view in ['portrait', 'cockpit', 'cockpit-side']:
        visible = {standing, *standing.children_recursive} if view == 'portrait' else {vehicle, seated, *vehicle.children_recursive, *seated.children_recursive}
        for obj in imported:
            obj.hide_render = obj not in visible
        if view == 'portrait':
            camera.location = xyz((1.1, 1.85, 3.5))
            target = xyz((0, 1.52, 0))
            camera.data.ortho_scale = 1.32
        else:
            camera.location = xyz((2.7, 2.4, 4.5) if view == 'cockpit' else (4.5, 2.4, .2))
            target = xyz((-.12, 1, -.1))
            camera.data.ortho_scale = 3.6
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(OUT / f'{driver}-review-{view}.png')
        bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--driver', choices=IDS)
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--assemble-only', action='store_true')
    parser.add_argument('--build-only', action='store_true')
    parser.add_argument('--render-review', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    if not BASELINE.exists():
        shutil.copy2(ROOT / 'public/assets/models/racer-kit.glb', BASELINE)
    drivers = IDS if args.all else [args.driver or 'mark']
    if not args.assemble_only:
        for driver in drivers:
            build_actor(driver)
    kit = None
    if not args.build_only:
        kit = assemble(drivers)
    if args.render_review:
        render_review(args.driver or 'mark', kit)


if __name__ == '__main__':
    main()
