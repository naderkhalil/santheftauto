"""Original Union Square street details, in canonical right-handed coordinates.

Authoring functions take (east, height, north). Blender is (east, north, up),
so a normal Y-up glTF export becomes (east, up, SOUTH). Do not reflect this GLB.
All heights are relative to the 22 m road datum. Text nodes remain independent.
"""
from pathlib import Path
import bpy
import math
import json
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/square-street-details'
SOURCE = ROOT / 'art/source'
REVIEW = ROOT / 'art/reviews'
for path in (OUT, SOURCE, REVIEW):
    path.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
BODY, LETTERS, GROUPS = [], [], []
PARENT = None


def linear(hex_color):
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
                 for v in [int(hex_color[i:i+2], 16) / 255 for i in (1, 3, 5)])


def material(name, color, roughness=.65, metal=0, alpha=1, emission=0):
    mat = bpy.data.materials.new('SF street details / ' + name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*linear(color), 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        mat.surface_render_method = 'DITHERED'
    if emission:
        shader.inputs['Emission Color'].default_value = (*linear(color), 1)
        shader.inputs['Emission Strength'].default_value = emission
    mat.diffuse_color = (*linear(color), alpha)
    return mat


IRON = material('painted forest green iron', '#304d42', .57, .48)
GREEN = material('reflective street sign enamel', '#225a43', .41, .16)
SILVER = material('galvanized steel and brackets', '#a7b4ad', .38, .72)
WHITE = material('reflective lettering and edge lines', '#eeeeda', .46, .13, emission=.05)
BLUE = material('blue enamel newspaper box', '#367994', .48, .4)
RED = material('red enamel newspaper box', '#ab4f42', .51, .4)
DARK = material('hinges and recessed openings', '#263633', .68, .15)
PAPER = material('warm newspaper stock', '#e2d6b7', .96)
INK = material('printed navy ink', '#27454c', .94)
GLASS = material('newsbox glass', '#cee2d9', .15, .06, .19)

FONT = None
font_path = Path('/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf')
if font_path.exists():
    FONT = bpy.data.fonts.load(str(font_path))
SERIF = None
serif_path = Path('/System/Library/Fonts/Supplemental/Georgia Bold.ttf')
if serif_path.exists():
    SERIF = bpy.data.fonts.load(str(serif_path))


def point(x, y, north):
    return Vector((x, north, y))


def group(name, x, north, height=.05):
    global PARENT
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = point(x, height, north)
    root['semantic_east'] = x
    root['semantic_north'] = north
    root['canonical_z'] = -north
    root['sfCoordinateSystem'] = 'X east, Y up, Z south'
    GROUPS.append(root)
    PARENT = root
    return root


def own(obj, name, mat, is_letter=False):
    obj.name = name
    obj.parent = PARENT
    obj.data.materials.append(mat)
    (LETTERS if is_letter else BODY).append(obj)
    return obj


def box(name, x, y, z, w, h, d, mat, bevel=.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(x, y, z))
    obj = bpy.context.object
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Small rolled edge', 'BEVEL')
        mod.width = min(bevel, w * .2, d * .2, h * .2)
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Weighted manufacturing normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return own(obj, name, mat)


def cylinder(name, x, y, z, radius, height, mat, vertices=16, direction=(0, 1, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height, location=point(x, y, z))
    obj = bpy.context.object
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(point(*direction).normalized()).to_euler()
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return own(obj, name, mat)


def tube(name, points, radius, mat, resolution=8):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, xyz in zip(spline.points, points):
        p.co = (*point(*xyz), 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.select_set(False)
    return own(obj, name, mat)


def lettering(body, x, y, z, size, mat, facing=(0, 1), max_width=None, serif=False):
    """Front-facing glyphs with a proper rotation basis, never a reflection."""
    curve = bpy.data.curves.new('Lettering / ' + body, 'FONT')
    curve.body = body
    curve.size = size
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.extrude = .00065
    curve.resolution_u = 3
    font = SERIF if serif else FONT
    if font:
        curve.font = font
    obj = bpy.data.objects.new('Lettering / ' + body, curve)
    bpy.context.collection.objects.link(obj)
    up = Vector((0, 0, 1))
    front = Vector((facing[0], facing[1], 0)).normalized()
    right = up.cross(front)
    obj.rotation_euler = Matrix((right, up, front)).transposed().to_euler()
    obj.location = point(x, y, z)
    bpy.context.view_layer.update()
    if max_width and obj.dimensions.length:
        # Font width is measured in its local frame, before orientation.
        width = max(v[0] for v in obj.bound_box) - min(v[0] for v in obj.bound_box)
        if width > max_width:
            obj.scale.x = max_width / width
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj['sfLettering'] = True
    obj['sfLabelText'] = body
    obj['semanticFacingEast'] = facing[0]
    obj['semanticFacingNorth'] = facing[1]
    obj['canonicalOrientation'] = True
    obj.select_set(False)
    return own(obj, 'Lettering / ' + body, mat, True)


def bracket(height, along_x):
    # Steel bands close around the pole and terminate at the sign bracket.
    for dy in [-.105, .105]:
        coords = [(.070 * math.cos(i * math.tau / 24), height + dy, .070 * math.sin(i * math.tau / 24)) for i in range(25)]
        tube('Sign-post stainless band', coords, .012, SILVER)
    box('Clamped street-sign bracket', 0, height, 0, .21 if along_x else .08, .28, .08 if along_x else .21, SILVER, .008)


def blade(street, height, length, along_x):
    cx, cz = ((length/2+.075, 0) if along_x else (0, length/2+.075))
    box(street + ' aluminum substrate', cx, height, cz, length if along_x else .035, .39, .035 if along_x else length, SILVER, .025)
    for side in [-1, 1]:
        dx, dz = (0, side * .021) if along_x else (side * .021, 0)
        box(street + ' reflective border', cx+dx, height, cz+dz, length-.025 if along_x else .003, .365, .003 if along_x else length-.025, WHITE, .010)
        dx2, dz2 = (0, side * .024) if along_x else (side * .024, 0)
        box(street + ' green inset', cx+dx2, height, cz+dz2, length-.058 if along_x else .003, .329, .003 if along_x else length-.058, GREEN, .010)
        for end in [-1, 1]:
            xx = cx + end * (length/2-.074) if along_x else cx + side * .029
            zz = cz + side * .029 if along_x else cz + end * (length/2-.074)
            cylinder('Sign-face mounting rivet', xx, height, zz, .014, .009, SILVER, 10, (0,0,side) if along_x else (side,0,0))
        lettering(street, cx + (0 if along_x else side*.029), height, cz + (side*.029 if along_x else 0), .276, WHITE, (0,side) if along_x else (side,0), length-.21)
    bracket(height, along_x)


def signpost(east_west, north_south):
    box('Cast pole base plate', 0, .037, 0, .34, .075, .34, IRON, .022)
    cylinder('Tapered cast base collar', 0, .24, 0, .125, .40, IRON, 20)
    cylinder('Upper base ring', 0, .47, 0, .085, .065, SILVER, 20)
    cylinder('Forest green round street-sign pole', 0, 1.98, 0, .061, 3.42, IRON, 20)
    cylinder('Pole cap', 0, 3.725, 0, .074, .072, IRON, 20)
    for dx in [-.115, .115]:
        for dz in [-.115, .115]:
            cylinder('Anchor bolt washer', dx, .078, dz, .025, .014, SILVER, 12)
            cylinder('Anchor bolt hex head', dx, .093, dz, .020, .021, SILVER, 6)
    blade(east_west, 3.47, 1.42 if east_west == 'Post St' else 1.55, True)
    blade(north_south, 3.04, 1.65 if north_south == 'Powell St' else 1.86, False)


def paper_cover(x, z, issue):
    box('Original newspaper cover', x, .895, z, .396, .51, .012, PAPER, .003)
    lettering('THE CITY', x, 1.073, z+.008, .060, INK, (0,1), .353, True)
    lettering('SAN FRANCISCO', x, 1.130, z+.008, .021, INK, (0,1), .343)
    lettering('WATERFRONT' if issue else 'HILLS & THRILLS', x, .965, z+.008, .025, INK, (0,1), .343)
    for dy in [.021, -.012]:
        box('Newspaper column rule', x, .922+dy, z+.007, .351, .003, .002, INK)
    # Original miniature skyline illustration, with a familiar pointy tower.
    for i, h in enumerate([.048, .073, .055, .115, .036, .085, .049, .066]):
        box('Printed city silhouette', x-.158+i*.043, .815+h/2, z+.008, .028, h, .002, INK)
    for column in [-1, 1]:
        for line in range(7):
            box('Newspaper type lines', x+column*.090, .767-line*.012, z+.008, .154-(line%3)*.011, .003, .002, INK)


def newsbox(x, issue):
    paint = RED if issue else BLUE
    box('Newsbox cast foot', x, .034, 0, .43, .068, .40, DARK, .014)
    box('Newspaper pedestal', x, .24, -.012, .13, .38, .12, paint, .015)
    box('Folded steel newsbox rear', x, .84, -.16, .48, .88, .075, paint, .020)
    for side in [-1, 1]:
        box('Folded steel side wall', x+side*.227, .85, .002, .045, .91, .365, paint, .014)
    box('Lower newspaper tray', x, .422, .011, .48, .07, .39, paint, .016)
    box('Sloped weather lip', x, 1.322, .01, .532, .090, .428, paint, .027)
    box('Dark door gasket', x, .838, .200, .438, .808, .025, DARK, .012)
    # Window and dispenser door remain a cavity with a modeled paper behind it.
    box('Inset door panel', x, .515, .220, .43, .164, .035, paint, .012)
    for side in [-1, 1]:
        box('Glazing door stile', x+side*.213, .927, .220, .035, .66, .035, paint, .008)
    box('Upper window rail', x, 1.25, .22, .44, .047, .040, paint, .007)
    paper_cover(x, .211, issue)
    box('Newsbox clear glass', x, .925, .238, .385, .587, .004, GLASS)
    for zz in [.13, .32]:
        cylinder('Door hinge barrel', x-.254, .74, zz-.10, .021, .17, SILVER, 12)
    for xx in [x-.13, x+.13]:
        cylinder('Handle mounting screw', xx, .558, .250, .020, .022, SILVER, 12, (0,0,1))
    tube('Curved newspaper door handle', [(x-.13,.56,.26),(x-.13,.56,.31),(x+.13,.56,.31),(x+.13,.56,.26)], .022, SILVER)
    box('Coin-return inset', x+.147, 1.278, .243, .072, .029, .008, DARK, .004)
    for xx in [x-.205, x+.205]:
        for yy in [.46, 1.27]:
            cylinder('Newsbox corner rivet', xx, yy, .245, .008, .007, SILVER, 10, (0,0,1))


def rack():
    # Galvanized inverted-U staple with two radiused bends, anchored separately.
    coords = [(-.40,.06,0)]
    for i in range(10):
        angle=math.pi-i*(math.pi/2)/9
        coords.append((-.19+.21*math.cos(angle),.69+.21*math.sin(angle),0))
    for i in range(10):
        angle=math.pi/2-i*(math.pi/2)/9
        coords.append((.19+.21*math.cos(angle),.69+.21*math.sin(angle),0))
    coords.append((.40,.06,0))
    tube('Galvanized inverted-U bike rack', coords, .0315, SILVER)
    for xx in [-.40,.40]:
        cylinder('Rack welded base flange', xx, .038, 0, .09, .027, SILVER, 20)
        for angle in [math.pi/4+i*math.pi/2 for i in range(4)]:
            cylinder('Rack anchor hex bolt', xx+math.cos(angle)*.064, .061, math.sin(angle)*.064, .012, .018, DARK, 6)


PLACEMENTS = []
for name, x, z, ew, ns in [
    ('Post / Powell', -63.3, 53.3, 'Post St', 'Powell St'),
    ('Post / Stockton', 63.3, 53.3, 'Post St', 'Stockton St'),
    ('Geary / Powell', -63.3, -53.3, 'Geary St', 'Powell St'),
    ('Geary / Stockton', 63.3, -53.3, 'Geary St', 'Stockton St'),
]:
    group('Wayfinding / '+name, x, z)
    signpost(ew, ns)
    PLACEMENTS.append({'kind':'corner sign','name':name,'semantic':[x,.05,z],'canonical':[x,.05,-z]})
news_group=group('Post Street / original newspaper racks', -54.5, 75.3)
# The north-side newsracks face south toward Post's sidewalk and driving lane.
news_group.rotation_euler.z=math.pi
newsbox(-.30, 0)
newsbox(.30, 1)
PLACEMENTS.append({'kind':'newsracks','semantic':[-54.5,.05,75.3],'canonical':[-54.5,.05,-75.3]})
for z in [26, 29, 32]:
    group('Stockton / galvanized bicycle rack '+str(z), 85.0, z)
    rack()
    PLACEMENTS.append({'kind':'bike rack','semantic':[85,.05,z],'canonical':[85,.05,-z]})

# A clear workshop presentation for the editable source; none of this stage exports.
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.device='CPU'
scene.world.color=(.30,.36,.40)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.57,.67,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.mesh.primitive_plane_add(size=220)
workshop=bpy.context.object
workshop.name='Workshop ground / excluded from export'
workshop.data.materials.append(material('workshop concrete','#c3c0b6',.91))
bpy.ops.object.light_add(type='SUN',location=(0,0,30))
sun=bpy.context.object
sun.name='Workshop sun / excluded from export'
sun.data.energy=2.8
sun.rotation_euler=(.45,-.42,-.60)
sun.data.angle=.16
bpy.ops.object.camera_add(location=point(-57.7,5.0,60.5))
camera=bpy.context.object
camera.name='Corner street-name study'
camera.rotation_euler=(point(-63.0,2.2,53.5)-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=49
scene.camera=camera
scene.render.resolution_x=1200
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'square-street-details.blend'),compress=True)
scene.render.filepath=str(REVIEW/'square-street-signs.png')
bpy.ops.render.render(write_still=True)
camera.location=point(-56.1,1.6,72.2)
camera.rotation_euler=(point(-54.5,.78,75.3)-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=64
scene.render.filepath=str(REVIEW/'square-newsracks.png')
bpy.ops.render.render(write_still=True)

# Merge only non-lettering geometry by material. Text retains explicit readable
# orientations and identifying extras so later world transforms cannot silently
# mirror it. The source above retains the individual editable components.
bpy.context.view_layer.update()
by_material={}
for original in BODY:
    copy=original.copy()
    copy.data=original.data.copy()
    matrix=original.matrix_world.copy()
    copy.parent=None
    copy.matrix_world=matrix
    bpy.context.collection.objects.link(copy)
    by_material.setdefault(original.data.materials[0].name,[]).append(copy)
EXPORT=[]
for name, objects in by_material.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.name=name
    EXPORT.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in EXPORT+LETTERS:obj.select_set(True)
bpy.context.view_layer.objects.active=EXPORT[0]
bpy.ops.export_scene.gltf(
    filepath=str(OUT/'square-street-details.glb'), export_format='GLB',
    use_selection=True, export_yup=True, export_apply=True, export_extras=True,
    export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=18,
)
report={
    'coordinateSystem':'canonical right handed: X east, Y up, Z south',
    'runtimeTranslation':[0,22,0], 'runtimeRotation':[0,0,0], 'runtimeScale':[1,1,1],
    'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in EXPORT+LETTERS),
    'draws':len(EXPORT)+len(LETTERS), 'independentLabelNodes':len(LETTERS),
    'placements':PLACEMENTS,
    'sources':'Original geometry and fictional newspaper cover artwork; street names and placement follow the Union Square map audit. Fonts converted to geometry; no font files or third-party photographs exported.',
}
(OUT/'square-street-details.meta.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
