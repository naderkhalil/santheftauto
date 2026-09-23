"""Reference-led Union Square department stores and Stockton frontage.
All geometry is original. Blender +X east, -Y north, +Z up, metre units.
Exports world X/Z relative to y=22 street ground; glTF importer only translates up.
Run Blender --background --python tools/blender/build_square_frontages.py
"""
import bpy, bmesh, math, random, sys, json, struct
import numpy as np
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/square-frontages'; SOURCE=ROOT/'art/source'; REVIEW=ROOT/'art/reviews'
for p in [OUT,SOURCE,REVIEW]:p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials):bpy.data.materials.remove(d)
random.seed(233)
MATS={};BATCH={};GROUP='Macys'

def image(name,arr,noncolor=False):
    h,w,c=arr.shape
    im=bpy.data.images.new(name,width=w,height=h,alpha=c==4)
    if c==3:arr=np.concatenate((arr,np.ones((h,w,1))),axis=2)
    if noncolor:im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(np.asarray(arr,np.float32).reshape(-1));im.pack();return im

def surface_maps(name,base,kind='stone'):
    n=512;yy,xx=np.mgrid[0:n,0:n];rng=np.random.default_rng(32)
    noise=rng.normal(0,.013,(n,n));a=np.broadcast_to(np.array(base),(n,n,3)).copy()
    if kind=='marble':
        vein=np.exp(-np.abs(np.sin(xx*.026+np.sin(yy*.012)*1.3+np.sin(xx*.013+yy*.043)*.25))*16)
        a+=noise[:,:,None]-vein[:,:,None]*.063
        joint=((xx%256<1)|(yy%128<1))*.045;height=noise*.055-joint*.03
    elif kind=='terracotta':
        # Four-square tile pattern seen on Philip Johnson's Neiman Marcus exterior.
        row=yy//64;col=xx//64;checker=(row+col)%2
        a+=(checker*.049-.024)[:,:,None]+noise[:,:,None]
        joint=((xx%64<1.4)|(yy%64<1.4))*.056;height=noise*.06-joint*.30
        # Fine concentric grooves provide the faceted granite/tile read.
        edge=np.minimum(np.minimum(xx%64,63-xx%64),np.minimum(yy%64,63-yy%64))
        a+=np.sin(edge*.72)[:,:,None]*.010
    else:
        joint=((yy%128<1.2)|((xx+(yy//128%2)*128)%256<1.2))*.050
        a+=noise[:,:,None]-joint[:,:,None]
        height=noise*.05-joint*.16
    dx,dy=np.gradient(height);normal=np.stack((-dy*4,dx*4,np.ones_like(dx)),axis=2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    return image(name+' albedo',np.clip(a,0,1)),image(name+' normal',normal*.5+.5,True)

def mat(name,color,rough=.75,metal=0,maps=None,emission=0,alpha=1):
    m=bpy.data.materials.new('Square / '+name);m.use_nodes=True;m.diffuse_color=(*color,alpha)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    if alpha<1:p.inputs['Alpha'].default_value=alpha;m.surface_render_method='DITHERED';m.use_backface_culling=True
    if maps:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=maps[0];m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=maps[1];nm=m.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.32
        m.node_tree.links.new(t.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],p.inputs['Normal'])
    MATS[name]=m;return name
stone=mat('Macy limestone',(.63,.62,.56),maps=surface_maps('Macy limestone',(.63,.62,.56)))
trim=mat('Carved warm limestone',(.76,.72,.63),maps=surface_maps('Carved limestone',(.76,.72,.63)))
marble=mat('Magnin white marble',(.80,.805,.77),maps=surface_maps('Magnin marble',(.80,.805,.77),'marble'))
terra=mat('Neiman checkerboard red granite',(.39,.205,.164),maps=surface_maps('Neiman red stone',(.39,.205,.164),'terracotta'))
bronze=mat('Patinated bronze frames',(.17,.15,.095),.33,.70)
steel=mat('Pale atrium steel',(.49,.60,.57),.38,.60)
glass=mat('Recessed smoked glass',(.125,.22,.25),.18,.55)
clear=mat('Atrium transparent glass',(.53,.73,.74),.13,.22,alpha=.17)
cream=mat('Rotunda carved cream plaster',(.81,.70,.49),.66)
gold=mat('Rotunda gilded ornament',(.58,.37,.105),.3,.73)
windowdark=mat('Interior shadow',(.075,.075,.063),.9)
interior=mat('Retail warm plaster',(.56,.46,.32),.84)
light=mat('Interior lamps',(.95,.71,.38),.45,emission=.55)
red=mat('Macy red enamel',(.61,.025,.025),.42)
roof=mat('Roof and service metal',(.20,.24,.24),.87)
black=mat('Storefront dark granite',(.065,.075,.066),.48)
wood=mat('Warm oak furnishings',(.41,.22,.09),.76)
# Colored displays give near-camera storefronts a human scale and interior depth.
fabrics=[mat('Display coral',(.62,.14,.065),.91),mat('Display indigo',(.07,.16,.26),.92),mat('Display ivory',(.84,.76,.60),.86),mat('Display sea green',(.17,.42,.34),.85)]
# No external images: these restrained reflected-room maps are baked originally.
n=256;yy,xx=np.mgrid[0:n,0:n];a=np.zeros((n,n,3),np.float32)
for j in range(4):
 for i in range(4):
    u=xx[:64,:64]/63;v=yy[:64,:64]/63;k=i+j*4
    c=np.broadcast_to(np.array([.16,.225,.25]),(64,64,3)).copy();c+=v[:,:,None]*.065
    band=np.maximum(0,1-np.abs(u-v*.23-.28-(k%3)*.16)*10);c+=band[:,:,None]*.041
    curtain=(u<.15+(k%4)*.045)|(u>.9);c[curtain]=np.array([.38,.335,.25])*(.80+.10*np.sin(xx[:64,:64][curtain]*.8))[:,None]
    a[j*64:(j+1)*64,i*64:(i+1)*64]=c
atlas=image('Sixteen restrained store window rooms',a)
p=MATS[glass].node_tree.nodes.get('Principled BSDF');t=MATS[glass].node_tree.nodes.new('ShaderNodeTexImage');t.image=atlas;MATS[glass].node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])

def face(points,material,uv=None):
    key=(GROUP,material)
    if key not in BATCH:BATCH[key]=[[],[],[]]
    verts,faces,uvs=BATCH[key];start=len(verts);verts.extend(points);faces.append(list(range(start,start+len(points))))
    if uv is None:
        norm=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]));ax=max(range(3),key=lambda i:abs(norm[i]));ids=[i for i in range(3) if i!=ax]
        uv=[(p[ids[0]]/4,p[ids[1]]/4) for p in points]
    uvs.append(uv)

def box(w,d,h,x,y,z,m,bevel=0,rotation=0):
    half=[w/2,d/2,h/2];b=min(bevel,min(half)*.45) if bevel>=.025 else 0;c=math.cos(rotation);s=math.sin(rotation)
    def tr(p):return(x+c*p[0]-s*p[1],y+s*p[0]+c*p[1],z+p[2])
    for ax in range(3):
     ij=[i for i in range(3) if i!=ax]
     for sign in [-1,1]:
      pts=[]
      for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
       p=[0,0,0];p[ax]=half[ax]*sign;p[ij[0]]=u*(half[ij[0]]-b);p[ij[1]]=v*(half[ij[1]]-b);pts.append(tr(p))
      face(pts,m)
    if b:
     for a,j in [(0,1),(0,2),(1,2)]:
      k=3-a-j
      for sa in [-1,1]:
       for sj in [-1,1]:
        pts=[]
        for which,sk in [(0,-1),(1,-1),(1,1),(0,1)]:
         p=[0,0,0];p[a]=(half[a]-(b if which else 0))*sa;p[j]=(half[j]-(0 if which else b))*sj;p[k]=(half[k]-b)*sk;pts.append(tr(p))
        face(pts,m)
     for sx in [-1,1]:
      for sy in [-1,1]:
       for sz in [-1,1]:
        signs=[sx,sy,sz];pts=[]
        for ax in range(3):pts.append(tr([signs[i]*(half[i]-(0 if i==ax else b)) for i in range(3)]))
        face(pts,m)

def rod(a,b,r,m,segments=8,r2=None):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
    if u.length<.01:u=direction.cross(Vector((0,1,0)))
    u.normalize();v=direction.cross(u);r2=r if r2 is None else r2
    rings=[[tuple(p+(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments))*rad) for i in range(segments)] for p,rad in [(a,r),(b,r2)]]
    face(rings[0][::-1],m);face(rings[1],m)
    for i in range(segments):j=(i+1)%segments;face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],m)

def ring(cx,cy,z,r,width,height,m,segments=48):
    for i in range(segments):
        a=math.tau*i/segments;b=math.tau*(i+1)/segments
        lo=[(cx+r0*math.cos(t),cy+r0*math.sin(t),z-height/2) for r0,t in [(r-width/2,a),(r+width/2,a),(r+width/2,b),(r-width/2,b)]]
        hi=[(x,y,z+height/2) for x,y,zz in lo]
        face(lo[::-1],m);face(hi,m)
        for j in range(4):k=(j+1)%4;face([lo[j],lo[k],hi[k],hi[j]],m)

class Facade:
    def __init__(self,x,wz,yaw=0):self.x=x;self.y=-wz;self.yaw=yaw;self.c=math.cos(yaw);self.s=math.sin(yaw)
    def p(self,u,d,h):return(self.x+self.c*u-self.s*d,self.y+self.s*u+self.c*d,h)
    def b(self,w,d,h,x,y,z,m,bevel=0):box(w,d,h,*self.p(x,y,z),m,bevel,self.yaw)
    def f(self,points,m,uv=None):face([self.p(*p) for p in points],m,uv)
    def rod(self,a,b,r,m,n=8):rod(self.p(*a),self.p(*b),r,m,n)
    def text(self,text,x,d,h,size,m,maxwidth=None,serif=False):
        curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.align_x='CENTER';curve.size=size;curve.extrude=.012;curve.bevel_depth=.004;curve.bevel_resolution=0;curve.resolution_u=4
        # Bundled Blender font is used so builds are reproducible on any OS.
        ob=bpy.data.objects.new(text,curve);bpy.context.collection.objects.link(ob);ob.location=self.p(x,d,h);ob.rotation_euler=(math.pi/2,0,self.yaw)
        bpy.context.view_layer.update()
        if maxwidth and ob.dimensions.length>0:
            width=max(v[0] for v in ob.bound_box)-min(v[0] for v in ob.bound_box)
            if width>maxwidth:ob.scale.x=maxwidth/width
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH');bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        for p in ob.data.polygons:face([tuple(ob.data.vertices[i].co) for i in p.vertices],m)
        bpy.data.objects.remove(ob,do_unlink=True)
    def window(self,x,z,w,h,var=0,ornate=True,recess=.68):
        k=var%16;u=(k%4)/4;v=(k//4)/4;e=.003
        self.f([(x-w/2,recess,z-h/2),(x+w/2,recess,z-h/2),(x+w/2,recess,z+h/2),(x-w/2,recess,z+h/2)],glass,[(u+e,v+e),(u+.25-e,v+e),(u+.25-e,v+.25-e),(u+e,v+.25-e)])
        for side in [-1,1]:
            self.b(.085,.12,h,x+side*(w/2-.045),recess-.04,z,bronze)
            self.b(.13,.75,h+.22,x+side*(w/2+.08),.30,z,trim if ornate else marble,.01)
        self.b(.065,.12,h,x,recess-.06,z,bronze)
        for zz in [z-h/2,z+h/2]:self.b(w,.13,.08,x,recess-.04,zz,bronze)
        self.b(w,.12,.065,x,recess-.08,z-h*.12,bronze)
        self.b(w+.42,.60,.15,x,-.03,z-h/2-.11,trim if ornate else marble,.02)
        if ornate:
            self.b(w+.30,.33,.15,x,-.09,z+h/2+.10,trim,.02)
            self.b(w+.58,.45,.11,x,-.12,z+h/2+.28,trim,.018)
    def panel_wall(self,width,bays,rows,windoww,windowh,height,m=stone,ground=6.4,ornate=True):
        prev=ground
        for row,z in enumerate(rows):
            low=z-windowh/2
            if low>prev:self.b(width,.82,low-prev,0,.41,(low+prev)/2,m)
            gaps=[(-width/2,bays[0]-windoww/2)]+[(bays[i]+windoww/2,bays[i+1]-windoww/2) for i in range(len(bays)-1)]+[(bays[-1]+windoww/2,width/2)]
            for a,b in gaps:
                if b>a:self.b(b-a,.82,windowh,(a+b)/2,.41,z,m)
            for j,x in enumerate(bays):self.window(x,z,windoww,windowh,j+row*7,ornate)
            prev=z+windowh/2
        if height>prev:self.b(width,.82,height-prev,0,.41,(height+prev)/2,m)
    def store(self,x,w,height=5.6,label=None):
        # Real recessed display bay: back wall, lit ceiling, plinths and suspended rails.
        self.b(w-.28,.18,height-.28,x,3.0,height/2,interior)
        self.b(w,.12,.25,x,.65,.125,black)
        self.b(w,3.0,.13,x,1.65,height-.10,cream)
        for sx in [-1,1]:self.b(.18,3.0,height,x+sx*w/2,1.5,height/2,black,.018)
        for sx in [-1,1]:
            px=x+sx*w*.25;self.b(w*.21,1.05,.35,px,1.8,.27,cream,.02)
            # Display bust, garment and small handbag silhouettes.
            self.rod((px,1.85,.44),(px,1.85,2.4),.036,bronze,6)
            self.b(.58,.26,.75,px,1.83,1.8,fabrics[int(abs(x*3+sx))%4],.07)
            self.b(.26,.25,.26,px,1.84,2.30,cream,.08)
            self.rod((px-.30,1.80,2.05),(px+.30,1.80,2.05),.05,fabrics[int(abs(x+sx))%4],6)
            self.b(.63,.51,.045,px,1.28,height-.21,light)
        self.f([(x-w/2,.48,.23),(x+w/2,.48,.23),(x+w/2,.48,height-.22),(x-w/2,.48,height-.22)],clear)
        for xx in [-w/2,0,w/2]:self.b(.07,.15,height-.22,x+xx,.40,height/2,bronze)
        self.b(w+.15,.29,.22,x,.18,height+.05,black,.025)
        if label:self.text(label,x,.12,height+.56,min(.63,w/14),trim,w*.9)

# MACY'S historic Geary frontage: repeated stone window bays wrapping a tall
# central concave glass atrium, with a separate white I. Magnin corner mass.
GROUP='Macys Geary'
cx=-20.5; width=79
# Back body starts five metres behind the windows; frontage is open and modeled.
box(width,46.5,35.9,cx,112.75,17.95,stone,.10)
for wingx in [-26.5,26.5]:
    f=Facade(cx+wingx,-83)
    f.panel_wall(26.0,[-8.65,-2.88,2.88,8.65],[9.6,14.55,19.5,24.45,29.4],3.52,3.35,34.25)
    for x in [-8.65,-2.88,2.88,8.65]:f.store(x,4.65,5.35)
    for zz in [6.4,12.1,17.05,22,26.95,32.1,33.9,34.45]:f.b(26.2,.42,.25,0,.05,zz,trim,.02)
    for x in [-12.8,-5.76,5.76,12.8]:
        f.b(.33,.55,26.3,x,-.05,19.75,trim,.025)
        f.b(.65,.79,.40,x,-.11,33.22,trim,.035)
    for x in np.arange(-12.2,12.3,.74):f.b(.23,.53,.31,float(x),-.10,33.64,trim)
    f.b(26.4,1.13,.41,0,-.18,34.80,trim,.04)
    # Seventh-storey glazed restaurant band under deep overhanging roof.
    for x in [-9.7,-6.5,-3.2,0,3.2,6.5,9.7]:f.window(x,35.6,2.65,1.25,int(x),False,.85)
    f.b(26.5,1.4,.40,0,-.08,36.42,roof,.04)
f=Facade(cx,-83)
# Behind atrium are staggered balconies and stair flights visible through glass.
for floor in range(7):
    h=.15+floor*5.05
    f.b(23.0,3.1,.29,0,5.2,h,trim,.035)
    for x in [-9,9]:f.b(.30,6.0,34,x,4.1,17,steel,.04)
    for x in [-6,-3,0,3,6]:f.b(1.8,.25,3.0,x,6.7,h+1.6,interior,.035)
    if floor<6:
        for j in range(14):f.b(3.4,.33,.20,-3.3+j*.50,3.5,h+.19+j*.33,cream)
# Curved inward curtain wall, one wide opening at street level.
for j in range(10):
    a=-12.5+j*2.5;b=a+2.5
    da=.38+1.68*(1-(a/12.5)**2);db=.38+1.68*(1-(b/12.5)**2)
    for floor in range(7):
        low=.24+floor*5.05;hi=min(35.9,low+4.95)
        f.f([(a,da,low),(b,db,low),(b,db,hi),(a,da,hi)],clear)
        f.rod((a,da-.035,low),(a,da-.035,hi),.063,steel,8)
        f.rod((a,da-.06,hi),(b,db-.06,hi),.072,steel,8)
        if floor:f.rod((a,da-.08,low+1.1),(b,db-.08,low+1.1),.035,steel,6)
for x in [-12.8,12.8]:f.b(.62,1.3,36.3,x,.13,18.15,trim,.05)
f.b(26.1,1.45,.39,0,.25,36.42,roof,.04)
f.text("macy's",0,-.32,35.13,2.28,marble,12.2)
# White raised star left of the name: recognizable branding without a billboard.
pts=[]
for j in range(10):a=math.pi/2+j*math.pi/5;r=.85 if j%2==0 else .35;pts.append((-7.2+math.cos(a)*r,-.34,36.1+math.sin(a)*r))
f.f(pts,red)
# Human scale entrances, polished bronze door leaves and curved street canopy.
for x in [-7.4,-3.7,0,3.7,7.4]:
    f.b(3.0,.11,3.15,x,.68,1.60,clear)
    for side in [-1,0,1]:f.b(.075,.16,3.16,x+side*1.50,.49,1.60,bronze)
    for side in [-1,1]:f.b(.04,.11,.68,x+side*.20,.35,1.65,trim,.018)
    f.b(3.18,.20,.12,x,.40,3.18,bronze,.025)
f.b(24.5,3.4,.16,0,-1.0,4.02,steel,.05)
f.b(24.7,.15,.42,0,-2.61,3.94,black,.045);f.text("macy's",0,-2.71,3.80,.87,marble,5)
for x in [-10,-5,0,5,10]:f.rod((x,0,5.16),(x,-2.4,4.14),.035,steel,8)
# Full return elevation and believable rooftop silhouette, no flat untextured back.
for px,yaw in [(-60,-math.pi/2)]:
    fac=Facade(px,-110,yaw);fac.panel_wall(52,[-21,-14,-7,0,7,14,21],[9.6,14.55,19.5,24.45,29.4],3.2,3.25,35.9)
    for x in [-20,-13.3,-6.6,0,6.6,13.3,20]:fac.store(x,5.3,5.35)
    for z in [6.4,32.15,34.8]:fac.b(52.3,.50,.33,0,-.04,z,trim,.03)
for x in [-46,-32,-13,4]:box(5,7,1.4,x,121,36.55,roof,.05)
# I. MAGNIN: an independent taller white marble corner, not the same window grid.
GROUP='I Magnin marble corner'
f=Facade(39.5,-83);mw=41
box(mw,50,42.3,39.5,111,21.15,marble,.10)
rows=[7.9+i*4.23 for i in range(8)]
f.panel_wall(mw,[-15,-9,-3,3,9,15],rows,2.9,2.75,42.3,marble,5.0,False)
for x in [-15,-7.5,0,7.5,15]:f.store(x,6.0,4.9)
f.b(mw+.24,.57,.31,0,.05,42.45,marble,.04)
f.text("macy's",0,-.10,39.65,1.62,black,10)
f.text('LOUIS VUITTON',11,-.14,5.38,.57,black,13)
for x in [-19.9,19.9]:f.b(.18,.22,42,x,-.06,21,marble,.035)
fac=Facade(60,-109.4,math.pi/2)
fac.panel_wall(52.8,[-22,-15.7,-9.4,-3.1,3.1,9.4,15.7,22],rows,2.9,2.75,42.3,marble,5.0,False)
for x in [-21,-14,-7,0,7,14,21]:fac.store(x,5.4,4.9)
fac.b(53.1,.6,.3,0,-.02,42.45,marble,.04)
# NEIMAN MARCUS: southeast diagonal, rose checkerboard cube around a transparent
# corner containing the preserved City of Paris rotunda. This is a modern building.
GROUP='Neiman Marcus southeast'
x0,x1=94,137;y0,y1=83,128;H=31.3;atrium=17.2
# Two opaque arms leave a real NW atrium cavity all the way to the roof.
box(x1-x0-atrium,y1-y0,H,(x0+atrium+x1)/2,(y0+y1)/2,H/2,terra,.055)
box(atrium,y1-y0-atrium,H,x0+atrium/2,(y0+atrium+y1)/2,H/2,terra,.055)
box(atrium,atrium,3.7,x0+atrium/2,y0+atrium/2,H-1.85,terra,.055)
for f in [Facade((x0+x1)/2,-y0),Facade(x0,-(y0+y1)/2,-math.pi/2)]:
    # Tall narrow showcase slots at ground level read in the approach view.
    for x in [2.5,7.7,12.9,18.1]:
        f.b(3.6,.10,9.7,x,-.13,5.3,glass)
        for sx in [-1,1]:f.b(.16,.29,9.9,x+sx*1.87,-.23,5.3,steel,.025)
        for z in [.35,3.5,6.75,10.2]:f.b(3.75,.26,.13,x,-.22,z,steel,.012)
    f.text('Neiman Marcus',-7.0,-.18,28.0,1.30,cream,18.0)
    for z in [0.18,31.3]:f.b(43.2,.31,.25,0,-.05,z,bronze,.025)
    for xx in [3,7.3,11.6,15.9]:f.b(2.6,.10,1.35,xx,-.08,20.8,glass)
# Opaque architectural backing behind the transparent corner, pale enough to read.
box(.28,17.2,26.7,111.4,91.6,13.35,interior)
box(17.2,.28,26.7,102.6,100.4,13.35,interior)
# Glazed exterior on two faces, slim mullions and real articulated spider fittings.
for f in [Facade(102.6,-83),Facade(94,-91.6,-math.pi/2)]:
    for i in range(6):
        a=-8.6+i*17.2/6;b=a+17.2/6
        for j in range(8):
            lo=.22+j*3.30;hi=lo+3.27
            f.f([(a,-.035,lo),(b,-.035,lo),(b,-.035,hi),(a,-.035,hi)],clear)
            for xx in [a,b]:
                f.b(.055,.17,3.31,xx,-.04,(lo+hi)/2,steel)
            f.b(b-a,.18,.065,(a+b)/2,-.05,hi,steel)
            for xx in [a+.13,b-.13]:
                f.b(.20,.08,.20,xx,-.15,hi-.13,steel)
    f.b(17.4,.34,.22,0,-.02,26.92,steel,.025)
# Four stacked rings, columns, railings and preserved gilded dome.
cx,cy=104.0,93.0;r=7.7
for z in [.27,6.25,12.3,18.35]:
    ring(cx,cy,z,r,1.20,.34,cream)
    ring(cx,cy,z+.30,r+.35,.40,.17,gold)
    ring(cx,cy,z+.97,r+.43,.13,.14,cream)
    if z>1:
        for j in range(58):
            a=math.tau*j/58;x=cx+(r+.43)*math.cos(a);y=cy+(r+.43)*math.sin(a)
            rod((x,y,z+.38),(x,y,z+.91),.040,gold,6,r2=.060)
for j in range(12):
    a=math.tau*j/12;x=cx+r*math.cos(a);y=cy+r*math.sin(a)
    for z in [.3,6.3,12.35,18.4]:
        rod((x,y,z),(x,y,z+5.65),.23,cream,12,r2=.19)
        rod((x,y,z+.10),(x,y,z+.42),.37,gold,12)
        rod((x,y,z+5.25),(x,y,z+5.65),.43,cream,12)
        for k in range(6):
            aa=k*math.tau/6;rod((x+.29*math.cos(aa),y+.29*math.sin(aa),z+5.46),(x+.40*math.cos(aa),y+.40*math.sin(aa),z+5.75),.073,gold,6)
# Stained glass is actually segmented amber/cream/teal glass geometry, not a flat disc.
domecols=[mat('Dome amber glass',(.74,.45,.13),.28,.1,emission=.13),mat('Dome honey glass',(.77,.64,.32),.32,.05,emission=.13),mat('Dome sea glass',(.27,.42,.32),.31,.1,emission=.06)]
ring(cx,cy,24.25,8.0,.55,.36,gold)
for band in range(7):
    t0=band/7*math.pi/2;t1=(band+1)/7*math.pi/2
    for j in range(48):
        a=math.tau*j/48;b=math.tau*(j+1)/48
        pts=[]
        for t,ang in [(t0,a),(t0,b),(t1,b),(t1,a)]:pts.append((cx+7.85*math.cos(t)*math.cos(ang),cy+7.85*math.cos(t)*math.sin(ang),24.45+2.10*math.sin(t)))
        face(pts,domecols[2 if band==1 and j%3==0 else (j+band)%2])
        rod(pts[0],pts[1],.025,gold,5)
        if band<6:rod(pts[1],pts[2],.025,gold,5)
# Corner entry doors and discrete brass store name at pedestrian scale.
f=Facade(102.6,-83)
for x in [-5.2,0,5.2]:
    for side in [-1,1]:f.b(.09,.22,3.0,x+side*1.05,-.15,1.65,bronze,.015)
    f.b(2.2,.25,.14,x,-.16,3.16,bronze,.02)
    f.rod((x-.13,-.22,1.13),(x-.13,-.22,1.95),.027,gold,6)
f.b(17.3,1.9,.16,0,-.5,3.54,steel,.03)
f.text('NEIMAN MARCUS',0,-1.50,3.02,.49,cream,12.8)
# Roof service court and the unglazed south/east elevations retain tile continuity.
box(38,39,.24,115.5,105.5,31.48,roof,.025)
for x in [115,127]:box(5,7,1.9,x,118,32.4,roof,.05)
# STOCKTON STREET: distinct masonry parcels rather than one invented palace.
# Maiden Lane is kept fully open, with complete return facades looking down it.
GROUP='Stockton boutique parcels'
def boutique(x,z,width,depth,height,base_mat,style,label):
    f=Facade(x,z,-math.pi/2)
    f.b(width,depth-3,height,0,(depth+3)/2,height/2,base_mat,.05)
    baycount=max(2,round(width/6));bays=[-width/2+(j+.5)*width/baycount for j in range(baycount)]
    rows=[8.5+i*4.5 for i in range(max(2,int((height-7)/4.5)))]
    f.panel_wall(width,bays,rows,min(3.8,width/baycount-1.0),2.95,height,base_mat,5.6,style!=2)
    for b in bays:f.store(b,width/baycount-.85,5.4)
    for zz in [5.8,6.22,height-.95,height-.35]:f.b(width+.18,.49,.22,0,-.10,zz,trim if style!=2 else marble,.025)
    if style!=2:
        for xx in np.arange(-width/2+.40,width/2,.61):f.b(.19,.43,.27,float(xx),-.07,height-.76,trim)
        for b in bays:
            if style==1:
                f.b(min(4.1,width/baycount-.3),.26,.42,b,-.13,height-1.6,trim,.05)
                # Crown fan ornament, projecting keystone and central rosette.
                for j in range(7):
                    a=j*math.pi/6;f.b(.19,.30,.22,b+math.cos(a)*.58,-.27,height-1.4+math.sin(a)*.4,cream,.06)
            f.b(.2,.28,rows[-1]-6.3,b-width/baycount/2+.10,-.07,(rows[-1]+6.3)/2,trim,.025)
    if label:f.text(label,0,-.16,5.9,.68,bronze,width-.9)
    # Two cross-street returns: actual apertures, piers and storefront continuation.
    for side in {'BREITLING':[1],'GUCCI':[-1],'TORY BURCH':[1],'MONCLER':[],'BVLGARI':[-1]}.get(label,[-1,1]):
        wz=z+side*width/2;ret=Facade(x+depth/2,wz,0 if side==1 else math.pi)
        rbays=[-depth/2+(j+.5)*depth/5 for j in range(5)]
        ret.panel_wall(depth,rbays,rows,3.2,2.95,height,base_mat,5.6,style!=2)
        for b in rbays:ret.store(b,depth/5-.7,5.4)
        for zz in [5.8,height-.8,height-.3]:ret.b(depth+.2,.49,.23,0,-.08,zz,trim if style!=2 else marble,.025)
    f.b(width,depth,.18,0,depth/2,height+.12,roof,.03)
# Confirmed shop parcels from OpenStreetMap audit, with individual roof heights.
boutique(94,33.5,29,35,33.3,marble,2,'BREITLING')
boutique(94,12,14,35,40.0,stone,1,'GUCCI')
boutique(94,-12,14,35,18.0,trim,0,'TORY BURCH')
boutique(94,-29,20,35,25.0,stone,1,'MONCLER')
boutique(94,-43.5,9,35,25.0,marble,2,'BVLGARI')
# Storefront cornice variation, drainpipes and roof plant keep close camera views occupied.
for z in [-46,-24,23,46]:
    rod((94.25,-z,.15),(94.25,-z,22.6),.065,bronze,8)
for wz in [-29,33]:
    for x in [108,119]:box(3.2,4.0,1.0,x,-wz,34.1 if wz>0 else 25.8,roof,.05)
# Build mesh batches and generate their shared UVs.
objects=[]
for (group,material),(verts,faces,uvs) in BATCH.items():
    mesh=bpy.data.meshes.new(group+' / '+material);mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for poly,coords in zip(mesh.polygons,uvs):
        for i,coord in zip(poly.loop_indices,coords):uv.data[i].uv=coord
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    ob=bpy.data.objects.new(group+' / '+material,mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(MATS[material]);objects.append(ob)
    ob['asset_role']='Union Square reference architecture';ob['origin_contract']='World X/Z at street ground y=22; glTF group translates (0,22,0)'
# Neutral photo-study lighting; game uses its own environment and shadows.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
world=bpy.data.worlds.new('SF blue sky architectural study');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.42,.60,.80,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65;scene.world=world
bpy.ops.object.light_add(type='SUN',location=(-90,-110,160));sun=bpy.context.object;sun.data.energy=2.8;sun.data.angle=.05;sun.rotation_euler=(.46,-.50,-.4)
bpy.ops.object.camera_add(location=(-98,-107,95));cam=bpy.context.object;cam.rotation_euler=(Vector((28,80,19))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=43;scene.camera=cam
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
# Source opens with all architecture, camera and lights visible, ready to edit.
bpy.ops.object.select_all(action='DESELECT')
for ob in objects:ob.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'union-square-frontages.blend'))
def export(path):
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=17,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
export(OUT/'square-frontages.glb')
triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in objects)
# LOD preserves all material identity and the glazed rotunda, simplifies carvings.
lods=[]
for ob in objects:
    lod=ob.copy();lod.data=ob.data.copy();lod.name=ob.name+' / distant';bpy.context.collection.objects.link(lod);lods.append(lod)
    if len(lod.data.polygons)>300 and 'transparent' not in lod.name:
        mod=lod.modifiers.new('Distant architectural detail','DECIMATE');mod.ratio=.38
bpy.ops.object.select_all(action='DESELECT')
for ob in lods:ob.select_set(True)
bpy.context.view_layer.objects.active=lods[0];export(OUT/'square-frontages-lod.glb')
for ob in lods:bpy.data.objects.remove(ob,do_unlink=True)
blob=(OUT/'square-frontages-lod.glb').read_bytes();n=struct.unpack_from('<I',blob,12)[0];g=json.loads(blob[20:20+n]);lodtris=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
report={'triangles':triangles,'lodTriangles':lodtris,'meshes':len(objects),'materials':len(g['materials']),'bytes':(OUT/'square-frontages.glb').stat().st_size,'lodBytes':len(blob),'origin':'world X/Z ground relative; place glTF at (0,22,0)','bounds':{'Macys':[-60,-136,60,-83],'Neiman':[94,-128,137,-83],'Stockton':[94,-48,129,48]},'sources':['https://www.nilesbolton.com/neiman-marcus-union-square','https://en.wikipedia.org/wiki/Macy%27s_Union_Square']}
opaque_materials={o.data.materials[0].name for o in objects if o.data.materials[0].diffuse_color[3]>=1}
report['runtimeMaterialBatches']=len(opaque_materials)+sum(o.data.materials[0].diffuse_color[3]<1 for o in objects)
(OUT/'square-frontages.meta.json').write_text(json.dumps(report,indent=2)+'\n');print('SQUARE_FRONTAGES_REPORT',json.dumps(report))
if '--skip-render' not in sys.argv:
    scene.render.filepath=str(REVIEW/'square-frontages-overview.png');bpy.ops.render.render(write_still=True)
    cam.location=(66,45,13);cam.rotation_euler=(Vector((105,95,15))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=36
    scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.filepath=str(REVIEW/'neiman-rotunda-study.png');bpy.ops.render.render(write_still=True)
