"""Author Union Square art assets in Blender. Blender 4.5+, no external dependencies.
Run: blender --background --python tools/blender/create_plaza.py
Original geometry; photographic proportions are reference-informed, compressed for game.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/plaza'; OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'art/blender'; SRC.mkdir(parents=True,exist_ok=True)
random.seed(22031903)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)


def mat(name,hex,rough=.72,metal=0):
    rgb=[int(hex[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF'); n.inputs['Base Color'].default_value=(*rgb,1)
    n.inputs['Roughness'].default_value=rough; n.inputs['Metallic'].default_value=metal
    return m
stone=mat('Dewey / pale Sierra granite','dfdcd0',.78)
stoneShade=mat('Dewey / cut stone shadow','b6b2a8',.82)
bronze=mat('Victory / weathered green bronze','4d826f',.56,.54)
bronzeLight=mat('Victory / polished edges','789687',.38,.67)
bark=mat('Date palm / warm fibrous bark','9a7656',.91)
barkShade=mat('Date palm / old diamond leaf scars','846b50',.94)
leafMats=[mat('Date palm / fronds '+str(i),c,.61) for i,c in enumerate(['528447','648e43','789747','376d42'])]
for m in leafMats: m.use_backface_culling=False


def mesh(name,verts,faces,material,smooth=False):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); ob.data.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth=True
    return ob


def uv(name,p,scale,material,segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=p)
    ob=bpy.context.object;ob.name=name;ob.scale=scale;ob.data.materials.append(material)
    for q in ob.data.polygons:q.use_smooth=True
    return ob


def cube(name,p,size,material,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p); ob=bpy.context.object; ob.name=name; ob.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); ob.data.materials.append(material)
    if bevel:
        mod=ob.modifiers.new('Dressed stone rounded edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def lathe(name,profile,material,n=48,folds=0):
    vs=[];fs=[]
    for i,(z,r) in enumerate(profile):
        for j in range(n):
            a=j*math.tau/n;rr=r*(1+folds*math.cos(a*14+i*.13));vs.append((math.cos(a)*rr,math.sin(a)*rr,z))
    for i in range(len(profile)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(range(n-1,-1,-1)));fs.append(tuple((len(profile)-1)*n+j for j in range(n)))
    return mesh(name,vs,fs,material,True)


def tube(name,points,radii,material,n=8):
    vs=[];fs=[]
    for i,p in enumerate(points):
        p=Vector(p);d=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])).normalized()
        side=d.cross(Vector((0,1,0))).normalized()
        if side.length<.1:side=d.cross(Vector((1,0,0))).normalized()
        up=d.cross(side).normalized()
        for j in range(n):
            a=j*math.tau/n;v=p+(side*math.cos(a)+up*math.sin(a))*radii[i];vs.append(v)
    for i in range(len(points)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(range(n-1,-1,-1)));fs.append(tuple((len(points)-1)*n+j for j in range(n)))
    return mesh(name,vs,fs,material,True)


def leaf(name,start,end,width,material,curl=.12):
    a=Vector(start); b=Vector(end);d=b-a;side=d.cross(Vector((0,0,1))).normalized()*width
    mid=a+d*.48+Vector((0,0,curl));vs=[a,mid+side,mid+Vector((0,0,width*.4)),mid-side,b]
    return mesh(name,vs,[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],material,True)


def export(name,objects):
    # Join per material, applying authoring transforms for efficient GPU uploads.
    bpy.ops.object.select_all(action='DESELECT')
    materials={m for o in objects for m in o.data.materials}
    merged=[]
    by_material={m:[o for o in objects if o.data.materials and o.data.materials[0]==m] for m in materials}
    for m in sorted(materials,key=lambda m:m.name):
        obs=by_material[m]
        if not obs:continue
        for o in obs:o.select_set(True)
        bpy.context.view_layer.objects.active=obs[0]; bpy.ops.object.join()
        ob=bpy.context.object;ob.name=name+' / '+m.name
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        merged.append(ob);bpy.ops.object.select_all(action='DESELECT')
    for o in merged:o.select_set(True)
    bpy.context.scene['asset_license']='Original project geometry, reference-informed. No downloaded geometry or image pixels.'
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
    stats={'meshes':len(merged),'triangles':sum(len(o.data.loop_triangles) or sum(len(p.vertices)-2 for p in o.data.polygons) for o in merged)}
    print(name,stats)
    (OUT/(name+'.stats.json')).write_text(json.dumps(stats,indent=2)+'\n')
    for o in merged:bpy.data.objects.remove(o,do_unlink=True)


# DEWEY MONUMENT: layered square pedestal, slender shaft, carved composite capital.
start=set(bpy.data.objects)
for i,(w,h) in enumerate([(8.8,.26),(7.4,.28),(6.3,.32),(5.2,.30)]):
    z=sum([.26,.28,.32,.30][:i])+h/2;cube('Granite pedestal step', (0,0,z),(w,w,h),stone,.055)
cube('Inscribed pedestal',(0,0,2.20),(3.20,3.20,2.13),stone,.04)
for side in range(4):
    a=side*math.pi/2;ob=cube('Recessed inscription field',(math.sin(a)*1.607,-math.cos(a)*1.607,2.17),(2.64,.025,1.65),stoneShade,.009);ob.rotation_euler[2]=a
# Captions are engraved-look lines; detail stays restrained at racing distance.
for side in range(4):
    a=side*math.pi/2
    for i,width in enumerate([1.12,1.65,1.90,1.84,1.75,1.55,1.84,1.77,1.55,1.67,1.38,1.12]):
        ob=cube('Incised inscription line',(math.sin(a)*1.626,-math.cos(a)*1.626,2.91-i*.127),(width,.012,.018),stone,.001);ob.rotation_euler[2]=a
cube('Pedestal upper molding',(0,0,3.36),(3.60,3.60,.24),stone,.03)
lathe('Attic base',[(3.48,1.48),(3.58,1.48),(3.64,1.26),(3.82,1.23),(3.91,1.30),(4.05,1.30),(4.16,1.08)],stone)
lathe('Monument shaft',[(4.16,1.04),(4.35,1.04),(9.2,1.025),(14.4,.986),(19.6,.93),(24.45,.85)],stone,64)
for z,r in [(9.2,1.026),(14.4,.987),(19.6,.931)]:lathe('Granite drum joint',[(z-.009,r),(z+.009,r)],stoneShade,64)
lathe('Capital neck rings',[(24.4,.85),(24.5,.85),(24.52,.96),(24.65,.97),(24.73,.89),(24.80,.89)],stone,48)
lathe('Corinthian bell',[(24.78,.89),(25.12,1.04),(25.55,1.16),(26.03,1.37),(26.45,1.45)],stone,48)
# Two staggered acanthus whorls: fluted leaves with rolled-over tips.
for row in range(2):
    for j in range(12):
        a=(j+.5*row)*math.tau/12;z=24.78+row*.54
        pts=[]
        for k in range(7):
            t=k/6;r=.91+t*.51+row*.09;zz=z+t*.94+math.sin(t*math.pi)*.17
            pts.append((math.cos(a)*r,math.sin(a)*r,zz))
        tube('Acanthus central rib',pts,[.075,.085,.085,.074,.065,.053,.02],stone,6)
        for k in range(1,6):
            p=Vector(pts[k]);t=k/6;side=Vector((-math.sin(a),math.cos(a),0))
            for s in [-1,1]:
                end=p+side*s*(.25*math.sin(t*math.pi)+.02)+Vector((math.cos(a)*.10,math.sin(a)*.10,.12))
                leaf('Carved acanthus serration',p,end,.075,stone,.055)
# Ionic volutes facing the four corners.
for j in range(4):
    a=math.pi/4+j*math.pi/2;normal=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0));center=normal*1.27+Vector((0,0,26.13))
    for sign in [-1,1]:
        c=center+side*sign*.38;pts=[]
        for k in range(30):
            t=k/29;angle=t*math.pi*3;r=.33*(1-t)+.034
            pts.append(c+side*math.cos(angle)*r+Vector((0,0,math.sin(angle)*r)))
        tube('Carved capital scroll',pts,[.075]*(len(pts)-1)+[.043],stone,6)
cube('Capital abacus',(0,0,26.62),(3.47,3.47,.18),stone,.10)
cube('Capital upper lip',(0,0,26.77),(3.62,3.62,.12),stone,.025)
lathe('Statue pedestal',[(26.83,.64),(27.02,.70),(27.17,.59)],stone)
# Correct Victory pose: a foot on the sphere, the trident aloft, wreath sideways.
S=27.25
uv('Bronze globe',(0,0,S+.28),(.43,.43,.43),bronze,24,16)
# Smooth lofted garment with articulated hips, torsion and deep swept fabric folds.
vs=[];fs=[];rings=22;sides=48
for i in range(rings):
    t=i/(rings-1);z=S+.73+t*2.06
    cx=.05+.10*math.sin(t*3.1);cy=.04*math.sin(t*4)
    radius=.34*(1-t)+.24*t+.075*math.sin(t*math.pi*2)
    for j in range(sides):
        a=j*math.tau/sides;fold=(.055*(1-t)+.014)*math.sin(a*11+t*4)+.018*math.sin(a*19-t*5)
        # Swept skirt hem trails to the left behind the free leg.
        sweep=-.35*(1-t)**3*max(0,math.cos(a+1))
        vs.append((cx+math.cos(a)*(radius+fold)+sweep,cy+math.sin(a)*(radius*.68+fold)+.22*(1-t)**2,z+.08*math.sin(a*3)*(1-t)))
for i in range(rings-1):
    for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
mesh('Victory / swept draped gown',vs,fs,bronze,True)
# Anatomical torso and shoulders blended into sculpted drapery.
uv('Victory torso',(.14,0,S+2.69),(.31,.19,.42),bronze,24,16)
for x in [-.12,.37]:uv('Draped shoulder',(x,0,S+2.84),(.17,.17,.19),bronze)
tube('Neck',[(.14,0,S+2.91),(.14,-.015,S+3.13)],[.125,.12],bronze,12)
head=uv('Victory head',(.14,-.025,S+3.27),(.20,.175,.255),bronze,24,16)
# Profile nose, chin, ear and tied swept hair read in silhouette.
mesh('Face nose',[(.11,-.16,S+3.39),(.21,-.16,S+3.39),(.155,-.253,S+3.25),(.105,-.20,S+3.235),(.215,-.20,S+3.235),(.14,-.155,S+3.215),(.19,-.155,S+3.215)],[(0,1,2),(0,2,3),(2,1,4),(3,2,4),(3,4,6,5),(0,3,5),(1,6,4)],bronze,True)
uv('Face chin',(.16,-.121,S+3.12),(.105,.09,.069),bronze,12,8)
uv('Hair bun',(.09,.17,S+3.30),(.125,.11,.15),bronze,16,10)
for i in range(9):
    a=i*math.tau/9;tube('Sculpted hair',[(.14+math.cos(a)*.18,-.025+math.sin(a)*.155,S+3.31),(.14+math.cos(a)*.14,.01+math.sin(a)*.12,S+3.48),(.1,.12,S+3.43)],[.021,.025,.022],bronzeLight,5)
# Raised right arm and lowered extended left arm, tapered elbow and forearm.
tube('Raised arm',[(.36,0,S+2.83),(.48,0,S+3.03),(.58,-.02,S+3.36),(.57,-.04,S+3.71),(.50,-.06,S+3.94)],[.14,.12,.107,.083,.063],bronze,14)
tube('Wreath arm',[(-.13,0,S+2.84),(-.43,-.01,S+2.60),(-.73,-.06,S+2.55),(-1.01,-.10,S+2.76),(-1.17,-.13,S+2.99)],[.14,.124,.105,.085,.064],bronze,14)
uv('Trident hand',(.50,-.06,S+3.94),(.09,.085,.12),bronze)
uv('Wreath hand',(-1.17,-.13,S+2.99),(.10,.065,.09),bronze)
# Front foot stands on globe. The other ankle hangs back below floating cloth.
tube('Weight bearing leg',[(.12,-.03,S+1.13),(.13,-.045,S+.78),(.15,-.09,S+.65)],[.13,.086,.078],bronze,12)
uv('Foot on sphere',(.16,-.16,S+.65),(.10,.19,.074),bronze,16,10)
tube('Trailing leg',[(-.30,.17,S+1.35),(-.47,.18,S+1.05),(-.45,.18,S+.69)],[.11,.089,.053],bronze,12)
uv('Trailing pointed foot',(-.44,.15,S+.61),(.069,.08,.14),bronze,16,10)
# Voxel-union the anatomical masses, then relax and reduce the result. This
# eliminates intersecting sphere seams at shoulders, elbows, hands and face.
skin_names=['Victory torso','Draped shoulder','Neck','Victory head','Face nose','Face chin','Hair bun','Raised arm','Wreath arm','Trident hand','Wreath hand','Weight bearing leg','Foot on sphere','Trailing leg','Trailing pointed foot']
skin=[o for o in bpy.data.objects if any(o.name.startswith(n) for n in skin_names)]
bpy.ops.object.select_all(action='DESELECT')
for o in skin:o.select_set(True)
bpy.context.view_layer.objects.active=skin[0];bpy.ops.object.join();sculpt=bpy.context.object;sculpt.name='Victory / unified bronze anatomy'
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
sculpt.data.remesh_voxel_size=.025;bpy.ops.object.voxel_remesh()
mod=sculpt.modifiers.new('Relax sculpt transition','SMOOTH');mod.factor=.85;mod.iterations=4;bpy.ops.object.modifier_apply(modifier=mod.name)
mod=sculpt.modifiers.new('Sculpt game topology','DECIMATE');mod.ratio=.30;bpy.ops.object.modifier_apply(modifier=mod.name)
for poly in sculpt.data.polygons:poly.use_smooth=True
# A brow and two short lip planes replace the mannequin's circular features.
for xx in [.065,.245]:
    tube('Bronze brow',[(xx-.043,-.156,S+3.345),(xx,-.176,S+3.358),(xx+.044,-.159,S+3.345)],[.014,.015,.009],bronze,6)
tube('Sculpted upper lip',[(.095,-.165,S+3.205),(.155,-.19,S+3.207),(.215,-.164,S+3.203)],[.011,.014,.008],bronze,6)

# Broad wind-blown mantle edge behind figure, with rippling triangular hem.
verts=[];faces=[]
for i in range(15):
    t=i/14;z=S+1.06+t*1.62;cx=-.26-.39*math.sin(t*math.pi)
    for j in range(5):
        u=j/4;verts.append((cx+.22*u,.08+.23*math.sin(t*4+u*3)+.17*u,z+.05*math.sin(t*17+u*4)))
for i in range(14):
    for j in range(4):a=i*5+j;faces.append((a,a+1,a+6,a+5))
ob=mesh('Flowing mantle',verts,faces,bronze,True);mod=ob.modifiers.new('Bronze cloth thickness','SOLIDIFY');mod.thickness=.025;bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
# Wreath held vertically in front-facing plane, studded with laurel leaves.
center=Vector((-1.28,-.13,S+3.31));pts=[center+Vector((math.cos(a)*.29,0,math.sin(a)*.29)) for a in [i*math.tau/36 for i in range(37)]]
tube('Laurel wreath vine',pts,[.038]*len(pts),bronze,8)
for i in range(20):
    a=i*math.tau/20;p=center+Vector((math.cos(a)*.29,0,math.sin(a)*.29));end=p+Vector((math.cos(a+.7)*.11,-.025,math.sin(a+.7)*.11));leaf('Wreath laurel leaf',p,end,.040,bronzeLight,.025)
# Trident slants from raised hand down to opposite side as the reference does.
a=Vector((1.27,-.07,S+2.12));b=Vector((.23,-.07,S+4.53));tube('Trident shaft',[a,b],[.027,.027],bronzeLight,10)
dir=(b-a).normalized();side=Vector((dir.z,0,-dir.x));fork=b-dir*.12
for sign in [-1,0,1]:
    pts=[fork, fork+side*sign*.18+dir*.045, fork+side*sign*.18+dir*.35]
    tube('Trident tine',pts,[.031,.026,.009],bronzeLight,8)
export('dewey-monument',[o for o in bpy.data.objects if o not in start])

# CANARY ISLAND DATE PALM: heavy scarred trunk and many feather-shaped fronds.
start=set(bpy.data.objects)
height=12.7
lathe('Palm tapered trunk',[(0,.49),(.22,.54),(.6,.49),(3.5,.44),(7,.40),(10.7,.37),(12,.45),(height,.56)],bark,22)
# Real old leaf scars interlock into a diamond pattern, rather than horizontal rings.
verts=[];faces=[]
for row in range(42):
    z=.2+row*.287;r=.49-z/height*.13
    for k in range(10):
        a=(k+(row%2)*.5)*math.tau/10;offset=len(verts)
        for dz,da,dr in [(-.12,0,0),(0,-.25,.021),(.13,0,.034),(0,.25,.021),(0,0,.046)]:
            aa=a+da;rr=r+dr;verts.append((math.cos(aa)*rr,math.sin(aa)*rr,z+dz))
        faces.extend([(offset,offset+1,offset+4),(offset+1,offset+2,offset+4),(offset+2,offset+3,offset+4),(offset+3,offset,offset+4)])
mesh('Diamond trunk scars',verts,faces,barkShade,False)
# Dense pruned petiole bases form the characteristic pineapple-shaped crown.
for row in range(4):
    for k in range(11):
        a=(k+row*.5)*math.tau/11;r=.36+math.sin(row/3*math.pi)*.28;z=11.7+row*.25
        tube('Pruned petiole stub',[(math.cos(a)*r,math.sin(a)*r,z),(math.cos(a)*(r+.23),math.sin(a)*(r+.23),z+.36)],[.115,.055],bark,5)
# Geometry arrays keep 3,000+ leaflets cheap to author and merge into four mats.
leafVerts=[[] for _ in range(4)];leafFaces=[[] for _ in range(4)]
for f in range(60):
    band=f//20;a=f*2.399963+.15*math.sin(f);length=[6.5,5.6,3.95][band]+random.uniform(-.40,.40)
    dir=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0))
    lift=[1.80,3.1,4.1][band];drop=[3.0,2.4,1.7][band]
    def center(t):return dir*(length*t)+Vector((0,0,height+lift*math.sin(t*math.pi*.66)-drop*t*t))
    pts=[center(k/14) for k in range(15)];tube('Arching palm rachis',pts,[.049*(1-k/15)+.007 for k in range(15)],leafMats[f%4],5)
    for k in range(3,34):
        t=k/35;p=center(t);wing=(math.sin(t*math.pi)**.64)*1.13
        for sign in [-1,1]:
            jitter=random.uniform(-.055,.055);end=p+side*sign*wing+dir*(.25+.45*t)+Vector((0,0,-.14-.40*t+jitter));mid=p.lerp(end,.48)+Vector((0,0,.085))
            # Long slender folded pinnae create feathered silhouettes and true gaps.
            across=dir*(.081*(1-t*.55));bank=(f+k//9)%4;vs=leafVerts[bank];fs=leafFaces[bank];i=len(vs)
            vs.extend([p,mid-across,mid+Vector((0,0,.026)),mid+across,end]);fs.extend([(i,i+1,i+2),(i,i+2,i+3),(i+1,i+4,i+2),(i+2,i+4,i+3)])
for i in range(4):mesh('Fine date palm pinnae '+str(i),leafVerts[i],leafFaces[i],leafMats[i],True)
# Last-season drooping warm fronds below the crown, kept sparse.
for f in range(5):
    a=f*2.39996;pts=[]
    for k in range(9):
        t=k/8;r=2.4*math.sin(t*math.pi*.65);pts.append((math.cos(a)*r,math.sin(a)*r,height+.15-3.8*t*t))
    tube('Old hanging leaf stem',pts,[.036*(1-k/10) for k in range(9)],bark,5)
export('date-palm',[o for o in bpy.data.objects if o not in start])
print('Plaza assets exported successfully.')
