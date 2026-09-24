"""Original Blender model of the western San Francisco–Oakland Bay Bridge.

The crossing has four open lattice towers, two suspension bridges and their
central concrete anchorage. Distances are condensed for the racing world.
Authoring axes: X east, Y north, Z up. The GLB loads at identity OUTSIDE cityRoot.
No photographs, external meshes or textures are used.
"""
from pathlib import Path
from collections import defaultdict
import bpy
import json
import math
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/waterfront'
SOURCE = ROOT / 'art/source'
REVIEW = ROOT / 'art/reviews'
for folder in (OUT, SOURCE, REVIEW):
    folder.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0


def linear(color):
    values = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in values)


def material(name, color, roughness=.6, metal=.0):
    mat = bpy.data.materials.new('Western Bay Bridge / ' + name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (*linear(color), 1)
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Metallic'].default_value = metal
    mat.diffuse_color = (*linear(color), 1)
    return mat


STEEL = material('silver painted steel', '#c1cbd0', .48, .34)
SHADE = material('steel joints and shadowed webs', '#73919e', .61, .25)
CABLE = material('sunlit galvanized cables', '#e1e3d7', .4, .40)
ROAD = material('asphalt and dark deck recesses', '#4b585e', .96)
CONCRETE = material('weathered concrete piers', '#b1b4ac', .91)
EDGE = material('concrete ledges and lane paint', '#d8d6c8', .81)
GREEN = material('Yerba Buena wooded slopes', '#416f59', .96)
ROCK = material('island shoreline', '#a4a890', .97)

# Spatially separate the eight structural materials so runtime frustum culling
# does not submit the entire 1.9 km model when only one span is in view.
GEOMETRY = defaultdict(lambda: [[], []])
WEST = Vector((710, -680, 0))
EAST = Vector((2570, -252, 0))
DIRECTION = (EAST - WEST).normalized()
ACROSS = Vector((-DIRECTION.y, DIRECTION.x, 0))
LENGTH = (EAST - WEST).length
DECK = 55
TOP = 151
TOWERS = [280, 710, 1200, 1630]
CENTER = 955


def point(along, cross=0, up=0):
    return WEST + DIRECTION * along + ACROSS * cross + Vector((0, 0, up))


def geometry(name, mat, vertices, faces):
    vs, fs = GEOMETRY[(name, mat)]
    start = len(vs)
    vs.extend(tuple(v) for v in vertices)
    fs.extend(tuple(start + i for i in face) for face in faces)


def prism(name, mat, a, b, cross_section):
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    guide = Vector((0, 0, 1)) if abs(axis.z) < .94 else DIRECTION
    u = axis.cross(guide).normalized()
    v = axis.cross(u).normalized()
    ring = len(cross_section)
    vertices = [p + u * x + v * y for p in (a, b) for x, y in cross_section]
    faces = [tuple(range(ring - 1, -1, -1)), tuple(range(ring, ring * 2))]
    faces += [(i, (i + 1) % ring, (i + 1) % ring + ring, i + ring) for i in range(ring)]
    geometry(name, mat, vertices, faces)


def beam(name, mat, a, b, width, depth=None, bevel=.12):
    depth = width if depth is None else depth
    x, y = width / 2, depth / 2
    r = min(bevel, x * .28, y * .28)
    polygon = [(-x + r, -y), (x - r, -y), (x, -y + r), (x, y - r),
               (x - r, y), (-x + r, y), (-x, y - r), (-x, -y + r)]
    prism(name, mat, a, b, polygon)


def box(name, mat, along, cross, up, length, width, height, bevel=.12):
    beam(name, mat, point(along - length / 2, cross, up),
         point(along + length / 2, cross, up), width, height, bevel)


def rod(name, mat, a, b, radius, sides=8):
    section = [(math.cos(i * math.tau / sides) * radius,
                math.sin(i * math.tau / sides) * radius) for i in range(sides)]
    prism(name, mat, a, b, section)


def cable(name, mat, points, radius=1.05, sides=8):
    # Continuous rings prevent the joints that result from overlapping cylinders.
    vertices = []
    for i, center in enumerate(points):
        tangent = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        tangent.normalize()
        u = tangent.cross(ACROSS).normalized()
        v = tangent.cross(u).normalized()
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(center + radius * (u * math.cos(angle) + v * math.sin(angle)))
    faces = []
    for i in range(len(points) - 1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces += [tuple(range(sides - 1, -1, -1)), tuple(range(len(vertices) - sides, len(vertices)))]
    geometry(name, mat, vertices, faces)


# Twin highway decks, trussed edge girders and a visible dark storey between.
for section in range(4):
    start, end = section * LENGTH / 4, (section + 1) * LENGTH / 4
    name = 'Span %d / double-deck structure' % (section + 1)
    middle = (start + end) / 2
    box(name, ROAD, middle, 0, DECK, end - start, 28, 1.7)
    box(name, ROAD, middle, 0, DECK - 8.8, end - start, 27.5, 1.4)
    for cross in (-14.5, 14.5):
        for height, depth in [(DECK + 1.8, .8), (DECK - 1.35, 1), (DECK - 9.8, 1.1)]:
            box(name, STEEL, middle, cross, height, end - start, .8, depth)
        for s in range(math.ceil(start / 17) * 17, math.floor(end / 17) * 17, 17):
            beam(name, SHADE, point(s, cross, DECK - 8.8), point(s + 17, cross, DECK - 1.8), .57, .70)
            beam(name, STEEL, point(s, cross, DECK - 1.8), point(s + 17, cross, DECK - 8.8), .57, .70)
            beam(name, STEEL, point(s, cross, DECK - 9.7), point(s, cross, DECK + 2.1), .62, .62)
            box(name, SHADE, s, cross, DECK - 1.3, 1.6, .94, 1.6)
    # The repeating transverse floor beams remain visible from the waterfront.
    for s in range(math.ceil(start / 34) * 34, math.floor(end / 34) * 34, 34):
        box(name, SHADE, s, 0, DECK - 10.1, 1.2, 28.8, 1.2)
    for cross in (-8, -2.65, 2.65, 8):
        for s in range(math.ceil(start / 21) * 21, math.floor(end / 21) * 21, 21):
            box(name, EDGE, s, cross, DECK + .87, 7.5, .14, .018, 0)


for index, s in enumerate(TOWERS):
    name = 'Tower %d / open riveted steel frame' % (index + 1)
    # Broad cutwater footing with a smaller pedestal and a clean tide line.
    box(name, CONCRETE, s, 0, -.2, 31, 60, 9.6, .55)
    box(name, EDGE, s, 0, 5.2, 32.2, 61.2, 1.3, .3)
    box(name, CONCRETE, s, 0, 8.5, 25, 52, 5.3, .4)
    box(name, EDGE, s, 0, 11.5, 26, 53, 1.0, .2)

    def width_at(up):
        return 22 - 5.3 * ((up - 11.5) / (TOP - 11.5))

    def along_at(up):
        return 6.8 - 1.25 * ((up - 11.5) / (TOP - 11.5))

    for along_sign in (-1, 1):
        for across_sign in (-1, 1):
            bottom = point(s + along_sign * 6.8, across_sign * 22, 12)
            top = point(s + along_sign * 5.55, across_sign * 16.7, TOP)
            beam(name, STEEL, bottom, top, 3.65, 3.65, .21)
            # A shadowed centre web bounded by pale rolled flanges reads as steel.
            beam(name, SHADE, bottom + ACROSS * across_sign * 1.88,
                 top + ACROSS * across_sign * 1.88, .94, .19, .04)
    levels = [13, 41.5, 69, 105, 142]
    for k, h in enumerate(levels):
        across = width_at(h)
        along = along_at(h)
        box(name, STEEL, s, 0, h, along * 2 + 4.4, across * 2 + 3.8, 2.8)
        box(name, CABLE, s, 0, h + 1.5, along * 2 + 4.8, across * 2 + 4.2, .4, .05)
        # Steel gusset plates at the load-bearing joints.
        for a in (-1, 1):
            for c in (-1, 1):
                box(name, SHADE, s + a * along, c * (across + 1.96), h, 4.3, .22, 4.4, .04)
        if k == len(levels) - 1:
            continue
        nxt = levels[k + 1]
        a2, c2 = along_at(nxt), width_at(nxt)
        for c in (-1, 1):
            # Narrow front/back faces always have X bracing.
            beam(name, SHADE, point(s - along, c * across, h + 2), point(s + a2, c * c2, nxt - 2), 1.04)
            beam(name, STEEL, point(s + along, c * across, h + 2), point(s - a2, c * c2, nxt - 2), 1.04)
        if k != 1:
            # Leave the highway portal clear through both decks.
            for a in (-1, 1):
                beam(name, STEEL, point(s + a * along, -across, h + 2), point(s + a * a2, c2, nxt - 2), 1.35)
                beam(name, SHADE, point(s + a * along, across, h + 2), point(s + a * a2, -c2, nxt - 2), 1.35)
    box(name, STEEL, s, 0, TOP - 1, 18, 38, 4.2, .24)
    box(name, CABLE, s, 0, TOP + 1.3, 18.8, 38.5, .7, .08)
    for c in (-1, 1):
        box(name, STEEL, s, c * 16.7, TOP + 3, 8, 7, 3.2, .45)
        box(name, CABLE, s, c * 16.7, TOP + 5, 8.5, 7.5, .6, .15)
        rod(name, STEEL, point(s, c * 16.7, TOP + 5.3), point(s, c * 16.7, TOP + 8), .15)


# Center anchorage separates two complete suspension bridges. It is deliberately
# concrete and massive, with stepped top chambers and subtle vertical buttresses.
name = 'Central anchorage / concrete gravity pier'
box(name, CONCRETE, CENTER, 0, .2, 57, 72, 12, .55)
box(name, EDGE, CENTER, 0, 6.8, 58.5, 74, 1.2, .3)
box(name, CONCRETE, CENTER, 0, 33.5, 42, 54, 53, .6)
box(name, EDGE, CENTER, 0, 60.8, 47, 60, 2.4, .25)
box(name, CONCRETE, CENTER, 0, 67, 31, 45, 10, .45)
box(name, EDGE, CENTER, 0, 72.9, 36, 50, 1.8, .2)
for cross in (-27.5, 27.5):
    for offset in (-14, 0, 14):
        box(name, EDGE, CENTER + offset, cross, 32, 2.5, 1.4, 49, .18)
for along in (-21.5, 21.5):
    for cross in (-16, 0, 16):
        box(name, EDGE, CENTER + along, cross, 32, 1.3, 2.6, 49, .18)

for s, direction in [(0, 1), (LENGTH, -1)]:
    name = ('West' if s == 0 else 'East') + ' anchorage / deck approach'
    box(name, CONCRETE, s + direction * 13, 0, 22, 52, 50, 48, .4)
    box(name, EDGE, s + direction * 13, 0, 47, 54, 53, 2, .25)
    for cross in (-20, 20):
        box(name, CONCRETE, s + direction * 9, cross, 58, 35, 10, 22, .3)
        box(name, EDGE, s + direction * 9, cross, 69.4, 37, 12, 1.5, .2)

spans = [
    (0, 280, 64, TOP + 2.5, 17),
    (280, 710, TOP + 2.5, TOP + 2.5, 73),
    (710, CENTER, TOP + 2.5, 71, 16),
    (CENTER, 1200, 71, TOP + 2.5, 16),
    (1200, 1630, TOP + 2.5, TOP + 2.5, 73),
    (1630, LENGTH, TOP + 2.5, 64, 17),
]
for i, (start, end, h0, h1, sag) in enumerate(spans):
    name = 'Suspension segment %d / paired cables and hangers' % (i + 1)

    def cable_height(t):
        return h0 * (1 - t) + h1 * t - 4 * t * (1 - t) * sag

    for side in (-1, 1):
        pts = [point(start + (end - start) * j / 64, side * 17.0, cable_height(j / 64)) for j in range(65)]
        cable(name, CABLE, pts, 1.0)
        for s in range(math.ceil((start + 7) / 13) * 13, math.floor((end - 7) / 13) * 13, 13):
            h = cable_height((s - start) / (end - start))
            rod(name, STEEL, point(s, side * 14.8, DECK + 2), point(s, side * 17, h), .29, 6)
            box(name, SHADE, s, side * 17, h, .8, 2.3, 2.0, .1)


# Tiny static vehicles establish scale on the high roadway without extra draws.
for i in range(37):
    s = 45 + i * (LENGTH - 90) / 36
    name = 'Span %d / double-deck structure' % min(4, int(s / (LENGTH / 4)) + 1)
    cross = (-9, -3, 3, 9)[i % 4]
    box(name, EDGE if i % 4 else STEEL, s, cross, DECK + 1.75, 4.8, 2.0, 1.7, .16)
    box(name, SHADE, s + .3, cross, DECK + 2.6, 2.4, 1.8, .6, .1)


def island(name, center, rx, ry, height, mat, phase=0):
    # An irregular closed radial terrain cap, never a giant submerged sphere.
    rings, segments = 7, 40
    verts = [Vector((center[0], center[1], height))]
    for ring in range(1, rings + 1):
        t = ring / rings
        for i in range(segments):
            a = i * math.tau / segments
            irregular = 1 + .09 * math.sin(a * 3 + phase) + .05 * math.cos(a * 7 - phase)
            elevation = -2 + (height + 2) * (1 - t ** 1.32) ** 1.5
            elevation += math.sin(a * 5 + t * 3) * min(3.4, height * .05) * math.sin(t * math.pi)
            verts.append(Vector((center[0] + math.cos(a) * rx * t * irregular,
                                 center[1] + math.sin(a) * ry * t * irregular, elevation)))
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    for r in range(rings - 1):
        for i in range(segments):
            a = 1 + r * segments + i
            b = 1 + r * segments + (i + 1) % segments
            faces.append((a, a + segments, b + segments, b))
    geometry(name, mat, verts, faces)


island('Yerba Buena / low wooded eastern shore', (2740, -220), 260, 225, 82, GREEN, .8)
island('Yerba Buena / tide line and rocky apron', (2750, -220), 282, 248, 14, ROCK, .8)
# Low Treasure Island land is behind the wooded crown, not another hill.
island('Treasure Island / low distant reclaimed shore', (2540, 180), 330, 195, 3.5, ROCK, 1.6)
island('Treasure Island / flat green reclaimed land', (2540, 180), 310, 180, 6.5, GREEN, 1.6)


ASSETS = []
for (name, mat), (verts, faces) in GEOMETRY.items():
    mesh = bpy.data.meshes.new(name + ' / mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name + ' / ' + mat.name.split(' / ')[-1], mesh)
    bpy.context.collection.objects.link(obj)
    obj['sfAsset'] = 'bay-bridge'
    obj['asset_section'] = name
    obj['asset_role'] = 'landmark_geometry'
    obj['sfCoordinateSystem'] = 'Blender X east, Y north, Z up; glTF X east, Y up, Z south'
    ASSETS.append(obj)

bpy.ops.object.select_all(action='DESELECT')
for obj in ASSETS:
    obj.select_set(True)
bpy.context.view_layer.objects.active = ASSETS[0]
bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'bay-bridge.glb'), export_format='GLB', use_selection=True,
    export_yup=True, export_apply=True, export_extras=True,
    export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=18,
)
triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in ASSETS)
all_vertices = [v.co for obj in ASSETS for v in obj.data.vertices]
mins = [min(v[a] for v in all_vertices) for a in range(3)]
maxs = [max(v[a] for v in all_vertices) for a in range(3)]
report = {
    'asset': 'Western San Francisco–Oakland Bay Bridge',
    'coordinateSystem': 'canonical right handed: X east, Y up, Z south',
    'runtimeTranslation': [0, 0, 0], 'runtimeRotation': [0, 0, 0], 'runtimeScale': [1, 1, 1],
    'loadOutsideCityRoot': True,
    'westAnchorageSemantic': [710, -680], 'eastEndSemantic': [2570, -252],
    'towerCount': 4, 'towerTopElevation': TOP + 8, 'upperRoadElevation': DECK,
    'lowerRoadElevation': DECK - 8.8, 'centralAnchorageAlong': CENTER,
    'triangles': triangles, 'meshes': len(ASSETS), 'materials': 8,
    'boundsBlender': {'min': mins, 'max': maxs},
    'boundsGLTF': {'min': [mins[0], mins[2], -maxs[1]], 'max': [maxs[0], maxs[2], -mins[1]]},
    'sources': 'Original Blender geometry. Double-deck and four-tower western crossing observed in waterfront reference photographs; compressed dimensions and geography documented in art/references/waterfront.md. No third-party textures or meshes.',
}
(OUT / 'bay-bridge.meta.json').write_text(json.dumps(report, indent=2))
print('BAY_BRIDGE_REPORT ' + json.dumps(report))

# The editable .blend includes a separate presentation stage; exported GLB above
# includes only named bridge and island meshes, never this water/camera/light.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.44, .62, .78, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
bpy.ops.mesh.primitive_plane_add(size=16000, location=(1650, -200, -2.06))
water = bpy.context.object
water.name = 'Review water / excluded from game export'
water['asset_role'] = 'review_stage'
water.data.materials.append(material('review water only', '#187f9b', .23, .12))
bpy.ops.object.light_add(type='SUN', location=(0, 0, 800))
sun = bpy.context.object
sun.name = 'Review sun / excluded from game export'
sun.data.energy = 3.0
sun.data.angle = .055
sun.rotation_euler = (.38, -.62, -.55)
bpy.ops.object.camera_add(location=(1300, 2650, 630))
camera = bpy.context.object
camera.name = 'Waterfront view / bridge architectural study'
target = Vector((1950, -230, 65))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 36
camera.data.clip_end = 22000
scene.camera = camera
scene.render.resolution_x = 1400
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.render.filepath = str(REVIEW / 'bay-bridge.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.clip_end = 22000
bpy.ops.object.select_all(action='DESELECT')
ASSETS[0].select_set(True)
bpy.context.view_layer.objects.active = ASSETS[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'bay-bridge.blend'), compress=True)
bpy.ops.render.render(write_still=True)
# A second close view makes the open highway portal and fine steel members
# reviewable without zooming into the kilometer-wide presentation.
camera.location = (1220, -160, 117)
target = point(TOWERS[1], 0, 81)
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 45
scene.render.filepath = str(REVIEW / 'bay-bridge-tower.png')
bpy.ops.render.render(write_still=True)
