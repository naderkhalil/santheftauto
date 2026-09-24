"""San Francisco Ferry Building: original, reference-informed Blender hero asset.

Run with Blender 4.5 --background --python tools/blender/build_ferry_building.py.
Optional --skip-render only skips review images. Source is always saved.
Blender: +X east, +Y north, +Z up; street front faces west (-X).
glTF: +X east, +Y up, -Z north. Origin at center of the building's ground floor.
The 190m long market hall and 75m clock tower deliberately retain real proportions.
"""
import bpy, bmesh, math, json, sys, struct
import numpy as np
from mathutils import Vector, Quaternion
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/waterfront';SOURCE=ROOT/'art/source';REVIEWS=ROOT/'art/reviews'
for path in [OUT,SOURCE,REVIEWS]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
M={};B={};PART='ferry_market';TAU=math.tau

def linear(h):
    c=[int(h[i:i+2],16)/255 for i in [1,3,5]]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)

def image(name,pixels,noncolor=False):
    h,w,c=pixels.shape
    if c==3:pixels=np.concatenate([pixels,np.ones((h,w,1))],axis=2)
    im=bpy.data.images.new(name,width=w,height=h,alpha=False)
    if noncolor:im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(np.asarray(pixels,dtype=np.float32).ravel());im.pack();return im

def mat(name,color,rough=.75,metal=0,emit=0):
    m=bpy.data.materials.new('Ferry Building / '+name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear(color),1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if emit:p.inputs['Emission Color'].default_value=(*linear(color),1);p.inputs['Emission Strength'].default_value=emit
    m.diffuse_color=(*linear(color),1);M[name]=m;return name

stone=mat('warm gray Colusa sandstone','#c4c1ae',.84)
trim=mat('carved limestone cornices','#ddd9c7',.78)
granite=mat('salt weathered granite base','#929790',.87)
roof=mat('weathered dark green gray roof','#526b67',.82)
roofdark=mat('roof seam shadow','#374f4d',.87)
glass=mat('recessed blue gray glazing','#46717a',.27,.28)
glasslight=mat('skylight glass','#829fa3',.28,.18)
bronze=mat('dark bronze sash','#344f4b',.42,.64)
steel=mat('painted terminal steel','#d4d5c8',.47,.35)
dark=mat('interior and rooftop shadow','#383f3b',.94)
wood=mat('oak market doors','#876d47',.72)
warm=mat('market interior warm light','#f1d19a',.5,0,.22)
clockwhite=mat('opal clock dial','#e9e8d7',.62,.02,.10)
clockblack=mat('clock numerals and hands','#182a27',.5,.27)
gold=mat('gilt metal accents','#ad9351',.35,.7)
red=mat('terminal signage brick red','#873f31',.76)

# Original physically tiled texture maps are embedded in both delivery assets.
# They encode pores, fine mortar joints and salt streaks, not a photo decal.
for index,name in enumerate([stone,trim,granite,roof]):
    n=512;yy,xx=np.mgrid[0:n,0:n];rr=np.random.default_rng(1898+index)
    grain=rr.normal(0,.018,(n,n));rows=np.floor(yy/96)
    joint=(np.mod(yy,96)<1.4)|((np.mod(xx+(rows%2)*128,256)<1.15))
    if name==roof:joint=(np.mod(xx,36)<2)|(np.mod(yy,94)<2)
    height=grain*.17-joint*.055
    tint=np.array(M[name].diffuse_color[:3]);var=grain+np.sin(xx*.015+yy*.009)*.008-joint*.033
    color=np.clip(tint[None,None,:]+var[:,:,None],.01,1)
    normy,normx=np.gradient(height);normal=np.stack([-normx*4,-normy*4,np.ones_like(normx)],axis=2)
    normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    maps=[image(name+' / original stone albedo',color),image(name+' / original micro normal',normal*.5+.5,True),image(name+' / original roughness',np.repeat(np.clip(.82+grain*2+joint*.1,0,1)[:,:,None],3,axis=2),True)]
    nodes=M[name].node_tree.nodes;links=M[name].node_tree.links;p=nodes.get('Principled BSDF')
    for i,slot in [(0,'Base Color'),(2,'Roughness')]:
        t=nodes.new('ShaderNodeTexImage');t.image=maps[i];links.new(t.outputs['Color'],p.inputs[slot])
    t=nodes.new('ShaderNodeTexImage');t.image=maps[1];normalnode=nodes.new('ShaderNodeNormalMap');normalnode.inputs['Strength'].default_value=.30
    links.new(t.outputs['Color'],normalnode.inputs['Color']);links.new(normalnode.outputs['Normal'],p.inputs['Normal'])

def face(points,material,uv=None):
    data=B.setdefault((PART,material),[[],[],[]]);verts,faces,uvs=data;n=len(verts)
    verts.extend(points);faces.append(list(range(n,n+len(points))))
    if uv is None:
        normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]));ax=max(range(3),key=lambda i:abs(normal[i]));ids=[i for i in range(3) if i!=ax]
        uv=[(p[ids[0]]/2,p[ids[1]]/2) for p in points]
    uvs.append(uv)

def box(x,y,z,w,d,h,m,bevel=0,angle=0):
    if bevel<.025:bevel=0 # Sub-pixel stone joints use their baked normal map.
    half=[w/2,d/2,h/2];bevel=min(bevel,min(half)*.4);c=math.cos(angle);s=math.sin(angle)
    def tr(p):return(x+c*p[0]-s*p[1],y+s*p[0]+c*p[1],z+p[2])
    for ax in range(3):
        ij=[i for i in range(3) if i!=ax]
        for sign in [-1,1]:
            points=[]
            for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                p=[0,0,0];p[ax]=half[ax]*sign;p[ij[0]]=u*(half[ij[0]]-bevel);p[ij[1]]=v*(half[ij[1]]-bevel);points.append(tr(p))
            face(points,m)
    if not bevel:return
    for a,j in [(0,1),(0,2),(1,2)]:
        k=3-a-j
        for sa in [-1,1]:
            for sj in [-1,1]:
                points=[]
                for which,sk in [(0,-1),(1,-1),(1,1),(0,1)]:
                    p=[0,0,0];p[a]=(half[a]-(bevel if which else 0))*sa;p[j]=(half[j]-(0 if which else bevel))*sj;p[k]=(half[k]-bevel)*sk;points.append(tr(p))
                face(points,m)
    for sx in [-1,1]:
        for sy in [-1,1]:
            for sz in [-1,1]:
                signs=[sx,sy,sz];face([tr([signs[i]*(half[i]-(0 if i==ax else bevel)) for i in range(3)]) for ax in range(3)],m)

def rod(a,b,r,m,n=10,r2=None):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
    if u.length<.01:u=direction.cross(Vector((0,1,0)))
    u.normalize();v=direction.cross(u);r2=r if r2 is None else r2
    rings=[[tuple(p+(u*math.cos(i*TAU/n)+v*math.sin(i*TAU/n))*rad) for i in range(n)] for p,rad in [(a,r),(b,r2)]]
    face(rings[0],m);face(rings[1],m)
    for i in range(n):j=(i+1)%n;face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],m)

class Facade:
    # u: viewer right, v: into building. Front is v=0, glass recess is v>0.
    def __init__(self,x,y,angle=0):self.x=x;self.y=y;self.a=angle;self.c=math.cos(angle);self.s=math.sin(angle)
    def p(self,u,v,z):return(self.x+self.c*v+self.s*u,self.y+self.s*v-self.c*u,z)
    def b(self,u,v,z,w,d,h,m,bevel=0):box(*self.p(u,v,z),d,w,h,m,bevel,self.a)
    def f(self,points,m,uv=None):face([self.p(*p) for p in points],m,uv)
    def r(self,a,b,r,m,n=10):rod(self.p(*a),self.p(*b),r,m,n)
    def lettering(self,body,u,v,z,size,m):
        curve=bpy.data.curves.new(body,'FONT');curve.body=body;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=size;curve.extrude=.013;curve.bevel_depth=.0015;curve.bevel_resolution=0;curve.resolution_u=5
        ob=bpy.data.objects.new(body,curve);bpy.context.collection.objects.link(ob);bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob=bpy.context.object
        for poly in ob.data.polygons:
            self.f([(u+ob.data.vertices[i].co.x,v-ob.data.vertices[i].co.z,z+ob.data.vertices[i].co.y) for i in poly.vertices],m)
        bpy.data.objects.remove(ob,do_unlink=True)
    def arch(self,u,bottom,w,h,walltop,depth=1.1,m=stone,segments=18,door=True,aperture=glass):
        r=w/2;spring=bottom+h-r;glassdepth=depth+.26
        points=[(u-r,glassdepth,bottom),(u+r,glassdepth,bottom),(u+r,glassdepth,spring)]+[(u+math.cos(i*math.pi/segments)*r,glassdepth,spring+math.sin(i*math.pi/segments)*r) for i in range(1,segments+1)]
        self.f(points,aperture)
        # Opening has thick jambs, a soffit and separate wedge-cut voussoirs.
        for side in [-1,1]:
            self.b(u+side*(r+.23),depth/2-.08,(bottom+spring)/2,.46,depth+.26,spring-bottom,m,.035)
            self.b(u+side*(r-.04),depth+.12,(bottom+spring)/2,.075,.14,spring-bottom,bronze)
        for i in range(segments):
            a=i*math.pi/segments;b=(i+1)*math.pi/segments;gap=.005
            inner=r+.025;outer=r+.48
            pts=[(u+math.cos(a+gap)*inner,-.19,spring+math.sin(a+gap)*inner),(u+math.cos(b-gap)*inner,-.19,spring+math.sin(b-gap)*inner),(u+math.cos(b-gap)*outer,-.19,spring+math.sin(b-gap)*outer),(u+math.cos(a+gap)*outer,-.19,spring+math.sin(a+gap)*outer)]
            self.f(pts,trim)
            self.f([pts[0],pts[1],(pts[1][0],depth+.22,pts[1][2]),(pts[0][0],depth+.22,pts[0][2])],trim)
            self.f([pts[2],pts[3],(pts[3][0],.14,pts[3][2]),(pts[2][0],.14,pts[2][2])],stone)
            # The spandrel goes around the arch, never across the window.
            xa=-r+i*w/segments;xb=-r+(i+1)*w/segments
            za=spring+math.sqrt(max(0,r*r-xa*xa));zb=spring+math.sqrt(max(0,r*r-xb*xb))
            self.f([(u+xa,.02,za),(u+xb,.02,zb),(u+xb,.02,walltop),(u+xa,.02,walltop)],m)
        self.b(u,-.24,bottom+h+.16,.58,.35,.76,trim,.055)
        # Tall market doors and an independent arched fanlight.
        for du in [-w*.31,0,w*.31]:self.b(u+du,depth+.08,(bottom+spring)/2,.075,.18,spring-bottom,bronze)
        self.b(u,depth+.07,spring,w,.18,.10,bronze)
        self.b(u,depth+.07,bottom+2.5,w,.18,.105,bronze)
        for i in range(1,8):
            a=i*math.pi/8
            self.r((u,depth+.08,spring),(u+math.cos(a)*(r-.07),depth+.08,spring+math.sin(a)*(r-.07)),.026,bronze,6)
        if door:
            for side in [-1,1]:self.b(u+side*.16,depth-.04,bottom+1.28,.045,.12,.50,gold)
            self.b(u,depth+.04,bottom+.25,w-.14,.16,.42,wood)
        self.b(u,depth/2,bottom-.07,w+.42,depth+.40,.15,granite,.04)
    def window(self,u,z,w,h):
        self.b(u,.86,z,w,.06,h,glass)
        for s in [-1,1]:self.b(u+s*(w/2+.075),.34,z,.15,.72,h+.22,trim)
        for zz in [z-h/2,z+h/2]:self.b(u,.34,zz,w+.28,.72,.14,trim)
        self.b(u,.70,z,.075,.15,h,bronze);self.b(u,.70,z,w,.15,.07,bronze)
        self.b(u,-.07,z-h/2-.08,w+.5,.5,.18,trim,.04)

def cornice(f,width,top=18.3):
    for z,d,h in [(6.5,1.00,.25),(6.80,1.2,.18),(16.4,.65,.17),(17.30,.8,.19),(17.55,1.05,.22),(17.88,1.55,.36),(18.2,1.75,.24)]:
        f.b(0,-.04,z,width+.25,d,h,trim,.04)
    for u in np.arange(-width/2+.42,width/2,.76):f.b(float(u),-.64,17.65,.26,.50,.35,trim,.04)

def hall_facade(f,width,bays):
    # The Ferry Building has its great arcade on the UPPER storey. Smaller
    # ground-floor market doors and the long continuous belt course sit below.
    lower=[]
    for u in bays:
        for du in [-1.25,1.25]:
            lower.append(u+du);f.arch(u+du,.25,1.75,4.85,6.5,1.0,segments=12)
        f.arch(u,7.15,4.85,8.75,17.3,1.1,segments=20,door=False)
    edges=[-width/2]+[u+d for u in lower for d in [-.875,.875]]+[width/2]
    for a0,a1 in zip(edges[::2],edges[1::2]):
        if a1<=a0:continue
        f.b((a0+a1)/2,.55,3.25,a1-a0,1.10,6.5,stone)
        for z in np.arange(.65,6.25,.64):f.b((a0+a1)/2,-.025,float(z),a1-a0-.04,.10,.51,stone,.015)
    edges=[-width/2]+[u+d for u in bays for d in [-2.425,2.425]]+[width/2]
    for a0,a1 in zip(edges[::2],edges[1::2]):
        if a1<=a0:continue
        f.b((a0+a1)/2,.55,12.225,a1-a0,1.10,10.15,stone)
        if a1-a0>.7:
            f.b((a0+a1)/2,-.14,11.9,.34,.34,9.0,trim,.035)
            f.b((a0+a1)/2,-.2,16.55,.65,.50,.44,trim,.055)
    f.b(0,.52,6.825,width,1.04,.65,stone)
    cornice(f,width)

def wing(side):
    global PART
    for section in range(4):
        length=18.75;center=side*(29.375+section*length);PART=('ferry_north_' if side>0 else 'ferry_south_')+str(section)
        for x,a in [(-23,0),(23,math.pi)]:
            hall_facade(Facade(x,center,a),length,[-6.25,0,6.25])
        # Interior galleries are set behind the deep arches, never across them.
        for x in [-19,19]:box(x,center,8.5,.3,length,16.5,dark)
        box(0,center,.09,46,length,.18,granite)
        box(0,center,6.8,45.6,length,.3,stone)
        box(0,center,18.05,46,length,.35,trim)
        for sideX in [-1,1]:
            face([(sideX*23.8,center-length/2,18.5),(sideX*4.8,center-length/2,22.75),(sideX*4.8,center+length/2,22.75),(sideX*23.8,center+length/2,18.5)],roof)
            for yy in np.arange(center-length/2+.17,center+length/2,.56):
                rod((sideX*23.85,float(yy),18.52),(sideX*4.8,float(yy),22.78),.065,roof,6)
                for frac in [.2,.4,.6,.8]:
                    xx=sideX*(23.85-19.05*frac);zz=18.52+4.26*frac
                    rod((xx,float(yy)-.18,zz+.05),(xx,float(yy)+.18,zz+.05),.020,roofdark,6)
        for x in [-4.8,4.8]:
            box(x,center,23.42,.12,length,1.40,bronze)
            for yy in np.arange(center-length/2+.8,center+length/2,2.1):
                box(x+(-.08 if x<0 else .08),float(yy),23.42,.04,1.90,1.2,glasslight)
                box(x,float(yy)-1.01,23.42,.14,.12,1.5,steel)
        box(0,center,24.27,10.5,length,.26,roofdark)
        for yy in [center-7,center+7]:
            box(8,yy,21.9,1.6,1.7,.65,bronze,.08);rod((8,yy,22.2),(8,yy,22.8),.28,bronze,12)
        for x in [-24,24]:
            rod((x,center-length/2,18.4),(x,center+length/2,18.4),.09,bronze,8)
            rod((x,center+length/2-.3,.4),(x,center+length/2-.3,18.4),.075,bronze,8)

wing(-1);wing(1)
for side in [-1,1]:
    PART='ferry_'+('north' if side>0 else 'south')+'_end'
    f=Facade(0,side*95,side*math.pi/2);hall_facade(f,46,[-18.4,-9.2,0,9.2,18.4])
    f.f([(-24,0,18.5),(24,0,18.5),(4.8,0,22.75),(-4.8,0,22.75)],roof)
    f.b(0,0,23.4,9.6,.22,1.5,glasslight);f.b(0,-.08,24.2,10.5,.6,.25,roofdark)

# Central entrance pavilion and the indoor nave, visible through its main portal.
PART='ferry_central_pavilion'
for x,a in [(-25.2,0),(23.5,math.pi)]:
    f=Facade(x,0,a)
    for u in [-12,0,12]:f.arch(u,.18,9.0,15.2,16.2,1.55,segments=28)
    for a0,a1 in [(-20,-16.5),(-7.5,-4.5),(4.5,7.5),(16.5,20)]:
        f.b((a0+a1)/2,.7,8.1,a1-a0,1.6,16.2,stone)
        for zz in np.arange(.6,15.9,.65):f.b((a0+a1)/2,-.15,float(zz),a1-a0-.05,.18,.54,stone,.025)
    for side in [-1,1]:f.b(side*19.55,-.11,9.1,.6,.8,18.2,trim,.05)
    f.b(0,.3,16.43,40,1.65,.46,trim)
    f.lettering('PORT OF SAN FRANCISCO',0,-.59,16.4,.71,bronze)
    f.b(0,.50,17.45,40,1.0,1.55,stone)
    for zz,depth,height in [(18.3,1.1,.24),(18.68,1.60,.4),(19.0,1.85,.24)]:f.b(0,-.05,zz,40.5,depth,height,trim,.04)
    for uu in np.arange(-19.5,19.8,.76):f.b(float(uu),-.65,18.5,.30,.55,.33,trim,.035)
    f.lettering('FERRY BUILDING',0,-.92,18.29,.55,bronze)
box(0,0,.07,51,39.8,.14,granite)
box(0,0,18.65,48,39.8,.25,roofdark)
for y in [-19.75,19.75]:
    box(0,y,5.8,44,.3,11.4,stone)
    for x in np.arange(-19,22,5.6):
        box(float(x),y-(.22 if y>0 else -.22),3.35,4.5,.12,5.5,wood)
        box(float(x),y-(.3 if y>0 else -.3),5.2,4.2,.08,.40,warm)
for x in np.arange(-21,24,4.8):
    rod((float(x),-19.5,15.8),(float(x),0,18.4),.08,steel,8);rod((float(x),0,18.4),(float(x),19.5,15.8),.08,steel,8)
for x in [-15,-5,5,15]:
    rod((x,0,17.8),(x,0,13.3),.045,bronze,8);rod((x,0,12.8),(x,0,13.3),.3,warm,12)

# The Giralda-inspired clock tower: narrow sandstone shaft, inset paired arches,
# four seven-meter dials, open belfry and a restrained gray-green crown.
PART='ferry_clock_tower';TX=-20
for a in [0,math.pi/2,math.pi,math.pi*1.5]:
    f=Facade(TX-math.cos(a)*6.9,-math.sin(a)*6.9,a)
    f.b(0,.50,27.6,13.8,1.0,15.6,stone)
    f.b(0,.50,41.25,13.8,1.0,5.9,stone)
    for u in [-3.9,3.9]:f.b(u,.50,36.85,6.,1.0,2.9,stone)
    f.window(0,36.85,1.60,2.90)
    f.b(0,.25,43.5,13.8,1.50,.6,trim)
    for u in [-6.0,6.0]:f.b(u,-.045,33.0,.67,.30,25.6,trim,.03)
    for zz,depth,height in [(20,1.0,.5),(20.6,1.4,.35),(26.8,.55,.17),(43.5,1.2,.3),(44.1,1.65,.5),(44.6,1.90,.32)]:f.b(0,-.15,zz,14.15,depth,height,trim,.035)
    for u in [-5.9,5.9]:
        for zz in np.arange(21.0,43.4,.80):f.b(u,-.14,float(zz),.7,.30,.67,trim,.025)
    # Clock chamber corners leave enough uninterrupted stone around the dials.
    f.b(0,.47,51.1,13.4,.95,12.6,stone)
    for side in [-1,1]:f.b(side*6.03,-.23,51.0,.62,.65,11.9,trim,.045)
    for zz,depth,height in [(45.0,1.05,.25),(56.8,1.05,.26),(57.3,1.5,.5),(57.75,1.85,.26)]:f.b(0,-.15,zz,14.1,depth,height,trim,.04)
    # Circular stone mouldings, luminous white dial and readable Roman glyphs.
    cz=51.45;r=3.42
    for i in range(96):
        aa=i*TAU/96;bb=(i+1)*TAU/96
        for inn,out,v in [(r+.08,r+.46,-.40),(r-.06,r+.11,-.48)]:
            pts=[(math.sin(aa)*inn,v,cz+math.cos(aa)*inn),(math.sin(bb)*inn,v,cz+math.cos(bb)*inn),(math.sin(bb)*out,v,cz+math.cos(bb)*out),(math.sin(aa)*out,v,cz+math.cos(aa)*out)]
            f.f(pts,trim if inn>r else clockblack)
    f.f([(math.sin(i*TAU/96)*r,-.44,cz+math.cos(i*TAU/96)*r) for i in range(96)],clockwhite)
    for i in range(60):
        aa=i*TAU/60;rr=3.17 if i%5==0 else 3.25
        f.r((math.sin(aa)*rr,-.51,cz+math.cos(aa)*rr),(math.sin(aa)*3.31,-.51,cz+math.cos(aa)*3.31),.026 if i%5 else .039,clockblack,6)
    for i,num in enumerate(['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI']):
        aa=i*TAU/12;f.lettering(num,math.sin(aa)*2.69,-.53,cz+math.cos(aa)*2.69,.61,clockblack)
    # All four dials tell 10:10. Hands are spear silhouettes, not thick bars.
    for aa,length,width in [(-math.pi/3,1.84,.15),(math.pi/3,2.5,.105)]:
        du,dz=math.sin(aa),math.cos(aa);pu,pz=math.cos(aa),-math.sin(aa)
        f.f([(-du*.37+pu*width,-.61,cz-dz*.37+pz*width),(du*(length-.3)+pu*width,-.61,cz+dz*(length-.3)+pz*width),(du*length,-.61,cz+dz*length),(du*(length-.3)-pu*width,-.61,cz+dz*(length-.3)-pz*width),(-du*.37-pu*width,-.61,cz-dz*.37-pz*width)],clockblack)
    f.f([(math.sin(i*TAU/24)*.19,-.66,cz+math.cos(i*TAU/24)*.19) for i in range(24)],gold)
    # Belfry: openings remain genuinely open to an inset dark bell chamber.
    for u in [-4.8,-1.6,1.6,4.8]:f.arch(u,58.1,2.18,5.9,64.25,.78,segments=16,door=False,aperture=dark)
    for u in [-6.55,-3.2,0,3.2,6.55]:f.b(u,.2,61.2,.55,.75,6.4,trim,.055)
    for u in [-4.8,-1.6,1.6,4.8]:
        f.b(u,.53,59.0,2.50,.12,.10,bronze)
        for dx in [-.9,-.6,-.3,0,.3,.6,.9]:f.b(u+dx,.53,58.55,.045,.12,1.0,bronze)
    for zz,depth,height in [(64.1,1.2,.25),(64.5,1.7,.42),(64.85,2.0,.26),(65.20,1.65,.26)]:f.b(0,-.1,zz,14.2,depth,height,trim,.05)
    for u in np.arange(-6.3,6.5,.8):f.b(float(u),-.6,64.39,.3,.6,.48,trim,.035)
    # Upper octagonal/cupola tier reads as a restrained light crown.
    f.b(0,.5,65.8,12.6,.8,1.0,stone)
    f.b(0,-.13,66.45,13.6,1.5,.32,trim,.04)

# Pale, diminishing open lanterns are the tower's distinctive Giralda crown.
for level,(half,bottom,height,bays,aw) in enumerate([(4.10,65.8,4.0,[-2.65,0,2.65],1.55),(2.10,70.2,2.85,[-.95,.95],1.10)]):
    for a in [0,math.pi/2,math.pi,math.pi*1.5]:
        f=Facade(TX-math.cos(a)*half,-math.sin(a)*half,a)
        for u in bays:f.arch(u,bottom,aw,height,bottom+height+.20,.5,segments=14,door=False,aperture=dark)
        edges=[-half]+[u+d for u in bays for d in [-aw/2,aw/2]]+[half]
        for a0,a1 in zip(edges[::2],edges[1::2]):f.b((a0+a1)/2,.15,bottom+height/2,a1-a0,.55,height,trim,.04)
        f.b(0,-.12,bottom-.15,half*2+.40,.65,.25,trim,.045)
        f.b(0,-.12,bottom+height+.32,half*2+.50,.75,.25,trim,.045)
        for u in np.arange(-half+.4,half,.7):f.b(float(u),-.35,bottom+height+.09,.18,.35,.25,trim,.03)
# Slender terminal dome and finial complete the tapered crown.
rod((TX,0,73.28),(TX,0,73.62),2.22,trim,16,r2=1.58)
rod((TX,0,73.62),(TX,0,74.00),1.58,trim,16,r2=.62)
rod((TX,0,74.00),(TX,0,74.30),.62,trim,16,r2=.18)
rod((TX,0,74.3),(TX,0,75.0),.045,gold,10,r2=.02)
# Small modeled national flag; no externally sourced bitmap is required.
for stripe in range(13):
    for segment in range(8):
        pts=[]
        for du,dv in [(0,0),(1,0),(1,1),(0,1)]:
            u=(segment+du)/8;v=(stripe+dv)/13
            pts.append((TX+math.sin(u*7)*u*.12,u*1.45,74.92-v*.68-u*.15))
        face(pts,red if stripe%2==0 else clockwhite)
face([(TX-.006,0,74.92),(TX+.04,.65,74.85),(TX+.04,.65,74.48),(TX-.006,0,74.55)],bronze)

# Ferry terminal behind the building: shallow glazed canopies, fine white trusses,
# real support spacing and timber waiting benches. No generic floating platform.
PART='ferry_terminal_canopies'
for cy in [-46,0,46]:
    for xx in [29,41,53,63]:
        for yy in [cy-10.5,cy+10.5]:
            rod((xx,yy,.05),(xx,yy,5.25),.13,steel,12)
            box(xx,yy,.17,.6,.6,.34,granite,.04)
            rod((xx,yy,4.2),(xx,cy,7.0),.075,steel,8)
        rod((xx,cy-11.3,5.4),(xx,cy,7.15),.11,steel,10)
        rod((xx,cy,7.15),(xx,cy+11.3,5.4),.11,steel,10)
        rod((xx,cy-10.5,5.4),(xx,cy+10.5,5.4),.07,steel,8)
    for yy in [cy-10.5,cy-5.25,cy,cy+5.25,cy+10.5]:
        zz=7.15-abs(yy-cy)/11.3*1.75;rod((24,yy,zz),(64,yy,zz),.065,steel,8)
    for side in [-1,1]:
        face([(24,cy,7.17),(64,cy,7.17),(64,cy+side*11.3,5.42),(24,cy+side*11.3,5.42)],glasslight)
    f=Facade(64.1,cy,math.pi);f.b(0,-.1,4.9,7,.16,.80,bronze);f.lettering('SAN FRANCISCO BAY FERRY',0,-.20,4.88,.36,clockwhite)
    for xx in [33,48,59]:
        for yy in [cy-8,cy+8]:
            box(xx,yy,.66,4.4,.65,.13,wood,.03);box(xx,yy+.24,1.04,4.4,.13,.6,wood,.03)
            for dx in [-1.5,1.5]:box(xx+dx,yy,.34,.12,.5,.55,bronze)

# Export grouped geometry. All material slots are shared across culling groups.
objects=[]
for (part,material),(verts,faces,uvs) in B.items():
    mesh=bpy.data.meshes.new(part+' / '+material);mesh.from_pydata(verts,[],faces);mesh.update();layer=mesh.uv_layers.new(name='UVMap')
    for poly,coords in zip(mesh.polygons,uvs):
        for i,uv in zip(poly.loop_indices,coords):layer.data[i].uv=uv
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    ob=bpy.data.objects.new(part+' / '+material,mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(M[material]);objects.append(ob)
    ob['asset_role']='San Francisco Ferry Building / 1898 Beaux-Arts terminal';ob['reference']='https://www.ferrybuildingmarketplace.com/history/';ob['axis_contract']='Blender east +X / north +Y / up +Z'
    ob['asset_section']=part
    ob['asset_subsection']='NorthWing' if 'north' in part else 'SouthWing' if 'south' in part else 'RearTerminal' if 'terminal' in part else 'CentralTower'
    ob['asset_culling_group']=part
    # Mesh origins remain world-local zero; vertex bounds drive Three.js culling.

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True
world=bpy.data.worlds.new('San Francisco waterfront clear sky');world.use_nodes=True
world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.40,.57,.73,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.55;scene.world=world
bpy.ops.object.light_add(type='SUN',location=(-100,-120,160));sun=bpy.context.object;sun.name='Clear afternoon sunlight';sun.data.energy=2.4;sun.data.angle=.07;sun.rotation_euler=(math.radians(25),math.radians(-32),math.radians(-30))
bpy.ops.object.light_add(type='AREA',location=(-150,-130,150));fill=bpy.context.object;fill.name='Architectural soft fill';fill.data.energy=190000;fill.data.shape='DISK';fill.data.size=110;fill.rotation_euler=(Vector((0,0,24))-fill.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-216,-195,111));camera=bpy.context.object;camera.name='Ferry Building architectural overview';camera.rotation_euler=(Vector((0,0,27))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='PERSP';camera.data.lens=42;scene.camera=camera
scene.render.resolution_x=1800;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
# Source opens immediately into the model from the presentation camera.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.clip_end=2500;area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
for ob in objects:ob.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'ferry-building.blend'))

def export(path,obs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:ob.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)

export(OUT/'ferry-building.glb',objects)
triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in objects)
allpoints=[v.co for ob in objects for v in ob.data.vertices]
bounds=[[min(v[i] for v in allpoints) for i in range(3)],[max(v[i] for v in allpoints) for i in range(3)]]
lods=[];lodmaterials={}
for ob in objects:
    lod=ob.copy();lod.data=ob.data.copy();lod.name=ob.name+' / distant';bpy.context.collection.objects.link(lod);lods.append(lod)
    for slot in lod.material_slots:
        source=slot.material
        if source.name not in lodmaterials:
            lm=source.copy();lm.name=source.name+' / distant';p=lm.node_tree.nodes.get('Principled BSDF')
            for target in ['Normal','Roughness']:
                for link in list(p.inputs[target].links):lm.node_tree.links.remove(link)
            for node in list(lm.node_tree.nodes):
                if node.type=='TEX_IMAGE':
                    if any(l.to_socket==p.inputs['Base Color'] for l in node.outputs['Color'].links):
                        small=node.image.copy();small.name=node.image.name+' / distant';small.scale(128,128);small.pack();node.image=small
                    else:lm.node_tree.nodes.remove(node)
            lodmaterials[source.name]=lm
        slot.material=lodmaterials[source.name]
    # Disconnected canopy sheets must retain their simple planes: collapsing
    # coplanar quads can extrapolate vertices far outside the original mesh.
    if len(lod.data.polygons)>50:
        mod=lod.modifiers.new('Distant architectural detail budget','DECIMATE');mod.ratio=.29
        graph=bpy.context.evaluated_depsgraph_get();evaluated=lod.evaluated_get(graph)
        simplified=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=graph)
        mins=[min(v.co[i] for v in lod.data.vertices) for i in range(3)]
        maxs=[max(v.co[i] for v in lod.data.vertices) for i in range(3)]
        escape=max(max(mins[i]-v.co[i],v.co[i]-maxs[i],0) for v in simplified.vertices for i in range(3))
        if escape>1.0:
            print('LOD_BOUNDS_GUARD retained unstable mesh:',ob.name,escape,flush=True)
            bpy.data.meshes.remove(simplified)
        else:
            # The edge-collapse solution may overshoot a shallow cornice by a
            # few centimeters. Its source envelope is a hard constraint.
            for v in simplified.vertices:
                for i in range(3):v.co[i]=max(mins[i],min(maxs[i],v.co[i]))
            lod.data=simplified
        lod.modifiers.remove(mod)
export(OUT/'ferry-building-lod.glb',lods)
for ob in lods:bpy.data.objects.remove(ob,do_unlink=True)
blob=(OUT/'ferry-building-lod.glb').read_bytes();n=struct.unpack_from('<I',blob,12)[0];ld=json.loads(blob[20:20+n])
report={'asset':'ferry-building.glb','source':'art/source/ferry-building.blend','generator':'tools/blender/build_ferry_building.py','triangles':triangles,'meshes':len(objects),'materials':len(M),'lodTriangles':sum(ld['accessors'][prim['indices']]['count']//3 for mesh in ld['meshes'] for prim in mesh['primitives']),'bytes':(OUT/'ferry-building.glb').stat().st_size,'lodBytes':len(blob),'blenderBounds':bounds,'axis':'Blender +X east, +Y north, +Z up; street front -X. glTF +X east, +Y up, -Z north. No reflection required.','runtimePlacement':{'canonicalPosition':[730,2.3,-250],'rotationY':0},'compression':'Draco (local decoder)','references':['https://www.ferrybuildingmarketplace.com/history/','https://en.wikipedia.org/wiki/San_Francisco_Ferry_Building'],'modelingNotes':'Original reference-informed model, adapted to compressed game map; real proportions and silhouette, not a survey. All source geometry and original baked materials authored in Blender. 190m hall; 75m tower; clock dials on all four sides; real recessed arcade apertures; roof monitor; rear terminal canopy.'}
(OUT/'ferry-building.meta.json').write_text(json.dumps(report,indent=2)+'\n');print('FERRY_BUILDING_REPORT',json.dumps(report),flush=True)
if '--skip-render' in sys.argv:sys.exit(0)
scene.render.filepath=str(REVIEWS/'ferry-building-overview.png');bpy.ops.render.render(write_still=True)
camera.location=(-69,-38,15);camera.rotation_euler=(Vector((-22,0,12))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=35
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.filepath=str(REVIEWS/'ferry-building-arcades.png');bpy.ops.render.render(write_still=True)
camera.location=(-117,-92,61);camera.rotation_euler=(Vector((-20,0,52))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=60
scene.render.resolution_x=1400;scene.render.resolution_y=1400;scene.render.filepath=str(REVIEWS/'ferry-building-clocktower.png');bpy.ops.render.render(write_still=True)
