"""Small-scale cloth construction and UVs for the actual exported driver meshes."""
import math
import bpy
import bmesh
from mathutils import Vector


def _bell(value, center, width):
    return math.exp(-((value - center) / width) ** 2)


def sewn_collar(actor, leather=False):
    """A turned fabric band, seated into the shoulder and snug to the neck."""
    # Profile travels up the outside, across the turned edge, then down inside.
    # A broad buried foot avoids the old detached tube around the neck.
    sections = [(1.495, .141, .099), (1.511, .123, .091),
                (1.529, .095, .079), (1.552 if leather else 1.544, .082, .077),
                (1.554 if leather else 1.547, .078, .074),
                (1.548 if leather else 1.542, .075, .069), (1.497, .124, .080)]
    verts, faces = [], []
    n = 64
    for y, width, depth in sections:
        for i in range(n):
            angle = math.tau * i / n
            forward = math.sin(angle)
            # Crewneck dips at the throat; leather stands slightly taller at back.
            height = y - max(0, forward) * (.012 if leather else .010)
            verts.append((width * math.cos(angle), -depth * forward, height + actor.offset))
    for k in range(len(sections)):
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n
            c, d = ((k + 1) % len(sections)) * n + (i + 1) % n, ((k + 1) % len(sections)) * n + i
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(actor.prefix + ' / sewn collar')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = actor.root
    mesh.materials.append(actor.cloth if leather else actor.trim)
    for face in mesh.polygons:
        face.use_smooth = True
    mod = obj.modifiers.new('Turned collar edge', 'SUBSURF')
    mod.levels = 1


def sculpt_garment(actor, garment, kind='jacket'):
    """Shallow sewn tension folds, sculpted into the garment rather than dark tubes.

    Input is the relaxed remeshed surface, in Blender coordinates. Keep the
    center front quiet so the existing zipper and placket remain on the fabric.
    """
    leather = actor.id == 'jensen'
    for vertex in garment.data.vertices:
        x, z, y = vertex.co.x, -vertex.co.y, vertex.co.z - actor.offset
        ax = abs(x)
        front = max(0, min(1, (z + .015) / .12))
        back = max(0, min(1, (-z - .015) / .10))
        if kind == 'trousers':
            # A pressed vertical break and soft stacking at the standing ankle.
            if actor.seated:
                amount = .0016 * math.sin(y * 71 + ax * 19) * _bell(y, .84, .10)
            else:
                amount = .0022 * front * _bell(ax, .15, .03) * _bell(y, .43, .25)
                amount += .0024 * math.sin(y * 109 + x * 7) * _bell(y, .19, .053)
        else:
            # Waist folds emerge from the side seam and taper before the zipper.
            panel = (1 - _bell(x, 0, .035)) * _bell(ax, .115, .11)
            waist = (_bell(y, 1.072 + .19 * ax, .012)
                     - .6 * _bell(y, 1.085 + .19 * ax, .010)
                     + .63 * _bell(y, 1.175 - .22 * ax, .016))
            shoulder = _bell(y, 1.34 + .23 * ax, .025) * _bell(ax, .17, .07)
            amount = front * ((.0055 if leather else .0034) * panel * waist
                              + (.0025 if leather else .0016) * shoulder)
            amount += back * .0028 * math.sin(y * 41 + ax * 10) * _bell(y, 1.17, .12)
            # The outside sleeve breaks around the bent elbow, then gathers
            # against its cuff. Nonperiodic offsets avoid a corrugated sleeve.
            sleeve = max(0, min(1, (ax - actor.s['shoulders'] * .83) / .065))
            if actor.seated:
                elbow = _bell(y, 1.242, .017) - .55 * _bell(y, 1.261, .015)
                amount += sleeve * (.0048 if leather else .003) * elbow
            else:
                diagonal = .18 * z + .09 * (ax - actor.s['shoulders'])
                elbow = (_bell(y, 1.212 + diagonal, .019)
                         - .55 * _bell(y, 1.237 + diagonal, .017)
                         + .32 * _bell(y, 1.17 - diagonal, .026))
                cuff = _bell(y, 1.051 + .16 * z, .012)
                amount += sleeve * ((.0045 if leather else .0032) * elbow + .003 * cuff)
        vertex.co += vertex.normal * amount
    garment.data.update()
    # Voxel density is useful while shaping folds but wasteful on the final
    # broad fabric panels. Collapse after sculpting so curvature and creases
    # guide the reduction; keep small sewn details as separate geometry.
    bpy.ops.object.select_all(action='DESELECT')
    garment.select_set(True)
    bpy.context.view_layer.objects.active = garment
    reduction = garment.modifiers.new('Final garment surface budget', 'DECIMATE')
    reduction.ratio = .42
    bpy.ops.object.modifier_apply(modifier=reduction.name)


def jacket_construction(actor, wrists):
    """Leather pocket welts, zipper tape/teeth, and fine double stitching."""
    if actor.id != 'jensen':
        return
    # A fabric zipper tape beneath small individual metal teeth reads as a
    # real closure at portrait distance, rather than a single silver stripe.
    zip_path = [(0, 1.006, .145), (0, 1.18, .147), (0, 1.34, .144),
                (0, 1.45, .123), (0, 1.50, .092)]
    actor.tube('zipper woven tape', [(x, y, z - .001) for x, y, z in zip_path], .0045, actor.trim, 8, 5)
    for index in range(43):
        y = 1.015 + index * .0102
        for start, end in zip(zip_path, zip_path[1:]):
            if start[1] <= y <= end[1]:
                t = (y - start[1]) / (end[1] - start[1])
                z = start[2] + (end[2] - start[2]) * t
                actor.tube('zipper tooth', [(-.003, y, z + .003), (.003, y, z + .003)],
                           .001, actor.metal, 6, 1)
                break
    for side in [-1, 1]:
        # Low-contrast seam thread catches the light in two stitched rows.
        for row in [0, .0045]:
            path = [(side * (.086 + row), 1.493, .085),
                    (side * (.145 + row), 1.448, .100),
                    (side * (.195 + row), 1.388, .077)]
            for start, end in zip(path, path[1:]):
                a, b = Vector(start), Vector(end)
                count = max(2, int((b - a).length / .007))
                for i in range(count):
                    actor.tube('shoulder topstitch', [a.lerp(b, i / count), a.lerp(b, (i + .55) / count)],
                               .00065, actor.seam, 5, 1)
        # Pocket edges are soft raised leather welts, not a drawn-on line.
        for offset in [-.005, .005]:
            actor.tube('leather pocket welt', [(side * (.094 + offset), 1.118, .134),
                       (side * (.134 + offset), 1.17, .118),
                       (side * (.16 + offset), 1.215, .102)], .0030, actor.cloth, 8, 5)
    if actor.seated:
        for side, wrist in zip([-1, 1], wrists):
            x, y, z = wrist
            actor.tube('ribbed driving cuff', [(x + side * .004, y - .006, z - .027), (x, y, z)],
                       [.059, .059], actor.trim, 28, 3)


def apply_character_uvs(actors):
    """Give packed PBR maps metric UVs after remeshing and before batching.

    A principal-axis projection per polygon preserves a uniform grain density
    on sculpted bodies and curved sleeves. No unwrap is expected from glTF.
    """
    for actor in actors:
        for obj in actor.children_recursive:
            if obj.type != 'MESH' or not obj.data.materials:
                continue
            textured = any(m and m.get('racer_tile_metres') for m in obj.data.materials)
            if not textured:
                continue
            layer = obj.data.uv_layers.get('Garment grain') or obj.data.uv_layers.new(name='Garment grain')
            obj.data.uv_layers.active = layer
            for polygon in obj.data.polygons:
                material = obj.data.materials[polygon.material_index]
                tile = material.get('racer_tile_metres', .064)
                n = polygon.normal
                axis = max(range(3), key=lambda k: abs(n[k]))
                # Blender Z is the garment's vertical grain direction.
                axes = (0, 2) if axis == 1 else (1, 2) if axis == 0 else (0, 1)
                sign = 1 if n[axis] >= 0 else -1
                for loop in polygon.loop_indices:
                    v = obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    layer.data[loop].uv = (v[axes[0]] * sign / tile, v[axes[1]] / tile)


def finalize_actors(actors):
    """Apply authored modifiers, UV the final surface, batch by material."""
    for actor in actors:
        for obj in list(actor.children_recursive):
            if obj.type not in ['MESH', 'CURVE']:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            if obj.type == 'CURVE':
                bpy.ops.object.convert(target='MESH')
            for modifier in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
    apply_character_uvs(actors)
    for actor in actors:
        batches = {}
        for obj in list(actor.children):
            if obj.type == 'MESH' and len(obj.data.materials) == 1:
                batches.setdefault(obj.data.materials[0].name, []).append(obj)
        for name, objects in batches.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            if len(objects) > 1:
                bpy.ops.object.join()
            objects[0].name = actor.name + ' / ' + name
