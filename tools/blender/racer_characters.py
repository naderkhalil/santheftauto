"""Original stylized founder sculptures, authored in Blender for the playable kit.

The geometry is designed at character-select distance: continuous body silhouettes,
sculpted faces, shaped hair masses and actual tailored clothing. Coordinates use the
racer's Y-up / +Z-forward system; no photographs or screen-facing billboards.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

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
                  width=.140, jaw=.111, depth=.128, head=.447, nose=.063, brow=.008, stature=1.025,
                  shoulders=.247, waist=.199, eye='#58636a'),
    'sam': dict(skin='#d8b499', hair='#625044', cloth='#a5a79c', pants='#344352', shoe='#e9e5dc',
                width=.143, jaw=.103, depth=.120, head=.432, nose=.054, brow=.0065, stature=1.0,
                shoulders=.240, waist=.185, eye='#637369'),
    'elon': dict(skin='#deb49c', hair='#40332c', cloth='#262c32', pants='#32363b', shoe='#333438',
                 width=.164, jaw=.138, depth=.137, head=.426, nose=.041, brow=.007, stature=1.04,
                 shoulders=.280, waist=.233, eye='#60787e'),
    'jensen': dict(skin='#c59a7a', hair='#bac1bf', cloth='#252b2e', pants='#303b44', shoe='#ece8df',
                   width=.153, jaw=.112, depth=.118, head=.395, nose=.030, brow=.006, stature=.967,
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
        self.cloth = material(ident+' / tailored outerwear', self.s['cloth'], .59 if ident=='jensen' else .83)
        if ident=='jensen':
            p=self.cloth.node_tree.nodes.get('Principled BSDF')
            p.inputs['Coat Weight'].default_value=.03
            p.inputs['Specular IOR Level'].default_value=.29
            p.inputs['Coat Roughness'].default_value=.52
        self.pants = material(ident+' / woven trousers', self.s['pants'], .9)
        self.shoes = material(ident+' / shoe leather', self.s['shoe'], .55)
        self.sole = material(ident+' / sole rubber', '#bfbdb3' if ident!='elon' else '#24272a', .87)
        self.tee = material(ident+' / cotton tee', '#e1d9c7' if ident in ['dario','sam'] else '#343739', .9)
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

    def head_profile(self,t):
        w=self.s['width'];j=self.s['jaw'];d=self.s['depth']
        if self.id=='sam':
            wp=[(0,.012),(.07,j*.59),(.18,j),(.36,w*.92),(.55,w*.96),(.74,w),(.84,w*.91),(.95,w*.54),(1,.001)]
        elif self.id=='elon':
            wp=[(0,.014),(.07,j*.72),(.19,j),(.35,w*.99),(.49,w),(.69,w*.96),(.84,w*.90),(.96,w*.50),(1,.001)]
        elif self.id=='jensen':
            wp=[(0,.010),(.07,j*.64),(.20,j),(.39,w),(.53,w*.99),(.70,w*.94),(.84,w*.86),(.96,w*.47),(1,.001)]
        else:
            wp=[(0,.010),(.07,j*.62),(.18,j),(.34,w*.95),(.52,w),(.71,w*.98),(.84,w*.91),(.95,w*.56),(1,.001)]
        width=interp(wp,t)
        depth=interp([(0,.015),(.10,d*.67),(.24,d*.91),(.46,d),(.7,d*.98),(.86,d*.87),(.95,d*.54),(1,.001)],t)
        center=interp([(0,.016),(.28,0),(.62,-.01),(1,-.026)],t)
        return width,depth,center

    def front(self,x,t):
        w,d,center=self.head_profile(t)
        base=d*math.sqrt(max(.002,1-(x/max(w,.001))**2))+center
        # Nose bridge and tip are displaced from the head itself, not attached balls.
        tip_width=.030 if self.id in ['jensen','elon'] else .022
        base+=self.s['nose']*(.77*gauss(t,.436,.063)*gauss(x,0,tip_width)+.65*gauss(t,.542,.147)*gauss(x,0,.017))
        base+=.010*gauss(t,.417,.028)*(gauss(x,.021,.012)+gauss(x,-.021,.012))
        # Cheek plane, orbicular depressions, brow and nasolabial volume.
        for side in [-1,1]:
            base+=(.011 if self.id=='jensen' else .007)*gauss(t,.44,.10)*gauss(x,side*.088,.043)
            base-=.0095*gauss(t,.593,.049)*gauss(x,side*.067,.038)
            base+=.008*gauss(t,.664,.038)*gauss(x,side*.064,.049)
        base+=.006*gauss(t,.27,.075)*gauss(x,0,.055)
        base+=.009*gauss(t,.14,.064)*gauss(x,0,.065)
        return base

    def face(self):
        verts,faces=[],[]
        n,m=96,72
        for j in range(m+1):
            t=.0005+j/m*.999
            y=self.y0+t*self.hh
            w,d,c=self.head_profile(t)
            for i in range(n):
                a=TAU*i/n;x=w*math.sin(a);z=c+d*math.cos(a)
                if math.cos(a)>0:
                    z=self.front(x,t)
                verts.append(self.p((x,y,z)))
        for j in range(m):
            for i in range(n):
                a=j*n+i;b=j*n+(i+1)%n
                faces.append((a,b,b+n,a+n))
        faces.extend([tuple(reversed(range(n))),tuple(m*n+i for i in range(n))])
        head=mesh_object(self.prefix+' / integrated facial sculpt',verts,faces,self.skin,self.root)
        # A single face surface carries soft pigmentation and Dario's close stubble.
        face_mat=self.skin.copy();face_mat.name=self.id+' / skin with subtle complexion'
        node=face_mat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Complexion'
        face_mat.node_tree.links.new(node.outputs['Color'],face_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        head.data.materials[0]=face_mat
        attr=head.data.color_attributes.new(name='Complexion',type='FLOAT_COLOR',domain='POINT')
        base=rgb(self.s['skin']);flush=rgb('#c2947f' if self.id!='jensen' else '#b1876c');stubble=rgb('#786c61')
        for i,p in enumerate(verts):
            x,y,z=p;t=(y-self.offset-self.y0)/self.hh
            front=max(0,min(1,(z+.02)/.12))
            blush=.22*front*(gauss(x,-.090,.040)+gauss(x,.090,.040))*gauss(t,.45,.10)
            color=[v*(1-blush)+f*blush for v,f in zip(base,flush)]
            if self.id=='dario':
                beard=.47*front*gauss(t,.19,.19)*(1-.8*gauss(x,0,.040)*gauss(t,.27,.070))
                color=[v*(1-beard)+f*beard for v,f in zip(color,stubble)]
            attr.data[i].color=(*color,1)
        self.loft('neck',[(1.485,.072,.070,0,-.008),(1.54,.075,.073,0,-.006),(1.64,.074,.070,0,.003)],self.skin)
        # Small ears, with a folded helix rather than pink spheres beside the face.
        for side in [-1,1]:
            ex=side*(self.s['width']*.97)
            self.ell('ear', (ex,self.y0+self.hh*.54,-.012),(.022,.048,.024),self.skin)
            self.tube('ear concha',[(ex+side*.015,self.y0+self.hh*.59,.006),(ex+side*.020,self.y0+self.hh*.54,.010),(ex+side*.010,self.y0+self.hh*.49,.011)], [.004,.005,.0025],self.shadow_skin)
        self.eyes()
        self.mouth()
        self.hairstyle()

    def patch(self,name,coords,mat):
        # Boundary plus a slightly convex center, suitable for facial patches.
        cx=sum(p[0] for p in coords)/len(coords);cy=sum(p[1] for p in coords)/len(coords)
        center=(cx,cy,self.front(cx,(cy-self.y0)/self.hh)+.0038)
        verts=[self.p(center),*[self.p(p) for p in coords]]
        faces=[(0,i+1,(i+1)%len(coords)+1) for i in range(len(coords))]
        return mesh_object(self.prefix+' / '+name,verts,faces,mat,self.root)

    def eyes(self):
        eye_t=.587 if self.id=='jensen' else .594
        for side in [-1,1]:
            cx=side*.066;cy=self.y0+self.hh*eye_t
            ew={'dario':.030,'sam':.032,'elon':.028,'jensen':.030}[self.id];eh={'dario':.010,'sam':.0105,'elon':.0085,'jensen':.0068}[self.id]
            coords=[]
            for i in range(48):
                a=TAU*i/48;x=cx+ew*math.cos(a);y=cy+eh*math.sin(a)*(abs(math.sin(a))**.25)+(side*(x-cx)*.10 if self.id=='jensen' else 0)
                coords.append((x,y,self.front(x,(y-self.y0)/self.hh)+.0020))
            self.patch('almond eye',coords,self.whites)
            z=self.front(cx,eye_t)+.005
            self.ell('iris',(cx,cy+.0004,z),(.0070,.0078,.0022),self.iris)
            self.ell('pupil',(cx,cy+.0004,z+.002),(.0033,.0044,.0014),self.black)
            self.ell('eye catchlight',(cx-.0017,cy+.0033,z+.0035),(.0014,.0014,.0008),self.whites)
            for upper in [True,False]:
                pts=[]
                for i in range(17):
                    a=math.pi*i/16+(0 if upper else math.pi)
                    x=cx+ew*math.cos(a);y=cy+eh*math.sin(a)*(abs(math.sin(a))**.25)+(side*(x-cx)*.10 if self.id=='jensen' else 0)
                    pts.append((x,y,self.front(x,(y-self.y0)/self.hh)+.003))
                self.tube('upper eyelid' if upper else 'lower eyelid',pts,[.0012]+[.0028 if upper else .0019]*15+[.0012],self.shadow_skin if upper else self.skin,10,2)
            # Brows are low, tapered shapes with individual expression and arch.
            pts=[]
            for i in range(6):
                u=i/5;x=side*(.031+.072*u)
                y=cy+.035+.006*math.sin(u*math.pi)-.010*u
                if self.id=='sam':y+=.006*(1-u) if side<0 else 0
                pts.append((x,y,self.front(x,(y-self.y0)/self.hh)+.003))
            self.tube('tapered eyebrow',pts,[.003,.0045,self.s['brow']*.65,.004,.003,.0009],self.hair,12,4)
        # Tiny nostril grooves under the continuous nose.
        for side in [-1,1]:
            x=side*.017;t=.423;y=self.y0+self.hh*t
            self.ell('nostril',(x,y,self.front(x,t)+.0008),(.0060,.0021,.0015),self.shadow_skin)
        if self.id=='jensen':
            for side in [-1,1]:
                cx=side*.067;cy=self.y0+self.hh*.597
                points=[]
                for i in range(49):
                    a=TAU*i/48
                    # Soft rectangular acetate frame, not round comic goggles.
                    x=cx+.047*math.copysign(abs(math.cos(a))**.6,math.cos(a))
                    y=cy+.027*math.copysign(abs(math.sin(a))**.7,math.sin(a))
                    points.append((x,y,.135))
                self.tube('rectangular glasses',points,.0035,self.dark,10,2)
                self.tube('glasses temple',[(side*.113,cy+.008,.135),(side*.151,cy+.010,.09),(side*.156,cy+.006,-.01)],.003,self.dark,10)
            self.tube('glasses bridge',[(-.019,self.y0+self.hh*.614,.136),(0,self.y0+self.hh*.624,.144),(.019,self.y0+self.hh*.614,.136)],.0025,self.dark,10)

    def mouth(self):
        y=self.y0+self.hh*.272
        width={'dario':.045,'sam':.053,'elon':.047,'jensen':.042}[self.id]
        pts=[]
        for i in range(17):
            u=i/16;x=(u*2-1)*width
            yy=y+(.009 if self.id=='sam' else .0045)*(2*u-1)**2
            if self.id=='sam':yy+=.004*(u-.5)
            pts.append((x,yy,self.front(x,(yy-self.y0)/self.hh)+.002))
        # A relaxed closed mouth: two soft lip planes and a fine central crease.
        for upper in [True,False]:
            outline=[]
            for i,p in enumerate(pts):
                u=i/16;lip_h=math.sin(math.pi*u)*(.0036 if upper else -.005)
                if upper:lip_h*=.82+.18*math.cos(u*4*math.pi)
                yy=p[1]+lip_h
                outline.append((p[0],yy,self.front(p[0],(yy-self.y0)/self.hh)+.003))
            outline.extend(reversed(pts))
            self.patch('upper lip' if upper else 'lower lip',outline,self.lips)
        self.tube('mouth crease',pts,[.0007]+[.0012]*15+[.0007],self.shadow_skin,8,2)

    def hairstyle(self):
        verts,faces=[],[]
        n,m=96,26
        for j in range(m+1):
            u=j/m
            for i in range(n):
                a=TAU*i/n;front=max(0,math.cos(a));back=max(0,-math.cos(a))
                base=.60+.19*front-.14*back
                base+=.010*math.sin(a*9+.4)*front
                if self.id=='dario':base+=.022*math.sin(a*15)*front
                if self.id=='elon':base+=.050*front-.050*front**14+.028*gauss(abs(math.sin(a)),.7,.15)*front
                if self.id=='sam':base+=.039*math.sin(a)*front-.025*gauss(a,.28,.3)
                if self.id=='jensen':base+=.045*front-.030*front**12
                t=base+(1-base)*u
                w,d,c=self.head_profile(t)
                lift=math.sin(math.pi*(u*.92+.05))
                if self.id=='dario':
                    ripple=(.5+.5*math.sin(a*13+u*18)*math.sin(a*9-u*22))
                    volume=(.003+.015*ripple)*(math.sin(math.pi*u)**.65)
                    top_lift=(.015+.005*math.sin(a*7+u*18))*math.sin(math.pi*u)
                else:
                    volume=(.005+.0025*math.sin(a*12+u*18))*math.sin(math.pi*u)
                    top_lift=(.010 if self.id=='sam' else .004)*math.sin(math.pi*u)
                x=(w+volume*(1-u**12))*math.sin(a)
                z=c+(d+volume*(1-u**12))*math.cos(a)
                y=self.y0+self.hh*t+top_lift
                verts.append(self.p((x,y,z)))
        for j in range(m):
            for i in range(n):
                a=j*n+i;b=j*n+(i+1)%n
                faces.append((a,b,b+n,a+n))
        faces.append(tuple(m*n+i for i in range(n)))
        hair=mesh_object(self.prefix+' / '+('sculpted curls' if self.id=='dario' else 'swept hair cap'),verts,faces,self.hair,self.root)
        mod=hair.modifiers.new('Hair shell','SOLIDIFY');mod.thickness=.0025
        # Swept flow is expressed by shallow sculpted surface ridges, with no
        # free-standing strands or bright wire shapes on top of the head.

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
        union_sculpt(self.prefix+' / continuous tailored trousers',trousers,.005)
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
        union_sculpt(self.prefix+' / continuous tailored jacket',sleeves,.0048)
        # Ribbed cuffs and hem are separate intentional sewn boundaries.
        self.loft('hem band',[(.992,waist*.97,.137,0,0),(1.004,waist,.140,0,0),(1.031,waist*1.006,.141,0,0),(1.039,waist*.991,.138,0,0)],self.cloth)
        for side,wrist in zip([-1,1],wrists):
            self.hand(side,wrist)
            if not self.seated:
                self.loft('knit cuff',[(.992,.059,.060,wrist[0],wrist[2]),(1.00,.060,.061,wrist[0],wrist[2]),(1.033,.061,.062,wrist[0],wrist[2]-.007)],self.cloth)
            # Soft fabric creases echo the bent elbow and waist, never black outlines.
            if self.id in ['jensen','elon']:
                self.tube('zip pocket',[(side*.10,1.12,.139),(side*.14,1.17,.133),(side*.17,1.22,.124)],.0019,self.metal,8,5)
        self.tailoring()
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
                for side in [-1,1]:
                    pts=[]
                    for i in range(17):
                        a=(-math.pi*.08+i/16*math.pi*.99)*side
                        pts.append((math.sin(a)*.086,1.525+.008*math.cos(a),math.cos(a)*.076))
                    self.tube('standing leather collar',pts,.011,self.cloth,16,3)
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
                pts=[]
                for i in range(33):
                    a=TAU*i/32
                    pts.append((math.cos(a)*.091,1.528+.008*math.sin(a),math.sin(a)*.075))
                self.tube('rib knit collar',pts,.008,self.cloth,16,3)
                self.tube('tee collar glimpse',[(-.069,1.537,.035),(0,1.522,.073),(.069,1.537,.035)],.005,self.tee,12)
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
            actor=Sculptor(ident,seated).build()
            actors.append(actor)
    return actors
