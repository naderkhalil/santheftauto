"""Original stylized founder sculptures, authored in Blender for the playable kit.

The geometry is designed at character-select distance: continuous body silhouettes,
sculpted faces, shaped hair masses and actual tailored clothing. Coordinates use the
racer's Y-up / +Z-forward system; no photographs or screen-facing billboards.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from racer_materials import build_character_materials
from racer_surfaces import sculpt_garment, jacket_construction, sewn_collar

TAU = math.tau


def xyz(p):
    return (p[0], -p[2], p[1])


def rgb(h):
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))


def material(name, color, roughness=.7, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb(color), 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = m.diffuse_color
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return m


def mesh_object(name, verts, faces, mat, parent, subdivision=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([xyz(p) for p in verts], [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    for f in mesh.polygons:
        f.use_smooth = True
    if subdivision:
        mod = obj.modifiers.new('Sculpt surface', 'SUBSURF')
        mod.levels = subdivision
    return obj


def sphere(name, center, scale, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=xyz(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    obj.data.materials.append(mat)
    for f in obj.data.polygons:
        f.use_smooth = True
    return obj


def loft(name, rings, mat, parent, n=40, subdivision=1):
    """Horizontal sections (y, x radius, z radius, x center, z center)."""
    verts, faces = [], []
    for y, w, d, x, z in rings:
        for i in range(n):
            a = TAU * i / n
            verts.append((x + w * math.cos(a), y, z + d * math.sin(a)))
    for k in range(len(rings) - 1):
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    faces.extend([tuple(reversed(range(n))), tuple((len(rings) - 1) * n + i for i in range(n))])
    return mesh_object(name, verts, faces, mat, parent, subdivision)


def smooth_path(points, steps=6):
    """Catmull–Rom, retaining the authored control points and end tangents."""
    result = []
    p = [Vector(points[0]), *[Vector(v) for v in points], Vector(points[-1])]
    for k in range(1, len(p) - 2):
        a, b, c, d = p[k - 1:k + 3]
        for i in range(steps):
            t = i / steps
            result.append((2*b + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t) * .5)
    result.append(Vector(points[-1]))
    return result


def tube(name, points, radii, mat, parent, sides=16, steps=6):
    """A smooth tapered sweep; sleeves have joined elbows, never cylinder caps."""
    controls = [(*p, r) for p, r in zip(points, radii)]
    samples = smooth_path(controls, steps)
    verts, faces = [], []
    for k, sample in enumerate(samples):
        p = Vector(sample[:3])
        tangent = Vector(samples[min(k+1, len(samples)-1)][:3]) - Vector(samples[max(k-1, 0)][:3])
        tangent.normalize()
        axis = Vector((0, 0, 1)) if abs(tangent.z) < .95 else Vector((0, 1, 0))
        u = tangent.cross(axis).normalized()
        v = tangent.cross(u).normalized()
        for i in range(sides):
            a = TAU * i / sides
            q = p + sample[3] * (u * math.cos(a) + v * math.sin(a))
            verts.append(tuple(q))
    for k in range(len(samples)-1):
        for i in range(sides):
            a, b = k*sides+i, k*sides+(i+1)%sides
            faces.append((a, b, b+sides, a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple((len(samples)-1)*sides+i for i in range(sides))])
    return mesh_object(name, verts, faces, mat, parent)


def union_sculpt(name, objects, voxel=.0055):
    """Voxel sculpt seams into one garment and relax its surface."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = objects[0]
    obj.name = name
    mod = obj.modifiers.new('Unified sculpt', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    mod.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new('Relaxed fabric', 'SMOOTH')
    mod.factor = .7
    mod.iterations = 4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Planar regions do not need the voxel lattice's full triangle count.
    mod = obj.modifiers.new('Sculpt topology', 'DECIMATE')
    mod.ratio = .55
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def interp(profile, t):
    """Shape-preserving cubic interpolation keeps jaw and crown silhouettes smooth."""
    if t <= profile[0][0]:
        return profile[0][1]
    if t >= profile[-1][0]:
        return profile[-1][1]
    slopes=[(q[1]-p[1])/(q[0]-p[0]) for p,q in zip(profile,profile[1:])]
    tangents=[slopes[0]]
    for a,b in zip(slopes,slopes[1:]):
        tangents.append(0 if a*b<=0 else 2*a*b/(a+b))
    tangents.append(slopes[-1])
    for k,((a,av),(b,bv)) in enumerate(zip(profile,profile[1:])):
        if t <= b:
            u=(t-a)/(b-a);h=b-a
            return (2*u**3-3*u*u+1)*av+(u**3-2*u*u+u)*h*tangents[k]+(-2*u**3+3*u*u)*bv+(u**3-u*u)*h*tangents[k+1]
    return profile[-1][1]


def gauss(x, center, width):
    return math.exp(-((x-center)/width)**2)


SPECS = {
    'dario': dict(skin='#d8ae91', hair='#382c25', cloth='#324b60', pants='#555754', shoe='#e8e3d6',
                  width=.145, jaw=.117, depth=.128, head=.454, nose=.077, brow=.0085, stature=1.025,
                  eye_t=.601, eye_spacing=.066, eye_width=.0305, eye_height=.0092, brow_color='#3b3029',
                  nose_bridge=.018, nose_tip=.022, nose_base=.026, mouth_t=.276, mouth_width=.046, cheek=.010,
                  shoulders=.247, waist=.199, eye='#58636a'),
    'sam': dict(skin='#d8b499', hair='#625044', cloth='#a5a79c', pants='#344352', shoe='#e9e5dc',
                width=.141, jaw=.104, depth=.121, head=.453, nose=.074, brow=.0067, stature=1.0,
                eye_t=.603, eye_spacing=.063, eye_width=.0305, eye_height=.0091, brow_color='#5b493e',
                nose_bridge=.0165, nose_tip=.023, nose_base=.024, mouth_t=.269, mouth_width=.051, cheek=.008,
                shoulders=.240, waist=.185, eye='#637369'),
    'elon': dict(skin='#deb49c', hair='#40332c', cloth='#262c32', pants='#32363b', shoe='#333438',
                 width=.166, jaw=.145, depth=.139, head=.434, nose=.052, brow=.0071, stature=1.04,
                 eye_t=.605, eye_spacing=.068, eye_width=.0285, eye_height=.0080, brow_color='#463a31',
                 nose_bridge=.023, nose_tip=.028, nose_base=.031, mouth_t=.275, mouth_width=.037, cheek=.014,
                 shoulders=.280, waist=.233, eye='#60787e'),
    'jensen': dict(skin='#c59a7a', hair='#bac1bf', cloth='#252b2e', pants='#303b44', shoe='#ece8df',
                   width=.158, jaw=.119, depth=.122, head=.411, nose=.039, brow=.0055, stature=.967,
                   eye_t=.609, eye_spacing=.068, eye_width=.0270, eye_height=.0072, brow_color='#696b62',
                   nose_bridge=.024, nose_tip=.030, nose_base=.033, mouth_t=.291, mouth_width=.046, cheek=.018,
                   shoulders=.246, waist=.205, eye='#3d3933'),
}


class Sculptor:
    def __init__(self, ident, seated):
        self.id, self.seated = ident, seated
        self.s = SPECS[ident]
        self.offset = -.5 if seated else 0
        self.root = bpy.data.objects.new(('Seated_' if seated else 'Standing_') + ident, None)
        bpy.context.collection.objects.link(self.root)
        self.prefix = self.root.name
        self.skin = material(ident+' / warm skin', self.s['skin'], .62)
        self.shadow_skin = material(ident+' / soft skin creases', '#a27965' if ident!='jensen' else '#916e59', .75)
        self.lips = material(ident+' / natural lips', '#b68a79' if ident!='jensen' else '#a17a64', .64)
        self.hair = material(ident+' / sculpted hair', self.s['hair'], .84)
        self.hair.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.18
        wardrobe = build_character_materials(ident, self.s)
        self.cloth, self.trim, self.seam = wardrobe['cloth'], wardrobe['trim'], wardrobe['seam']
        self.pants = wardrobe['pants']
        self.shoes = material(ident+' / shoe leather', self.s['shoe'], .55)
        self.sole = material(ident+' / sole rubber', '#bfbdb3' if ident!='elon' else '#24272a', .87)
        self.tee = wardrobe['tee']
        self.metal = material(ident+' / brushed hardware', '#999e9b', .3, .75)
        self.dark = material(ident+' / graphite detail', '#303332', .6)
        self.whites = material(ident+' / eye whites', '#e2dbcd', .48)
        self.iris = material(ident+' / iris', self.s['eye'], .46)
        self.black = material(ident+' / pupils', '#1a2122', .42)
        self.y0 = 1.558
        self.hh = self.s['head']

    def p(self, p):
        return (p[0], p[1]+self.offset, p[2])

    def ell(self, name, center, scale, mat):
        return sphere(self.prefix+' / '+name, self.p(center), scale, mat, self.root)

    def tube(self, name, points, radii, mat, sides=16, steps=6):
        if isinstance(radii, (int,float)):
            radii=[radii]*len(points)
        return tube(self.prefix+' / '+name, [self.p(p) for p in points], radii, mat, self.root, sides, steps)

    def loft(self, name, rings, mat, subdivision=1):
        return loft(self.prefix+' / '+name, [(y+self.offset,w,d,x,z) for y,w,d,x,z in rings], mat, self.root, subdivision=subdivision)

    def head_profile(self, t):
        """Individually authored skull sections, from chin through cranial vault."""
        w, j, d = self.s['width'], self.s['jaw'], self.s['depth']
        profiles = {
            'dario': (
                [(0,.020),(.035,.053),(.10,j*.81),(.19,j),(.34,w*.94),(.46,w),(.59,w*.97),(.70,w*.91),(.81,w*.95),(.90,w*.77),(.975,w*.34),(1,.002)],
                [(0,.025),(.08,d*.70),(.23,d*.86),(.44,d*.99),(.64,d),(.79,d*.96),(.91,d*.76),(.977,d*.35),(1,.002)],
                [(0,.025),(.15,.011),(.35,-.002),(.66,-.013),(.87,-.022),(1,-.030)]),
            'sam': (
                [(0,.018),(.035,.045),(.10,j*.76),(.19,j),(.32,w*.84),(.46,w*.96),(.59,w*.94),(.70,w*.88),(.82,w),(.92,w*.76),(.975,w*.34),(1,.002)],
                [(0,.026),(.09,d*.71),(.25,d*.87),(.43,d*.94),(.66,d),(.80,d*.98),(.92,d*.77),(.977,d*.34),(1,.002)],
                [(0,.028),(.16,.013),(.34,-.004),(.61,-.013),(.83,-.020),(1,-.025)]),
            'elon': (
                [(0,.023),(.035,.064),(.09,j*.88),(.19,j),(.30,w*.96),(.42,w),(.57,w*.98),(.71,w*.98),(.83,w*.92),(.93,w*.68),(.977,w*.29),(1,.002)],
                [(0,.034),(.08,d*.73),(.23,d*.99),(.43,d),(.66,d*.99),(.83,d*.91),(.94,d*.64),(.977,d*.31),(1,.002)],
                [(0,.026),(.20,.010),(.40,-.003),(.65,-.014),(.86,-.025),(1,-.030)]),
            'jensen': (
                [(0,.018),(.035,.051),(.10,j*.82),(.21,j),(.34,w*.93),(.46,w*1.015),(.57,w),(.69,w*.90),(.82,w*.91),(.92,w*.71),(.978,w*.30),(1,.002)],
                [(0,.028),(.08,d*.74),(.23,d*.88),(.44,d),(.62,d*.98),(.81,d*.94),(.93,d*.70),(.978,d*.32),(1,.002)],
                [(0,.021),(.18,.008),(.40,-.009),(.65,-.017),(.87,-.024),(1,-.031)]),
        }
        wp, dp, cp = profiles[self.id]
        return interp(wp, t), interp(dp, t), interp(cp, t)

    def front(self, x, t):
        """One continuous face carries the jaw, orbital rims, nose and age folds."""
        w, d, center = self.head_profile(t)
        r = min(1, abs(x) / max(w, .001))
        # Squarer mandibular sections give Elon/Jensen genuinely different planes,
        # rather than the same elliptical head at a different overall width.
        power = {'dario':2.15, 'sam':2.04, 'elon':2.68, 'jensen':2.48}[self.id]
        power = 2 + (power - 2) * gauss(t, .37, .36)
        base = center + d * max(0, 1-r**power)**(1/power)
        envelope = max(0, 1-r**4)**.7
        s = self.s
        eye = s['eye_t']
        spacing = s['eye_spacing']
        feature = 0
        nose_profiles = {
            'dario':[(.355,0),(.385,.30),(.412,1),(.451,.95),(.512,.85),(.563,.64),(.625,.24),(.697,0)],
            'sam':[(.363,0),(.392,.40),(.428,1),(.475,.85),(.531,.64),(.594,.39),(.676,0)],
            'elon':[(.363,0),(.398,.55),(.439,1),(.478,.74),(.533,.40),(.609,.16),(.681,0)],
            'jensen':[(.384,0),(.413,.42),(.448,1),(.481,.70),(.535,.26),(.608,.07),(.665,0)],
        }
        bridge_width = interp([(.37,s['nose_base']*.77),(.44,s['nose_tip']),(.54,s['nose_bridge']),(.67,s['nose_bridge']*1.2)], t)
        feature += s['nose'] * interp(nose_profiles[self.id], t) * gauss(x, 0, bridge_width)
        alar_t = .427 if self.id == 'jensen' else .410
        for side in [-1, 1]:
            # Alar wings and their junctions are sculpted into the face mesh.
            feature += (.013 if self.id in ['elon','jensen'] else .010) * gauss(t, alar_t, .032) * gauss(x, side*s['nose_base'], .011)
            feature -= .0038 * gauss(t, alar_t-.014, .020) * gauss(x, side*s['nose_base']*.72, .0065)
            cheek_x = side * ({'dario':.096,'sam':.099,'elon':.110,'jensen':.109}[self.id])
            cheek_t = .492 if self.id == 'jensen' else .457
            feature += s['cheek'] * gauss(t, cheek_t, .088) * gauss(x, cheek_x, .035)
            # Sam's hollow lower cheeks, Dario's long nasolabial planes, and
            # Elon's full jowls remain distinct in three-quarter view.
            feature += {'dario':-.004,'sam':-.014,'elon':.010,'jensen':-.003}[self.id] * gauss(t,.30,.11) * gauss(x,side*.098,.030)
            feature -= {'dario':.012,'sam':.014,'elon':.017,'jensen':.008}[self.id] * gauss(t,eye,.047) * gauss(x,side*spacing,s['eye_width']*1.11)
            feature += {'dario':.012,'sam':.011,'elon':.016,'jensen':.009}[self.id] * gauss(t,eye+.073,.036) * gauss(x,side*spacing,.043)
            feature += {'dario':.006,'sam':.0025,'elon':.008,'jensen':.0045}[self.id] * gauss(t,eye-.048,.026) * gauss(x,side*spacing,.034)
            feature -= {'dario':.0042,'sam':.0024,'elon':.0026,'jensen':.0040}[self.id] * gauss(t,eye-.078,.015) * gauss(x,side*spacing,.034)
            fold_x = side*(s['nose_base']+.016+(.42-t)*.18)
            feature -= {'dario':.0034,'sam':.0026,'elon':.0021,'jensen':.0038}[self.id] * gauss(t,.345,.082) * gauss(x,fold_x,.006)
            feature -= {'dario':.004,'sam':.006,'elon':.001,'jensen':.003}[self.id] * gauss(t,.66,.074) * gauss(x,side*w*.83,.022)
        # Philtrum, the lip barrel, labiomental break and a broad/fine chin.
        mouth_t = s['mouth_t']
        feature += .0045 * gauss(t,mouth_t+.058,.042) * (gauss(x,-.009,.006)+gauss(x,.009,.006))
        feature -= .0025 * gauss(t,mouth_t+.067,.040) * gauss(x,0,.0045)
        feature += {'dario':.007,'sam':.008,'elon':.009,'jensen':.006}[self.id] * gauss(t,mouth_t,.054) * gauss(x,0,s['mouth_width']*1.05)
        feature -= .0045 * gauss(t,mouth_t-.070,.020) * gauss(x,0,.042)
        feature += {'dario':.012,'sam':.016,'elon':.013,'jensen':.009}[self.id] * gauss(t,.135,.065) * gauss(x,0,.054 if self.id != 'elon' else .073)
        if self.id == 'sam':
            feature -= .0028 * gauss(t,.143,.035) * gauss(x,0,.010)
        if self.id in ['dario','elon','jensen']:
            for line in [.750,.789]:
                feature -= (.0013 if self.id == 'elon' else .0017) * gauss(t,line+.006*math.cos(x*27),.0045) * gauss(x,0,.087)
        return base + feature*envelope

    def face(self):
        verts, faces = [], []
        n, m = 88, 68
        for j in range(m+1):
            t = .0005+j/m*.999
            y = self.y0+t*self.hh
            w, d, c = self.head_profile(t)
            for i in range(n):
                a = TAU*i/n
                x = w*math.sin(a)
                z = self.front(x,t) if math.cos(a) >= 0 else c+d*math.cos(a)
                verts.append(self.p((x,y,z)))
        for j in range(m):
            for i in range(n):
                a, b = j*n+i, j*n+(i+1)%n
                faces.append((a,b,b+n,a+n))
        faces.extend([tuple(reversed(range(n))),tuple(m*n+i for i in range(n))])
        head = mesh_object(self.prefix+' / integrated facial sculpt',verts,faces,self.skin,self.root)
        face_mat = self.skin.copy()
        face_mat.name = self.id+' / skin with subtle complexion'
        node = face_mat.node_tree.nodes.new('ShaderNodeVertexColor')
        node.layer_name = 'Complexion'
        face_mat.node_tree.links.new(node.outputs['Color'],face_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        head.data.materials[0] = face_mat
        attr = head.data.color_attributes.new(name='Complexion',type='FLOAT_COLOR',domain='POINT')
        base = rgb(self.s['skin'])
        flush = rgb('#c1927a' if self.id != 'jensen' else '#ae8064')
        beard_color = rgb('#776f65')
        for i, p in enumerate(verts):
            x, y, z = p
            t = (y-self.offset-self.y0)/self.hh
            forward = max(0,min(1,(z+.02)/.12))
            blush = .17*forward*(gauss(x,-.094,.038)+gauss(x,.094,.038))*gauss(t,.465,.095)
            color = [v*(1-blush)+f*blush for v,f in zip(base,flush)]
            if self.id == 'dario':
                beard = .40*forward*gauss(t,.18,.16)
                beard += .22*forward*gauss(t,self.s['mouth_t']+.063,.033)*gauss(x,0,.052)
                beard *= 1-.80*gauss(x,0,.042)*gauss(t,self.s['mouth_t'],.032)
                color = [v*(1-beard)+f*beard for v,f in zip(color,beard_color)]
            attr.data[i].color = (*color,1)
        self.loft('neck',[(1.485,.072,.070,0,-.008),(1.54,.075,.073,0,-.006),(1.64,.074,.070,0,.003)],self.skin)
        # Low-poly folded ear shells: no detached spherical facial components.
        for side in [-1,1]:
            ev, ef = [], []
            cx = side*(self.s['width']*.955+.006)
            cy = self.y0+self.hh*(.545 if self.id != 'jensen' else .565)
            en, rings = 28, 6
            for k in range(rings+1):
                r = .06+.94*k/rings
                for i in range(en):
                    a = TAU*i/en
                    x = cx+side*.022*r*math.cos(a)*(1+.10*math.sin(a))
                    y = cy+.047*r*math.sin(a)
                    z = -.012+.015*(1-r*r)+.010*gauss(r,.83,.14)
                    ev.append(self.p((x,y,z)))
            for k in range(rings):
                for i in range(en):
                    a,b=k*en+i,k*en+(i+1)%en
                    ef.append((a,b,b+en,a+en))
            ef.append(tuple(reversed(range(en))))
            back = len(ev)
            ev.append(self.p((cx,cy,-.026)))
            for i in range(en):
                ef.append((rings*en+i,back,rings*en+(i+1)%en))
            mesh_object(self.prefix+' / folded ear shell',ev,ef,self.skin,self.root)
            self.tube('ear antihelix',[(cx+side*.005,cy+.027,.003),(cx+side*.011,cy+.010,.005),(cx+side*.006,cy-.015,.005)],[.0020,.0025,.0013],self.shadow_skin,6,3)
        self.eyes()
        self.mouth()
        self.hairstyle()

    def patch(self, name, coords, mat):
        """Triangulate the actual facial outline, including concave lips/brows."""
        def cross(a, b, c):
            return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        # Lip planes share their corner endpoints; remove zero-length edges
        # before triangulation, retaining the caller's face-conforming depths.
        clean = []
        for p in coords:
            if not clean or (p[0]-clean[-1][0])**2+(p[1]-clean[-1][1])**2 > 1e-20:
                clean.append(p)
        if len(clean)>1 and (clean[0][0]-clean[-1][0])**2+(clean[0][1]-clean[-1][1])**2 < 1e-20:
            clean.pop()
        coords = clean
        area = sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(coords,coords[1:]+coords[:1]))
        if area < 0:
            coords.reverse()
        remaining = list(range(len(coords)))
        triangles = []
        while len(remaining) > 3:
            for k,b in enumerate(remaining):
                a,c = remaining[k-1],remaining[(k+1)%len(remaining)]
                pa,pb,pc = coords[a],coords[b],coords[c]
                turn = cross(pa,pb,pc)
                if abs(turn) < 1e-14:
                    remaining.pop(k)
                    break
                if turn < 0:
                    continue
                if any(cross(pa,pb,coords[q])>=-1e-14 and cross(pb,pc,coords[q])>=-1e-14 and cross(pc,pa,coords[q])>=-1e-14 for q in remaining if q not in [a,b,c]):
                    continue
                triangles.append((a,b,c))
                remaining.pop(k)
                break
            else:
                raise ValueError(self.prefix+' / could not triangulate '+name)
        if len(remaining)==3 and cross(*(coords[i] for i in remaining)) > 1e-14:
            triangles.append(tuple(remaining))
        # A valid outline alone is insufficient: a long chord across a concave
        # eye socket can sit in front of its iris. Refine the actual 3D surface,
        # sampling every new point from front() plus interpolated caller lift.
        samples = [(x,y,z-self.front(x,(y-self.y0)/self.hh)) for x,y,z in coords]
        verts = list(coords)
        midpoints = {}
        def surface(sample):
            x,y,lift = sample
            return (x,y,self.front(x,(y-self.y0)/self.hh)+lift)
        def midpoint(a,b):
            key = tuple(sorted((a,b)))
            if key not in midpoints:
                sample = tuple((p+q)*.5 for p,q in zip(samples[a],samples[b]))
                midpoints[key] = len(verts)
                samples.append(sample)
                verts.append(surface(sample))
            return midpoints[key]
        faces = []
        pending = [(a,b,c,0) for a,b,c in triangles]
        while pending:
            a,b,c,depth = pending.pop()
            edges = [(a,b,c),(b,c,a),(c,a,b)]
            u,v,opposite = max(edges,key=lambda edge:sum((p-q)**2 for p,q in zip(samples[edge[0]][:2],samples[edge[1]][:2])))
            longest = sum((p-q)**2 for p,q in zip(samples[u][:2],samples[v][:2]))
            center = tuple(sum(samples[i][axis] for i in [a,b,c])/3 for axis in range(3))
            error = abs(surface(center)[2]-sum(verts[i][2] for i in [a,b,c])/3)
            for p,q,_ in edges:
                sample = tuple((x+y)*.5 for x,y in zip(samples[p],samples[q]))
                error = max(error,abs(surface(sample)[2]-(verts[p][2]+verts[q][2])*.5))
            if longest > .005**2 or error > .00010:
                if depth >= 24:
                    raise ValueError(self.prefix+' / excessive facial patch curvature in '+name)
                mid = midpoint(u,v)
                pending.extend([(u,mid,opposite,depth+1),(mid,v,opposite,depth+1)])
            else:
                faces.append((a,b,c))
        return mesh_object(self.prefix+' / '+name,[self.p(p) for p in verts],faces,mat,self.root)

    def eyes(self):
        s = self.s
        eye_t, ew, eh = s['eye_t'], s['eye_width'], s['eye_height']
        brow_mat = material(self.id+' / natural brows',s['brow_color'],.86)
        # Fine folds should shade as skin, rather than read as drawn outlines.
        crease_mat = self.skin.copy()
        crease_mat.name = self.id+' / subtle orbital folds'
        crease_color = tuple(.76*a+.24*b for a,b in zip(self.skin.diffuse_color[:3],self.shadow_skin.diffuse_color[:3]))
        crease_mat.diffuse_color = (*crease_color,1)
        crease_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (*crease_color,1)
        tilt = {'dario':-.0010,'sam':-.0017,'elon':-.0009,'jensen':.0020}[self.id]
        for side in [-1,1]:
            cx = side*s['eye_spacing']
            cy = self.y0+self.hh*eye_t
            if self.id == 'sam':
                cy += .0010 if side < 0 else -.0005
            def lid(u, upper):
                x = side*(s['eye_spacing']+ew*(2*u-1))
                wave = max(0,math.sin(math.pi*u))**.8
                hood = {'dario':.93,'sam':.76,'elon':.73,'jensen':.72}[self.id]
                height = eh*wave*(hood*(1-.17*u) if upper else -.61*(1+.15*u))
                y = cy+tilt*(2*u-1)+height
                return (x,y,self.front(x,(y-self.y0)/self.hh)+.0020)
            upper = [lid(i/16,True) for i in range(17)]
            lower = [lid(i/16,False) for i in range(17)]
            self.patch('individual eye opening',upper+list(reversed(lower[1:-1])),self.whites)
            # Iris/pupil surfaces are clipped by the actual lid aperture. This
            # retains hooded eyes without spheres poking through a narrow opening.
            for name, rx, ry, lift, mat in [
                ('iris',.0068,.0072,.0030,self.iris),
                ('pupil',.0031,.0047,.0037,self.black),
            ]:
                points = []
                for i in range(24):
                    a = TAU*i/24
                    x = cx+rx*math.cos(a)
                    u = .5+(x-cx)/(side*ew*2)
                    bottom,top = lid(u,False)[1]+.00045,lid(u,True)[1]-.00045
                    y = max(bottom,min(top,cy+ry*math.sin(a)))
                    points.append((x,y,self.front(x,(y-self.y0)/self.hh)+lift))
                self.patch(name,points,mat)
            points=[]
            for i in range(10):
                a=TAU*i/10;x=cx-.0018+.00115*math.cos(a);y=cy+.0013+.00115*math.sin(a)
                points.append((x,y,self.front(x,(y-self.y0)/self.hh)+.0045))
            self.patch('eye catchlight',points,self.whites)
            self.tube('weighted upper eyelid',[(x,y,z-.00035) for x,y,z in upper],[.0007]+[.00165]*15+[.0006],self.shadow_skin,8,1)
            self.tube('soft lower eyelid',[(x,y,z-.0008) for x,y,z in lower],[.0005]+[.00115]*15+[.0005],self.skin,8,1)
            # The superior fold is a second, low-contrast anatomical crease.
            crease=[]
            for i in range(11):
                u=.06+.88*i/10;x,y,_=lid(u,True)
                y+= {'dario':.008,'sam':.0065,'elon':.0055,'jensen':.0050}[self.id]*(math.sin(math.pi*u)**.6)
                crease.append((x,y,self.front(x,(y-self.y0)/self.hh)+.00035))
            self.tube('hooded lid crease',crease,[.00025]+[.00055]*9+[.0002],crease_mat,6,1)
            # The lower orbital bag and its crease already belong to front().
            # Let that continuous relief catch light without a second dark tube.
            # Broad medial brows taper into lifted or drooping lateral tails.
            outline=[]
            brow_points=[]
            for i in range(13):
                u=i/12
                x=side*(s['eye_spacing']-ew*.97+ew*2.25*u)
                arch={'dario':.009,'sam':.0055,'elon':.0035,'jensen':.005}[self.id]
                y=cy+{'dario':.032,'sam':.030,'elon':.025,'jensen':.027}[self.id]+arch*math.sin(math.pi*u)-.009*u
                if self.id == 'sam':
                    y+=(.0035 if side < 0 else 0)*(1-u)
                brow_points.append((x,y))
            for sign,points in [(1,brow_points),(-1,list(reversed(brow_points)))]:
                for x,y in points:
                    u=(abs(x)-(s['eye_spacing']-ew*.97))/(ew*2.25)
                    thickness=s['brow']*(.26+.74*math.sin(math.pi*max(0,min(1,u)))**.5)*(1-.55*u)
                    yy=y+sign*thickness*.5
                    outline.append((x,yy,self.front(x,(yy-self.y0)/self.hh)+.0014))
            self.patch('shaped tapered brow',outline,brow_mat)
            if self.id in ['dario','jensen']:
                for k in range(2):
                    x0=side*(s['eye_spacing']+ew*.97)
                    yy=cy-.003-k*.006
                    points=[(x0,yy),(x0+side*.013,yy-.002-k*.003),(x0+side*.021,yy-.004-k*.004)]
                    self.tube('fine outer eye crease',[(x,y,self.front(x,(y-self.y0)/self.hh)+.0003) for x,y in points],[.00025,.00045,.00015],crease_mat,6,2)
        # Small alar slit surfaces reinforce the already sculpted nasal base.
        for side in [-1,1]:
            cx=side*s['nose_base']*.73
            nt=.417 if self.id == 'jensen' else .399
            cy=self.y0+self.hh*nt
            points=[]
            for i in range(16):
                a=TAU*i/16;x=cx+.0055*math.cos(a);y=cy+.0018*math.sin(a)-side*(x-cx)*.17
                points.append((x,y,self.front(x,(y-self.y0)/self.hh)+.0008))
            self.patch('alar nostril slit',points,self.shadow_skin)
        if self.id == 'jensen':
            cy=self.y0+self.hh*(eye_t+.011)
            frame_z=self.front(s['eye_spacing'],eye_t)+.018
            for side in [-1,1]:
                cx=side*s['eye_spacing'];points=[]
                for i in range(33):
                    a=TAU*i/32
                    x=cx+.046*math.copysign(abs(math.cos(a))**.40,math.cos(a))
                    y=cy+.0215*math.copysign(abs(math.sin(a))**.42,math.sin(a))
                    points.append((x,y,frame_z-.05*abs(x)))
                self.tube('rectangular glasses',points,.0030,self.dark,8,1)
                self.tube('glasses temple',[(side*(s['eye_spacing']+.046),cy+.008,frame_z-.006),(side*.150,cy+.009,.075),(side*.158,cy+.004,-.012)],.0028,self.dark,8,3)
            self.tube('glasses bridge',[(-.021,cy+.005,frame_z),(0,cy+.013,frame_z+.009),(.021,cy+.005,frame_z)],.0024,self.dark,8,3)

    def mouth(self):
        y=self.y0+self.hh*self.s['mouth_t']
        width=self.s['mouth_width']
        points=[]
        for i in range(21):
            u=i/20;q=2*u-1;x=q*width
            curve={'dario':-.0015,'sam':.0075,'elon':-.0008,'jensen':.0060}[self.id]
            yy=y+curve*q*q
            if self.id == 'sam':
                yy+=.0035*q
            elif self.id == 'elon':
                yy+=.0015*gauss(q,0,.40)
            points.append((x,yy,self.front(x,(yy-self.y0)/self.hh)+.0016))
        for upper in [True,False]:
            outline=[]
            for i,p in enumerate(points):
                u=i/20;q=2*u-1
                height=({'dario':.0038,'sam':.0036,'elon':.0026,'jensen':.0031}[self.id] if upper else -{'dario':.0055,'sam':.0061,'elon':.0041,'jensen':.0048}[self.id])
                height*=math.sin(math.pi*u)**.85
                if upper:
                    height*=.64+.36*(gauss(q,-.29,.24)+gauss(q,.29,.24))
                yy=p[1]+height
                outline.append((p[0],yy,self.front(p[0],(yy-self.y0)/self.hh)+.0022))
            outline.extend(reversed(points))
            self.patch('defined upper lip' if upper else 'soft lower lip',outline,self.lips)
        self.tube('relaxed mouth seam',points,[.0005]+[.0010]*19+[.0005],self.shadow_skin,8,1)
        for side in [-1,1]:
            x=side*width;cy=points[0 if side < 0 else -1][1]
            self.tube('mouth corner',[(x,cy,self.front(x,(cy-self.y0)/self.hh)+.0010),(x+side*.004,cy-.003,self.front(x+side*.004,(cy-.003-self.y0)/self.hh)+.0007)],[.0008,.00025],self.shadow_skin,6,2)

    def hairstyle(self):
        """One sculpted cap per head: curl clusters, side sweep or brushed silver."""
        verts, faces = [], []
        n, m = 88, 30
        for j in range(m):
            u=j/m
            for i in range(n):
                a=TAU*i/n;forward=max(0,math.cos(a));back=max(0,-math.cos(a));sine=math.sin(a)
                if self.id == 'dario':
                    base=.565+.180*forward-.105*back-.050*abs(sine)**12
                    base+=.019*math.sin(a*13+.4)*forward
                elif self.id == 'sam':
                    base=.60+.245*forward-.120*back+.050*sine*forward-.068*gauss(sine,-.28,.35)*forward
                elif self.id == 'elon':
                    base=.605+.232*forward-.120*back-.018*forward**14+.042*gauss(abs(sine),.58,.22)*forward
                else:
                    base=.575+.265*forward-.100*back-.033*forward**12+.036*gauss(abs(sine),.70,.20)*forward
                t=base+(1-base)*u
                w,d,c=self.head_profile(t)
                fade=max(0,math.sin(math.pi*u))**.65
                if self.id == 'dario':
                    cluster=(.5+.5*math.sin(a*14+u*20+1.7*math.sin(u*TAU)))**1.35
                    cluster*=.72+.28*math.cos(a*7-u*17)
                    volume=.0035+(.008+.020*cluster)*fade
                    top_lift=.024*u+.010*cluster*fade
                    shift=0
                elif self.id == 'sam':
                    sweep=gauss(sine,-.22,.69)*forward
                    ridge=(.5+.5*math.sin(a*13-u*9+1.4*math.sin(u*math.pi)))**2
                    volume=.0035+.74*(.008+.015*sweep+.003*ridge)*fade
                    top_lift=.0148*u+.01702*sweep*fade+.00222*ridge*fade
                    shift=.0074*u+.00592*fade*forward
                elif self.id == 'elon':
                    ridge=(.5+.5*math.sin(a*15-u*7))**2
                    volume=.003+(.005+.009*forward+.0027*ridge)*fade
                    top_lift=.012*u+.009*forward*fade
                    shift=.006*fade
                else:
                    ridge=(.5+.5*math.sin(a*19-u*4.5))**2
                    volume=.003+(.006+.003*ridge)*fade
                    top_lift=.014*u+.008*fade+.002*ridge*fade
                    shift=-.003*fade
                radial=volume*(1-u**10)
                x=w*sine+radial*sine+shift
                z=self.front(w*sine,t)+radial*math.cos(a) if forward > 0 else c+(d+radial)*math.cos(a)
                y=self.y0+self.hh*t+top_lift
                verts.append(self.p((x,y,z)))
        for j in range(m-1):
            for i in range(n):
                a,b=j*n+i,j*n+(i+1)%n
                faces.append((a,b,b+n,a+n))
        crown=len(verts)
        lift={'dario':.024,'sam':.0148,'elon':.012,'jensen':.014}[self.id]
        verts.append(self.p((.0074 if self.id == 'sam' else 0,self.y0+self.hh+lift,self.head_profile(1)[2])))
        for i in range(n):
            faces.append(((m-1)*n+i,(m-1)*n+(i+1)%n,crown))
        # Only the hem has thickness. A full Solidify shell would double the
        # invisible interior topology of every standing and seated hairstyle.
        inner=len(verts)
        for i in range(n):
            x,y,z=verts[i]
            verts.append((x*.992,y-.001,z*.992))
        for i in range(n):
            faces.append((i,inner+i,inner+(i+1)%n,(i+1)%n))
        names={'dario':'dark sculpted curl clusters','sam':'asymmetric swept quiff','elon':'receding swept hairline','jensen':'short brushed silver hair'}
        mesh_object(self.prefix+' / '+names[self.id],verts,faces,self.hair,self.root)

    def body(self):
        width=self.s['shoulders'];waist=self.s['waist']
        # A clothed pelvis joins both trouser legs beneath the hem.
        trousers=[self.loft('trouser seat',[(.855,.19,.130,0,0),(.90,.211,.145,0,0),(.995,.207,.137,0,0),(1.025,.196,.128,0,0)],self.pants)]
        for side in [-1,1]:
            if self.seated:
                pts=[(side*.112,.97,-.010),(side*.128,.89,.17),(side*.137,.79,.36),(side*.140,.58,.50),(side*.145,.36,.60)]
                radii=[.126,.126,.105,.087,.069]
                leg=self.tube('seated trouser leg',pts,radii,self.pants,28,7)
            else:
                rings=[(.13,.069,.075,side*.157,.026),(.18,.071,.080,side*.159,.014),(.34,.079,.087,side*.157,-.006),(.53,.084,.092,side*.150,.018),(.60,.092,.100,side*.143,.012),(.79,.114,.122,side*.124,0),(.98,.119,.135,side*.108,0)]
                leg=self.loft('trouser leg',rings,self.pants)
            trousers.append(leg)
        trousers = union_sculpt(self.prefix+' / continuous tailored trousers',trousers,.005)
        sculpt_garment(self, trousers, 'trousers')
        # Slightly square torso sections and full shoulder cap form a wearable garment.
        torso=self.loft('outerwear body',[(.985,waist*.93,.131,0,0),(1.003,waist,.140,0,0),(1.055,waist*1.01,.141,0,0),(1.19,waist*.97,.143,0,-.003),(1.36,width*.91,.142,0,-.009),(1.455,width,.132,0,-.012),(1.49,width*.87,.115,0,-.011),(1.535,.101,.075,0,0)],self.cloth)
        sleeves=[torso]
        wrists=[]
        for side in [-1,1]:
            if self.seated:
                arm=[(side*.095,1.414,-.008),(side*(width-.018),1.414,.014),(side*(width+.040),1.345,.070),(side*(width+.048),1.21,.18),(side*.215,1.233,.32),(side*.164,1.265,.466)]
            else:
                # A relaxed bend and tapered cuffs, with no gaps at elbows or shoulders.
                arm=[(side*.095,1.414,-.007),(side*(width-.018),1.414,-.003),(side*(width+.037),1.347,.001),(side*(width+.055),1.21,.011),(side*(width+.037),1.095,.041),(side*(width+.015),1.005,.070)]
            sleeve=self.tube('continuous sleeve',arm,[.082,.096,.094,.078,.064,.057],self.cloth,28,6)
            sleeves.append(sleeve);wrists.append(arm[-1])
        garment = union_sculpt(self.prefix+' / continuous tailored jacket',sleeves,.0048)
        sculpt_garment(self, garment)
        # Ribbed cuffs and hem are separate intentional sewn boundaries.
        self.loft('hem band',[(.992,waist*.97,.137,0,0),(1.004,waist,.140,0,0),(1.031,waist*1.006,.141,0,0),(1.039,waist*.991,.138,0,0)],self.trim)
        for side,wrist in zip([-1,1],wrists):
            self.hand(side,wrist)
            if not self.seated:
                self.loft('knit cuff',[(.992,.059,.060,wrist[0],wrist[2]),(1.00,.060,.061,wrist[0],wrist[2]),(1.033,.061,.062,wrist[0],wrist[2]-.007)],self.trim)
            # Soft fabric creases echo the bent elbow and waist, never black outlines.
            if self.id in ['jensen','elon']:
                self.tube('zip pocket',[(side*.10,1.12,.139),(side*.14,1.17,.133),(side*.17,1.22,.124)],.0019,self.metal,8,5)
        self.tailoring()
        jacket_construction(self, wrists)
        for side in [-1,1]:
            self.foot(side)
        if not self.seated:
            self.root.scale.z=self.s['stature']

    def tailoring(self):
        if self.id in ['jensen','elon']:
            # Folded outerwear edges; the underlying torso is continuous so no
            # planar shirt polygon can protrude through the chest at grazing angles.
            if self.id=='jensen':
                # Jensen's jacket is a zip-front leather bomber with a compact collar.
                sewn_collar(self, leather=True)
            else:
                for side in [-1,1]:
                    pts=[(side*.068,1.525,.066),(side*.116,1.492,.105),(side*.086,1.443,.139),(side*.039,1.395,.148),(side*.042,1.475,.112)]
                    obj=mesh_object(self.prefix+' / folded jacket lapel',[self.p(p) for p in pts],[(0,1,2,3,4)],self.cloth,self.root)
                    mod=obj.modifiers.new('Lapel thickness','SOLIDIFY');mod.thickness=.004
                    mod=obj.modifiers.new('Turned lapel edge','BEVEL');mod.width=.005;mod.segments=3
            # Jensen's recognizable center zip, subtly offset for Elon's casual jacket.
            self.tube('front zip',[(0,1.006,.145),(0,1.18,.147),(0,1.34,.144),(0,1.45,.123),(0,1.50,.092)],.0022,self.metal,8,6)
            self.ell('zip pull',(0,1.456,.126),(.007,.012,.0025),self.metal)
            # Raglan seams follow shoulder anatomy and stop at the sleeve cap.
            for side in [-1,1]:
                self.tube('leather seam',[(side*.10,1.494,-.081),(side*.205,1.461,-.060),(side*(self.s['shoulders']+.035),1.40,.054)],.0015,self.dark,8,6)
        else:
            # A crewneck on Dario; Sam wears a soft collar with an open placket.
            if self.id=='dario':
                sewn_collar(self)
            else:
                for side in [-1,1]:
                    pts=[(side*.065,1.54,.062),(side*.096,1.505,.092),(side*.083,1.466,.129),(side*.037,1.480,.119)]
                    obj=mesh_object(self.prefix+' / soft shirt collar',[self.p(p) for p in pts],[(0,1,2,3)],self.cloth,self.root)
                    mod=obj.modifiers.new('Collar fold','SOLIDIFY');mod.thickness=.007
                    mod=obj.modifiers.new('Soft collar edge','BEVEL');mod.width=.007;mod.segments=3
                self.tube('shirt placket',[(0,1.006,.142),(0,1.25,.149),(0,1.465,.126)],.003,self.cloth,10)
                for yy in [1.09,1.22,1.35]:
                    self.ell('shirt button',(0,yy,.149),(.0034,.0034,.0018),self.dark)

    def hand(self,side,wrist):
        wx,wy,wz=wrist
        if self.seated:
            center=(wx,wy+.002,wz+.031)
            parts=[self.ell('hand palm',center,(.043,.035,.048),self.skin)]
            parts.append(self.ell('thumb base',(wx-side*.035,wy+.016,wz+.032),(.022,.025,.028),self.skin))
            for k in range(4):
                x=wx+(k-1.5)*.019
                parts.append(self.tube('curled steering finger',[(x,wy+.018,wz+.048),(x,wy+.006,wz+.073),(x,wy-.017,wz+.066)],[.010,.011,.008],self.skin,12,4))
        else:
            center=(wx,wy-.047,wz+.001)
            parts=[self.ell('hand palm',center,(.040,.057,.029),self.skin)]
            parts.append(self.ell('thumb base',(wx-side*.034,wy-.025,wz+.014),(.019,.031,.021),self.skin))
            for k in range(4):
                x=wx+(k-1.5)*.017
                parts.append(self.tube('relaxed finger',[(x,wy-.058,wz+.006),(x,wy-.089+(abs(k-1.5)*.004),wz+.011),(x,wy-.101+(abs(k-1.5)*.008),wz+.004)],[.0105,.0095,.006],self.skin,12,4))
        union_sculpt(self.prefix+' / natural '+('left' if side<0 else 'right')+' hand',parts,.0028)

    def foot(self,side):
        if self.seated:
            x,y,z=side*.145,.268,.672
        else:
            x,y,z=side*.158,0,.080
        # The shoe has a rounded heel, low vamp, toe box and continuous rubber welt.
        self.loft('shoe sole',[(y+.022,.086,.164,x,z+.015),(y+.029,.092,.172,x,z+.015),(y+.053,.092,.172,x,z+.015),(y+.061,.087,.166,x,z+.015)],self.sole)
        self.loft('shaped shoe',[(y+.051,.086,.163,x,z+.015),(y+.074,.087,.160,x,z+.010),(y+.104,.077,.145,x,z+.003),(y+.127,.071,.112,x,z-.016),(y+.153,.064,.073,x,z-.055)],self.shoes)
        if self.id!='elon':
            for k in range(4):
                zz=z+.002+k*.024;yy=y+.132-k*.007
                self.tube('cotton lace',[(x-.039,yy,zz),(x,yy+.003,zz-.003),(x+.039,yy,zz+.009)],.0025,self.sole,10,3)
        else:
            self.tube('boot toe seam',[(x-.073,y+.083,z+.1),(x,y+.109,z+.145),(x+.073,y+.083,z+.1)],.0015,self.dark,8)

    def build(self):
        self.body()
        body_parts=set(self.root.children)
        self.face()
        # A few degrees of head turn gives the lineup an individual, relaxed pose.
        # Apply directly to parts to keep the exported material batching compact.
        angle=math.radians({'dario':4,'sam':-5,'elon':3,'jensen':-4}[self.id]) if not self.seated else 0
        pivot=Vector(xyz((0,1.545+self.offset,0)))
        turn=Matrix.Translation(pivot) @ Matrix.Rotation(angle,4,'Z') @ Matrix.Translation(-pivot)
        for part in self.root.children:
            if part not in body_parts:
                part.matrix_basis=turn @ part.matrix_basis
        return self.root


def build_actors(context=None):
    """Called by build_racer_assets; returns all independently selectable roots."""
    actors=[]
    for ident in ['dario','sam','elon','jensen']:
        for seated in [False,True]:
            print('Building '+ident+' / '+('seated' if seated else 'standing'), flush=True)
            actor=Sculptor(ident,seated).build()
            actors.append(actor)
    return actors
