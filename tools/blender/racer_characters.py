"""Stylized founder sculptures, authored in Blender for the playable kit.

The geometry is designed at character-select distance: continuous body silhouettes,
sculpted faces, shaped hair masses and actual tailored clothing. Coordinates use the
racer's Y-up / +Z-forward system; no photographs or screen-facing billboards.
Anatomical heads derive from the vendored CC0 MakeHuman base and facial targets.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from racer_materials import build_character_materials
from racer_surfaces import sculpt_garment, jacket_construction, sewn_collar
from racer_faces import FACE_SPECS, build_face, head_profile as facial_profile, front as facial_front
from racer_hair import build_hair

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


SPECS = {
    'dario': dict(skin='#d8ae91', hair='#382c25', cloth='#324b60', pants='#555754', shoe='#e8e3d6',
                  stature=1.025, shoulders=.247, waist=.199, eye='#58636a'),
    'sam': dict(skin='#d8b499', hair='#625044', cloth='#a5a79c', pants='#344352', shoe='#e9e5dc',
                stature=1.0, shoulders=.240, waist=.185, eye='#637369'),
    'elon': dict(skin='#deb49c', hair='#40332c', cloth='#262c32', pants='#32363b', shoe='#333438',
                 stature=1.04, shoulders=.280, waist=.233, eye='#60787e'),
    'jensen': dict(skin='#c59a7a', hair='#bac1bf', cloth='#252b2e', pants='#303b44', shoe='#ece8df',
                   stature=.967, shoulders=.246, waist=.205, eye='#3d3933'),
    'mira': dict(skin='#d4a58d', hair='#2a1c19', cloth='#34353a', pants='#34333a', shoe='#292629',
                 stature=.975, shoulders=.220, waist=.174, eye='#4b3427'),
    'feifei': dict(skin='#d8b091', hair='#211b1a', cloth='#3d6379', pants='#313c48', shoe='#27252a',
                   stature=.960, shoulders=.224, waist=.181, eye='#302821'),
    'mark': dict(skin='#d9ac94', hair='#70523e', cloth='#51514d', pants='#39414b', shoe='#e3dfd4',
                 stature=1.005, shoulders=.244, waist=.195, eye='#798889'),
}


class Sculptor:
    def __init__(self, ident, seated):
        self.id, self.seated = ident, seated
        self.s = {**SPECS[ident], **FACE_SPECS[ident]}
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
        return facial_profile(self, t)

    def front(self, x, t):
        return facial_front(self, x, t)

    def face(self):
        build_face(self)
        self.hairstyle()

    def hairstyle(self):
        build_hair(self)

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
        if self.id in ['mira', 'feifei']:
            # Soft suiting with an ivory inner top and turned, notched lapels.
            # The front follows the sculpted torso rather than a floating plane.
            rings=[(1.018,.060,.141),(1.12,.055,.143),(1.30,.053,.141),
                   (1.43,.063,.133),(1.50,.070,.099),(1.535,.065,.077)]
            verts=[];faces=[];segments=12
            for y,w,d in rings:
                torso_width=interp([(1.018,self.s['waist']), (1.36,self.s['shoulders']*.91),
                                    (1.49,self.s['shoulders']*.87),(1.535,.101)],y)
                for k in range(segments+1):
                    x=w*(2*k/segments-1)
                    z=d*math.sqrt(max(0,1-(x/torso_width)**2))+.007
                    verts.append(self.p((x,y,z)))
            for row in range(len(rings)-1):
                for k in range(segments):
                    a=row*(segments+1)+k
                    faces.append((a,a+1,a+segments+2,a+segments+1))
            mesh_object(self.prefix+' / ivory inner top',verts,faces,self.tee,self.root)
            for side in [-1,1]:
                points=[(side*.065,1.534,.069),(side*.107,1.505,.097),
                        (side*.086,1.463,.131),(side*.124,1.441,.125),
                        (side*.055,1.29,.148),(side*.046,1.32,.152)]
                obj=mesh_object(self.prefix+' / tailored blazer lapel',[self.p(p) for p in points],
                                [(0,1,2,5),(2,3,4,5)],self.cloth,self.root)
                mod=obj.modifiers.new('Turned lapel thickness','SOLIDIFY');mod.thickness=.004
                mod=obj.modifiers.new('Soft tailored edges','BEVEL');mod.width=.0025;mod.segments=3
                self.tube('blazer pocket welt',[(side*.113,1.14,.137),(side*.186,1.147,.100)],.0026,self.trim,8,3)
            for y in [1.10,1.22]:
                self.ell('matte blazer button',(.061,y,.148),(.0045,.0045,.002),self.dark)
            return
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
            if self.id in ['dario','mark']:
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
        angle=math.radians({'dario':3,'sam':-3,'elon':2,'jensen':-3,'mira':-2,'feifei':3,'mark':-2}[self.id]) if not self.seated else 0
        pivot=Vector(xyz((0,1.545+self.offset,0)))
        turn=Matrix.Translation(pivot) @ Matrix.Rotation(angle,4,'Z') @ Matrix.Translation(-pivot)
        for part in self.root.children:
            if part not in body_parts:
                part.matrix_basis=turn @ part.matrix_basis
        return self.root


def build_actors(context=None):
    """Called by build_racer_assets; returns all independently selectable roots."""
    actors=[]
    for ident in SPECS:
        for seated in [False,True]:
            print('Building '+ident+' / '+('seated' if seated else 'standing'), flush=True)
            actor=Sculptor(ident,seated).build()
            actors.append(actor)
    return actors
