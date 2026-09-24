"""Original, editable Blender waterfront assets for Whimsical San Francisco.

World authoring axes: X east, Y north, Z up. Standard glTF Y-up export becomes
canonical Three.js X east, Y up, Z south. Load at the origin OUTSIDE cityRoot.
Historic pier sequence/proportions are compressed to suit the existing race map.
"""
from pathlib import Path
import math, json, random, sys, bpy
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'public/assets/waterfront'
SOURCE = ROOT/'art/source'
REVIEW = ROOT/'art/reviews'
for path in (OUT,SOURCE,REVIEW): path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
random.seed(7)
BATCHES={}; MATS={}; OBJECTS=[]; PALMS=[]; SOUTH_PALMS=[]
ZONE='Quay'
FORCE_DETAIL=False

def linear(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)
def material(name,color,rough=.75,metal=0):
    m=bpy.data.materials.new('Embarcadero / '+name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*linear(color),1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*linear(color),1);MATS[name]=m;return m
STONE=material('warm historic stucco','#e7d8b9')
LIGHT=material('limestone cornice and arch voussoirs','#f3e5c8')
DARKSTONE=material('sandstone reveals','#b5a889')
GRANITE=material('granite seawall blocks','#aaa899',.93)
WOOD=material('sunbleached pier timber','#aa8765',.90)
RAIL=material('Port dark bronze iron','#304c46',.55,.48)
GLASS=material('deep marine blue glazing','#335b65',.26,.30)
DARK=material('deep recessed openings','#223a3e',.9)
ROOF=material('weathered red clay tiles','#a86447',.88)
METAL=material('zinc shed roof','#889b96',.71,.22)
GREEN=material('heritage green doors','#396965',.61,.18)
WHITE=material('warm glass globes and painted lines','#f6e8c9',.43)
GOLD=material('brass Port plaques','#b99751',.44,.5)
PAVE=material('jointed waterfront granite pavers','#c5b8a0',.96)
BIKE=material('quiet green waterfront bikeway','#62897a',.96)
SOIL=material('tree pits and planting soil','#645d49',.96)
# Original tile texture: real expansion joints, stone aggregate, subtle warm variations.
SZ=512; rng=random.Random(81); pixels=[]
for y in range(SZ):
    for x in range(SZ):
        joint=(x%128<2 or y%128<2)
        grain=rng.uniform(-.045,.045); tile=((x//128)*3+(y//128)*7)%5
        c=(.56,.53,.47) if joint else (.75+tile*.012+grain,.715+tile*.011+grain,.635+tile*.009+grain)
        pixels.extend((*c,1))
im=bpy.data.images.new('Original Embarcadero granite paving',SZ,SZ);im.pixels.foreach_set(pixels)
im.filepath_raw=str(OUT/'embarcadero-paving.png');im.file_format='PNG';im.save();im.pack()
tex=PAVE.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;tex.extension='REPEAT'
PAVE.node_tree.links.new(tex.outputs['Color'],PAVE.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

def mesh(name,vertices,faces,mat,uv=None,detail=False):
    key=(ZONE,mat.name,detail or FORCE_DETAIL)
    if key not in BATCHES: BATCHES[key]=[[],[],[],mat]
    vs,fs,us,_=BATCHES[key];off=len(vs);vs.extend(vertices);fs.extend(tuple(off+i for i in f) for f in faces)
    for f in faces:
        us.extend((vertices[i][0]/8,vertices[i][1]/8) if uv is None else uv[i] for i in f)

def box(name,x,n,z,w,d,h,mat,detail=False):
    vs=[(x+sx*w/2,n+sy*d/2,z+sz*h/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,detail=detail)
def beam(name,a,b,r,mat,sides=8,detail=False,r2=None):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized();other=Vector((0,0,1)) if abs(direction.z)<.95 else Vector((1,0,0))
    u=direction.cross(other).normalized();v=direction.cross(u);r2=r if r2 is None else r2
    vs=[tuple(p+(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))*rad) for p,rad in [(a,r),(b,r2)] for i in range(sides)]
    fs=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    mesh(name,vs,fs,mat,detail=detail)
def sphere(name,x,n,z,r,mat,detail=False):
    seg=12; rings=7;vs=[];fs=[]
    for j in range(rings+1):
        a=math.pi*j/rings
        for i in range(seg):
            b=math.tau*i/seg;vs.append((x+r*math.sin(a)*math.cos(b),n+r*math.sin(a)*math.sin(b),z+r*math.cos(a)))
    for j in range(rings):
        for i in range(seg):fs.append((j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i))
    mesh(name,vs,fs,mat,detail=detail)
def triangle(name,x,n,z,w,h,depth,mat):
    vs=[(x+dx,n+dy,z+dz) for dx in [-depth/2,depth/2] for dy,dz in [(-w/2,0),(w/2,0),(0,h)]]
    mesh(name,vs,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],mat)
def roof(name,x,n,z,length,width,rise,mat):
    vs=[(x+dx,n+dy,z+dz) for dx in [-length/2,length/2] for dy,dz in [(-width/2,0),(width/2,0),(0,rise)]]
    mesh(name,vs,[(0,2,1),(3,4,5),(0,1,4,3),(0,3,5,2),(1,2,5,4)],mat)
def arch(x,n,z,w,h,mat=LIGHT,thick=.36,depth=.35,detail=False):
    # Vertical western facade: a real extruded arch ring around a recessed opening.
    radius=w/2;spring=z+h-radius
    box('Left arch jamb',x,n-radius-thick/2,z+(h-radius)/2,depth,thick,h-radius,mat,detail)
    box('Right arch jamb',x,n+radius+thick/2,z+(h-radius)/2,depth,thick,h-radius,mat,detail)
    for j in range(16):
        aa=j*math.pi/16;bb=(j+1)*math.pi/16
        vs=[(x+dx,n+rr*math.cos(t),spring+rr*math.sin(t)) for dx in [-depth/2,depth/2] for rr,t in [(radius,aa),(radius,bb),(radius+thick,bb),(radius+thick,aa)]]
        mesh('Carved arch ring',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,detail=detail)

def archface(x,n,z,w,h,mat):
    r=w/2; spring=z+h-r
    verts=[(x,n-r,z),(x,n+r,z),(x,n+r,spring)]
    verts.extend((x,n+r*math.cos(i*math.pi/20),spring+r*math.sin(i*math.pi/20)) for i in range(1,21))
    mesh('Arched glazed opening',verts,[tuple(reversed(range(len(verts))))],mat)

def label(body,x,n,z,size,mat=RAIL,max_width=None,facing=(-1,0)):
    curve=bpy.data.curves.new('Port lettering '+body,'FONT');curve.body=body;curve.size=size;curve.align_x='CENTER';curve.align_y='CENTER';curve.extrude=.008;curve.resolution_u=2
    f=Path('/System/Library/Fonts/Supplemental/Georgia Bold.ttf')
    if f.exists():curve.font=bpy.data.fonts.load(str(f))
    ob=bpy.data.objects.new(body,curve);bpy.context.collection.objects.link(ob)
    front=Vector((*facing,0));up=Vector((0,0,1));right=up.cross(front)
    ob.rotation_euler=Matrix((right,up,front)).transposed().to_euler();ob.location=(x,n,z)
    bpy.context.view_layer.update()
    width=max(v[0] for v in ob.bound_box)-min(v[0] for v in ob.bound_box)
    if max_width and width>max_width: ob.scale.x=max_width/width
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
    ob=bpy.context.object;transform=ob.matrix_world;vs=[tuple(transform@v.co) for v in ob.data.vertices];fs=[tuple(p.vertices) for p in ob.data.polygons]
    mesh(body,vs,fs,mat,detail=True);bpy.data.objects.remove(ob,do_unlink=True)

def smooth(v):v=max(0,min(1,v));return v*v*(3-2*v)
def route_deck(n):return 2.24+3*smooth((n-250)/150)
def deck(x,n):
    # Plaza under the Ferry is deliberately level; meet its 2.3m floor.
    east=2.24+3*smooth((n-355)/45)
    return route_deck(n)+(east-route_deck(n))*smooth((x-638)/44)
def paving_patch(x0,x1,n0,n1,mat=PAVE,step=12):
    nx=max(1,math.ceil((x1-x0)/step));ny=max(1,math.ceil((n1-n0)/step));vs=[];fs=[]
    xs=sorted(set([x0+(x1-x0)*i/nx for i in range(nx+1)]+([685] if x0<685<x1 else [])))
    ns=sorted(set([n0+(n1-n0)*j/ny for j in range(ny+1)]+[v for v in [240,242.3,257.7,260] if n0<v<n1]))
    for n in ns:
        for x in xs:vs.append((x,n,deck(x,n)+(.027 if mat==BIKE else 0)))
    for j in range(len(ns)-1):
        for i in range(len(xs)-1):
            xx=(xs[i]+xs[i+1])/2;nn=(ns[j]+ns[j+1])/2
            if xx<685 and 242.3<nn<257.7:continue
            if mat==BIKE and 240<nn<260:continue
            a=j*len(xs)+i;fs.append((a,a+1,a+len(xs)+1,a+len(xs)))
    mesh('Contoured granite promenade',vs,fs,mat)

def bollard(x,n,z):
    beam('Cast mooring bollard',(x,n,z),(x,n,z+.72),.18,RAIL,10,r2=.14)
    beam('Bollard shoulder',(x,n,z+.62),(x,n,z+.81),.25,RAIL,10)
    beam('Bollard brass safety band',(x,n,z+.53),(x,n,z+.57),.185,GOLD,10,True)
def lamp(x,n,z,pier=False):
    beam('Cast lamp foot',(x,n,z),(x,n,z+.18),.35,RAIL,12)
    beam('Fluted lamp plinth',(x,n,z+.18),(x,n,z+.82),.18,RAIL,12,r2=.12)
    beam('Historic lamp column',(x,n,z+.82),(x,n,z+4.9),.084,RAIL,10,r2=.059)
    for h,r in [(1.0,.15),(4.32,.13),(4.78,.15)]:beam('Lamp collar',(x,n,z+h),(x,n,z+h+.10),r,GOLD,10,True)
    sphere('Lamp finial',x,n,z+5.1,.11,RAIL)
    for s in [-1,1]:
        beam('Globe bracket',(x,n,z+4.4),(x,n+s*.72,z+4.65),.065,RAIL,8)
        beam('Scrolled lamp arm',(x,n+s*.72,z+4.65),(x,n+s*.80,z+4.95),.065,RAIL,8)
        beam('Globe bronze cup',(x,n+s*.80,z+4.91),(x,n+s*.80,z+5.06),.17,RAIL,10)
        sphere('Milky white pier globe',x,n+s*.80,z+5.35,.36,WHITE)
def bench(x,n,z,orientation=0):
    prior={key:len(batch[0]) for key,batch in BATCHES.items()}
    for a in [-.84,.84]:
        box('Bench iron foot',x-.22,n+a,z+.20,.72,.095,.40,RAIL,True)
        beam('Bench back frame',(x+.21,n+a,z+.23),(x+.37,n+a,z+1.02),.045,RAIL,6,True)
    for dx in [-.26,-.06,.14]:box('Bench weathered seat slat',x+dx,n,z+.45,.17,2.10,.07,WOOD,True)
    for h in [.71,.88]:box('Bench backrest slat',x+.32,n,z+h,.09,2.10,.12,WOOD,True)
    for a in [-.92,.92]:beam('Bench arm',(x-.20,n+a,z+.72),(x+.32,n+a,z+.72),.048,RAIL,6,True)
    if orientation:
        c,ss=math.cos(orientation),math.sin(orientation)
        for key,batch in BATCHES.items():
            for i in range(prior.get(key,0),len(batch[0])):
                xx,nn,zz=batch[0][i];dx,dn=xx-x,nn-n;batch[0][i]=(x+c*dx-ss*dn,n+ss*dx+c*dn,zz)
def railing_segment(x0,n0,x1,n1,z,detail=True):
    distance=math.hypot(x1-x0,n1-n0);num=max(1,math.ceil(distance/2.4))
    for i in range(num+1):
        t=i/num;x=x0+(x1-x0)*t;n=n0+(n1-n0)*t
        beam('Waterfront railing post',(x,n,z),(x,n,z+1.16),.055,RAIL,6,detail)
    for h in [.35,.71,1.13]:beam('Waterfront iron rail',(x0,n0,z+h),(x1,n1,z+h),.035,RAIL,6,detail)

# Continuous street-facing public realm, subdivided for runtime frustum culling.
SOUTH_SECTIONS=[(-770,-640),(-640,-510),(-510,-380),(-380,-250),(-250,-120),(-120,10),(10,120)]
for idx,(n0,n1) in enumerate(SOUTH_SECTIONS+[(120,250),(250,390),(390,520),(520,660),(660,790),(790,910),(910,1030),(1030,1130)]):
    south=n1<=120
    ZONE=f'Quay South {idx+1}' if south else f'Quay {idx-len(SOUTH_SECTIONS)+1}'
    paving_patch(603.3,688,n0,n1)
    # Low granite curb meets the existing street without creating a shoulder wall.
    curb_step=10 if south else 5
    for n in range(n0,n1,curb_step):
        length=min(curb_step,n1-n);nn=n+length/2;h=route_deck(nn)
        if 239<nn<261:continue
        box('Dressed street-edge granite curb',603.5,nn,h-.06,.34,length-.02,.22,LIGHT)
    paving_patch(612,616,n0,n1,BIKE,8)
    for n in range(n0+3,n1,10):
        if 232<n<270:continue
        box('Bikeway broken center stripe',614,n,deck(614,n)+.047,.08,2.2,.016,WHITE,True)
    for n in range(n0+14,n1,60 if south else 34):
        if 225<n<277:continue
        x=626;h=deck(x,n);(SOUTH_PALMS if south else PALMS).append({'x':x,'north':n,'height':h})
        box('Palm planting well',x,n,h+.012,4.2,4.2,.035,SOIL)
        for dx in [-2.2,2.2]:box('Tree pit granite edging',x+dx,n,h+.04,.18,4.6,.15,LIGHT)
        for dn in [-2.2,2.2]:box('Tree pit granite edging',x,n+dn,h+.04,4.6,.18,.15,LIGHT)
        for p in [-1,1]:beam('Palm tree iron grate',(x+p*.85,n-1.9,h+.045),(x+p*.85,n+1.9,h+.045),.023,RAIL,6,True)
        bench(633,n,h)
    FORCE_DETAIL=south
    for n in range(n0+8,n1,70 if south else 35):
        if 235<n<266:continue
        lamp(607.6,n,deck(607.6,n))
    FORCE_DETAIL=False
    # Historic port seawall is masonry coursing, not a flat foundation box.
    wall_step=12 if south else 6;courses=1 if south else 3
    for n in range(n0,n1,wall_step):
        length=min(wall_step,n1-n);nn=n+length/2;top=deck(687,nn)
        for k in range(courses):
            z=-2+(top+2)*(k+.5)/courses
            box('Massive seawall granite course',687,nn,z,2.2,length-.02,(top+2)/courses-.06,GRANITE)
        box('Rounded granite seawall coping',687,nn,top+.10,2.5,length-.02,.32,LIGHT)
# Flat apron, Ferry Building + terminal undercroft. No barrier in Market's finish corridor.
ZONE='Ferry plaza foundation'
paving_patch(688,795,140,355,step=10)
for n in range(144,356,12):
    for x in [707,746,787]:beam('Ferry wharf concrete piling',(x,n,-4),(x,n,2.15),.75,GRANITE,10)
box('Ferry rear wharf beam',788,247.5,1.80,13,215,.70,GRANITE)
# Flush stone bands visibly articulate the expansive Ferry plaza.
for n in [148,177,207,292,322,351]:
    box('Ferry apron granite inlay',669,n,2.256,49,.27,.027,DARKSTONE,True)
for n in [156,185,214,287,316,345]:
    lamp(686,n,2.24);bollard(691,n,2.24)

PIERS=[(1,740,82,18.0),(1.5,805,30,13.2),(3,875,70,16.0),(5,965,66,15.3)]
for number,north,width,height in PIERS:
    ZONE=f'Pier {number} historic bulkhead'
    front=654;back=690;base=5.24;depth=back-front;mid=(front+back)/2
    # Broad shallow facade, deeply recessed doors, paired pilasters and ceramic roof.
    box('Pier masonry body',mid,north,base+height/2,depth,width,height,STONE)
    box('Granite foundation plinth',mid,north,base+.55,depth+.6,width+.6,1.1,GRANITE)
    for h,d,w in [(height-1.4,.43,.6),(height-.68,.55,1.0),(height,.46,1.5)]:
        box('Layered classical cornice',mid,north,base+h,depth+d,width+w,.40,LIGHT)
    roof('Historic roof',mid,north,base+height+.24,depth+1.7,width+1.7,3.0,ROOF)
    # Red terracotta ridges deliberately catch the low sun.
    for xx in range(int(front),int(back)+1,3):
        for s in [-1,1]:beam('Terracotta roof seam',(xx,north+s*(width/2+.7),base+height+.26),(xx,north,base+height+3.27),.07,ROOF,5,True)
    count=7 if number==1 else 3 if number==1.5 else 5;step=(width-(6 if number==1.5 else 12))/count
    for j in range(count):
        nn=north+(j-(count-1)/2)*step;central=j==count//2
        w=(4.5 if central else 3.2) if number==1.5 else (6.8 if central else 5.6);h=8.7 if number==1.5 else 9.9 if central else 7.4
        archface(front-.023,nn,base+.37,w,h,DARK)
        archface(front-.05,nn,base+.46,w-.35,h-.28,GLASS)
        arch(front-.22,nn,base+.37,w,h,LIGHT,.52,.52)
        for s in [-1,0,1]:box('Entry vertical glazing bars',front-.102,nn+s*w*.29,base+3.8,.10,.10,6.9,GREEN,True)
        for hh in [1.0,4.4,6.6]:box('Entry transom bars',front-.112,nn,base+hh,.11,w-.35,.12,GREEN,True)
        for s in [-1,1]:box('Entry door brass handles',front-.181,nn+s*.35,base+2.1,.12,.07,.58,GOLD,True)
        if not central:
            box('Upper clerestory opening',front-.021,nn,base+height-3.15,.05,4.9,2.10,GLASS)
            for s in [-1,0,1]:box('Clerestory limestone mullion',front-.105,nn+s*1.55,base+height-3.15,.14,.17,2.15,LIGHT,True)
            box('Upper stone window sill',front-.23,nn,base+height-4.3,.4,5.5,.30,LIGHT)
        for s in [-1,1]:
            off=step/2-.48
            box('Facade pilaster',front-.17,nn+s*off,base+height/2,.44,.69,height-.35,LIGHT)
            box('Pilaster capital',front-.24,nn+s*off,base+height-1.1,.58,1.02,.42,LIGHT)
    # Raised Port insignia and oversized pier identity on a proud central pediment.
    box('Central Port entrance pavilion',front-.32,north,base+height-1.4,1.4,15.2,4.4,STONE)
    triangle('Pier central pediment',front-.53,north,base+height+.23,16.6,2.8,1.75,LIGHT)
    triangle('Pediment recessed tympanum',front-1.425,north,base+height+.60,12.6,1.7,.035,DARKSTONE)
    label(('PIER 1½' if number==1.5 else f'PIER {number}'),front-1.10,north,base+height-.97,1.66,RAIL,12.8)
    label('PORT OF SAN FRANCISCO',front-.625,north,base+11.0,.61,RAIL,16)
    # Detailed complete end facades viewed while racing south on the Embarcadero.
    for side in [-1,1]:
        nn=north+side*(width/2+.02)
        for x in [front+5,front+13,front+21,front+29]:
            box('End facade ground recess',x,nn,base+3.6,4.9,.08,5.4,GLASS)
            for dx in [-2.55,0,2.55]:box('End wall window stone jamb',x+dx,nn+side*.10,base+3.6,.19,.29,5.7,LIGHT)
            box('End facade upper window',x,nn,base+height-4.1,4.7,.08,2.5,GLASS)
            box('End wall window sill',x,nn+side*.22,base+height-5.45,5.2,.38,.28,LIGHT)
        box('Side facade string course',mid,nn+side*.10,base+7.0,depth,.25,.24,LIGHT)
    # Pier warehouse, extending east over water, behind the ornate bulkhead.
    ZONE=f'Pier {number} shed and deck';end=858 if number==1 else 852 if number==3 else 836
    shedwidth=width-20;shedfront=689;shedlength=end-shedfront-5;shedmid=shedfront+shedlength/2
    box('Pier concrete deck', (687+end)/2,north,4.52,end-687,shedwidth+10,1.3,GRANITE)
    box('Pier deck top', (687+end)/2,north,5.215,end-687,shedwidth+10,.09,PAVE)
    box('Historic freight shed',shedmid,north,10.05,shedlength,shedwidth,9.62,STONE)
    roof('Long zinc cargo shed gable',shedmid,north,14.94,shedlength+1,shedwidth+1,4.3,METAL)
    box('Shed ridge clerestory',shedmid,north,18.35,shedlength-5,4.0,1.7,GLASS)
    roof('Clerestory cap',shedmid,north,19.25,shedlength-4,5.0,.65,METAL)
    for x in range(696,int(end)-3,10):
        for s in [-1,1]:
            nn=north+s*shedwidth/2
            box('Freight shed vertical pilaster',x,nn+s*.11,9.5,.58,.28,8.5,LIGHT)
            box('Freight shed high window',x+4.6,nn+s*.03,12.5,6.8,.10,2.3,GLASS)
            for dx in [-2,0,2]:box('Warehouse steel mullion',x+4.6+dx,nn+s*.09,12.5,.12,.09,2.4,GREEN,True)
            beam('Roof standing seam',(x,north+s*(shedwidth/2+.5),15.0),(x,north,19.2),.048,METAL,5,True)
        for nn in [north-shedwidth/2-2.5,north+shedwidth/2+2.5]:
            beam('Concrete pier pile',(x,nn,-4),(x,nn,4.6),.55,GRANITE,8)
            beam('Timber fender pile',(x+.7,nn+(-1 if nn<north else 1)*2,-2.6),(x+.7,nn+(-1 if nn<north else 1)*2,6.1),.24,WOOD,8)
    for s in [-1,1]:
        nn=north+s*(shedwidth/2+4.2)
        railing_segment(692,nn,end,nn,5.26)
    for nn in [north-shedwidth/2-1,north+shedwidth/2+1]:
        box('Massive pier-end fender beam',end+.16,nn,1.2,.5,4.2,3.5,WOOD)
    # A readable warehouse end identifies the offshore architecture as a real pier.
    box('Pier rear loading opening',end-5.0,north,9.2,.12,8,7.6,GREEN)
    label(('PIER 1½' if number==1.5 else f'PIER {number}'),end-4.8,north,14.6,1.5,LIGHT,13,(1,0))

# Pier7: the slender public promenade, white globe lamps, timber deck and benches.
ZONE='Pier 7 timber promenade';p7=1070;start=687;end=936;width=11.4;top=5.24
box('Pier 7 continuous structural deck',(start+end)/2,p7,top-.60,end-start,width,1.20,GRANITE)
# Top planks are individual strips with visible dark joints and alternating grains.
for i,x in enumerate(range(start,end,1)):
    box('Pier 7 timber board',x+.49,p7,top+.018,.965,width,.105,WOOD,True)
box('Pier7 end belvedere',end-4,p7,top-.23,12.0,19,.50,WOOD)
for x in range(start+5,end,16):
    for s in [-1,1]:
        nn=p7+s*4.5
        beam('Pier 7 concrete support pile',(x,nn,-5),(x,nn,top-.65),.35,GRANITE,10)
    beam('Pier 7 cross headstock',(x,p7-5.8,top-.84),(x,p7+5.8,top-.84),.28,WOOD,8)
    beam('Pier 7 X brace',(x,p7-4.5,-1.8),(x,p7+4.5,top-1.1),.16,WOOD,8,True)
    beam('Pier 7 X brace',(x,p7+4.5,-1.8),(x,p7-4.5,top-1.1),.16,WOOD,8,True)
for s in [-1,1]:
    nn=p7+s*(width/2-.23);railing_segment(start,nn,end-10,nn,top)
    railing_segment(end-10,nn,end-10,p7+s*9.0,top)
    railing_segment(end-10,p7+s*9,end+2,p7+s*9,top)
    for x in range(start+9,end-4,22):
        lamp(x,p7+s*4.65,top,True)
        if x>start+13:bench(x+7,p7+s*4.35,top,math.pi/2 if s>0 else -math.pi/2)
railing_segment(end+2,p7-9,end+2,p7+9,top)
# The entrance is intentionally open and legible from Washington.
for s in [-1,1]:
    box('Pier 7 entry granite plinth',680,p7+s*8,top+.68,1.7,1.6,1.35,GRANITE)
    box('Pier 7 bronze dedication plaque',679.12,p7+s*8,top+.88,.035,1.1,.56,GOLD)
    label('PIER 7',679.09,p7+s*8,top+.9,.20,RAIL,1)
# North Ferry Plaza waiting area: modest shelter with a real open canopy.
ZONE='North Ferry Plaza Gate B'
base=deck(713,396)
box('Gate B concrete landing',719,392,base-.40,64,35,.8,GRANITE)
box('Gate B granite apron',719,392,base+.025,64,35,.12,PAVE)
for x in [695,708,721,734]:
    for n in [383,401]:beam('Ferry waiting shelter column',(x,n,base),(x,n,base+5.3),.14,RAIL,12)
box('Ferry waiting shelter clerestory',714.5,392,base+5.40,44,20,.28,METAL)
roof('Gate B slender shelter roof',714.5,392,base+5.55,45,21,.9,METAL)
for x in [699,710,721,732]:
    bench(x,384,base);bench(x,400,base)
box('Gate B enamel sign',692.7,392,base+3.8,.12,10,1.5,GREEN)
label('GATE B',692.61,392,base+3.9,1.0,WHITE,8)
label('SAN FRANCISCO BAY FERRY',692.60,392,base+2.7,.40,RAIL,12)
for n in [378,406]:railing_segment(693,n,750,n,base)
for x in [697,715,733,748]:
    for n in [377,407]:beam('Gate B wharf piling',(x,n,-4),(x,n,base-.3),.60,GRANITE,10)
# Quay edge rails only between open pier approaches; never across Market finish.
for n0,n1 in SOUTH_SECTIONS+[(120,138),(356,375),(409,698),(782,788),(822,838),(912,930),(1000,1059),(1081,1128)]:
    ZONE=f'Quay rail {n0}';railing_segment(685.8,n0,685.8,n1,deck(685.8,(n0+n1)/2))
    for n in range(n0+5,n1,30 if n1<=120 else 15):bollard(682,n,deck(682,n))

# Build semantically named, spatially divided meshes. Detail is a separate LOD layer.
for (zone,matname,detail),(verts,faces,uvs,mat) in BATCHES.items():
    data=bpy.data.meshes.new(zone+' geometry');data.from_pydata(verts,[],faces);data.materials.append(mat);data.update()
    layer=data.uv_layers.new(name='Architectural UV')
    for loop,uv in zip(layer.data,uvs):loop.uv=uv
    ob=bpy.data.objects.new(zone+' | '+matname.split(' / ')[-1]+(' | detail' if detail else ''),data);bpy.context.collection.objects.link(ob)
    ob['sfCanonicalOrientation']=True;ob['sfDetail']=detail;ob['sfDistrict']='Embarcadero';ob['sfComponent']=zone;ob['asset_section']=zone
    OBJECTS.append(ob)
# Save a source with clear collections and review cameras.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.30,.42,.50);scene.view_settings.view_transform='AgX'
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.50,.68,.83,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55
bpy.ops.object.light_add(type='SUN',location=(400,100,400));sun=bpy.context.object;sun.name='Waterfront afternoon';sun.rotation_euler=(.6,-.45,-.4);sun.data.energy=3.0;sun.data.angle=.1
bpy.ops.object.camera_add(location=(514,1104,94));camera=bpy.context.object;camera.name='Pier 7 and historic piers review';camera.rotation_euler=(Vector((740,890,9))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=38;camera.data.clip_end=2500;scene.camera=camera
# Review-only water/ground objects do not enter glTF.
mat=material('review turquoise water','#247d8b',.3,.15)
bpy.ops.mesh.primitive_plane_add(size=3000,location=(1280,220,-2));water=bpy.context.object;water.name='REVIEW ONLY bay';water.data.materials.append(mat)
bpy.ops.mesh.primitive_plane_add(size=2,location=(550,180,1.2));land=bpy.context.object;land.name='REVIEW ONLY inland';land.scale=(53,950,1);land.data.materials.append(GRANITE)
# Save Blender source before export, with only authorship assets selected.
bpy.ops.object.select_all(action='DESELECT')
for ob in OBJECTS:ob.select_set(True)
bpy.context.view_layer.objects.active=OBJECTS[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'embarcadero.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'embarcadero.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_apply=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=17,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
# Performance variant retains architectural silhouette, windows and shore infrastructure.
for ob in OBJECTS:ob.select_set(not ob.get('sfDetail',False))
bpy.ops.export_scene.gltf(filepath=str(OUT/'embarcadero-lod.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_apply=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=17,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
triangles=sum(sum(max(0,len(p.vertices)-2) for p in ob.data.polygons) for ob in OBJECTS)
lodtris=sum(sum(max(0,len(p.vertices)-2) for p in ob.data.polygons) for ob in OBJECTS if not ob.get('sfDetail',False))
metadata={'coordinateSystem':'Blender X east, Y north, Z up; glTF X east, Y up, Z south. Load world origin, no Z reflection.','triangles':triangles,'lodTriangles':lodtris,'closeBytes':(OUT/'embarcadero.glb').stat().st_size,'lodBytes':(OUT/'embarcadero-lod.glb').stat().st_size,'compression':'Draco level6, positions17bit, normals10bit, UV12bit','meshes':len(OBJECTS),'materials':len(set(ob.active_material.name for ob in OBJECTS)),'ground':'2.24m at Market, 5.24m north of 400; level Ferry apron x>=682,north140..355','semanticBounds':{'west':603.3,'east':938.05,'south':-770,'north':1130},'source':'art/source/embarcadero.blend','piers':[{'number':i,'north':n,'frontEast':654,'width':w} for i,n,w,h in PIERS]+[{'number':7,'north':1070,'startEast':687,'endEast':938,'width':11.4}], 'palmAnchors':PALMS,'southernPalmAnchors':SOUTH_PALMS,'clearCorridors':[{'minEast':590,'maxEast':685,'minNorth':242.3,'maxNorth':257.7}], 'authorship':'Original geometry created in Blender; compressed historic pier sequence, not a surveyed city model.'}
(OUT/'embarcadero.json').write_text(json.dumps(metadata,indent=2))
if '--skip-render' in sys.argv:
    print(json.dumps({'triangles':triangles,'lodTriangles':lodtris,'meshes':len(OBJECTS),'palmAnchors':len(PALMS)}));sys.exit(0)
scene.render.filepath=str(REVIEW/'embarcadero-piers.png');bpy.ops.render.render(write_still=True)
camera.location=(620,1102,12.2);camera.rotation_euler=(Vector((837,1069,6.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=30
scene.render.filepath=str(REVIEW/'embarcadero-pier7.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'triangles':triangles,'lodTriangles':lodtris,'meshes':len(OBJECTS),'palmAnchors':len(PALMS)}))

camera.location=(561,184,32);camera.rotation_euler=(Vector((666,-170,3))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=34
scene.render.filepath=str(REVIEW/'embarcadero-south-continuation.png');bpy.ops.render.render(write_still=True)
