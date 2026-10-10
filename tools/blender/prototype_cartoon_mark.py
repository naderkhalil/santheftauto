"""Isolated, review-only Mark bust matching the selected cartoon direction.

Uses the vendored CC0 MakeHuman face topology as a connected surface, with
localized lid edits and newly authored curl volumes. Never rebuilds the roster.
Blender --background --factory-startup -t 4 --python this_file
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
import racer_faces as anatomy
import racer_skin
from racer_characters import Sculptor, material, mesh_object, xyz

OUT = ROOT / 'art/characters/cartoon-mark'
TAU = math.tau


def clamp(v, lo=0., hi=1.):
    return max(lo, min(hi, v))


def smooth(v):
    v = clamp(v)
    return v*v*(3-2*v)


def matte_skin(ident, color):
    mat = material('Mark cartoon / smooth warm skin', color, .82)
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Specular IOR Level'].default_value = .20
    # The anatomical lip tint expects a linked base-color input.
    base = nodes.new('ShaderNodeRGB')
    base.outputs[0].default_value = mat.diffuse_color
    mat.node_tree.links.new(base.outputs[0], bsdf.inputs['Base Color'])
    return mat


original_shape = anatomy._shape


def shaped_face(actor):
    mapped, faces, groups, base = original_shape(actor)
    # Open the eyelid aperture locally, preserving globe size and cheek volume.
    centers = []
    helpers = set()
    for name in ('helper-r-eye', 'helper-l-eye'):
        ids = set(i for f in groups[name] for i in f)
        helpers |= ids
        points = [mapped[i] for i in ids]
        centers.append(tuple((min(p[k] for p in points)+max(p[k] for p in points))/2
                             for k in range(3)))
    changed = []
    for i, (x, y, z) in enumerate(mapped):
        if i not in helpers:
            for cx, cy, cz in centers:
                dx, dy = x-cx, y-cy
                # Fall off before the eyebrow and cheek; move lid loops only.
                w = math.exp(-((dx/.029)**4 + (dy/.018)**4))
                w *= smooth((z-(cz-.004))/.017)
                y += dy*.78*w
        changed.append((x, y, z))
    actor._human_mapped = changed
    return changed, faces, groups, base


def lively_eyes(actor, groups, mapped):
    actor._human_eyes = []
    rim = material('Mark cartoon / iris rim', '#283a44', .46)
    blue = material('Mark cartoon / clear blue iris', '#628a9f', .40)
    pupil = material('Mark cartoon / pupil', '#17252b', .35)
    glint = material('Mark cartoon / restrained catchlight', '#fff9e9', .18)
    for side, name in ((-1, 'helper-r-eye'), (1, 'helper-l-eye')):
        ids = set(i for f in groups[name] for i in f)
        points = [mapped[i] for i in ids]
        lo = [min(p[k] for p in points) for k in range(3)]
        hi = [max(p[k] for p in points) for k in range(3)]
        center = [(a+b)/2 for a, b in zip(lo, hi)]
        radius = [(b-a)/2 for a, b in zip(lo, hi)]
        actor.ell('orbital globe '+str(side), center, radius, actor.whites)
        actor._human_eyes.append((side, center, radius))
        for label, scale, lift, mat in (
                ('iris rim', .57, .00013, rim), ('blue iris', .51, .00027, blue),
                ('pupil', .235, .00041, pupil)):
            vertices, faces = [], []
            n = 48
            for ring in (1., .75, .5, .25, .001):
                for j in range(n):
                    angle = TAU*j/n
                    q = scale*ring
                    vertices.append((center[0]+radius[0]*q*math.cos(angle),
                                     center[1]+radius[1]*q*math.sin(angle),
                                     center[2]+radius[2]*math.sqrt(1-q*q)+lift))
            for ring in range(4):
                for j in range(n):
                    a, b = ring*n+j, ring*n+(j+1)%n
                    faces.append((a, b, b+n, a+n))
            anatomy._mesh(actor, label+' '+str(side), vertices, faces, [mat])
        for dx, dy, size in ((-.0040, .0047, .00155), (.0032, -.0033, .00065)):
            z = center[2]+radius[2]*math.sqrt(max(0, 1-(dx/radius[0])**2-(dy/radius[1])**2))
            actor.ell('eye light '+str(side), (center[0]+dx, center[1]+dy, z+.00065),
                      (size, size, .00055), glint)


def curls(actor):
    base = material('Mark cartoon / chestnut scalp', '#49331f', .88)
    shades = [material('Mark cartoon / curl '+str(i), col, .69)
              for i, col in enumerate(('#6e4827', '#754c28', '#624326', '#7c522e'))]
    for mat in shades:
        mat.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value = .24

    def surface(a, u):
        front = max(0, math.cos(a))
        back = max(0, -math.cos(a))
        line = .56 + .245*front - .065*back
        line += .008*math.sin(a*7+.4)*front
        t = line+(1-line)*u
        w, d, c = actor.head_profile(min(t, .995))
        extra = .006+.010*math.sin(math.pi*u)**.7
        x = (w+extra)*math.sin(a)
        z = c+(d+extra)*math.cos(a)
        if math.cos(a) > 0:
            z = actor.front(w*math.sin(a), min(t, .995)) + extra*math.cos(a)
        return Vector((x, actor.y0+actor.hh*t+.014*u, z))

    n, rows = 96, 28
    verts = [tuple(surface(TAU*i/n, row/rows)) for row in range(rows) for i in range(n)]
    faces = []
    for row in range(rows-1):
        for i in range(n):
            a, b = row*n+i, row*n+(i+1)%n
            faces.append((a, b, b+n, a+n))
    tip = len(verts)
    verts.append((0, actor.y0+actor.hh+.015, -.020))
    for i in range(n):
        faces.append(((rows-1)*n+i, (rows-1)*n+(i+1)%n, tip))
    mesh_object('Mark / fitted scalp under curls', verts, faces, base, actor.root)

    # Each curl is an asymmetrically tapered spiral volume, not a sphere or a
    # fine ridge pasted to the scalp. Raised outer turns establish silhouette.
    specs = []
    for band, count in enumerate((19, 17, 14, 10, 5)):
        for k in range(count):
            a = TAU*(k+.37*band)/count
            u = .025+band*.19+.02*math.sin(k*2.8)
            specs.append((a, clamp(u, .01, .92), band, k))
    for idx, (a, u, band, k) in enumerate(specs):
        center = surface(a, u)
        tangent = (surface(a+.003, u)-surface(a-.003, u)).normalized()
        vertical = (surface(a, min(.98, u+.003))-surface(a, max(0, u-.003))).normalized()
        normal = tangent.cross(vertical).normalized()
        radial = Vector((center.x, center.y-actor.y0-actor.hh*.53, center.z+.020))
        if normal.dot(radial) < 0:
            normal = -normal
        vertical = normal.cross(tangent).normalized()
        center += normal*(.008+.002*math.sin(idx*3.7))
        size = .0195+.003*math.sin(idx*1.9)
        phase = idx*2.399
        # Outer edge ends in a broad lock; inner tail curls back into the mass.
        points = []
        samples, sides = 30, 10
        for j in range(samples):
            q = j/(samples-1)
            angle = phase+q*TAU*.86
            r = size*(1-.79*q)
            p = center + tangent*(math.cos(angle)*r) + vertical*(math.sin(angle)*r*1.12)
            p += normal*(.0055*math.sin(math.pi*q)-.002*q)
            points.append(p)
        cv, cf = [], []
        for j, p in enumerate(points):
            q = j/(samples-1)
            along = (points[min(j+1,samples-1)]-points[max(j-1,0)]).normalized()
            across = normal.cross(along).normalized()
            width = .001+.0115*math.sin(math.pi*(.12+.88*q))**.65
            width *= (1-.35*q)
            height = .001+.0042*math.sin(math.pi*(.15+.85*q))**.7
            for side in range(sides):
                angle = TAU*side/sides
                p2 = p + across*(width*math.cos(angle)) + normal*(height*math.sin(angle))
                cv.append(tuple(p2))
        for j in range(samples-1):
            for side in range(sides):
                a1, b1 = j*sides+side, j*sides+(side+1)%sides
                cf.append((a1,b1,b1+sides,a1+sides))
        cf += [tuple(reversed(range(sides))),tuple((samples-1)*sides+i for i in range(sides))]
        obj = mesh_object('Mark / sculpted curl %02d'%idx, cv, cf, shades[idx%4], actor.root)
        obj['design_role'] = 'Broad overlapping chestnut curl; authored cartoon silhouette'


def shoulders(actor):
    shirt = material('Mark cartoon / charcoal cotton', '#303945', .94)
    edge = material('Mark cartoon / ribbed crewneck edge', '#252d36', .95)
    # Continuous sloping shoulder surface avoids the old padded sleeve chunks.
    rings = [(1.010,.165,.091,0,-.023), (1.075,.184,.096,0,-.023),
             (1.210,.204,.101,0,-.023), (1.330,.225,.103,0,-.023),
             (1.397,.224,.101,0,-.023), (1.439,.190,.091,0,-.023),
             (1.480,.130,.074,0,-.023), (1.515,.072,.054,0,-.023),
             (1.531,.062,.049,0,-.023)]
    torso = actor.loft('continuous tee and sloping shoulders',rings,shirt,subdivision=2)
    for v in torso.data.vertices:
        # Minimal broad cotton tension under the collar, no procedural pores.
        x,y,z=v.co
        if y < 0 and 1.22 < z < 1.48:
            w=math.exp(-((abs(x)-.06)/.07)**2)*math.sin((z-1.22)/.26*math.pi)
            v.co.y += .0015*w*math.sin(x*48+z*28)
    pts=[]
    for i in range(97):
        a=TAU*i/96
        pts.append((.064*math.cos(a), 1.525-.004*math.sin(a), -.023+.0495*math.sin(a)))
    actor.tube('soft crewneck binding',pts,.0032,edge,12,1)
    return torso


def lid_edges(actor, obj):
    """Fine contour on the actual eye-opening boundary, following real loops."""
    import bmesh
    mat=material('Mark cartoon / soft eyelid contour','#795334',.86)
    bm=bmesh.new();bm.from_mesh(obj.data)
    boundary=set(v for e in bm.edges if e.is_boundary for v in e.verts)
    for side,c,r in actor._human_eyes:
        points=[]
        for v in boundary:
            x,y,z=v.co.x,v.co.z,-v.co.y
            if abs(x-c[0])<r[0]*1.20 and abs(y-c[1])<r[1]*1.25 and z>c[2]:
                points.append((x,y,z+.0005))
        if len(points)>8:
            points.sort(key=lambda p:math.atan2(p[1]-c[1],p[0]-c[0]))
            # Upper lid provides the most useful graphic edge; keep lower soft.
            points.append(points[0])
            radii=[.00065 if p[1]>c[1] else .00028 for p in points]
            actor.tube('anatomical lid line '+str(side),points,radii,mat,6,1)
    bm.free()


def camera_at(scene, target, yaw, distance, scale):
    center=Vector(target)
    pos=center+Vector((distance*math.sin(yaw),-distance*math.cos(yaw),.025))
    camera=scene.camera
    camera.location=pos
    camera.rotation_euler=(center-pos).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=scale


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # These process-local settings only affect this standalone proof.
    anatomy._MORPHS['mark']={**anatomy._MORPHS['mark'],
        'head/head-fat-decr':.10,'chin/chin-height-incr':.15,
        'mouth/mouth-angles-up':.57,'mouth/mouth-laugh-lines-in':.12,
        'both:ears/ear-scale-incr':.0,'both:ears/ear-rot-forward':.0,
        'nose/nose-scale-vert-incr':.36,'nose/nose-scale-depth-incr':.40}
    anatomy._LIP_COLOR['mark']='#b77458'
    anatomy._shape=shaped_face
    anatomy._orbital_eyes=lively_eyes
    racer_skin.build_skin_material=matte_skin
    actor=Sculptor('mark',False)
    actor.root.name='Mark_Cartoon_Bust_Prototype'
    actor.s['skin']='#dda16f'
    actor.s['brow_color']='#805633'
    actor.s['brow']=.0050
    actor.skin=material('Mark cartoon / neck skin',actor.s['skin'],.82)
    actor.whites=material('Mark cartoon / warm ivory sclera','#f5ecdf',.44)
    face=anatomy.build_face(actor)
    # Extend the existing connected neck beneath the collar. The old separate
    # fitted-neck primitive made a visibly broken seam on this cropped bust.
    for obj in list(actor.root.children):
        if 'fitted anatomical neck' in obj.name:
            bpy.data.objects.remove(obj,do_unlink=True)
    for v in face.data.vertices:
        if v.co.z<1.60:
            v.co.z-=.060*(1-smooth((v.co.z-1.535)/.065))
    lid_edges(actor,face)
    face['concept_reference']='art/characters/direction/mark-concept-cartoon-v1.png'
    curls(actor)
    shoulders(actor)
    for obj in actor.root.children:
        for mod in list(obj.modifiers):
            bpy.context.view_layer.objects.active=obj
            obj.select_set(True)
            bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.select_set(False)
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.46,.48,.50,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.20
    for name,pos,power,size in [('Large soft key',(-2,-3,3),110,2.5),
                               ('Open fill',(2,-2,2),32,3),('Soft rim',(1,1,3),70,2)]:
        bpy.ops.object.light_add(type='AREA',location=pos)
        light=bpy.context.object;light.name=name
        light.data.energy=power;light.data.shape='DISK';light.data.size=size
        light.rotation_euler=(Vector((0,0,1.65))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add()
    scene.camera=bpy.context.object
    scene.render.resolution_x=900;scene.render.resolution_y=1100
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform='Standard'
    scene.view_settings.look='None'
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=True
    camera_at(scene,(0,0,1.555),0,4,1.06)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mark-prototype.blend'))
    # Runtime proof exports the actual meshes and PBR materials, without lights.
    bpy.ops.object.select_all(action='DESELECT')
    actor.root.select_set(True)
    for obj in actor.root.children:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'mark-prototype.glb'),export_format='GLB',
        use_selection=True,export_apply=True,export_yup=True,export_cameras=False,
        export_lights=False,export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6)
    for name,yaw in [('front',0),('three-quarter',math.radians(32)),('profile',math.radians(90))]:
        camera_at(scene,(0,0,1.64),yaw,4,.83)
        scene.render.filepath=str(OUT/('mark-'+name+'.png'))
        bpy.ops.render.render(write_still=True)
    print('CARTOON MARK BUST PROOF COMPLETE',OUT,flush=True)


if __name__=='__main__':
    main()
