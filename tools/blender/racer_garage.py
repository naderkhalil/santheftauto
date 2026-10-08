"""Close-view Victorian garage. Canonical Blender coordinates: X/Y/Z-up.

The street architecture comes from Cerebral Valley's kit. The fixtures, plants,
joinery and paving are built specifically for the much closer showroom camera.
"""
import bpy
import bmesh
import math
import random
from mathutils import Vector


def build_architecture(g):
    box = g['box']
    cream, accent, concrete = g['cream'], g['material']('garage deep olive', '#53665c'), g['concrete']
    wall = g['material']('garage eucalyptus weatherboard', '#929e91')
    g['texture_material'](wall)
    g['texture_material'](accent)
    # The map's grain is intentionally subtle at portrait distance.
    for material in g['M'].values():
        for node in material.node_tree.nodes:
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = .10
    g['placement']('Garage / Victorian', (0, 3.8, 0))
    # Real reveal and a recessed, five-metre-deep room behind the door.
    box(-3.05, 2.45, 1.65, 1.1, 5.1, 3.3, wall)
    box(3.05, 2.45, 1.65, 1.1, 5.1, 3.3, wall)
    box(0, 5.0, 1.65, 6.2, .22, 3.3, wall)
    box(0, 2.45, 3.30, 7.2, 5.1, .24, cream)
    # Continuous slab ends exactly where the apron begins, never coplanar.
    box(0, 2.43, -.07, 7.2, 5.06, .14, concrete)
    for x in [-2.52, 2.52]:
        box(x, -.115, 1.65, .20, .31, 3.3, cream)
        box(x, -.29, 1.65, .09, .045, 3.3, accent)
        box(x, -.13, .16, .29, .36, .32, cream)
        box(x, -.13, 3.08, .31, .39, .16, cream)
    box(0, -.12, 3.21, 5.40, .39, .20, cream)
    box(0, -.20, 3.37, 5.62, .46, .13, cream)
    # The bay, sash, dentils and gable are the very same city assemblies.
    g['sided_body'](7.2, 10, 6.6, wall, base=3.3)
    g['banded_facade'](7.2, 0, 3.3, 9.7, wall, [(-1.30, 6.4, 3.8, 6.1), (2.05, 4.95, 1.35, 2.15), (2.05, 8.15, 1.35, 2.15)])
    g['bay'](-1.25, -.8, 3.3, 3.8, 6.45, wall, cream, accent)
    for z in [4.95, 8.15]:
        g['window'](2.05, -.1, z, 1.35, 2.15, cream, accent, False, True)
    for z, depth, height in [(6.55, .38, .15), (9.65, .5, .19), (9.88, .78, .20)]:
        box(0, -.05, z, 7.45, depth, height, cream)
    g['dentils'](-.36, 9.68, 7.2, accent)
    g['gable'](7.35, -.18, 10, 2.8, wall, cream, accent, 2)
    for side in [-1, 1]:
        g['face']([(0, -.24, 12.85), (side * 3.8, -.24, 9.98), (side * 3.8, 10.3, 9.98), (0, 10.3, 12.85)], g['roof'])
    g['text']('738', 0, -.46, 3.32, .18, accent)
    for x, palette, address in [(-22.8, ('#c2b69f', '#756c59'), 732), (-15.2, ('#adada0', '#66736a'), 734), (-7.6, ('#b0bdc2', '#556b76'), 736), (7.6, ('#c7bba5', '#786951'), 740), (15.2, ('#b4bec0', '#65777e'), 742), (22.8, ('#b8c2ad', '#68765c'), 744)]:
        g['placement']('Garage / neighbor ' + str(address), (x, 4.1, 0))
        g['painted_lady'](address, palette, 1, 7.25, 12)
        # The street's distant grass sticks do not survive a close-up camera.
        for leaf in [g['leaf'], g['leaf2']]:
            g['BATCH'].pop(('Garage / neighbor ' + str(address), leaf), None)
    # Neighbor materials are created by the original facade builder above.
    for material in g['M'].values():
        for node in material.node_tree.nodes:
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = .10

    # One clean ground surface, with broad concrete flags and actual joints.
    # The old 1.2m grid overlapped both the garage slab and the road.
    g['placement']('Garage / paving', (0, 0, 0))
    paving = [g['material']('garage limestone ' + str(i), color, .83) for i, color in enumerate(['#b5b4a8', '#b9b8ad', '#b6b6ab'])]
    rng = random.Random(738)
    for col in range(-16, 17):
        for row in range(4):
            box(col * 1.6, -2.43 + row * 1.735, -.055, 1.594, 1.729, .11, paving[rng.randrange(3)])
    # A shallow, physically recessed channel marks the street boundary.
    box(0, -3.35, -.070, 54, .12, .045, g['iron'])
    for x in range(-24, 25):
        box(x * 1.1, -3.51, -.077, 1.094, .25, .16, g['granite'])
    # Road is shaded by the runtime's scanned asphalt; no competing top face.
    box(0, -10, -.25, 72, 13, .12, g['dark'])


def finish_architecture(obj):
    """Give the close-view facade edges real highlights, not razor edges."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    bevel = obj.modifiers.new('Fine painted arris', 'BEVEL')
    bevel.width = .006
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(35)
    bevel.use_clamp_overlap = True
    normal = obj.modifiers.new('Architectural corner normals', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    normal.weight = 30


def add_fixtures(garage, materials):
    """Objects are true geometry; no image planes or alpha foliage."""
    rng = random.Random(738)

    def material(name, color, rough=.55, metal=0, emission=0):
        m = bpy.data.materials.new('Garage / ' + name)
        m.use_nodes = True
        rgb = [int(color[i:i + 2], 16) / 255 for i in [1, 3, 5]]
        rgb = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in rgb]
        m.diffuse_color = (*rgb, 1)
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*rgb, 1)
        p.inputs['Roughness'].default_value = rough
        p.inputs['Metallic'].default_value = metal
        if emission:
            p.inputs['Emission Color'].default_value = (*rgb, 1)
            p.inputs['Emission Strength'].default_value = emission
        return m

    ivory = materials['ivory carved wood']
    oak = material('satin oiled oak', '#ac825c', .55)
    oak_end = material('oak end grain', '#8f6a49', .7)
    enamel = material('olive cabinetry', '#596453', .42)
    shadow = material('joinery recess', '#394239', .78)
    black = material('blackened steel', '#293530', .37, .65)
    brass = material('aged brass', '#aa9365', .33, .72)
    ceramic = material('warm ceramic', '#c4bda9', .34)
    soil = material('garden soil', '#4a4435', .98)
    leaves = [material('olive foliage ' + str(i), c, .71) for i, c in enumerate(['#4b6150', '#73816b', '#89937a'])]
    lamp = material('opal glass', '#ffebc5', .36, emission=.75)
    cloth = material('linen shop cloth', '#b9b2a0', .93)
    oil = material('muted red oil can', '#986653', .38, .35)
    tire = material('spare tire rubber', '#2b2f2d', .83)

    def finish(obj, name, mat, bevel=0, smooth=False):
        obj.name = 'Garage / ' + name
        obj.parent = garage
        obj.data.materials.append(mat)
        if smooth:
            for face in obj.data.polygons:
                face.use_smooth = True
        if bevel:
            mod = obj.modifiers.new('Machined edge', 'BEVEL')
            mod.width, mod.segments = bevel, 3
            mod = obj.modifiers.new('Corner normals', 'WEIGHTED_NORMAL')
            mod.keep_sharp = True
        return obj

    def box(name, p, size, mat, bevel=.008):
        bpy.ops.mesh.primitive_cube_add(size=1, location=p)
        obj = bpy.context.object
        obj.dimensions = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return finish(obj, name, mat, bevel)

    def tube(name, a, b, radius, mat, radius2=None):
        a, b = Vector(a), Vector(b)
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=radius, radius2=radius if radius2 is None else radius2, depth=(b - a).length, location=(a + b) / 2)
        obj = bpy.context.object
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
        return finish(obj, name, mat, min(radius / 5, .005), True)

    def lathe(name, center, profile, mat, n=48):
        vertices, faces = [], []
        for radius, height in profile:
            vertices.extend([(center[0] + radius * math.cos(i * math.tau / n), center[1] + radius * math.sin(i * math.tau / n), center[2] + height) for i in range(n)])
        for ring in range(len(profile) - 1):
            for i in range(n):
                a, b = ring * n + i, ring * n + (i + 1) % n
                faces.append((a, b, b + n, a + n))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        return finish(obj, name, mat, smooth=True)

    # Retracted panelled door, not floating plywood strips.
    for y in [4.05 + i * .42 for i in range(9)]:
        box('raised door section', (0, y, 3.02), (4.73, .408, .065), oak)
        for x in [-1.56, 0, 1.56]:
            box('recessed door panel', (x, y, 2.982), (1.36, .275, .018), oak_end, .006)
            box('door panel field', (x, y, 2.969), (1.27, .205, .019), oak, .006)
    for x in [-2.40, 2.40]:
        box('door track', (x, 6.02, 2.92), (.045, 4.28, .08), black)
        for y in [4.3, 6.0, 7.85]:
            tube('track hanger', (x, y, 2.93), (x, y, 3.16), .012, black)
    # Back wall joinery, generous quiet surfaces and believable construction.
    box('workshop wainscot', (0, 8.61, 1.3), (4.65, .075, 2.40), shadow)
    for x in [-2.28 + i * .16 for i in range(29)]:
        box('tongue and groove', (x, 8.557, 1.3), (.154, .030, 2.35), enamel, .004)
    box('cabinet plinth', (0, 8.13, .12), (4.32, .76, .18), shadow)
    box('cabinet carcass', (0, 8.17, .55), (4.48, .79, .79), enamel, .025)
    box('oak worktop edge', (0, 8.10, 1.005), (4.67, .98, .09), oak, .022)
    for x in [-1.68, -.56, .56, 1.68]:
        box('cabinet door reveal', (x, 7.761, .56), (1.068, .035, .72), shadow, .008)
        box('shaker cabinet door', (x, 7.724, .56), (1.035, .055, .688), enamel, .010)
        box('shaker door inset', (x, 7.689, .56), (.81, .017, .46), shadow, .005)
        box('shaker door field', (x, 7.677, .56), (.79, .012, .44), enamel, .005)
        tube('cabinet pull', (x + .34, 7.66, .69), (x + .34, 7.66, .83), .012, brass)
    # A smaller open shelf leaves negative space instead of rows of blank cubes.
    for z in [1.66, 2.28]:
        box('oak wall shelf', (.91, 8.30, z), (2.28, .56, .052), oak, .014)
        for x in [.05, 1.78]:
            tube('shelf bracket', (x, 8.51, z - .25), (x, 8.13, z - .025), .012, black)
    # A shaped oil can, tins, cloths, and a pair of storage cases.
    for x, y, z, mat in [(1.46, 8.22, 1.69, oil), (.55, 8.22, 1.69, ceramic), (1.18, 8.22, 2.31, ceramic)]:
        lathe('oil tin', (x, y, z), [(0, 0), (.115, 0), (.121, .018), (.12, .26), (.108, .28), (.055, .28), (.055, .304), (0, .304)], mat)
        tube('tin cap', (x, y, z + .305), (x, y, z + .322), .058, black)
    for i in range(3):
        box('folded cloth', (.3, 8.22, 2.34 + i * .035), (.42 - i * .018, .35, .033), cloth, .012)
    for x in [1.70, 2.03]:
        box('parts tin', (x, 8.23, 2.43), (.28, .29, .24), shadow, .018)
        box('tin lid', (x, 8.23, 2.56), (.291, .301, .026), black, .012)
    # Wall-mounted spanners have shaped heads, rather than blunt hammer bars.
    for i in range(4):
        x = -1.72 + i * .28
        z = 1.92 - i * .025
        tube('spanner shaft', (x, 8.46, z - .22), (x, 8.46, z + .05), .015, brass)
        tube('spanner head left', (x - .036, 8.46, z + .045), (x - .036, 8.46, z + .10), .016, brass)
        tube('spanner head right', (x + .036, 8.46, z + .045), (x + .036, 8.46, z + .10), .016, brass)
        tube('spanner head base', (x - .03, 8.46, z + .04), (x + .03, 8.46, z + .04), .018, brass)
    # A small machinist's vise on the worktop.
    box('vise base', (-1.60, 8.0, 1.09), (.40, .29, .06), black, .018)
    box('vise body', (-1.60, 8.0, 1.19), (.30, .22, .17), black, .018)
    for x in [-1.75, -1.44]:
        box('vise jaw', (x, 8, 1.29), (.05, .27, .08), brass, .006)
    tube('vise screw', (-1.42, 8, 1.17), (-1.30, 8, 1.17), .022, brass)
    tube('vise handle', (-1.30, 8, 1.07), (-1.30, 8, 1.30), .014, brass)
    def canopy(center, spread, count):
        verts = [[], [], []]
        faces = [[], [], []]
        for i in range(count):
            a = rng.random() * math.tau
            az = rng.uniform(-.95, .95)
            r = rng.uniform(.36, 1.0)
            p = Vector((center[0] + math.cos(a) * math.sqrt(1 - az * az) * r * spread[0], center[1] + math.sin(a) * math.sqrt(1 - az * az) * r * spread[1], center[2] + az * spread[2]))
            axis = Vector((math.cos(a + .45), math.sin(a + .45), rng.uniform(-.30, .65))).normalized()
            side = axis.cross(Vector((0, 0, 1))).normalized()
            normal = side.cross(axis).normalized()
            length, width = rng.uniform(.105, .19), rng.uniform(.028, .047)
            m = i % 3
            start = len(verts[m])
            for u, v, bulge in [(-.5, 0, 0), (-.2, -1, .07), (.25, -.72, .055), (.5, 0, 0), (.25, .72, .055), (-.2, 1, .07), (0, 0, .13)]:
                verts[m].append(tuple(p + axis * (u * length) + side * (v * width) + normal * (bulge * length)))
            for k in range(6):
                faces[m].append((start + k, start + (k + 1) % 6, start + 6))
        for i in range(3):
            mesh = bpy.data.meshes.new('Olive leaf canopy')
            mesh.from_pydata(verts[i], [], faces[i])
            mesh.update()
            obj = bpy.data.objects.new('Olive foliage', mesh)
            bpy.context.collection.objects.link(obj)
            finish(obj, 'olive leaves', leaves[i], smooth=True)
            # Subtle geometric thickness makes leaves solid from any orbit.
            mod = obj.modifiers.new('Leaf thickness', 'SOLIDIFY')
            mod.thickness = .0012

    # Soft-edged ceramic planters and broad, individually shaped leaves.
    for x, y, seed in [(-3.07, 2.78, 1), (3.07, 2.78, 2)]:
        lathe('ceramic planter', (x, y, .012), [(0, 0), (.255, 0), (.269, .022), (.286, .11), (.342, .53), (.348, .57), (.344, .604), (.318, .609), (.312, .574), (.307, .535)], ceramic)
        tube('potting soil', (x, y, .547), (x, y, .565), .307, soil)
        trunk_end = (x + .04, y + .012, 1.58)
        tube('olive trunk', (x, y, .56), trunk_end, .026, oak_end, .011)
        for branch in range(9):
            a = branch * 2.399 + seed
            end = Vector((x + math.cos(a) * .29, y + math.sin(a) * .29, 1.35 + (branch % 3) * .15))
            start = Vector((x + .02, y, .83 + branch * .047))
            tube('olive branch', start, end, .009, oak_end, .0035)
        canopy((x, y, 1.47), (.49, .49, .43), 290)
    # Fill the neighboring front gardens with lush low shrubs, not spiky fans.
    for facade_x in [-7.6, 7.6]:
        for dx, dy, height in [(-.66, -.55, .91), (.66, -.43, .87), (-.65, .64, 1.03), (.62, .65, .99)]:
            canopy((facade_x - 1.82 + dx, .9 + dy, height), (.69, .61, .47), 230)
    # Round opal wall lights: brass sockets, a clean shade and a cast backplate.
    for x in [-3.06, 3.06]:
        tube('sconce backplate', (x, 3.61, 2.28), (x, 3.65, 2.28), .117, black)
        tube('sconce arm', (x, 3.64, 2.28), (x, 3.34, 2.28), .022, black)
        lathe('sconce opal shade', (x, 3.33, 2.29), [(.04, 0), (.105, .04), (.118, .17), (.09, .28), (.042, .30)], lamp)
        lathe('sconce lower cap', (x, 3.33, 2.28), [(0, 0), (.095, 0), (.116, .02), (.105, .045), (0, .05)], brass)
        lathe('sconce crown', (x, 3.33, 2.575), [(0, 0), (.075, 0), (.066, .035), (0, .055)], brass)
    # Ceiling task luminaires retain a warm interior even under the daylight sky.
    for x in [-1.30, 1.30]:
        box('work light housing', (x, 7.22, 3.10), (.12, 1.25, .06), black, .018)
        box('work light diffuser', (x, 7.22, 3.064), (.086, 1.19, .018), lamp, .008)
