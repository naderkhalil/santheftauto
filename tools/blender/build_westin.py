"""Reference-led Westin St. Francis hero model. Run with Blender --background --python.
Blender axes: X across Powell front, +Y into hotel, +Z up. Front origin at street.
All static geometry is batched by material; embedded textures make the GLB portable.
"""
import bpy, bmesh, math, random, os, json, sys, struct
import numpy as np
from mathutils import Vector
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/hero'; SOURCE = ROOT / 'art/source'
OUT.mkdir(parents=True, exist_ok=True); SOURCE.mkdir(parents=True, exist_ok=True)
REVIEWS=ROOT/'art/reviews';REVIEWS.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials): bpy.data.materials.remove(d)
random.seed(1904)
MATS = {}; BATCH = {}; GROUP = 'westin_historic'

def image(name, values, noncolor=False):
    h,w,c=values.shape
    im=bpy.data.images.new(name,width=w,height=h,alpha=c==4)
    if c==3: values=np.concatenate((values,np.ones((h,w,1))),axis=2)
    if noncolor: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(np.asarray(values,np.float32).reshape(-1))
    im.pack(); return im

def stone_maps(name, base, course=.26, rough=.82):
    n=512; yy,xx=np.mgrid[0:n,0:n]; rng=np.random.default_rng(44)
    noise=rng.normal(0,.021,(n,n))
    # Two physical meters per UV tile; mild honed stone pores, mortar channels.
    rows=np.floor(yy/(n*course)); joints=(np.mod(yy,n*course)<1.7)
    vertical=np.mod(xx+np.mod(rows,2)*n*.24,n*.48)<1.4
    joint=np.maximum(joints,vertical*.7)
    blocknoise=np.sin(np.floor((xx+np.mod(rows,2)*n*.24)/(n*.48))*12.31+rows*17.4)*.017
    streak=(np.sin(xx*.33)*np.sin(yy*.075)+np.sin(xx*.016+yy*.013))*.009
    val=noise+blocknoise+streak-joint*.105
    color=np.clip(np.array(base)[None,None,:]+val[:,:,None],0,1)
    height=noise*.12-joint*.085
    dy,dx=np.gradient(height)
    norm=np.stack((-dx*3,-dy*3,np.ones_like(dx)),axis=2);norm/=np.linalg.norm(norm,axis=2)[:,:,None]
    return image(name+' albedo',color),image(name+' normal',norm*.5+.5,True),image(name+' roughness',np.repeat(np.clip(rough+noise*2+joint*.08,0,1)[:,:,None],3,axis=2),True)

def mat(name,color,rough=.8,metal=0,maps=None,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if emission: p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    if maps:
        for idx,target in [(0,'Base Color'),(2,'Roughness')]:
            tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=maps[idx];m.node_tree.links.new(tex.outputs['Color'],p.inputs[target])
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=maps[1]
        norm=m.node_tree.nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.45
        m.node_tree.links.new(tex.outputs['Color'],norm.inputs['Color']);m.node_tree.links.new(norm.outputs['Normal'],p.inputs['Normal'])
    MATS[name]=m;return name

stone=mat('Westin / gray rusticated sandstone',(.55,.54,.50),maps=stone_maps('Westin gray stone',(.57,.56,.525)))
trim=mat('Westin / carved limestone edges',(.64,.63,.585),maps=stone_maps('Westin carved stone',(.65,.64,.595),.50,.77))
base=mat('Westin / granite ground storey',(.43,.435,.416),maps=stone_maps('Westin granite',(.455,.46,.435),.21,.82))
copper=mat('Westin / oxidized copper crown',(.15,.275,.205),.68,.35)
bronze=mat('Westin / patinated architectural bronze',(.115,.135,.12),.38,.72)
glass=mat('Westin / recessed reflected windows',(.17,.245,.29),.23,.46)
interior=mat('Westin / curtain and room depth',(.53,.43,.31),.96)
roof=mat('Westin / roof and shadow wells',(.105,.115,.112),.94)
concrete=mat('Westin / Pereira tower concrete',(.58,.58,.525),maps=stone_maps('Westin tower',(.61,.61,.56),.45,.87))
lamp=mat('Westin / warm lantern glass',(.97,.77,.45),.38,.0,emission=.45)

# A sixteen-cell window atlas gives actual curtain folds, reflections, and room
# variation, rather than a single bright repeated rectangle.
n=512; arr=np.zeros((n,n,3),np.float32)
for row in range(4):
 for col in range(4):
    yy,xx=np.mgrid[0:128,0:128]; u=xx/127.;v=yy/127.;seed=row*4+col
    sky=np.array([.17,.245,.285])[None,None,:]+(v*.095)[:,:,None]
    a=np.broadcast_to(sky,(128,128,3)).copy()
    # Diagonal muted reflections read as glass without painting opaque blue.
    a+=np.maximum(0,1-np.abs(u-v*.3-.43)*5)[:,:,None]*np.array([.025,.03,.025])
    gap=.18+(seed%5)*.07;curtain=(u<gap)|(u>1-gap*.7)
    folds=.71+.12*np.cos(xx*.42)+.07*np.sin(xx*.8)
    tint=np.array([.42,.395,.325]) if seed%4 else np.array([.61,.535,.41])
    a[curtain]=folds[curtain,None]*tint
    a[:5]*=.47;a[-5:]*=.60;a[:,:5]*=.62;a[:,-5:]*=.62
    arr[row*128:(row+1)*128,col*128:(col+1)*128]=a
atlas=image('Westin / sixteen curtain rooms',arr)
p=MATS[glass].node_tree.nodes.get('Principled BSDF');tex=MATS[glass].node_tree.nodes.new('ShaderNodeTexImage');tex.image=atlas
MATS[glass].node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])

# Mesh constructors store faces directly, avoiding thousands of Blender objects.
def face(points,material,uv=None):
    key=(GROUP,material)
    if key not in BATCH:BATCH[key]=[[],[],[]]
    verts,faces,uvs=BATCH[key]; start=len(verts);verts.extend(points);faces.append(list(range(start,start+len(points))))
    if uv is None:
        normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]));ax=max(range(3),key=lambda i:abs(normal[i]))
        ids=[i for i in range(3) if i!=ax];uv=[(p[ids[0]]/2,p[ids[1]]/2) for p in points]
    uvs.append(uv)

def box(w,d,h,x,y,z,material,bevel=0,rotation=0):
    half=[w/2,d/2,h/2];b=min(bevel,min(half)*.45); c=math.cos(rotation);s=math.sin(rotation)
    def tr(p):return (x+c*p[0]-s*p[1],y+s*p[0]+c*p[1],z+p[2])
    for ax in range(3):
      ij=[i for i in range(3) if i!=ax]
      for sign in [-1,1]:
        pts=[]
        for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
          p=[0,0,0];p[ax]=half[ax]*sign;p[ij[0]]=u*(half[ij[0]]-b);p[ij[1]]=v*(half[ij[1]]-b);pts.append(tr(p))
        face(pts,material)
    if not b:return
    for a,j in [(0,1),(0,2),(1,2)]:
      k=3-a-j
      for sa in [-1,1]:
       for sj in [-1,1]:
        pts=[]
        for which,sk in [(0,-1),(1,-1),(1,1),(0,1)]:
          p=[0,0,0];p[a]=(half[a]-(b if which else 0))*sa;p[j]=(half[j]-(0 if which else b))*sj;p[k]=(half[k]-b)*sk;pts.append(tr(p))
        face(pts,material)
    for sx in [-1,1]:
     for sy in [-1,1]:
      for sz in [-1,1]:
        signs=[sx,sy,sz];pts=[]
        for ax in range(3):pts.append(tr([signs[i]*(half[i]-(0 if i==ax else b)) for i in range(3)]))
        face(pts,material)

def cylinder(a,b,r,material,segments=8,r2=None):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
    if u.length<.01:u=direction.cross(Vector((0,1,0)))
    u.normalize();v=direction.cross(u);r2=r if r2 is None else r2
    rings=[[tuple(p+(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments))*rad) for i in range(segments)] for p,rad in [(a,r),(b,r2)]]
    face(rings[0],material);face(rings[1],material)
    for i in range(segments):j=(i+1)%segments;face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],material)

class Facade:
 def __init__(self,x,y,yaw=0,detail=True):self.x=x;self.y=y;self.yaw=yaw;self.c=math.cos(yaw);self.s=math.sin(yaw);self.detail=detail
 def p(self,x,y,z):return (self.x+self.c*x-self.s*y,self.y+self.s*x+self.c*y,z)
 def b(self,w,d,h,x,y,z,m,bevel=0):p=self.p(x,y,z);box(w,d,h,*p,m,bevel if self.detail else 0,self.yaw)
 def f(self,pts,m,uv=None):face([self.p(*p) for p in pts],m,uv)
 def rod(self,a,b,r,m,n=8):cylinder(self.p(*a),self.p(*b),r,m,n)
 def window(self,x,z,w=1.66,h=2.2,variant=0,ornate=False):
    # Wall is y=0…0.65. Glass/bronze are inside a real 50cm opening.
    cell=variant%16;u=(cell%4)/4;v=(cell//4)/4;e=.003
    self.f([(x-w/2,.52,z-h/2),(x+w/2,.52,z-h/2),(x+w/2,.52,z+h/2),(x-w/2,.52,z+h/2)],glass,[(u+e,v+e),(u+.25-e,v+e),(u+.25-e,v+.25-e),(u+e,v+.25-e)])
    for side in [-1,1]:
      self.b(.085,.12,h+.05,x+side*(w/2-.045),.405,z,bronze)
      self.b(.13,.63,h+.27,x+side*(w/2+.10),.265,z,trim)
    for zz in [z-h/2,z+h/2]:self.b(w,.12,.09,x,.405,zz,bronze)
    self.b(.055,.12,h,x,.39,z,bronze);self.b(w,.12,.062,x,.38,z-.08,bronze)
    self.b(w+.52,.48,.13,x,-.075,z-h/2-.09,trim,.022)
    self.b(w+.35,.28,.13,x,-.045,z+h/2+.11,trim,.015)
    if ornate:
      self.b(w+.72,.49,.17,x,-.11,z+h/2+.35,trim,.025)
      for side in [-1,1]: self.b(.18,.30,.31,x+side*(w/2+.15),-.07,z-h/2-.26,trim)
 def wall(self,width,bays,floors,lower=8.15,top=42):
    # Assemble masonry piers and spandrels around open windows; no hidden box
    # can cover glazing, which was the central visual limitation of the v1.
    for row,(z,h) in enumerate(floors):
      low=lower if row==0 else (floors[row-1][0]+floors[row-1][1]/2)
      sill=z-h/2
      if sill>low:self.b(width,.72,sill-low,0,.36,(low+sill)/2,stone)
      intervals=[(-width/2,bays[0]-1.66/2)]+[(bays[j]+1.66/2,bays[j+1]-1.66/2) for j in range(len(bays)-1)]+[(bays[-1]+1.66/2,width/2)]
      for a,b in intervals:
       if b>a:self.b(b-a,.72,h,(a+b)/2,.36,z,stone)
      for j,x in enumerate(bays):self.window(x,z,1.66,h,row*7+j+int(self.x),row in [0,8])
    high=floors[-1][0]+floors[-1][1]/2
    self.b(width,.72,top-high,0,.36,(top+high)/2,stone)

floors=[(9.5+i*2.93,2.05 if i<8 else 2.18) for i in range(11)]

def ornament(f,x,z):
    # Relief cartouche: recessed tablet, fluted shoulders and carved rosette.
    f.b(1.12,.16,1.36,x,-.11,z,trim,.04);f.b(.81,.06,1.02,x,-.215,z,stone)
    for i in range(8):
      a=i*math.tau/8;px=x+math.sin(a)*.28;pz=z+math.cos(a)*.28
      f.b(.18,.15,.25,px,-.285,pz,trim,.055)
    f.b(.23,.21,.23,x,-.29,z,trim,.05)

def arch_store(f,x,w=2.85,h=4.45):
    r=w/2; spring=h-r; steps=12
    # Back of a genuine arch; ground door surrounds have geometric voussoirs.
    pts=[(x-r,.48,.20),(x+r,.48,.20),(x+r,.48,spring)]+[(x+math.cos(i*math.pi/steps)*r,.48,spring+math.sin(i*math.pi/steps)*r) for i in range(1,steps+1)]
    f.f(pts,glass,[(.05,.05),(.20,.05),(.20,.20)]+[(.125+math.cos(i*math.pi/steps)*.10,.125+math.sin(i*math.pi/steps)*.10) for i in range(1,steps+1)])
    for side in [-1,1]:f.b(.19,.65,spring,x+side*(r+.12),.04,spring/2,trim,.025)
    for i in range(steps):
      a=i*math.pi/steps+.009;b=(i+1)*math.pi/steps-.009;out=r+.29;inside=r+.025
      ring=[(x+math.cos(a)*inside,-.15,spring+math.sin(a)*inside),(x+math.cos(b)*inside,-.15,spring+math.sin(b)*inside),(x+math.cos(b)*out,-.15,spring+math.sin(b)*out),(x+math.cos(a)*out,-.15,spring+math.sin(a)*out)]
      f.f(ring,trim)
      f.f([ring[0],ring[1],(ring[1][0],.48,ring[1][2]),(ring[0][0],.48,ring[0][2])],trim)
    f.b(.35,.48,.52,x,-.13,h+.035,trim,.035)
    f.b(w-.16,.15,.10,x,.27,2.40,bronze)
    for side in [-1,0,1]:f.b(.072,.18,2.3,x+side*w*.31,.24,1.26,bronze)
    for side in [-1,1]:f.b(.043,.09,.54,x+side*.20,.12,1.35,trim,.018)
    # Stone spandrel infill above curve closes the arch all the way to floor2.
    for i in range(steps):
      a=-r+i*w/steps;b=-r+(i+1)*w/steps
      za=spring+math.sqrt(max(0,r*r-a*a));zb=spring+math.sqrt(max(0,r*r-b*b))
      f.f([(x+a,0,za),(x+b,0,zb),(x+b,0,5.35),(x+a,0,5.35)],base)

def ground_floor(f,width,bays):
    # Tall arched openings alternate with deeply rusticated stone piers.
    for a,b in [(-width/2,bays[0]-1.70)]+[(bays[i]+1.70,bays[i+1]-1.70) for i in range(len(bays)-1)]+[(bays[-1]+1.70,width/2)]:
      if b>a:f.b(b-a,.88,5.35,(a+b)/2,.44,2.675,base)
    for x in bays:arch_store(f,x)
    f.b(width,.83,.45,0,.37,5.53,base)
    smallfloors=[(6.92,1.7)]
    for x in bays:
      f.window(x,6.92,1.66,1.7,int(x)*7,True)
    for a,b in [(-width/2,bays[0]-.83)]+[(bays[i]+.83,bays[i+1]-.83) for i in range(len(bays)-1)]+[(bays[-1]+.83,width/2)]:
      if b>a:f.b(b-a,.75,2.4,(a+b)/2,.375,6.95,base)
    f.b(width,.75,.32,0,.375,5.915,base)
    f.b(width,.75,.38,0,.375,7.96,base)
    for z in [5.78,8.07]:f.b(width+.18,.34,.17,0,-.045,z,trim,.02)

def crown(f,width):
    for z,d,h,m in [(8.30,.82,.22,trim),(31.72,.82,.19,trim),(32.02,1.0,.20,trim),(38.3,.57,.16,trim),(40.40,.83,.20,trim),(40.78,1.11,.20,trim),(41.07,1.40,.30,trim),(41.39,1.58,.14,copper),(41.67,1.05,.24,trim),(42.02,1.28,.20,copper)]:
      f.b(width+.55,d,h,0,.06-d*.16,z,m,.02)
    for x in np.arange(-width/2+.3,width/2,.67):
      f.b(.22,.63,.30,float(x),-.37,40.7,trim)
    for x in np.arange(-width/2+.48,width/2,1.32):
      f.b(.40,.28,.38,float(x),-.37,41.85,copper,.05)
    # Carved upper-storey tablets sit between the very top windows.
    for x in np.arange(-width/2+1.2,width/2-1,3.15):ornament(f,float(x),39.22)

# Historic block: three unequal projecting pavilions, two 10m-deep courts.
wings=[(-33,25),(0,22),(33,25)]
for cx,w in wings:
    bays=list(np.linspace(-w/2+2.22,w/2-2.22,6 if w>23 else 5))
    front=Facade(cx,0);ground_floor(front,w,bays);front.wall(w,bays,floors);crown(front,w)
    # Deep stone quoins identify the corners and give sunlight a rhythmic edge.
    for x in [-w/2+.30,w/2-.30]:
      for z in np.arange(.32,40.2,.56):front.b(.56,.13,.48,x,-.04,float(z),trim)
    # Roof inner deck and fully windowed side returns.
    box(w,31,.36,cx,15.5,41.94,roof)
    for sign in [-1,1]:
      ret=Facade(cx+sign*w/2,15.5,sign*math.pi/2,False)
      sidebays=list(np.linspace(-13.1,13.1,8))
      ground_floor(ret,31,sidebays);ret.wall(31,sidebays,floors);crown(ret,31)
for cx,w in [(-15.75,9.5),(15.75,9.5)]:
    court=Facade(cx,10.0,detail=False);bays=[-2.15,2.15]
    ground_floor(court,w,bays);court.wall(w,bays,floors);crown(court,w)
    box(w,22,.40,cx,21,41.91,roof)
# Rear connector closes hotel roof against tower podium.
box(91,5,42,0,33.5,21,stone)
# Each pavilion and court back has a roof; the light courts remain open to sky.

# The Powell entrance: open glass canopy with layered bronze ribs, filigree
# fascia, pendant lanterns, revolving doors, medallions and raised brass name.
f=Facade(0,0)
f.b(17.3,4.7,.13,0,-2.10,4.79,bronze,.04)
for x in np.arange(-8,8.1,1.2):
    f.b(.062,4.5,.20,float(x),-2.1,4.90,trim)
    f.b(1.1,4.4,.036,float(x)+.59,-2.1,4.87,glass)
for z in [4.49,4.79,4.99]:f.b(17.6,.18,.10,0,-4.49,z,bronze,.022)
f.b(17.3,.09,.35,0,-4.44,4.69,bronze)
for x in np.arange(-8.3,8.4,.55):
    f.rod((float(x)-.12,-4.55,4.52),(float(x)+.12,-4.55,4.87),.018,trim,5)
for x in [-7.75,7.75]:
    f.rod((x,-3.86,.08),(x,-3.86,4.75),.092,bronze,10)
    for z in [.12,.29,3.8,4.3]:f.b(.29,.29,.14,x,-3.86,z,bronze,.03)
    f.rod((x,-3.85,3.82),(x,-2.77,4.79),.055,bronze,8)
# Hanging lanterns deliberately visible from the driving camera.
for x in [-6,-3,0,3,6]:
    f.rod((x,-2.4,4.70),(x,-2.4,4.10),.027,bronze,6)
    f.b(.33,.33,.50,x,-2.4,3.85,lamp,.025)
    for side in [-1,1]:
      for sy in [-1,1]:f.rod((x+side*.17,-2.4+sy*.17,3.57),(x+side*.17,-2.4+sy*.17,4.14),.024,bronze,5)
    for z in [3.58,4.12]:f.b(.43,.43,.07,x,-2.4,z,bronze,.02)
# Two entrance bronze doors, an inset revolving-door drum and interior lobby.
f.b(7.2,.12,3.4,0,1.75,1.7,interior)
for x in [-2.2,2.2]:
    f.b(1.64,.12,2.5,x,.25,1.25,glass)
    for side in [-1,1]:f.b(.065,.15,2.5,x+side*.80,.17,1.25,bronze)
    f.b(1.72,.16,.08,x,.17,2.50,bronze);f.b(.037,.06,.57,x-.30,.05,1.35,trim,.014)
# Real extruded lettering, with its own glyph mesh merged into the bronze batch.
def lettering(text,x,y,z,size,material):
    curve=bpy.data.curves.new('Westin raised serif lettering','FONT');curve.body=text;curve.align_x='CENTER';curve.size=size;curve.extrude=.008;curve.bevel_depth=.003;curve.bevel_resolution=0;curve.resolution_u=5
    ob=bpy.data.objects.new('Westin entrance name',curve);bpy.context.collection.objects.link(ob)
    ob.location=(x,y,z);ob.rotation_euler=(math.pi/2,0,0)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for poly in ob.data.polygons:face([tuple(ob.data.vertices[i].co) for i in poly.vertices],material)
    bpy.data.objects.remove(ob,do_unlink=True)
f.b(7.1,.08,.48,0,-4.59,4.40,bronze,.025)
f.b(7.20,.07,.05,0,-4.65,4.16,trim,.015)
f.b(7.20,.07,.05,0,-4.65,4.64,trim,.015)
lettering('THE WESTIN ST. FRANCIS',0,-4.66,4.29,.31,trim)
lettering('ST. FRANCIS',0,-.62,5.30,.57,trim)
for x in [-4.6,4.6]:ornament(f,x,5.65)

# Two subdued cloth flags, woven folds in mesh (no stiff rectangular billboards).
flagtex=np.ones((256,512,3),np.float32)*.85
for i in range(13):
    if i%2==0:flagtex[int(i*256/13):int((i+1)*256/13),:256]=[.50,.045,.04]
flagtex[118:256,:110]=[.045,.085,.19]
for yy in range(128,250,21):
 for xx in range(8,108,16):flagtex[yy:yy+3,xx:xx+3]=[.95,.94,.86]
flagtex[:25,256:]=[.53,.065,.045]
flagtex[91:128,330:425]=[.22,.16,.09]
flagmat=mat('Westin / woven national and state flags',(.8,.8,.8),.9)
p=MATS[flagmat].node_tree.nodes.get('Principled BSDF');t=MATS[flagmat].node_tree.nodes.new('ShaderNodeTexImage');t.image=image('Westin flags',flagtex);MATS[flagmat].node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
MATS[flagmat].use_backface_culling=False
for idx,x in enumerate([-33,33]):
    cylinder((x,1,42.1),(x,1,52.5),.038,bronze,8)
    for u in range(14):
      for v in range(7):
        points=[];uv=[]
        for du,dv in [(0,0),(1,0),(1,1),(0,1)]:
          a=(u+du)/14;b=(v+dv)/7
          # b runs down the cloth; Blender image V runs up. Keep the US canton
          # at the upper hoist and the California red stripe at the bottom.
          points.append((x+a*3.8,1+math.sin(a*9+b*.4)*a*.36,51.9-b*2.1-a*.34));uv.append((idx*.5+a*.5,1-b))
        face(points,flagmat,uv)

# William Pereira tower silhouette: fluted concrete bays and dark glass slots.
GROUP='westin_towers'
towerglass=mat('Westin / dark tower glazing',(.105,.165,.195),.26,.52)
for idx,(cx,width,height,depth) in enumerate([(-22,38,84,29),(23,36,91,29)]):
    cy=50.5;box(width,depth,height,cx,cy,height/2,roof)
    for side in [-1,1]:
      fac=Facade(cx,cy-side*depth/2,0 if side==1 else math.pi)
      count=int(width/2.75)
      for j in range(count):
        xx=-width/2+(j+.5)*width/count
        # Recessed full-height glass interrupted by slim real floor spandrels.
        fac.b(width/count-.44,.10,height-7,xx,.02,(height-7)/2,towerglass)
        fac.b(.31,.77,height-3,xx-width/count/2,-.10,(height-3)/2,concrete,.045)
        for zz in np.arange(2.4,height-6,3.05):fac.b(width/count-.10,.39,.39,xx,-.10,float(zz),concrete)
      # Heavy sculpted crown and dark recessed top level are Pereira signatures.
      fac.b(width+.30,1.28,3.0,0,-.15,height-1.5,concrete,.08)
      for xx in np.arange(-width/2+.5,width/2,2.75):fac.b(.37,1.66,3.8,float(xx),-.38,height-1.9,concrete,.045)
    for side in [-1,1]:
      fac=Facade(cx+side*width/2,cy,side*math.pi/2)
      for j in range(10):
        xx=-depth/2+(j+.5)*depth/10
        fac.b(2.22,.13,height-7,xx,.02,(height-7)/2,towerglass)
        fac.b(.34,.74,height-3,xx-1.45,-.10,(height-3)/2,concrete,.025)
        for zz in np.arange(2.4,height-6,3.05):fac.b(2.8,.31,.36,xx,-.08,float(zz),concrete)
      fac.b(depth+.25,1.10,3.0,0,-.10,height-1.5,concrete,.06)
    box(width,depth,.40,cx,cy,height+.02,concrete,.04)
    for xx in [cx-width*.3,cx+width*.3]:box(4.1,5.5,1.7,xx,cy,height+1.05,roof,.06)

# Build minimal mesh objects, one per material and architectural mass.
objects=[]
for (group,material),(verts,faces,uvs) in BATCH.items():
    mesh=bpy.data.meshes.new(group+' / '+material);mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for poly,coords in zip(mesh.polygons,uvs):
      for i,coord in zip(poly.loop_indices,coords):uv.data[i].uv=coord
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    ob=bpy.data.objects.new(group+' / '+material,mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(MATS[material]);objects.append(ob)
    ob['reference']='https://commons.wikimedia.org/wiki/File:Westin_st_francis_san_francisco.jpg'
    ob['asset_role']='hero architecture / Powell Street'

# Render an architectural contact sheet from the identical delivery mesh.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world.color=(.34,.42,.5)
bpy.ops.object.light_add(type='SUN',location=(-70,-90,140));sunlight=bpy.context.object;sunlight.name='Reference SF sunlight';sunlight.data.energy=2.6;sunlight.data.angle=.065;sunlight.rotation_euler=(math.radians(28),math.radians(-24),math.radians(-25))
world=bpy.data.worlds.new('San Francisco clear blue sky');world.use_nodes=True
world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.38,.52,.70,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.55;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-70,-90,140));sun=bpy.context.object;sun.name='Reference soft sun';sun.data.energy=210000;sun.data.shape='DISK';sun.data.size=60;sun.rotation_euler=(Vector((0,15,25))-sun.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-104,-139,68));camera=bpy.context.object;camera.rotation_euler=(Vector((0,16,37))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='PERSP';camera.data.lens=42;scene.camera=camera
scene.render.resolution_x=1600;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
# Save editable source with organized mesh objects, maps, camera and lighting.
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'westin.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects:ob.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'westin.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
report={'asset':'westin.glb','triangles':triangles,'meshes':len(objects),'materials':len(MATS),'compression':'Draco; local decoder required','historicBounds':[-45.8,-4.8,0,45.8,36,52.5],'axis':'Blender Z up; local front -Y; glTF front +Z','reference':'https://commons.wikimedia.org/wiki/File:Westin_st_francis_san_francisco.jpg'}
(OUT/'westin.meta.json').write_text(json.dumps(report,indent=2)+'\n')
# The distant mesh shares materials and textures, while shedding carved relief.
lods=[]; lod_materials={}; lod_images={}
for ob in objects:
    lod=ob.copy();lod.data=ob.data.copy();lod.name=ob.name+' / distant';bpy.context.collection.objects.link(lod);lods.append(lod)
    # Distant stone does not need microscopic normals or 512px pore images.
    # Retain albedo identity and curtain variation at quarter resolution.
    for slot in lod.material_slots:
        src=slot.material
        if src.name not in lod_materials:
            lm=src.copy();lm.name=src.name+' / distant';p=lm.node_tree.nodes.get('Principled BSDF')
            for target in ['Normal','Roughness']:
                for link in list(p.inputs[target].links):lm.node_tree.links.remove(link)
            p.inputs['Roughness'].default_value=.78 if 'glaz' not in src.name and 'window' not in src.name else .28
            for node in lm.node_tree.nodes:
                if node.type=='TEX_IMAGE' and any(link.to_socket==p.inputs['Base Color'] for link in node.outputs['Color'].links):
                    original=node.image
                    if original.name not in lod_images:
                        small=original.copy();small.name=original.name+' / distant';small.scale(128,128);small.pack();lod_images[original.name]=small
                    node.image=lod_images[original.name]
            lod_materials[src.name]=lm
        slot.material=lod_materials[src.name]
    mod=lod.modifiers.new('Distant geometry budget','DECIMATE');mod.ratio=.26
bpy.ops.object.select_all(action='DESELECT')
for ob in lods:ob.select_set(True)
bpy.context.view_layer.objects.active=lods[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'westin-lod.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
for ob in lods:bpy.data.objects.remove(ob,do_unlink=True)
blob=(OUT/'westin-lod.glb').read_bytes();n=struct.unpack_from('<I',blob,12)[0];ld=json.loads(blob[20:20+n])
report['lodTriangles']=sum(ld['accessors'][prim['indices']]['count']//3 for mesh in ld['meshes'] for prim in mesh['primitives'])
report['bytes']=(OUT/'westin.glb').stat().st_size;report['lodBytes']=len(blob)
(OUT/'westin.meta.json').write_text(json.dumps(report,indent=2)+'\n')
print('WESTIN_ASSET_REPORT',json.dumps(report))
if '--skip-render' in sys.argv:sys.exit(0)
scene.render.filepath=str(REVIEWS/'westin-overview.png');bpy.ops.render.render(write_still=True)
camera.location=(13,-28,10);camera.rotation_euler=(Vector((0,-.5,5.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=39
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.filepath=str(REVIEWS/'westin-entrance.png');bpy.ops.render.render(write_still=True)
