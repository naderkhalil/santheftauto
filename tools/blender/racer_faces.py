"""Reference-led founder heads using CC0 MakeHuman anatomy and named morphs.

Authored anatomical topology supplies the connected eyelids, nasal cartilage,
lip volumes, oral cavity and ears. Identity is shaped by explicit sculpt targets;
no photograph or facial decal is used. See art/third-party/makehuman provenance.
"""
import math
from pathlib import Path
from functools import lru_cache

TAU = math.tau

# Half widths, in metres. These are deliberately much smaller than the former
# 41--45 cm tall toy heads. Other wardrobe/body values stay in racer_characters.
FACE_SPECS = {'dario': {'head': 0.328, 'width': 0.112, 'depth': 0.111, 'brow': 0.0048, 'brow_color': '#41362c'},
 'sam': {'head': 0.333, 'width': 0.105, 'depth': 0.106, 'brow': 0.0037, 'brow_color': '#655143'},
 'elon': {'head': 0.319, 'width': 0.118, 'depth': 0.115, 'brow': 0.0041, 'brow_color': '#514136'},
 'jensen': {'head': 0.309, 'width': 0.114, 'depth': 0.107, 'brow': 0.0039, 'brow_color': '#55514a'},
 'mira': {'head': 0.321, 'width': 0.106, 'depth': 0.103, 'brow': 0.0046, 'brow_color': '#372e2b'},
 'feifei': {'head': 0.31, 'width': 0.109, 'depth': 0.104, 'brow': 0.0036, 'brow_color': '#48372d'},
 'mark': {'head': 0.331, 'width': 0.106, 'depth': 0.106, 'brow': 0.0036, 'brow_color': '#816349'}}

_LIP_COLOR = {'dario': '#b57f71',
 'sam': '#b7857a',
 'elon': '#ba867d',
 'jensen': '#a77969',
 'mira': '#af6d68',
 'feifei': '#ae796a',
 'mark': '#bb8b7e'}


def _clamp(x, lo=0., hi=1.):
    return max(lo, min(hi, x))


def _smooth(x):
    x = _clamp(x)
    return x*x*(3-2*x)


def _lerp(a, b, t):
    return a+(b-a)*t






# Weights are sculpt directions, not measurements inferred from an identity.
# Side-specific sculpt files are mirrored explicitly to preserve authored loops.
_MORPHS = {
    'dario': {
        'macrodetails/caucasian-male-young':.70,'macrodetails/caucasian-male-old':.30,
        'head/head-round':.20,'head/head-fat-incr':.12,
        'nose/nose-scale-depth-incr':.60,'nose/nose-hump-incr':.28,
        'nose/nose-scale-vert-incr':.30,'nose/nose-point-width-incr':.12,
        'nose/nose-width1-decr':.08,'nose/nose-point-down':.30,
        'nose/nose-nostrils-width-incr':.18,'chin/chin-width-incr':.12,
        'mouth/mouth-lowerlip-volume-incr':.25,'mouth/mouth-upperlip-volume-incr':.15,
        'mouth/mouth-angles-up':.12,'mouth/mouth-laugh-lines-in':.22,
        'both:cheek/cheek-volume-incr':.12,'both:eyes/eye-bag-incr':.25,
        'both:eyes/eye-eyefold-down':.16,
    },
    'sam': {
        'macrodetails/caucasian-male-young':.85,'macrodetails/caucasian-male-old':.15,
        'head/head-oval':.38,'head/head-fat-decr':.35,
        'both:cheek/cheek-inner-decr':.40,'both:cheek/cheek-bones-incr':.20,
        'chin/chin-prominent-incr':.20,'chin/chin-width-decr':.15,
        'nose/nose-scale-depth-incr':.35,'nose/nose-scale-vert-incr':.18,
        'nose/nose-width1-decr':.25,'nose/nose-point-width-decr':.20,
        'mouth/mouth-scale-horiz-incr':.17,'mouth/mouth-angles-up':.48,
        'mouth/mouth-lowerlip-height-incr':.16,'mouth/mouth-laugh-lines-in':.16,
        'both:eyes/eye-height1-incr':.28,'both:eyes/eye-height2-incr':.22,
    },
    'elon': {
        'macrodetails/caucasian-male-young':.65,'macrodetails/caucasian-male-old':.35,
        'head/head-square':.38,'head/head-fat-incr':.40,
        'chin/chin-width-incr':.40,'chin/chin-prominent-incr':.12,
        'both:cheek/cheek-volume-incr':.28,'both:cheek/cheek-inner-incr':.18,
        'nose/nose-scale-vert-decr':.15,'nose/nose-width2-incr':.20,
        'nose/nose-point-width-incr':.22,'nose/nose-point-up':.10,
        'both:eyes/eye-height1-decr':.18,'both:eyes/eye-height3-decr':.12,
        'mouth/mouth-upperlip-height-decr':.23,'mouth/mouth-lowerlip-volume-incr':.10,
        'mouth/mouth-angles-down':.09,'head/head-age-incr':.10,
    },
    'jensen': {
        'macrodetails/asian-male-young':.48,'macrodetails/asian-male-old':.52,
        'head/head-round':.17,'chin/chin-triangle':.16,'chin/chin-width-decr':.14,
        'both:cheek/cheek-bones-incr':.32,'both:cheek/cheek-volume-incr':.15,
        'both:eyes/eye-eyefold-down':.14,'both:eyes/eye-height1-decr':.14,
        'nose/nose-width1-incr':.15,'nose/nose-scale-horiz-incr':.20,
        'nose/nose-scale-vert-decr':.12,'nose/nose-point-width-incr':.16,
        'mouth/mouth-scale-horiz-incr':.18,'mouth/mouth-laugh-lines-in':.48,
        'mouth/mouth-angles-up':.74,
    },
    'mira': {
        'macrodetails/caucasian-female-young':1.,'head/head-oval':.28,
        'chin/chin-triangle':.13,'chin/chin-width-decr':.12,
        'nose/nose-scale-depth-incr':.40,'nose/nose-greek-incr':.26,
        'nose/nose-point-down':.10,'nose/nose-nostrils-width-decr':.10,
        'nose/nose-hump-incr':.07,'mouth/mouth-upperlip-volume-incr':.42,
        'mouth/mouth-lowerlip-volume-incr':.42,'mouth/mouth-cupidsbow-incr':.18,
        'both:eyes/eye-corner2-up':.12,'eyebrows/eyebrows-angle-up':.18,
    },
    'feifei': {
        'macrodetails/asian-female-young':.75,'macrodetails/asian-female-old':.25,
        'head/head-round':.13,'chin/chin-width-decr':.10,
        'both:cheek/cheek-bones-incr':.30,'both:eyes/eye-height2-incr':.10,
        'both:eyes/eye-epicanthus-in':.12,'nose/nose-width2-incr':.18,
        'nose/nose-scale-depth-decr':.07,'mouth/mouth-angles-up':.17,
        'mouth/mouth-upperlip-volume-incr':.14,'mouth/mouth-lowerlip-volume-incr':.20,
    },
    'mark': {
        'macrodetails/caucasian-male-young':.90,'macrodetails/caucasian-male-old':.10,
        'head/head-oval':.28,'head/head-fat-decr':.23,
        'chin/chin-height-incr':.27,'nose/nose-scale-vert-incr':.25,
        'nose/nose-scale-depth-incr':.25,'nose/nose-width1-decr':.15,
        'mouth/mouth-scale-horiz-incr':.20,'mouth/mouth-laugh-lines-in':.48,
        'mouth/mouth-angles-up':.92,'both:eyes/eye-height2-incr':.26,
        'both:eyes/eye-height1-incr':.25,'both:ears/ear-scale-incr':.24,
        'both:ears/ear-rot-forward':.14,
    },
}


def used_targets():
    """Exact reproducible source subset, also consumed by the provenance audit."""
    result=set()
    for weights in _MORPHS.values():
        for name in weights:
            if name.startswith('both:'):
                folder,stem=name[5:].split('/')
                result.update(folder+'/'+side+'-'+stem+'.target' for side in ('l','r'))
            else:result.add(name+'.target')
    return sorted(result)


def _source_root():
    root=Path(__file__).resolve().parents[2]/'art/third-party/makehuman'
    if not (root/'base.obj').is_file():
        raise FileNotFoundError('Missing documented CC0 anatomical source: '+str(root))
    return root


@lru_cache(maxsize=1)
def _base():
    verts=[];faces=[];groups={};group='body';uv=[];fuv=[]
    for line in (_source_root()/'base.obj').read_text().splitlines():
        fields=line.split()
        if not fields or fields[0].startswith('#'):continue
        if fields[0]=='v':verts.append(tuple(float(v) for v in fields[1:4]))
        elif fields[0]=='vt':uv.append(tuple(float(v) for v in fields[1:3]))
        elif fields[0]=='g':group=' '.join(fields[1:])
        elif fields[0]=='f':
            face=tuple(int(v.split('/')[0])-1 for v in fields[1:])
            groups.setdefault(group,[]).append(face)
            if group=='body':
                faces.append(face)
                fuv.append(tuple(int(v.split('/')[1])-1 for v in fields[1:]))
    return verts,faces,groups,uv,fuv


@lru_cache(maxsize=160)
def _target(name):
    path=_source_root()/'targets'/(name+'.target')
    values=[]
    for line in path.read_text().splitlines():
        fields=line.split()
        if fields and not fields[0].startswith('#'):
            values.append((int(fields[0]),tuple(float(v) for v in fields[1:4])))
    return values


def _shape(actor):
    base,faces,groups,_,_=_base()
    verts=[list(v) for v in base]
    for name,weight in _MORPHS[actor.id].items():
        if name.startswith('both:'):
            folder,stem=name[5:].split('/')
            names=[folder+'/'+side+'-'+stem for side in ('l','r')]
        else:names=[name]
        for target in names:
            for index,delta in _target(target):
                strength=weight
                if actor.id=='sam' and target=='mouth/mouth-angles-up':
                    strength*=1+.25*_clamp(base[index][0]/.3,-1,1)
                for k in range(3):verts[index][k]+=strength*delta[k]
    # Under-chin landmark and crown establish a stable attachment to the body.
    chin=verts[991][1]
    body_ids=set(i for f in faces for i in f)
    crown=max(verts[i][1] for i in body_ids)
    upper=[verts[i] for i in body_ids if base[i][1]>7.60]
    width=max(abs(p[0]) for p in upper)
    forehead=max(p[2] for p in upper)
    back=min(p[2] for p in upper)
    sy=actor.hh/(crown-chin)
    sx=actor.s['width']/width
    sz=actor.s['depth']/((forehead-back)*.5)
    zcenter=(forehead+back)*.5
    def map_point(v):
        x,y,z=v
        yy=actor.y0+(y-chin)*sy
        xx=x*sx;zz=(z-zcenter)*sz-.020
        # Bound the source trapezius/neck to the existing collar instead of
        # retaining its shoulder skirt. The lower jaw stays unchanged.
        below=_smooth((actor.y0-yy)/.023)
        rear=(1-_smooth((zz-.005)/.040))*_smooth((actor.y0+.040-yy)/.065)
        blend=max(below,rear)
        radial=math.sqrt((xx/.064)**2+((zz+.026)/.055)**2)
        if radial>1 and blend>0:
            xx=_lerp(xx,xx/radial,blend)
            zz=_lerp(zz,-.026+(zz+.026)/radial,blend)
        return (xx,yy,zz)
    mapped=[map_point(v) for v in verts]
    actor._human_original=verts
    actor._human_map=map_point
    actor._human_mapped=mapped
    return mapped,faces,groups,base


def _mat(name,color,roughness):
    import bpy
    old=bpy.data.materials.get(name)
    if old:return old
    material=bpy.data.materials.new(name);material.use_nodes=True
    color=tuple((int(color[i:i+2],16)/255)**2.2 for i in (1,3,5))
    material.diffuse_color=(*color,1)
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=roughness
    return material


def _mesh(actor,name,verts,faces,materials,mat_indices=None):
    import bpy
    mesh=bpy.data.meshes.new(actor.prefix+' / '+name)
    mesh.from_pydata([(x,-z,y+actor.offset) for x,y,z in verts],[],faces)
    mesh.update()
    obj=bpy.data.objects.new(actor.prefix+' / '+name,mesh)
    bpy.context.collection.objects.link(obj);obj.parent=actor.root
    for material in materials:mesh.materials.append(material)
    for i,poly in enumerate(mesh.polygons):
        poly.use_smooth=True
        if mat_indices:poly.material_index=mat_indices[i]
    return obj


def _tree(actor,obj):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    coords=[(p.co.x,p.co.z-actor.offset,-p.co.y) for p in obj.data.vertices]
    actor._human_tree=BVHTree.FromPolygons([Vector(v) for v in coords],
                                        [tuple(p.vertices) for p in obj.data.polygons],all_triangles=False)
    actor._human_profile={}


def _ray(actor,origin,direction):
    from mathutils import Vector
    return actor._human_tree.ray_cast(Vector(origin),Vector(direction),2.)[0]


def head_profile(actor,t):
    """Sample the actual morphed skull so fitted hair follows its anatomy."""
    if not hasattr(actor,'_human_tree'):
        wave=math.sqrt(max(.00001,1-(2*t-1)**2))
        return actor.s['width']*wave,actor.s['depth']*wave,-.020
    key=round(t,5)
    if key in actor._human_profile:return actor._human_profile[key]
    y=actor.y0+actor.hh*_clamp(t,.001,.998)
    fp=_ray(actor,(0,y,1),(0,0,-1));bp=_ray(actor,(0,y,-1),(0,0,1))
    if fp is None or bp is None:
        return .001,.001,-.020
    center=(fp.z+bp.z)*.5
    side=_ray(actor,(1,y,center),(-1,0,0))
    width=side.x if side else .001
    result=(max(.001,width),max(.001,(fp.z-bp.z)*.5),center)
    actor._human_profile[key]=result
    return result


def front(actor,x,t):
    if hasattr(actor,'_human_tree'):
        hit=_ray(actor,(x,actor.y0+actor.hh*_clamp(t,.001,.998),1),(0,0,-1))
        if hit is not None:return hit.z
    w,d,c=head_profile(actor,t)
    return c+d*math.sqrt(max(0,1-(x/max(w,.001))**2))


def _orbital_eyes(actor,groups,mapped):
    """Fitted convex globes use the morphed source's eye-helper bounds."""
    eye_data=[]
    for side,name in [(-1,'helper-r-eye'),(1,'helper-l-eye')]:
        ids=set(i for face in groups[name] for i in face)
        points=[mapped[i] for i in ids]
        lo=[min(p[k] for p in points) for k in range(3)]
        hi=[max(p[k] for p in points) for k in range(3)]
        center=[(a+b)*.5 for a,b in zip(lo,hi)]
        radius=[(b-a)*.5 for a,b in zip(lo,hi)]
        actor.ell('fitted orbital globe '+str(side),center,radius,actor.whites)
        eye_data.append((side,center,radius))
        shader=actor.iris.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Specular IOR Level'].default_value=.15
        limbal=_mat(actor.id+' / limbal ring','#303c3c',.32)
        for title,size,lift,material in [('limbal ring',.49,.00012,limbal),
                                         ('living iris',.445,.00025,actor.iris),
                                         ('round pupil',.19,.00038,actor.black)]:
            verts=[];faces=[];n=64
            for r in (1.,.75,.50,.25):
                for i in range(n):
                    angle=TAU*i/n
                    x=center[0]+radius[0]*size*r*math.cos(angle)
                    y=center[1]+radius[1]*size*r*math.sin(angle)
                    z=center[2]+radius[2]*math.sqrt(max(0,1-(size*r)**2))+lift
                    verts.append((x,y,z))
            for k in range(3):
                for i in range(n):faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
            middle=len(verts);verts.append((center[0],center[1],center[2]+radius[2]+lift))
            for i in range(n):faces.append((3*n+i,3*n+(i+1)%n,middle))
            _mesh(actor,title+' '+str(side),verts,faces,[material])
    actor._human_eyes=eye_data


def _brows_and_spectacles(actor):
    s=actor.s
    brows=_mat(actor.id+' / natural shaped brows',s['brow_color'],.82)
    for side,center,radii in actor._human_eyes:
        # Surface-following hair strips sit over the original sculpted brow ridge.
        verts=[];faces=[]
        for i in range(33):
            u=i/32
            x=center[0]+side*radii[0]*(-.86+2.14*u)
            y=center[1]+radii[1]*1.25+.005*math.sin(math.pi*u)-.004*u
            if actor.id in ('mira','feifei'):y+=.003*math.sin(math.pi*u)
            thick=1.5*s['brow']*(.22+.78*math.sin(math.pi*u)**.65)*(1-.55*u)
            for k in range(5):
                r=k/4;yy=y+(r-.5)*thick
                z=front(actor,x,(yy-actor.y0)/actor.hh)+.00035+.0006*math.sin(math.pi*r)
                verts.append((x,yy,z))
        for i in range(32):
            for k in range(4):faces.append((i*5+k,i*5+k+1,(i+1)*5+k+1,(i+1)*5+k))
        _mesh(actor,'tapered eyebrow '+str(side),verts,faces,[brows])
    if actor.id not in ('dario','jensen'):return
    frame=_mat(actor.id+' / optical frames','#263541' if actor.id=='dario' else '#33342e',.35)
    rz=max(front(actor,0,(c[1]-actor.y0)/actor.hh) for _,c,_ in actor._human_eyes)+.009
    rx=.036 if actor.id=='dario' else .034
    ry=.023 if actor.id=='dario' else .018
    thick=.0025 if actor.id=='dario' else .0014
    bridges=[]
    for side,center,radii in actor._human_eyes:
        cx,cy=center[:2];points=[]
        for i in range(65):
            angle=TAU*i/64
            x=cx+rx*math.copysign(abs(math.cos(angle))**.65,math.cos(angle))
            y=cy+.002+ry*math.copysign(abs(math.sin(angle))**.75,math.sin(angle))
            points.append((x,y,rz-.08*abs(x)))
        actor.tube('sculpted optical rim',points,thick,frame,10,1)
        actor.tube('spectacle temple',[(cx+side*rx,cy+.012,rz-.008),
                                      (side*s['width']*1.03,cy+.010,.024),
                                      (side*s['width']*1.03,cy-.002,-.025)],thick*.85,frame,8,3)
        bridges.append((cx-side*rx,cy+.009,rz))
    actor.tube('spectacle bridge',[bridges[0],(0,sum(p[1] for p in bridges)*.5+.004,rz+.003),bridges[1]],thick*.8,frame,8,3)


def _lip_tint(actor,source):
    """Soft tint inside the actual hm08 upper/lower vermilion contours.

    These are source-space anatomical landmarks, so deformation carries the
    tint with the lips. It is interpolated on real mesh vertices, never a
    floating decal or a polygon material cut across the cupid's bow.
    """
    x,y,z=source;x=abs(x)
    if x>.250 or y<6.47 or y>6.745 or z<1.40:return (1.,1.,1.,1.)
    def line(points,value):
        for a,b in zip(points,points[1:]):
            if value<=b[0]:return _lerp(a[1],b[1],_clamp((value-a[0])/(b[0]-a[0])))
        return points[-1][1]
    upper=line([(0,6.696),(.0224,6.6983),(.0515,6.7093),(.080,6.7186),
                (.109,6.7162),(.144,6.7052),(.179,6.687),(.211,6.667),
                (.234,6.636),(.250,6.612)],x)
    lower=line([(0,6.4885),(.0571,6.4953),(.1296,6.5135),(.1865,6.5429),
                (.228,6.5663),(.250,6.612)],x)
    weight=_smooth((upper-y+.012)/.026)*_smooth((y-lower+.012)/.026)
    weight*=(1-_smooth((x-.223)/.027))
    base=[(int(actor.s['skin'][i:i+2],16)/255)**2.2 for i in (1,3,5)]
    tint=[(int(_LIP_COLOR[actor.id][i:i+2],16)/255)**2.2 for i in (1,3,5)]
    return (*[_lerp(1,b/max(a,.001),weight*.86) for a,b in zip(base,tint)],1.)


def _complexion_material(actor,skin):
    import bpy
    name=actor.id+' / anatomical skin with vermilion'
    existing=bpy.data.materials.get(name)
    if existing:return existing
    material=skin.copy();material.name=name
    nodes=material.node_tree.nodes;links=material.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    source=bsdf.inputs['Base Color'].links[0].from_socket
    color=nodes.new('ShaderNodeVertexColor');color.layer_name='Vermilion'
    # Blender 4.5's glTF material walker recognizes the RGBA Mix node, but not
    # legacy MixRGB. The latter silently exports white COLOR_0 + real COLOR_1.
    mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY'
    mix.inputs[0].default_value=1.
    links.new(source,mix.inputs[6]);links.new(color.outputs['Color'],mix.inputs[7])
    links.new(mix.outputs[2],bsdf.inputs['Base Color'])
    return material


def build_face(actor):
    """Crop and map authored anatomy, preserving its real facial edge loops."""
    import bpy
    import bmesh
    from racer_skin import build_skin_material
    mapped,faces,groups,base=_shape(actor)
    kept=[f for f in faces if all(mapped[i][1]>1.445 for i in f)]
    used=sorted(set(i for f in kept for i in f));index={v:i for i,v in enumerate(used)}
    skin=_complexion_material(actor,build_skin_material(actor.id,actor.s['skin']))
    obj=_mesh(actor,'authored anatomical face',[mapped[i] for i in used],
              [tuple(index[i] for i in f) for f in kept],[skin])
    tint=obj.data.color_attributes.new(name='Vermilion',type='FLOAT_COLOR',domain='POINT')
    obj.data.color_attributes.active_color_index=0
    obj.data.color_attributes.render_color_index=0
    for i,source_index in enumerate(used):tint.data[i].color=_lip_tint(actor,base[source_index])
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    # One subdivision refines the existing authored loops; no voxel remeshing.
    sub=obj.modifiers.new('Refined anatomical edge loops','SUBSURF');sub.levels=1
    bpy.ops.object.modifier_apply(modifier=sub.name)
    # A precise collar cut leaves the original skull, oral cavity and ears intact.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          dist=.00001,plane_co=(0,0,1.535+actor.offset),plane_no=(0,0,1),clear_inner=True)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    uv=obj.data.uv_layers.new(name='Anatomical UV')
    for poly in obj.data.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:
            co=obj.data.vertices[obj.data.loops[li].vertex_index].co
            x,y,z=co.x,co.z-actor.offset,-co.y
            t=(y-actor.y0)/actor.hh
            uv.data[li].uv=(.5+math.atan2(x,z+.020)/TAU,t)
    obj['anatomy_source']='MakeHuman hm08; CC0; named anatomical morph targets'
    obj['head_height_m']=actor.hh
    obj['morph_targets']=str(_MORPHS[actor.id])
    _tree(actor,obj)
    _orbital_eyes(actor,groups,mapped)
    _brows_and_spectacles(actor)
    actor.loft('fitted anatomical neck',[(1.485,.070,.063,0,-.022),
                                         (1.530,.063,.056,0,-.025),
                                         (1.565,.052,.050,0,-.026),
                                         (1.588,.047,.046,0,-.025)],actor.skin,subdivision=1)
    return obj
