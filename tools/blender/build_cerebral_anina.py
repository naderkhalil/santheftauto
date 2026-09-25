"""Original Blender architecture for Anina, 482 Hayes, and its east patio.

Reference-informed pale green twin-bay Victorian, navy/coral bar, and open patio.
Blender X east/Y north/Z elevation; glTF north is -Z. No reflected-root offset.
See art/references/cerebral-anina.md for source/interpretation boundaries.
"""
import bpy, math, json, random, sys
import numpy as np
from mathutils import Vector
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/cerebral-valley'
REVIEW=ROOT/'art/reviews'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
LAYOUT=json.loads((ROOT/'art/references/cerebral-valley-layout.json').read_text())
BUILDING=next(b for b in LAYOUT['buildings'] if b['id']=='60824061')
ORIGIN=(-16.106,28.639,21.68669157221604)
ANGLE=.16091752938795872
M={}; BATCH={}; SIGNS=[]; PROBES=[]
rng=random.Random(482)

def srgb(color):
    values=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)

def material(name,color,rough=.72,metal=0,alpha=1,emit=0):
    m=bpy.data.materials.new('Anina / '+name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*srgb(color),1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    p.inputs['Alpha'].default_value=alpha
    if alpha<1:m.surface_render_method='DITHERED'
    if emit:p.inputs['Emission Color'].default_value=(*srgb(color),1);p.inputs['Emission Strength'].default_value=emit
    m.diffuse_color=(*srgb(color),alpha);M[name]=m;return name

SAGE=material('pale green weatherboards','#c6d1ac')
SAGE_DARK=material('olive green inset panels','#839773')
CREAM=material('ivory painted Victorian trim','#edead5')
NAVY=material('deep blue bar siding','#344f5a')
TEAL=material('turquoise patio fence','#3f8c9a')
CORAL=material('coral storefront cornice','#b87966')
CHARCOAL=material('Brass Tacks charcoal fascia','#44473f')
GOLD=material('muted gold lettering','#cbb17c',.5,.18)
GLASS=material('cool reflective sash glazing','#526b73',.23,.32)
DARK=material('deep interior and window reveals','#26393b',.7)
WOOD=[material('warm picnic oak '+str(i),c,.58) for i,c in enumerate(['#c7985c','#b28650','#d0a468','#bc8d52'])]
IRON=material('navy picnic steel','#283c4a',.48,.45)
CONCRETE=material('patio concrete','#b4b6a9',.93)
BLOCK=material('white concrete planters','#d7dbcd',.9)
POT=material('round weathered cement pots','#a8afa6',.9)
SOIL=material('potting soil','#514939',.96)
LEAVES=[material('leaf tone '+str(i),c,.81) for i,c in enumerate(['#597d48','#779b56','#395f46','#91a86c'])]
PURPLE=material('cordyline burgundy leaves','#826255',.83)
LIME=material('lime green patio planter','#b4c753',.65)
ROOF=material('charcoal flat roof','#6a7168',.91)
CLEAR=material('light transmitting patio roof','#d5e4db',.35,.02,.14)
BULB=material('warm string light bulbs','#f4d9a4',.36,0,1,1.3)
BOTTLE=material('green bar bottles','#526d4e',.28,.12)
AMBER=material('amber bar bottles','#ad7945',.35,.12)

# Original packed material maps keep the close storefront from reading as flat
# color. Fine timber grain remains subtle at the driving distance.
N=256;rr=np.random.default_rng(482)
rough=np.ones((N,N,4));rough[:,:,:3]=np.clip(.72+rr.normal(0,.03,(N,N,1)),.5,.95)
normal=np.ones((N,N,4));normal[:,:,0]=.5+rr.normal(0,.009,(N,N));normal[:,:,1]=.5+rr.normal(0,.015,(N,N));normal[:,:,2]=1.
def image_map(name,data):
    im=bpy.data.images.new(name,width=N,height=N);im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(data.astype(np.float32).ravel());im.pack();return im
rough_image=image_map('Anina original painted timber roughness',rough)
normal_image=image_map('Anina original fine grain normal',normal)
for key in [SAGE,SAGE_DARK,CREAM,NAVY,TEAL,CORAL,*WOOD]:
    nt=M[key].node_tree;p=nt.nodes.get('Principled BSDF')
    a=nt.nodes.new('ShaderNodeTexImage');a.image=rough_image;nt.links.new(a.outputs['Color'],p.inputs['Roughness'])
    a=nt.nodes.new('ShaderNodeTexImage');a.image=normal_image
    norm=nt.nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.25
    nt.links.new(a.outputs['Color'],norm.inputs['Color']);nt.links.new(norm.outputs['Normal'],p.inputs['Normal'])

def tr(p):
    x,y,z=p;c,s=math.cos(ANGLE),math.sin(ANGLE)
    return (ORIGIN[0]+x*c-y*s,ORIGIN[1]+x*s+y*c,ORIGIN[2]+z)

def local(p):
    x,y=p['x']-ORIGIN[0],p['z']-ORIGIN[1];c,s=math.cos(ANGLE),math.sin(ANGLE)
    return (x*c+y*s,-x*s+y*c)

def face(points,mat):
    vertices,faces,uvs=BATCH.setdefault(mat,([],[],[]));start=len(vertices)
    vertices.extend(tr(p) for p in points);faces.append(list(range(start,start+len(points))))
    normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]))
    ax=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=ax]
    uvs.append([(p[axes[0]]/2,p[axes[1]]/2) for p in points])

def box(x,y,z,w,d,h,mat):
    if min(w,d,h)<=0:return
    points=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sx,sy,sz in
        [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:face([points[i] for i in ids],mat)

def prism(points,z,h,mat):
    face([(x,y,z) for x,y in points][::-1],mat);face([(x,y,z+h) for x,y in points],mat)
    for a,b in zip(points,points[1:]+points[:1]):face([(a[0],a[1],z),(b[0],b[1],z),(b[0],b[1],z+h),(a[0],a[1],z+h)],mat)

def cylinder(x,y,z,r,h,mat,count=12,r2=None):
    r2=r if r2 is None else r2
    a=[(x+r*math.cos(i*math.tau/count),y+r*math.sin(i*math.tau/count),z-h/2) for i in range(count)]
    b=[(x+r2*math.cos(i*math.tau/count),y+r2*math.sin(i*math.tau/count),z+h/2) for i in range(count)]
    face(a[::-1],mat);face(b,mat)
    for i in range(count):j=(i+1)%count;face([a[i],a[j],b[j],b[i]],mat)

def beam(a,b,r,mat,sides=6):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    u=direction.cross(Vector((0,0,1)))
    if u.length<.01:u=direction.cross(Vector((1,0,0)))
    u.normalize();v=direction.cross(u)
    rings=[[p+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)) for i in range(sides)] for p in (a,b)]
    for i in range(sides):j=(i+1)%sides;face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],mat)

def text(body,x,y,z,size,mat,font=None,angle=0):
    curve=bpy.data.curves.new(body,'FONT');curve.body=body;curve.align_x='CENTER';curve.size=size;curve.extrude=.004;curve.resolution_u=5
    if font:
        try:curve.font=bpy.data.fonts.load(font)
        except RuntimeError:pass
    obj=bpy.data.objects.new(body,curve);bpy.context.collection.objects.link(obj)
    obj.location=(x,y,z);obj.rotation_euler=(math.pi/2,0,angle)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');obj=bpy.context.object;bpy.context.view_layer.update()
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    normal=Vector((math.sin(angle),-math.cos(angle),0));front=max(p.dot(normal) for p in points);samples=[]
    for polygon in obj.data.polygons:
        ps=[points[i] for i in polygon.vertices];face(ps,mat)
        if all(abs(p.dot(normal)-front)<.00001 for p in ps):samples.append(tr(sum(ps,Vector())/len(ps)))
    nn=(math.cos(ANGLE)*normal.x-math.sin(ANGLE)*normal.y,math.sin(ANGLE)*normal.x+math.cos(ANGLE)*normal.y,0)
    SIGNS.append(dict(text=body,position=tr((x,y,z)),normal=nn));PROBES.append((body,samples,nn))
    bpy.data.objects.remove(obj,do_unlink=True)

def window(x,y,z,w,h,trim=CREAM):
    box(x,y+.02,z,w,.045,h,GLASS)
    for xx in [x-w/2-.05,x+w/2+.05]:box(xx,y-.035,z,.10,.17,h+.18,trim)
    box(x,y-.08,z-h/2-.07,w+.3,.32,.14,trim)
    box(x,y-.05,z+h/2+.07,w+.24,.21,.14,trim)
    box(x,y-.065,z,w,.13,.065,trim)

def side_window(y,z,w,h):
    # East side glazing faces the patio; the wall is a real volumetric shell.
    box(5.69,y,z,.05,w,h,GLASS)
    for yy in [y-w/2-.05,y+w/2+.05]:box(5.75,yy,z,.16,.10,h+.16,CREAM)
    for zz in [z-h/2-.07,z+h/2+.07]:box(5.76,y,zz,.23,w+.26,.13,CREAM)
    box(5.78,y,z,.15,w,.065,CREAM)

# Accurate mapped perimeter, including the deep central front light well.
footprint=[local(p) for p in BUILDING['polygon']]
prism(footprint,-.24,.40,CONCRETE)
prism(footprint,3.45,7.30,SAGE)
prism(footprint,10.72,.18,ROOF)
# Ground-floor walls leave the two bar entrances and east patio door open.
box(-5.65,10.7,1.70,.20,21.4,3.4,CHARCOAL)
box(0.15,17.2,1.70,.22,9.5,3.4,NAVY)
box(-.1,21.0,1.7,10.6,.25,3.4,NAVY)
for start,end in [(0,1.0),(4.3,5.0),(7.25,11),(14,19.6)]:
    box(5.52,(start+end)/2,1.7,.22,end-start,3.4,NAVY)
box(5.52,9.9,3.2,.22,19.8,.44,NAVY)
box(3.25,10,.17,4.75,20,.12,WOOD[1])
box(-3.38,10,.17,4.4,20,.12,WOOD[1])

# The pale green rectangular bay stacks are distinctive in May 2025 imagery.
for cx in [-3.28,3.27]:
    box(cx,.10,7.08,4.17,.58,7.0,SAGE_DARK)
    for zz in [3.63,6.98,10.28]:
        box(cx,-.12,zz,4.40,.92,.20,CREAM)
        box(cx,-.18,zz+.12,4.23,.98,.09,SAGE_DARK)
    for level,zz in enumerate([5.27,8.64]):
        for dx,ww in [(-1.31,.61),(0,1.64),(1.31,.61)]:window(cx+dx,-.255,zz,ww,2.38)
        # Narrow vertical stiles and inset sage panels between the two floors.
        for dx in [-1.97,-.94,.94,1.97]:box(cx+dx,-.28,zz,.12,.23,2.98,CREAM)
        for dx in [-1.27,0,1.27]:
            box(cx+dx,-.21,zz+1.58,.93,.08,.52,SAGE_DARK)
            for strip in range(8):box(cx+dx-.43+strip*.12,-.264,zz+1.58,.035,.032,.46,SAGE)
    # Modeled projecting cornice, corbels and dentils, without an invented gable.
    for height,width,depth in [(10.66,4.36,.92),(10.87,4.65,1.13),(11.02,4.76,1.23)]:box(cx,-.12,height,width,depth,.14,CREAM)
    for dx in [-1.83,-1.25,0,1.25,1.83]:
        box(cx+dx,-.40,10.42,.20,.37,.43,CREAM)
        box(cx+dx,-.48,10.57,.32,.54,.14,SAGE_DARK)
    for dx in np.arange(-2.1,2.12,.24):box(cx+dx,-.52,10.75,.105,.19,.17,CREAM)

# Fine horizontal siding on side walls and the two front return strips.
for z in np.arange(3.60,10.7,.155):
    spans=[(.05,19.95)]
    if any(abs(z-h)<1.07 for h in [5.30,8.63]):
        for centre in [3.4,8.8,14.8,18.1]:
            remaining=[]
            for a,b in spans:
                if b<centre-.66 or a>centre+.66:remaining.append((a,b))
                else:
                    if a<centre-.66:remaining.append((a,centre-.66))
                    if b>centre+.66:remaining.append((centre+.66,b))
            spans=remaining
    for a,b in spans:box(5.72,(a+b)/2,z,.055,b-a,.020,SAGE_DARK)
    box(-5.73,10.4,z,.055,20.7,.020,SAGE_DARK)
    for x in [-5.48,-1.1,1.09,5.46]:box(x,.015,z,.36,.05,.016,SAGE_DARK)
for y in [3.4,8.8,14.8,18.1]:
    for z in [5.30,8.63]:side_window(y,z,1.03,1.86)
# The inset centre is visibly a light well above its wrought entrance gate.
box(0,11.45,7.05,2.0,.14,7.2,SAGE)
window(0,11.33,5.45,1.1,1.9)
window(0,11.33,8.75,1.1,1.9)
for x in np.arange(-.93,1.,.13):box(x,0,1.32,.026,.038,2.45,IRON)
for z in [.17,1.62,2.51]:box(0,0,z,2.03,.055,.042,IRON)
box(0,2.0,3.53,2.05,2.9,.18,SAGE_DARK)

# Brass Tacks occupies the other ground-floor bay of the same mapped building.
box(-3.27,.08,3.07,4.42,.28,.62,CHARCOAL)
box(-3.27,-.03,2.7,4.44,.36,.12,CREAM)
window(-3.27,-.04,1.57,3.75,2.12,CHARCOAL)
text('BRASS TACKS',-3.27,-.13,2.99,.29,GOLD,'/System/Library/Fonts/Supplemental/Arial Bold.ttf')

# Anina: timber entrance, dark navy casing, coral cornice and cream nameboard.
box(3.26,.05,3.22,4.47,.32,.64,NAVY)
box(3.26,-.12,3.61,4.73,.69,.17,CORAL)
box(3.26,-.16,3.72,4.89,.78,.08,CREAM)
for x in [1.0,2.19,5.45]:box(x,-.055,1.70,.16,.27,3.15,NAVY)
box(3.84,-.10,.53,3.10,.21,.75,WOOD[1])
for z in np.arange(.18,.90,.135):box(3.84,-.225,z,3.04,.032,.026,WOOD[0])
window(3.85,-.10,1.90,2.87,1.86,NAVY)
# Open front door projects inside the bar, maintaining a clear street opening.
box(1.52,.18,.22,1.22,.65,.10,WOOD[1])
box(1.03,.76,1.52,.11,1.27,2.58,WOOD[1])
box(1.03,.76,1.85,.12,.86,1.54,DARK)
cylinder(1.115,.29,1.28,.035,.25,GOLD,8)
box(3.30,-.215,3.21,2.60,.13,.56,CREAM)
text('ANINA',3.30,-.300,3.05,.46,NAVY,'/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf')
text('482',1.47,-.15,2.87,.12,CREAM)
# Side entrance and bar windows face east into the open patio.
for yy in [5.1,7.20]:box(5.67,yy,1.54,.18,.12,2.83,WOOD[1])
box(5.67,6.15,2.94,.18,2.2,.14,WOOD[1])
box(5.83,7.1,1.52,1.06,.10,2.70,WOOD[1])
box(5.89,7.08,1.86,.77,.13,1.79,DARK)
for cy,w in [(2.65,2.95),(12.52,2.90)]:
    box(5.66,cy,1.88,.035,w,1.91,GLASS)
    for yy in [cy-w/2-.05,cy+w/2+.05]:box(5.73,yy,1.90,.17,.11,2.20,CREAM)
    for z in [.84,2.96]:box(5.75,cy,z,.25,w+.25,.15,CREAM)
    box(5.74,cy,1.95,.18,.085,2.0,CREAM)
for z in np.arange(.35,3.25,.14):
    for a,b in [(0,1.0),(4.3,5.0),(7.25,11),(14,19.6)]:box(5.655,(a+b)/2,z,.022,b-a,.019,SAGE_DARK)

# Warm, shallow interior detail visible through the open entrance.
box(2.05,8.5,.76,.67,10.1,1.18,WOOD[1])
box(2.06,8.5,1.39,.84,10.3,.10,WOOD[0])
for y in [4,6.3,8.6,10.9]:
    cylinder(3.02,y,.60,.055,.87,IRON,8)
    cylinder(3.02,y,1.06,.30,.10,WOOD[1],16)
for z in [1.7,2.25,2.8]:
    box(1.10,11.8,z,.40,4.3,.055,WOOD[1])
    for i in range(13):
        y=9.83+i*.31;h=.22+(i%3)*.035
        cylinder(1.1,y,z+h/2+.025,.043,h,BOTTLE if i%2 else AMBER,8)
        cylinder(1.1,y,z+h+.06,.019,.065,BOTTLE if i%2 else AMBER,8)

# Exact unbuilt gap between Anina and the splayed west edge of 450 Hayes.
PATIO=[(5.370,.001),(12.852,-.041),(24.432,19.293),(5.497,19.400)]
prism(PATIO,.045,.095,CONCRETE)
def right(y):return 12.852+(24.432-12.852)*y/19.293
# Low Hayes edge preserves the opening reveal. The tall turquoise fence is at
# the REAR, as shown in Anina's official patio photograph.
for x in np.arange(7.18,12.8,.23):box(x,.19,.51,.221,.10,.88,TEAL)
box(9.94,.18,.99,5.71,.18,.11,WOOD[1])
for x in [7.1,9.95,12.80]:box(x,.17,.56,.13,.16,1.10,NAVY)
box(14.93,19.1,1.48,18.68,.14,2.82,TEAL)
for x in np.arange(5.66,24.3,.50):box(x,18.996,1.48,.047,.07,2.84,TEAL)
box(14.95,19.08,2.91,18.85,.22,.10,NAVY)
# The east boundary already has the real 450 Hayes wall; use thin open rails.
for y in [1.2,5.5,9.8,14.1,18.4]:box(right(y)-.28,y,1.63,.085,.085,3.18,IRON)
beam((right(1)-.28,1,3.28),(right(18.5)-.28,18.5,3.28),.055,IRON)

def picnic(x,y,angle=math.pi/2):
    before={k:len(v[0]) for k,v in BATCH.items()}
    for j in range(5):box((j-2)*.146,0,.89,.139,2.42,.075,WOOD[j%4])
    for sx in [-.69,.69]:
        for j in [-.115,.115]:box(sx+j,0,.49,.222,2.46,.066,WOOD[(j>0)+1])
    for yy in [-.86,.86]:
        beam((-.36,yy,.10),(.36,yy,.85),.031,IRON,4)
        beam((.36,yy,.10),(-.36,yy,.85),.031,IRON,4)
        beam((-.95,yy,.45),(.95,yy,.45),.033,IRON,4)
        for sx in [-.74,.74]:beam((sx,yy,.12),(sx,yy,.46),.032,IRON,4)
    beam((0,-.97,.34),(0,.97,.34),.029,IRON,4)
    # Geometry above is authored in local coordinates then rotated as a unit.
    c,s=math.cos(ANGLE),math.sin(ANGLE);ca,sa=math.cos(angle),math.sin(angle)
    for mat,(vertices,_,_) in BATCH.items():
        for index in range(before.get(mat,0),len(vertices)):
            px,py,pz=vertices[index];lx=(px-ORIGIN[0])*c+(py-ORIGIN[1])*s;ly=-(px-ORIGIN[0])*s+(py-ORIGIN[1])*c
            vertices[index]=tr((x+ca*lx-sa*ly,y+sa*lx+ca*ly,pz-ORIGIN[2]+.14))

for x,y in [(8.3,3.8),(11.2,5.9),(8.3,9.4),(12.2,10),(16.2,11),(8.5,15.7),(12.7,15.7),(17.0,16.0),(21.0,16.1)]:picnic(x,y,0)

def plant(x,y,size=1.,kind=0):
    radius=.34*size;h=.60*size
    cylinder(x,y,.14+h/2,radius,h,POT if kind!=2 else LIME,20,r2=radius*1.06)
    cylinder(x,y,.14+h-.02,radius*.88,.05,SOIL,20)
    for leaf in range(18 if kind else 28):
        angle=leaf*2.399+kind;length=(.5+rng.random()*.65)*size
        base=.14+h;reach=length*(.50 if kind else .80);height=length*(.90 if kind else .50)
        dx,dy=math.cos(angle),math.sin(angle);width=(.028 if kind else .080)*size
        points=[(x,y,base),(x+dx*reach*.48-dy*width,y+dy*reach*.48+dx*width,base+height*.76),
                (x+dx*reach,y+dy*reach,base+height),(x+dx*reach*.48+dy*width,y+dy*reach*.48-dx*width,base+height*.76)]
        face(points,PURPLE if kind==1 else LEAVES[leaf%4]);face(points[::-1],PURPLE if kind==1 else LEAVES[leaf%4])
for x,y,size,kind in [(6.2,1.5,.8,0),(6.2,8.6,1,0),(6.25,15.7,1,0),(7.2,18.1,1.1,0),
                       (10.5,18.4,.8,1),(14.4,18.3,.85,1),(18.3,18.3,1,0),(22.9,17.9,1.2,2),
                       (right(4)-.8,4,.8,0),(right(10)-.8,10,.9,0)]:plant(x,y,size,kind)
# Stepped white CMU display at the patio's rear corner, with real hollow cells.
for row in range(3):
    for col in range(4-row):
        x,y,z=21.4+col*.59,18.05+row*.16,.30+row*.38
        for dx in [-.265,.265]:box(x+dx,y,z,.06,.34,.34,BLOCK)
        for yy in [-.15,.15]:box(x,y+yy,z,.53,.04,.34,BLOCK)
        box(x,y,z,.055,.28,.34,BLOCK)

# Slender steel roof frame and light-transmitting rear panels reinterpret the
# current covered patio so its picnic seating remains visible from the race.
for y in [1,6,11,16,18.7]:
    rx=right(y)-.30;beam((5.72,y,3.83),(rx,y,3.30),.055,IRON,6)
    if y>=6:
        box(rx,y,1.73,.09,.09,3.17,IRON)
for y0,y1 in [(10.9,15.9),(16.1,18.55)]:
    face([(5.75,y0,3.88),(right(y0)-.30,y0,3.36),(right(y1)-.30,y1,3.36),(5.75,y1,3.88)],CLEAR)
# Catenary-style festoon runs, modeled bulbs and black ceramic sockets.
for row in range(6):
    y0=1.2+row*3.25;y1=min(18.4,y0+1.7);a=Vector((5.72,y0,3.25));b=Vector((right(y1)-.45,y1,3.20))
    count=30;points=[]
    for i in range(count+1):
        t=i/count;p=a.lerp(b,t);p.z-=.33*math.sin(math.pi*t);points.append(p)
    for p,q in zip(points,points[1:]):beam(p,q,.010,IRON,4)
    bulbs=max(5,int((b-a).length/1.3))
    for i in range(1,bulbs):
        t=i/bulbs;p=a.lerp(b,t);p.z-=.33*math.sin(math.pi*t)
        cylinder(p.x,p.y,p.z-.045,.027,.10,IRON,8)
        cylinder(p.x,p.y,p.z-.118,.049,.071,BULB,10,r2=.033)
        cylinder(p.x,p.y,p.z-.161,.034,.030,BULB,10,r2=.010)

# Original palm silhouettes on the navy side wall suggest the tropical bar
# artwork without copying a photograph or a copyrighted mural as a texture.
for yy in [9.5,16.5]:
    beam((5.667,yy,.40),(5.667,yy+.10,2.35),.022,SAGE_DARK,4)
    for i in range(7):
        a=(i-3)*.43
        face([(5.677,yy+.1,2.30),(5.677,yy+.1+math.sin(a)*.70,2.15+math.cos(a)*.46),
              (5.677,yy+.1+math.sin(a)*.94,1.97+math.cos(a)*.38)],SAGE_DARK)

objects=[]
for mat,(vertices,faces,uvs) in BATCH.items():
    mesh=bpy.data.meshes.new('Anina / '+mat);mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='Material coordinates')
    for polygon,coords in zip(mesh.polygons,uvs):
        for loop,coord in zip(polygon.loop_indices,coords):uv.data[loop].uv=coord
    # Recalculate closed architectural normals without changing the artwork's
    # thin leaves or the intentionally two-sided canopy sheets.
    mesh.materials.append(M[mat]);obj=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(obj);objects.append(obj)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();audits=[]
for body,samples,normal in PROBES:
    blocked=sum(bool(bpy.context.scene.ray_cast(deps,Vector(p)+Vector(normal)*.012,Vector(normal),distance=.35)[0]) for p in samples)
    audits.append(dict(text=body,glyphSamples=len(samples),blocked=blocked))
assert all(a['glyphSamples']>0 and a['blocked']==0 for a in audits),audits

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.54,.67,.78,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.70
bpy.ops.object.light_add(type='SUN',location=(-30,-40,90));sun=bpy.context.object;sun.data.energy=2.5;sun.data.angle=.075
sun.rotation_euler=(math.radians(38),math.radians(-28),math.radians(-35))
bpy.ops.object.camera_add(location=tr((21,-32,12)));camera=bpy.context.object;camera.data.lens=39;scene.camera=camera
camera.rotation_euler=(Vector(tr((5.5,5,4.9)))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.view_settings.view_transform='AgX';scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/cerebral-anina.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'anina.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
    export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in objects)
meta=dict(name='Anina · 482 Hayes and east patio',buildingId='60824061',origin=ORIGIN,angle=ANGLE,
          coordinates='Blender X east/Y north/Z elevation; glTF X east/Y elevation/negative Z north',
          patioPolygon=[dict(x=tr((x,y,0))[0],z=tr((x,y,0))[1]) for x,y in PATIO],
          triangles=triangles,materialBatches=len(objects),signs=SIGNS,signAudit=audits,
          source='art/references/cerebral-anina.md',note='Whole 482–488 building; Anina east bay, Brass Tacks west bay. Patio in east map gap; rear opaque turquoise fence only. No street parklet in driving lane.')
(OUT/'anina.meta.json').write_text(json.dumps(meta,indent=2)+'\n')
print('ANINA_REPORT',json.dumps(meta),flush=True)
if '--skip-render' not in sys.argv:
    scene.render.filepath=str(REVIEW/'cerebral-anina-front.png');bpy.ops.render.render(write_still=True)
    camera.location=tr((25,-12,12));camera.rotation_euler=(Vector(tr((12,10,1.4)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=39
    scene.render.filepath=str(REVIEW/'cerebral-anina-patio.png');bpy.ops.render.render(write_still=True)
