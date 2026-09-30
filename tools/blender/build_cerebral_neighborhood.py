"""Cerebral Valley: surveyed footprints, Victorian street walls and park grounds.

Run with Blender --background --python tools/blender/build_cerebral_neighborhood.py.
Geometry uses metres, +X east, +Y north, +Z up, origin (-122.42415,37.77655).
glTF is consequently +X east, -Z north and is placed OUTSIDE reflected cityRoot.
OSM footprints/heights and USGS sampled ground come from cerebral-valley-layout.json.
Facade paint/ornament are reference-informed interpretations, not a photo survey.
"""
import bpy, bmesh, math, random, json, sys, struct
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
from facade_geometry import wall_frontages

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/cerebral-valley'; SOURCE=ROOT/'art/source'; REVIEW=ROOT/'art/reviews'
DATA=ROOT/'art/references/cerebral-valley-layout.json'
for p in (OUT,SOURCE,REVIEW): p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
for d in list(bpy.data.materials): bpy.data.materials.remove(d)
BATCH={}; LOD_BATCH={}; MATERIALS={}; PART='neighborhood'; DETAIL='structural'; MODEL_LOG=[]; ANCHORS=[]
GROUND_SAMPLE=None
FAST='--fast' in sys.argv
# These three procedurally interpreted seats overlap the widened playable
# asphalt corridor. Other park furniture remains at its original position.
# Clearance was checked against the rounded live route, not the old perimeter
# itinerary in layout.json (centres are 1.223m, .957m and 1.604m from the route).
ALAMO_INTRUDING_BENCHES=((-1014.912,-91.004),(-1043.667,-134.586),(-813.772,-70.488))
ALAMO_RESTROOM_ID='389112749'

def linear(hexcolor):
    c=[int(hexcolor[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)

def image(name,arr,noncolor=False):
    h,w,c=arr.shape
    if c==3: arr=np.concatenate((arr,np.ones((h,w,1))),axis=2)
    im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    if noncolor: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(np.asarray(arr,np.float32).ravel()); im.pack(); return im

def material(name,color,rough=.76,metal=0,kind=None,emit=0):
    m=bpy.data.materials.new('Cerebral / '+name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear(color),1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*linear(color),1)
    if emit: p.inputs['Emission Color'].default_value=(*linear(color),1);p.inputs['Emission Strength'].default_value=emit
    if kind:
        n=512;yy,xx=np.mgrid[0:n,0:n];rng=np.random.default_rng(167+len(name))
        base=np.array([int(color[i:i+2],16)/255 for i in (1,3,5)])
        noise=rng.normal(0,.006,(n,n));h=noise*.025
        if kind=='clapboard':
            # 4m repeat with 0.18m horizontal lap siding and fine grain.
            sy=yy%23.27;seam=np.exp(-(sy/1.1)**2);grain=np.sin(xx*.30+np.sin(yy*.55))*rng.uniform(.0008,.002)
            shade=noise+grain-seam*.050+(sy/23.27-.5)*.010;h=sy/23.27*.012-seam*.018
        elif kind=='stucco': shade=noise*1.8;h=noise*.10
        elif kind=='brick':
            sy=yy%16;sx=(xx+(yy//16%2)*31)%62;mortar=(sy<1.5)|(sx<1.6)
            shade=noise*1.8+rng.normal(0,.024,(32,9))[np.minimum(yy//16,31),np.minimum((xx+(yy//16%2)*31)//62,8)]
            shade=np.where(mortar,.11,shade);h=np.where(mortar,-.009,noise*.06)
        elif kind=='slate':
            seam=(yy%25<1.3)|((xx+(yy//25%2)*13)%26<1.2)
            shade=noise*2-seam*.025;h=np.where(seam,-.008,noise*.08)
        elif kind=='grass':
            # Original dense blade/earth mottling: no painted polygon tiling.
            noise=rng.normal(0,.017,(n,n));broad=(np.sin(xx*.013)+np.sin(yy*.021+xx*.006))*0.013
            blade=(np.sin(xx*.91+yy*.37)> .78)*(rng.random((n,n))>.45)
            shade=noise+broad+blade*.038;h=noise*.40+blade*.06
        elif kind=='gravel': shade=noise*3;h=noise*.55
        else: shade=noise;h=noise*.1
        arr=np.clip(base+shade[:,:,None],0,1);al=image(name+' / albedo',arr)
        gy,gx=np.gradient(h);normal=np.stack((-gx*10,-gy*10,np.ones_like(h)),axis=-1);normal/=np.linalg.norm(normal,axis=-1)[:,:,None]
        nm=image(name+' / surface normal',normal*.5+.5,True)
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=al;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=nm;node=m.node_tree.nodes.new('ShaderNodeNormalMap');node.inputs['Strength'].default_value=.38
        m.node_tree.links.new(t.outputs['Color'],node.inputs['Color']);m.node_tree.links.new(node.outputs['Normal'],p.inputs['Normal'])
    MATERIALS[name]=m;return name

PAINT=[material('lap siding '+n,c,kind='clapboard') for n,c in [
    ('fog blue','#9aabb2'),('eucalyptus gray','#adb1a0'),('warm ivory','#d8d1bc'),
    ('pearl','#c1c7c6'),('slate blue','#778994'),('oyster','#b6b2a8'),
    ('buttercream','#d3c5a2'),('muted sage','#9faa99'),('clay pink','#bbaba3')]]
STUCCO=[material('stucco '+n,c,kind='stucco') for n,c in [('warm white','#ccc5b7'),('sandstone','#b9a995'),('pale gray','#b4b8b6')]]
BRICK=material('weathered red brick','#956d5b',kind='brick')
TRIMS=[material('painted cream joinery','#e4decd'),material('cool white joinery','#dee3df'),material('deep olive joinery','#677063')]
GLASS=material('recessed blue gray glazing','#3d5664',.26,.22)
SHADOW=material('window and porch shadow','#222c31',.95)
CURTAIN=material('ivory linen curtains','#bbb7a8',.94)
SASH=material('dark sash bronze','#424a46',.42,.35)
WOOD=material('varnished oak doors','#75573d',.63)
IRON=material('painted wrought iron','#303b3a',.42,.45)
ROOF=material('weathered membrane roof','#656c6b',.95)
SLATE=material('slate roof shingles','#576064',.87,kind='slate')
STONE=material('sandstone stoops','#b5b09e',.87,kind='stucco')
GRAVEL=material('park pale decomposed granite','#bcb398',.98,kind='gravel')
TURFS=[material('park turf '+str(i),c,1,kind='grass') for i,c in enumerate(('#75834f','#778751','#7c8954'))]
EARTH=material('tree bed soil','#5e5542',.98,kind='gravel')
GRANITE=material('dark gray retaining stone','#8b9086',.95,kind='stucco')
BENCH=material('park bench redwood','#8c6749',.86)
SHOP_OAK=material('Souvla pale oak','#b69a77',.68)
SIGN_BLUE=material('Souvla pale turquoise enamel','#93b7bc',.45)
SIGN_GOLD=material('Patxis warm sign lettering','#c1a158',.54,.25)
SHOP_LIGHT=material('warm cafe lamps','#f4dcaf',.5,emit=.55)
CLEAR=material('clear cafe glazing','#c1d4d2',.18,.1)
MATERIALS[CLEAR].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.18
MATERIALS[CLEAR].diffuse_color=(*linear('#c1d4d2'),.18);MATERIALS[CLEAR].surface_render_method='DITHERED'

def face(pts,mat,uv=None):
    if len(pts)<3:return
    key=(PART,DETAIL,mat);vs,fs,us=BATCH.setdefault(key,[[],[],[]]);idx=len(vs)
    vs.extend(pts);fs.append(list(range(idx,idx+len(pts))))
    if uv is None:
        normal=(Vector(pts[1])-Vector(pts[0])).cross(Vector(pts[2])-Vector(pts[0]));axis=max(range(3),key=lambda i:abs(normal[i]));ids=[i for i in range(3) if i!=axis]
        uv=[(p[ids[0]]/4,p[ids[1]]/4) for p in pts]
    us.append(uv)

def box(x,y,z,w,d,h,mat,yaw=0):
    c,s=math.cos(yaw),math.sin(yaw)
    pts=[(x+c*u-s*v,y+s*u+c*v,z+t) for u,v,t in [(-w/2,-d/2,-h/2),(w/2,-d/2,-h/2),(w/2,d/2,-h/2),(-w/2,d/2,-h/2),(-w/2,-d/2,h/2),(w/2,-d/2,h/2),(w/2,d/2,h/2),(-w/2,d/2,h/2)]]
    for ids in [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]:face([pts[i] for i in ids],mat)

def rod(a,b,r,mat,n=6):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
    if u.length<.01:u=direction.cross(Vector((0,1,0)))
    u.normalize();v=direction.cross(u)
    rings=[[tuple(p+(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))*r) for i in range(n)] for p in (a,b)]
    face(rings[0][::-1],mat);face(rings[1],mat)
    for i in range(n):j=(i+1)%n;face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],mat)

class Facade:
    """u follows frontage, d is out toward the street, h above local ground."""
    def __init__(self,x,y,nx,ny,base): self.x=x;self.y=y;self.nx=nx;self.ny=ny;self.base=base;self.ux=ny;self.uy=-nx;self.yaw=math.atan2(self.uy,self.ux)
    def p(self,u,d,h):return (self.x+self.ux*u+self.nx*d,self.y+self.uy*u+self.ny*d,self.base+h)
    def b(self,u,d,z,w,dep,h,m):box(*self.p(u,d,z),w,dep,h,m,self.yaw)
    def f(self,pts,m):face([self.p(*p) for p in pts],m,[(u/4,z/4) for u,d,z in pts])
    def r(self,a,b,r,m,n=6):rod(self.p(*a),self.p(*b),r,m,n)
    def text(self,body,u,d,z,size,mat,maxwidth=None):
        curve=bpy.data.curves.new(body,'FONT');curve.body=body;curve.align_x='CENTER';curve.size=size;curve.extrude=.008;curve.resolution_u=4
        ob=bpy.data.objects.new(body,curve);bpy.context.collection.objects.link(ob);ob.location=self.p(u,d,z);ob.rotation_euler=(math.pi/2,0,self.yaw+math.pi)
        bpy.context.view_layer.update()
        if maxwidth:
            w=max(v[0] for v in ob.bound_box)-min(v[0] for v in ob.bound_box)
            if w>maxwidth:ob.scale.x=maxwidth/w
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
        for p in ob.data.polygons:face([tuple(ob.matrix_world@ob.data.vertices[i].co) for i in p.vertices],mat)
        bpy.data.objects.remove(ob,do_unlink=True)

    def window(self,u,z,w,h,trim,projection=.11,decor=1,variant=0):
        if decor<=1:
            self.simple_window(u,z,w,h,trim,projection,decor==1)
            return
        # Pane lies 20cm behind the projecting casing, with black inner reveals.
        d=projection
        self.b(u,d+.014,z,w+.12,.06,h+.10,SHADOW)
        self.b(u,d+.045,z,w,.025,h,GLASS)
        # Two asymmetric curtains and room shadow add depth without transparency.
        if variant%5!=0:
            for sign in (-1,1):self.b(u+sign*w*.37,d+.064,z,w*.22,.018,h*.95,CURTAIN)
        for side in (-1,1):
            self.b(u+side*(w/2+.08),d+.15,z,.16,.27,h+.29,trim)
            self.b(u+side*(w/2-.036),d+.080,z,.063,.07,h,SASH)
        self.b(u,d+.10,z-h/2,w,.09,.075,SASH);self.b(u,d+.10,z+h/2,w,.09,.075,SASH)
        self.b(u,d+.103,z+.10,w,.08,.06,trim)
        if w>1.35:self.b(u,d+.108,z,.045,.06,h,trim)
        self.b(u,d+.18,z-h/2-.12,w+.37,.39,.16,trim)
        self.b(u,d+.145,z+h/2+.13,w+.32,.31,.16,trim)
        if decor>=2:
            self.b(u,d+.21,z+h/2+.28,w+.49,.44,.10,trim)
            for side in (-1,1):self.b(u+side*w*.39,d+.21,z-h/2-.29,.14,.21,.20,trim)
        if decor==3:
            self.f([(u-w*.58,d+.25,z+h/2+.32),(u+w*.58,d+.25,z+h/2+.32),(u,d+.25,z+h/2+.65)],trim)

    def simple_window(self,u,z,w,h,trim,d=.10,framed=True):
        self.f([(u-w/2,d,z-h/2),(u+w/2,d,z-h/2),(u+w/2,d,z+h/2),(u-w/2,d,z+h/2)],GLASS)
        if framed:
            # Front and inset reveal form an eight-face open frame; the hidden
            # backs/inner cubic faces that dominated the first draft are absent.
            outer=[(u-w/2-.10,z-h/2-.10),(u+w/2+.10,z-h/2-.10),(u+w/2+.10,z+h/2+.10),(u-w/2-.10,z+h/2+.10)]
            inner=[(u-w/2,z-h/2),(u+w/2,z-h/2),(u+w/2,z+h/2),(u-w/2,z+h/2)]
            for i in range(4):
                j=(i+1)%4
                self.f([(outer[i][0],d+.18,outer[i][1]),(outer[j][0],d+.18,outer[j][1]),(inner[j][0],d+.18,inner[j][1]),(inner[i][0],d+.18,inner[i][1])],trim)
                self.f([(inner[i][0],d+.18,inner[i][1]),(inner[j][0],d+.18,inner[j][1]),(inner[j][0],d,inner[j][1]),(inner[i][0],d,inner[i][1])],trim)
            self.f([(u-w/2,d+.06,z+.055),(u+w/2,d+.06,z+.055),(u+w/2,d+.06,z+.105),(u-w/2,d+.06,z+.105)],trim)
        self.f([(u-w/2-.16,d+.35,z-h/2-.10),(u+w/2+.16,d+.35,z-h/2-.10),(u+w/2+.16,d-.03,z-h/2-.10),(u-w/2-.16,d-.03,z-h/2-.10)],trim)
        self.f([(u-w/2-.16,d+.35,z-h/2-.22),(u+w/2+.16,d+.35,z-h/2-.22),(u+w/2+.16,d+.35,z-h/2-.10),(u-w/2-.16,d+.35,z-h/2-.10)],trim)

    def bay(self,u,base,width,height,floors,trim,paint,style=0,detail=2):
        # Real 3-sided angled bay, with side panes and returning mouldings.
        projection=.82 if style!=2 else .96
        narrow=width*.57
        contour=[(-width/2,.07),(-narrow/2,projection),(narrow/2,projection),(width/2,.07)]
        top=base+height
        for i in range(3):
            a,b=contour[i],contour[i+1];ln=math.hypot(b[0]-a[0],b[1]-a[1])
            pa=self.p(u+(a[0]+b[0])/2,(a[1]+b[1])/2,0)
            tangent=self.ux*(b[0]-a[0])+self.nx*(b[1]-a[1]),self.uy*(b[0]-a[0])+self.ny*(b[1]-a[1])
            normal=(-tangent[1]/ln,tangent[0]/ln)
            sub=Facade(pa[0],pa[1],*normal,self.base)
            sub.b(0,-.065,(base+top)/2,ln,.16,height,paint)
            for floor in range(floors):
                zz=base+(floor+.52)*height/floors
                sub.window(0,zz,max(.48,ln-.32),min(2.05,height/floors-.85),trim,.08,detail,style+floor)
            for zz,dep,hh in [(base,.25,.18),(top,.44,.21),(top-.28,.31,.15)]+[(base+(j+1)*height/floors,.28,.17) for j in range(floors-1)]:
                sub.b(0,dep*.15,zz,ln+.16,dep,hh,trim)
            if detail>1:
                sub.b(-ln/2+.06,.12,(base+top)/2,.09,.20,height,trim)
                sub.b(ln/2-.06,.12,(base+top)/2,.09,.20,height,trim)
        self.f([(u+a,d,top+.11) for a,d in contour]+[(u+width/2,-.10,top+.11),(u-width/2,-.10,top+.11)],SLATE)
        self.f([(u+a,d,base-.07) for a,d in contour]+[(u+width/2,-.10,base-.07),(u-width/2,-.10,base-.07)],trim)
        if detail>1:
            for xx in (-width*.27,width*.27):
                self.b(u+xx,.32,base-.29,.20,.54,.35,trim)
                self.b(u+xx,.17,base-.50,.16,.25,.23,trim)

    def stoop(self,u,width,landing,trim,detail=2):
        steps=max(3,round(landing/.19));depth=steps*.27
        self.b(u,.33,landing+.055,width+.3,.78,.13,STONE)
        for i in range(steps):
            h=landing*(steps-i)/steps;self.b(u,.73+(i+.5)*.27,h/2,width,.28,h,STONE)
        self.b(u,.022,landing+1.14,width*.77,.07,2.28,WOOD)
        for side in (-1,1):self.b(u+side*width*.43,.12,landing+1.19,.16,.29,2.50,trim)
        self.b(u,.11,landing+2.48,width+.11,.31,.17,trim)
        self.b(u,.087,landing+1.67,width*.57,.02,.61,GLASS)
        for dz in (.45,.85):self.b(u,.093,landing+dz,width*.56,.05,.24,trim)
        self.r((u+width*.22,.13,landing+1),(u+width*.22,.13,landing+1.28),.026,IRON)
        if detail>1:
            for side in (-1,1):
                x=u+side*(width/2+.03)
                self.r((x,.41,landing+.91),(x,.74+depth,.9),.036,IRON)
                for j in range(steps+1):
                    d=.67+j*.27;h=max(0,landing*(steps-j)/steps)
                    self.r((x,d,h+.07),(x,d,h+.89),.017,IRON,5)
                for d,h in ((.40,landing),(.74+depth,0)):self.r((x,d,h),(x,d,h+.98),.044,IRON,7)

    def frontage(self,width,height,style,paint,trim,detail,seed,commercial=False):
        global DETAIL
        rng=random.Random(seed);storey=3.20;floors=max(1,round((height-1.2)/storey));floorh=(height-.85)/floors
        # Wall is the original surveyed footprint. Thin facade details never
        # replace, combine or regularize the site's irregular parcel outline.
        self.b(0,.05,.36,width,.13,.72,STONE)
        for z,dep,h in [(height-.42,.40,.18),(height-.17,.65,.17),(height+.05,.91,.16)]:self.b(0,.10,z,width+.18,dep,h,trim)
        if detail>1:
            DETAIL='fine ornament'
            for u in np.arange(-width/2+.31,width/2,.47):
                self.b(float(u),.26,height-.66,.16,.31,.23,trim)
                if style==1:self.b(float(u),.12,height-.86,.12,.18,.16,trim)
            DETAIL='facade'
        for u in (-width/2+.08,width/2-.08):self.b(u,.11,height/2,.15,.23,height-.4,trim)
        if style in (0,1,2,4) and width>=6.1 and floors>=2:
            # Paired bays on broad double flats, one bay + offset stair on narrow lots.
            bays=[-width*.255,width*.255] if width>11 else [-width*.16]
            bw=min(3.25,width*.34 if len(bays)==1 else width*.29)
            for u in bays:self.bay(u,floorh+.03,bw,height-floorh-.64,floors-1,trim,paint,style,detail)
            if len(bays)==1:
                u=width*.31
                for fl in range(1,floors):self.window(u,(fl+.48)*floorh, min(1.36,width*.18),min(2.02,floorh-.72),trim,.07,2 if detail>1 else 1,fl+seed)
            if commercial:
                self.shop(width,floorh,trim,seed,detail)
            else:
                u=width*.31 if len(bays)==1 else 0
                self.stoop(u,min(1.45,width*.18),min(.94,floorh*.28),trim,detail)
                for bu in bays:self.window(bu,floorh*.52,bw*.61,min(1.7,floorh-.7),trim,.07,1,seed)
        else:
            cols=max(2,round(width/2.45));pitch=width/cols
            for fl in range(1 if commercial else 0,floors):
                for j in range(cols):
                    u=-width/2+(j+.5)*pitch
                    if fl==0 and j==cols-1 and not commercial:continue
                    self.window(u,(fl+.50)*floorh,min(1.43,pitch-.65),min(2.02,floorh-.75),trim,.07,2 if detail>1 and style!=5 else 1,seed+j+fl)
            if commercial:self.shop(width,floorh,trim,seed,detail)
            else:self.stoop(width/2-pitch*.50,min(1.35,pitch*.57),.57,trim,detail)
        for z in [floorh, height-.95]:self.b(0,.06,z,width+.04,.24,.14,trim)
        if detail>1:
            DETAIL='fine ornament'
            # A few authentic cast iron grilles and discreet drains, never
            # oversized sculptural decorations replacing Victorian joinery.
            self.r((-width/2+.12,.22,.4),(-width/2+.12,.22,height-.80),.035,SASH)
            if style in (1,4):
                for u in [-width*.30,width*.30]:
                    for k in range(7):self.b(u+(k-3)*.15,.22,.44,.022,.05,.54,IRON)
                    self.b(u,.22,.74,1.0,.07,.044,IRON)
            DETAIL='facade'

    def shop(self,width,height,trim,seed,detail):
        cols=max(2,round(width/3.15));pitch=width/cols
        for j in range(cols):
            u=-width/2+(j+.5)*pitch
            self.b(u,.07,height*.46,pitch-.29,.045,height*.73,SHADOW)
            self.b(u,.11,height*.48,pitch-.47,.025,height*.65,GLASS)
            self.b(u,.21,height*.69,pitch-.35,.14,.08,trim)
            self.b(u,.21,height*.13,pitch-.30,.16,.25,trim)
            for x in [u-pitch/2+.09,u+pitch/2-.09]:self.b(x,.16,height*.47,.16,.26,height*.86,trim)
            self.b(u,.20,height*.47,.06,.10,height*.67,SASH)
            if detail>1 and (seed+j)%3==0:
                self.f([(u-pitch*.47,.18,height*.87),(u+pitch*.47,.18,height*.87),(u+pitch*.47,1.18,height*.74),(u-pitch*.47,1.18,height*.74)],TRIMS[2])
                self.b(u,1.17,height*.715,pitch*.94,.09,.18,TRIMS[2])
        self.b(0,.22,height*.94,width+.07,.44,.25,trim)

def inside(x,y,poly):
    flag=False;j=len(poly)-1
    for i in range(len(poly)):
        a,b=poly[i],poly[j]
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:flag=not flag
        j=i
    return flag

def nearest_segment(x,y,segments):
    best=(1e12,None,None)
    for a,b,meta in segments:
        dx,dy=b[0]-a[0],b[1]-a[1];d=dx*dx+dy*dy
        t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/max(d,1e-6)))
        q=(a[0]+dx*t,a[1]+dy*t);dist=math.hypot(q[0]-x,q[1]-y)
        if dist<best[0]:best=(dist,q,meta)
    return best

def polygon_body(poly,z,h,paint,open_edge=None):
    for i,a in enumerate(poly):
        if i==open_edge:continue
        b=poly[(i+1)%len(poly)]
        length=math.dist(a,b)
        if length<.07:continue
        za=min(z,GROUND_SAMPLE(*a)-.22) if GROUND_SAMPLE else z
        zb=min(z,GROUND_SAMPLE(*b)-.22) if GROUND_SAMPLE else z
        face([(*a,za),(*b,zb),(*b,z+h),(*a,z+h)],paint,[(0,(za-z)/4),(length/4,(zb-z)/4),(length/4,h/4),(0,h/4)])
    vectors=[Vector((x,y,z+h)) for x,y in poly]
    for tri in tessellate_polygon([vectors]):face([tuple(vectors[v]) if isinstance(v,int) else tuple(v) for v in tri],ROOF)

def alamo_restroom(poly,base,height):
    """OSM amenity=toilets, building=yes: one small park service building.

    Its surveyed footprint is authoritative. Height, muted stucco, flush metal
    doors and high ventilation are restrained interpretations, not a facade
    photo survey. Do not pass this amenity through the Victorian house author.
    """
    body_height=height-.16
    polygon_body(poly,base,body_height,STUCCO[0])
    area=sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))
    for i,a in enumerate(poly):
        b=poly[(i+1)%len(poly)];length=math.dist(a,b)
        ux,uy=(b[0]-a[0])/length,(b[1]-a[1])/length
        nx,ny=(uy,-ux) if area>0 else (-uy,ux)
        f=Facade((a[0]+b[0])/2,(a[1]+b[1])/2,nx,ny,base)
        f.b(0,-.01,height-.08,length+.12,.24,.16,ROOF)
        f.b(0,.02,.18,length,.09,.36,GRANITE)
        if ny<-.5 and length>7:
            for u in (-length*.24,length*.24):
                f.b(u,.034,1.12,1.02,.045,2.24,IRON)
                f.b(u-.37,.073,1.08,.036,.04,.26,SASH)
                f.b(u,.073,2.55,.95,.04,.25,SHADOW)
                for z in (2.47,2.55,2.63):f.b(u,.10,z,.92,.045,.027,SASH)
        elif length>5:
            f.b(0,.04,2.60,min(1.65,length*.25),.04,.28,SHADOW)
            for z in (2.50,2.60,2.70):f.b(0,.075,z,min(1.62,length*.25),.045,.025,SASH)

def hayes_restaurants(f,height):
    """Original interiors/sign geometry from inspected Souvla/Patxi references.
    Positions follow business nodes within surveyed 511–529 Hayes footprint.
    """
    # Principal frontage u increases east; business widths fill this one real
    # five-metre-high commercial parcel, not several invented tall Victorians.
    for u,w,label,oak in [(11.0,6.0,'Patxi’s',False),(5.10,5.8,'SOUVLA',True),(-1.8,7.7,'',False),(-9.65,7.75,'',False)]:
        frame=SASH if oak else TRIMS[2];wall=SHOP_OAK if oak else STUCCO[0]
        f.b(u,-2.7,1.6,w-.12,.15,3.2,wall);f.b(u,-1.2,.07,w-.08,3,.14,STONE);f.b(u,-1.2,3.72,w-.08,3,.17,TRIMS[0])
        for sign in (-1,1):f.b(u+sign*(w/2-.08),-.7,1.8,.18,2.0,3.6,frame)
        f.b(u,.13,3.15,w,.21,.35,TRIMS[0] if oak else frame)
        f.b(u,.13,4.65,w,.22,.43,wall)
        # High transom strip and deep display glass with an open entrance bay.
        for xx,ww in [(u-w*.28,w*.39),(u+w*.30,w*.34)]:
            f.b(xx,.11,1.58,ww,.022,2.75,CLEAR)
            for s in (-1,1):f.b(xx+s*ww/2,.15,1.58,.065,.14,2.92,frame)
        f.b(u,.11,3.98,w-.20,.028,1.12,CLEAR)
        for xx in [u-w/2+.10,u,u+w/2-.10]:f.b(xx,.15,3.98,.065,.13,1.15,frame)
        # Recessed oak entrance and glass-panel door sit 0.8m inside the room.
        f.b(u,-.85,1.4,1.05,.12,2.8,WOOD);f.b(u,-.75,1.60,.86,.025,2.12,CLEAR)
        for s in (-1,1):f.b(u+s*.56,-.70,1.4,.075,.15,2.82,frame)
        f.r((u+.36,-.61,1.03),(u+.36,-.61,1.33),.018,SIGN_GOLD)
        # Human-scale illuminated interior: counter, cabinet shelving and table.
        f.b(u-1.1,-1.75,.91,min(2.4,w*.48),.70,.11,SHOP_OAK)
        for s in (-1,1):f.b(u-1.1+s*.7,-1.75,.44,.07,.58,.87,IRON)
        for zz in [1.08,1.69,2.35]:f.b(u,-2.56,zz,w-.55,.38,.07,SHOP_OAK)
        for j in range(4):f.b(u-w*.28+j*w*.18,-2.37,1.90,.18,.12,.31,TRIMS[0])
        for xx in [u-w*.30,u+w*.30]:
            f.r((xx,.16,4.82),(xx,.70,4.50),.025,SASH)
            f.b(xx,.70,4.45,.32,.30,.08,SASH);f.b(xx,.70,4.405,.23,.22,.02,SHOP_LIGHT)
            f.b(xx,-1.5,3.54,.36,.34,.06,SHOP_LIGHT)
        if oak:
            # Six slim turquoise plaques and ivory vertical glyphs match the
            # reference's small sign, rather than giant fictional brand text.
            for j,ch in enumerate(label):
                xx=u+(2.5-j)*.27
                f.b(xx,.30,3.20,.24,.08,.45,SIGN_BLUE);f.text(ch,xx,.35,3.02,.37,TRIMS[0],.19)
            # Low exterior oak counter seen in the official entrance photo.
            f.b(u-w*.31,.55,1.05,w*.40,.47,.10,SHOP_OAK)
            for xx in [u-w*.44,u-w*.19]:f.r((xx,.54,.04),(xx,.54,1.04),.035,IRON)
        elif label:
            f.b(u,.28,3.20,w-.20,.17,.55,SASH);f.text('PATXI’S PIZZA',u,.38,3.03,.32,SIGN_GOLD,w-.5)
            # Dark oval projecting sign, observed on the Hayes photograph.
            center=(u-w*.37,1.22,3.36);pts=[]
            for j in range(36):a=j*math.tau/36;pts.append((center[0]+math.cos(a)*.72,center[1],center[2]+math.sin(a)*.46))
            f.f(pts,SASH);f.text('Patxi’s',center[0],center[1]+.02,center[2]-.10,.30,SIGN_GOLD,1.18)

def ground_sampler(data):
    grid=data['elevationGrid'];cols=grid['columns'];rows=grid['rows'];values=grid['values']
    def height(x,y):
        xx=max(0,min(cols-1.001,(x-grid['minX'])/(grid['maxX']-grid['minX'])*(cols-1)))
        yy=max(0,min(rows-1.001,(grid['maxZ']-y)/(grid['maxZ']-grid['minZ'])*(rows-1)))
        ix,iy=int(xx),int(yy);fx,fy=xx-ix,yy-iy
        return (values[iy*cols+ix]*(1-fx)+values[iy*cols+ix+1]*fx)*(1-fy)+(values[(iy+1)*cols+ix]*(1-fx)+values[(iy+1)*cols+ix+1]*fx)*fy
    return height

def park_ribbon(points,width,mat,ground,raiseby=.085):
    dense=[]
    for a,b in zip(points,points[1:]):
        dist=math.dist(a,b);count=max(1,math.ceil(dist/3))
        for i in range(count):t=i/count;dense.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    dense.append(points[-1]);edges=[]
    for i,p in enumerate(dense):
        a=dense[max(0,i-1)];b=dense[min(len(dense)-1,i+1)];dx,dy=b[0]-a[0],b[1]-a[1];ln=math.hypot(dx,dy) or 1
        n=(-dy/ln*width/2,dx/ln*width/2)
        edges.append([(p[0]+sg*n[0],p[1]+sg*n[1],ground(p[0]+sg*n[0],p[1]+sg*n[1])+raiseby) for sg in (-1,1)])
    for a,b in zip(edges,edges[1:]):face([a[0],b[0],b[1],a[1]],mat)

def bench(x,y,z,yaw=0):
    for j in range(5):box(x,y+(j-2)*.095,z+.47,1.8,.075,.045,BENCH,yaw)
    for j in range(4):box(x,y+.24,z+.69+j*.09,1.8,.065,.07,BENCH,yaw)
    for sign in (-1,1):
        rod((x+sign*.68,y-.20,z+.04),(x+sign*.68,y-.17,z+.48),.035,IRON)
        rod((x+sign*.68,y+.19,z+.04),(x+sign*.68,y+.24,z+1.03),.035,IRON)

def parks(data,ground):
    global PART,DETAIL
    for park in data['parks']:
        name=park.get('name','')
        if not any(k in name.lower() for k in ('alamo','duboce','patricia')):continue
        # Close Hayes landmark owns its exact lawn, paths and authored anchors.
        # Avoid duplicate surfaces/furniture and the old oversized canopy row.
        if name=="Patricia's Green":continue
        PART='park / '+name;DETAIL='landscape';poly=[(p['x'],p['z']) for p in park['polygon']]
        if len(poly)<3:continue
        minx,maxx=min(p[0] for p in poly),max(p[0] for p in poly);miny,maxy=min(p[1] for p in poly),max(p[1] for p in poly)
        # Clip a fine DEM-following mesh to surveyed boundary. Boundary cells
        # are subdivided again, so irregular Duboce edges remain smooth.
        step=3
        for x in np.arange(minx,maxx,step):
            for y in np.arange(miny,maxy,step):
                if not inside(x+step*.5,y+step*.5,poly):continue
                pts=[(xx,yy,ground(xx,yy)+.053) for xx,yy in [(x,y),(x+step,y),(x+step,y+step),(x,y+step)]]
                face([pts[0],pts[1],pts[2]],TURFS[0]);face([pts[0],pts[2],pts[3]],TURFS[0])
        paths=[]
        for pp in park.get('paths',[]):
            pts=pp.get('points',[]) if isinstance(pp,dict) else pp
            if len(pts)<2:continue
            xy=[(p['x'],p['z']) for p in pts]
            width=pp.get('width',2.4) if isinstance(pp,dict) else 2.4
            if any(inside(x,y,poly) for x,y in xy):paths.append(xy);park_ribbon(xy,width,GRAVEL,ground)
        # Curb line sits just above terrain, not a giant raised planter wall.
        park_ribbon(poly+[poly[0]],.20,STONE,ground,.15)
        paths_segments=[(a,b,{}) for path in paths for a,b in zip(path,path[1:])]
        # Irregular woody belts seen in reviewed park photographs; full trees
        # are separate scanned assets supplied by the runtime.
        rng=random.Random(int(park.get('id',1)) if str(park.get('id','1')).isdigit() else len(name)*93)
        candidate=[]
        if 'Patricia' in name and len(poly)>=4:
            # Narrow garden follows the rotated Octavia parcel, so use its
            # actual long/short edges rather than a world-aligned bounding box.
            a,b,c=poly[0],poly[1],poly[3]
            for t in (.16,.37,.61,.83):
                for s in (.20,.80):
                    x=a[0]+(b[0]-a[0])*s+(c[0]-a[0])*t;y=a[1]+(b[1]-a[1])*s+(c[1]-a[1])*t
                    candidate.append((x,y));ANCHORS.append({'x':round(x,3),'z':round(y,3),'y':round(ground(x,y)+.08,3),'scale':.74,'yaw':round(rng.random()*math.tau,4),'kind':'park','park':name})
        for _ in range(900):
            if 'Patricia' in name:break
            x,y=rng.uniform(minx+5,maxx-5),rng.uniform(miny+5,maxy-5)
            if not inside(x,y,poly):continue
            ux=(x-minx)/(maxx-minx);uy=(y-miny)/(maxy-miny)
            if 'Alamo' in name:
                allowed=ux<.22 or ux>.84 or uy>.69 or (.31<ux<.49 and .37<uy<.58)
            elif 'Duboce' in name:allowed=uy>.72 or ux<.23 or (ux>.85 and uy>.4)
            else:allowed=ux<.23 or ux>.78
            if not allowed:continue
            if paths_segments and nearest_segment(x,y,paths_segments)[0]<3.8:continue
            if any(math.dist((x,y),p)<9+rng.random()*5 for p in candidate):continue
            candidate.append((x,y))
            ANCHORS.append({'x':round(x,3),'z':round(y,3),'y':round(ground(x,y)+.08,3),'scale':round(rng.uniform(.78,1.38),3),'yaw':round(rng.random()*math.tau,4),'kind':'park','park':name})
        # Simple real park furniture with open ironwork and timber slats.
        DETAIL='park furniture'
        benches_added=0;benches_suppressed=[]
        for path in paths[::max(1,len(paths)//8)]:
            x,y=path[len(path)//2];x+=3.1
            if not inside(x,y,poly):continue
            if name=='Alamo Square' and any(math.dist((x,y),p)<.025 for p in ALAMO_INTRUDING_BENCHES):
                benches_suppressed.append({'x':round(x,3),'z':round(y,3),'reason':'interpreted furniture intersects active race asphalt'})
                continue
            bench(x,y,ground(x,y)+.10);benches_added+=1
        MODEL_LOG.append({'park':name,'surveyedBoundary':True,'pathCount':len(paths),'treeAnchors':len(candidate),'benches':benches_added,'suppressedBenches':benches_suppressed})

def main():
    global PART,DETAIL,BATCH,LOD_BATCH,GROUND_SAMPLE
    data=json.loads(DATA.read_text());ground=ground_sampler(data)
    GROUND_SAMPLE=ground
    park_edges=[]
    for park in data['parks']:
        if park.get('name') not in ('Alamo Square','Duboce Park'):continue
        poly=park['polygon']
        park_edges.extend(((a['x'],a['z']),(b['x'],b['z']),{'park':park['name']}) for a,b in zip(poly,poly[1:]+poly[:1]))
    background_file=OUT/'background-buildings.json'
    if background_file.exists():
        existing={str(b['id']) for b in data['buildings']}
        for b in json.loads(background_file.read_text())['buildings']:
            if str(b['id']) in existing:continue
            if min(nearest_segment(p['x'],p['z'],park_edges)[0] for p in b['polygon'])<=55:
                b['_parkExtension']=True;data['buildings'].append(b);existing.add(str(b['id']))
    streets=[]
    for s in data['streets']:
        if not s.get('name'):continue
        for a,b in zip(s['points'],s['points'][1:]):streets.append(((a['x'],a['z']),(b['x'],b['z']),s))
    route=data.get('route',[])
    if isinstance(route,dict):route=route.get('points',[])
    route_segments=[((a['x'],a['z']),(b['x'],b['z']),{}) for a,b in zip(route,route[1:])]
    reserved=set(data.get('heroBuildingIds',[]))
    resfile=ROOT/'art/references/cerebral-hero-reserves.json'
    reserve_regions=[]
    if resfile.exists():
        reserves=json.loads(resfile.read_text());reserved.update(reserves.get('buildingIds',[]));reserve_regions=reserves.get('regions',[])
    chosen=[]
    for building in data['buildings']:
        poly=[(p['x'],p['z']) for p in building['polygon']]
        if len(poly)<3:continue
        if math.dist(poly[0],poly[-1])<.02:poly.pop()
        cx=sum(p[0] for p in poly)/len(poly);cy=sum(p[1] for p in poly)/len(poly)
        route_distance=nearest_segment(cx,cy,route_segments)[0] if route_segments else 0
        park_distance=min(nearest_segment(x,y,park_edges)[0] for x,y in poly)
        distance=min(route_distance,35) if park_distance<=55 else route_distance
        building['_actualRouteDistance']=route_distance;building['_parkDistance']=park_distance
        if park_distance<=55:
            # Park-facing houses must face the actual park edge. The nearest
            # named street can be behind the parcel (notably north of Duboce).
            pd,pq,pm=nearest_segment(cx,cy,park_edges);vx,vy=(pq[0]-cx)/max(pd,.001),(pq[1]-cy)/max(pd,.001)
            area=sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))
            edges=[]
            for i,a in enumerate(poly):
                bb=poly[(i+1)%len(poly)];ln=math.dist(a,bb)
                if ln<2:continue
                ux,uy=(bb[0]-a[0])/ln,(bb[1]-a[1])/ln;nx,ny=(uy,-ux) if area>0 else (-uy,ux)
                facing=nx*vx+ny*vy
                if facing<.68:continue
                mx,my=(a[0]+bb[0])/2,(a[1]+bb[1])/2
                edges.append((nearest_segment(mx,my,park_edges)[0]+(1-facing)*12,-ln,nx,ny,mx,my))
            if edges:
                _,negative_width,nx,ny,mx,my=min(edges);ux,uy=ny,-nx
                along=[x*ux+y*uy for x,y in poly];span=max(along)-min(along)
                if -negative_width>=span*.6:
                    width=-negative_width;fx,fy=mx,my
                else:
                    plane=max(x*nx+y*ny for x,y in poly);middle=(min(along)+max(along))/2
                    fx,fy=ux*middle+nx*plane,uy*middle+ny*plane;width=span
                building['frontage']={'x':fx,'z':fy,'nx':nx,'nz':ny,'width':width,'y':ground(fx,fy)}
                building['baseHeight']=ground(fx,fy)
        # Surrounding blocks remain visible, but full joinery is concentrated
        # on actual drivable frontage. No empty vanishing wall at street ends.
        if distance>160:continue
        addr=building.get('address','');bid=building['id']
        if building.get('hero') or str(bid) in ('28015901','60824061'):continue
        if bid in reserved or str(bid) in reserved:continue
        if any(math.hypot(cx-r['x'],cy-r['z'])<r.get('radius',12) for r in reserve_regions):continue
        if isinstance(addr,dict):addr=' '.join(str(v) for v in addr.values())
        # Stable address exclusion also works before explicit reserve data is emitted.
        if ('Steiner' in addr and any(n in addr for n in ('710','712','714','716','718','720','722','201'))) or ('Page' in addr and any(n in addr for n in ('531','535'))) or ('Hayes' in addr and '398' in addr):continue
        chosen.append((distance,building,poly,cx,cy))
    chosen.sort(key=lambda q:q[0]);print('NEIGHBORHOOD surveyed building count',len(chosen),flush=True)
    for index,(distance,b,poly,cx,cy) in enumerate(chosen):
        if str(b['id'])==ALAMO_RESTROOM_ID:
            PART='amenity / Alamo Square restroom';DETAIL='park restroom'
            base=float(b['baseHeight'])+.04;height=float(b['height'])
            alamo_restroom(poly,base,height)
            high=BATCH;BATCH=LOD_BATCH;alamo_restroom(poly,base,height);LOD_BATCH=BATCH;BATCH=high
            MODEL_LOG.append({'building':b['id'],'amenity':'toilets','height':height,'baseHeight':base,'surveyedFootprint':True,'sourceTags':{'amenity':'toilets','building':'yes'},'facadeReference':'interpreted low park restroom; muted stucco and flush metal doors'})
            continue
        seed=int(str(b['id']).split('/')[-1]) if str(b['id']).split('/')[-1].isdigit() else index+9
        rng=random.Random(seed);height=max(3.8,float(b.get('height',10.8)));base=float(b.get('baseHeight',ground(cx,cy)))+.04
        detail=2 if distance<40 else 1 if distance<80 else 0
        style=rng.randrange(6);paint=PAINT[rng.randrange(len(PAINT))];trim=TRIMS[rng.choices([0,1,2],[6,4,1])[0]]
        if height>18 or style==5:paint=STUCCO[rng.randrange(3)]
        if seed%17==0:paint=BRICK
        PART='block %d %d'%(math.floor(cx/190),math.floor(cy/190));DETAIL='structural'
        is_restaurants=str(b['id'])=='258156316'
        polygon_body(poly,base,height,paint,0 if is_restaurants else None)
        local_streets=[s for s in streets if min(s[0][0],s[1][0])-65<cx<max(s[0][0],s[1][0])+65 and min(s[0][1],s[1][1])-65<cy<max(s[0][1],s[1][1])+65]
        if not local_streets:local_streets=streets
        # Every footprint edge gets accurate roof coping; exposed returns get
        # sash windows, keeping rear/oblique race cameras architecturally complete.
        area=sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))
        candidate_edges=[]
        for i,a in enumerate(poly):
            bb=poly[(i+1)%len(poly)];ln=math.dist(a,bb)
            if ln<.18:continue
            x,y=(a[0]+bb[0])/2,(a[1]+bb[1])/2;ux,uy=(bb[0]-a[0])/ln,(bb[1]-a[1])/ln
            nx,ny=(uy,-ux) if area>0 else (-uy,ux)
            f=Facade(x,y,nx,ny,base)
            f.b(0,-.02,height+.06,ln+.03,.23,.24,paint)
            if ln<4:continue
            rd,q,street=nearest_segment(x,y,local_streets)
            facing=((q[0]-x)*nx+(q[1]-y)*ny)/max(.01,rd) if q else 0
            if rd<35 and facing>.67 and ln>4.8:candidate_edges.append((rd,f,ln,street))
        DETAIL='facade'
        # Use the survey's street-facing direction, but anchor every decorative
        # frontage to a real wall. Projected parcel spans can cross empty space.
        front=b.get('frontage')
        if front and detail>0:
            nx,ny=front['nx'],front['nz']
            rd,q,street=nearest_segment(front['x'],front['z'],local_streets)
            commercial=street and street['name']=='Hayes Street' and front['x']>-350
            if is_restaurants:
                # This individually authored restaurant has a matching open shell.
                hayes_restaurants(Facade(front['x'],front['z'],nx,ny,base),height)
            else:
                for wall in wall_frontages(poly,(nx,ny)):
                    f=Facade(wall['x'],wall['z'],wall['nx'],wall['nz'],base)
                    f.frontage(min(wall['width'],55),height,style,paint,trim,detail,seed,commercial)
            for erd,ff,ww,ss in sorted(candidate_edges,key=lambda c:c[0])[:3]:
                if ff.nx*nx+ff.ny*ny>.4:continue
                if ww>5 and erd<24:ff.frontage(min(ww,55),height,5,paint,trim,max(1,detail-1),seed+3,commercial)
        elif candidate_edges and detail>0:
            for rd,f,ln,s in sorted(candidate_edges,key=lambda c:c[0])[:2]:
                f.frontage(min(ln,55),height,style if detail else 5,paint,trim,max(1,detail),seed,s['name']=='Hayes Street' and cx>-350)
        # Rear elevations visible above neighbors receive restrained inset
        # windows and real parapets, no huge blank low-detail color prisms.
        if detail>0:
            for i,a in enumerate(poly):
                bb=poly[(i+1)%len(poly)];ln=math.dist(a,bb)
                if ln<10:continue
                ux,uy=(bb[0]-a[0])/ln,(bb[1]-a[1])/ln;nx,ny=(uy,-ux) if area>0 else (-uy,ux)
                if front and nx*front['nx']+ny*front['nz']>.35:continue
                f=Facade((a[0]+bb[0])/2,(a[1]+bb[1])/2,nx,ny,base)
                for z in np.arange(2.5,height-1,3.4):
                    for u in np.arange(-ln/2+2,ln/2-1,4.1):f.window(float(u),float(z),1.14,1.73,trim,.08,0,seed)
        else:
            # Distant ordinary buildings retain sash rhythm with two compact
            # meshes per window instead of spending near-view carving budget.
            for i,a in enumerate(poly):
                bb=poly[(i+1)%len(poly)];ln=math.dist(a,bb)
                if ln<5:continue
                ux,uy=(bb[0]-a[0])/ln,(bb[1]-a[1])/ln;nx,ny=(uy,-ux) if area>0 else (-uy,ux)
                f=Facade((a[0]+bb[0])/2,(a[1]+bb[1])/2,nx,ny,base)
                for z in np.arange(2.4,height-1,3.4):
                    for u in np.arange(-ln/2+1.6,ln/2-1,3.4):
                        f.simple_window(float(u),float(z),1.25,1.85,trim,.10,False)
        DETAIL='roof detail'
        if inside(cx,cy,poly):
            box(cx,cy,base+height+.57,min(2.3,height*.12),2.6,.55,ROOF)
            if detail>0:
                box(cx+1.1,cy+1,base+height+1,.64,.81,1.85,BRICK)
                box(cx+1.1,cy+1,base+height+1.96,.81,.93,.16,STONE)
                for k in range(2):rod((cx-.65+k*.42,cy-.6,base+height+.4),(cx-.65+k*.42,cy-.6,base+height+1.2),.11,SASH,8)
        MODEL_LOG.append({'building':b['id'],'address':b.get('address'),'height':height,'baseHeight':base,'detail':detail,'distanceToRoute':round(b['_actualRouteDistance'],1),'distanceToPark':round(b['_parkDistance'],1),'parkExtension':bool(b.get('_parkExtension')),'surveyedFootprint':True,'facadeReference':'interpreted neighborhood typology'})
        # Independently constructed distant asset: exact original silhouette,
        # simple sash apertures and coping. This is not mesh decimation that
        # randomly deletes individual rails/windows from a detailed facade.
        high=BATCH;BATCH=LOD_BATCH;DETAIL='distant shell'
        polygon_body(poly,base,height,paint)
        for i,a in enumerate(poly):
            bb=poly[(i+1)%len(poly)];ln=math.dist(a,bb)
            if ln<3:continue
            ux,uy=(bb[0]-a[0])/ln,(bb[1]-a[1])/ln;nx,ny=(uy,-ux) if area>0 else (-uy,ux)
            f=Facade((a[0]+bb[0])/2,(a[1]+bb[1])/2,nx,ny,base)
            f.b(0,0,height+.04,ln,.22,.18,trim)
            for z in np.arange(2.4,height-1,3.4):
                for u in np.arange(-ln/2+1.7,ln/2-1,3.65):f.simple_window(float(u),float(z),1.24,1.85,trim,.08,False)
        LOD_BATCH=BATCH;BATCH=high
        if index%100==0:print('Building',index,'of',len(chosen),flush=True)
    parks(data,ground)
    for key,value in BATCH.items():
        if key[0].startswith('park / '):LOD_BATCH[key]=value
    (OUT/'vegetation-anchors.json').write_text(json.dumps({'coordinateSystem':'semantic x east,z north,y altitude; runtime glTF z=-z','anchors':ANCHORS},indent=2)+'\n')
    build_scene(data)

def build_scene(data):
    objects=[];collections={}
    print('Materializing',len(BATCH),'spatial/material/detail batches',flush=True)
    for (part,detail,mat),(verts,faces,uvs) in BATCH.items():
        mesh=bpy.data.meshes.new(part+' / '+detail+' / '+mat);mesh.from_pydata(verts,[],faces);mesh.update()
        layer=mesh.uv_layers.new(name='UVMap')
        for p,coords in zip(mesh.polygons,uvs):
            for i,coord in zip(p.loop_indices,coords):layer.data[i].uv=coord
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
        ob=bpy.data.objects.new(part+' / '+detail+' / '+mat,mesh)
        if part not in collections:
            col=bpy.data.collections.new(part);bpy.context.scene.collection.children.link(col);collections[part]=col
        collections[part].objects.link(ob);ob.data.materials.append(MATERIALS[mat]);objects.append(ob)
        ob['role']=detail;ob['spatial_block']=part;ob['origin_contract']='Native Blender X east Y north Z elevation; glTF Z north negated, outside reflected cityRoot'
    # Spatial bounds are kept; combine only identical materials inside one
    # block, so runtime visibility culling does not become one district mesh.
    grouped={}
    for ob in objects:grouped.setdefault((ob['spatial_block'],ob.data.materials[0].name),[]).append(ob)
    compact=[]
    for (part,mat),items in grouped.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in items:ob.select_set(True)
        bpy.context.view_layer.objects.active=items[0]
        roles=sorted(set(ob['role'] for ob in items))
        if len(items)>1:bpy.ops.object.join()
        ob=items[0];ob.name=part+' / '+mat;ob['roles']=roles;compact.append(ob)
    objects=compact
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=20 if not FAST else 8
    scene.cycles.use_denoising=True
    world=bpy.data.worlds.new('San Francisco marine sky');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.52,.66,.83,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6;scene.world=world
    bpy.ops.object.light_add(type='SUN',location=(-300,-500,600));sun=bpy.context.object;sun.data.energy=2.5;sun.data.angle=.06;sun.rotation_euler=(.43,-.63,-.39)
    bpy.ops.object.camera_add(location=(-350,-550,170));cam=bpy.context.object;cam.data.lens=42;cam.data.clip_end=5000;scene.camera=cam
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene['reference_note']='Actual OSM footprints and heights, USGS terrain elevations. Facades/paint interpreted from inspected neighborhood photographs. No claim of photographic survey precision.'
    scene['origin']='-122.42415,37.77655';scene['axis_note']='X east Y north Z up; no reflection'
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'cerebral-neighborhood.blend'),compress=True)
    def export(path):
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
    export(OUT/'neighborhood.glb')
    triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in objects)
    bpy.ops.object.select_all(action='DESELECT')
    lods=[]
    for (part,detail,mat),(verts,faces,uvs) in LOD_BATCH.items():
        mesh=bpy.data.meshes.new(part+' / distant / '+mat);mesh.from_pydata(verts,[],faces);mesh.update();layer=mesh.uv_layers.new(name='UVMap')
        for p,coords in zip(mesh.polygons,uvs):
            for i,coord in zip(p.loop_indices,coords):layer.data[i].uv=coord
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
        ob=bpy.data.objects.new(part+' / distant / '+mat,mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(MATERIALS[mat]);ob['spatial_block']=part;ob['role']='distant';ob.select_set(True);lods.append(ob)
    export(OUT/'neighborhood-lod.glb')
    lodtriangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in lods)
    for ob in lods:bpy.data.objects.remove(ob,do_unlink=True)
    report={'triangles':triangles,'lodTriangles':lodtriangles,'meshes':len(objects),'lodMeshes':len(lods),'spatialBlocks':len(collections),'buildings':sum('building' in x for x in MODEL_LOG),'parkFeatures':[x for x in MODEL_LOG if 'park' in x],'vegetationAnchors':len(ANCHORS),'bytes':(OUT/'neighborhood.glb').stat().st_size,'lodBytes':(OUT/'neighborhood-lod.glb').stat().st_size,'coordinates':'+X east, glTF -Z north, +Y altitude, no parent reflection','origin':{'longitude':-122.42415,'latitude':37.77655},'geometrySource':'OSM mapped building footprints/heights and USGS elevation raster; facade ornament/paint reference-informed'}
    (OUT/'neighborhood.meta.json').write_text(json.dumps(report,indent=2)+'\n')
    (ROOT/'art/references/cerebral-neighborhood-model-log.json').write_text(json.dumps(MODEL_LOG,indent=2)+'\n')
    # Write the inclusion manifest last, so a running preview never removes
    # far-building substitutes before the corresponding new GLBs are ready.
    (OUT/'neighborhood-parcels.json').write_text(json.dumps([str(b['building']) for b in MODEL_LOG if 'building' in b],indent=2)+'\n')
    print('CEREBRAL_NEIGHBORHOOD_REPORT',json.dumps(report),flush=True)
    if '--skip-render' in sys.argv:return
    # Add a temporary neutral street/sidewalk context for the review. Runtime
    # uses its own surveyed road ribbon and these meshes are never exported.
    global PART,DETAIL
    PART='review only road surfaces';DETAIL='review context'
    ground=ground_sampler(data)
    roadmat=material('review asphalt','#5c6263',.96)
    for street in data['streets']:
        points=[(p['x'],p['z']) for p in street['points']]
        if len(points)>1:park_ribbon(points,street.get('width',14.8),roadmat,ground,.01)
    for (part,detail,mat),(verts,faces,uvs) in list(BATCH.items()):
        if part!='review only road surfaces':continue
        mesh=bpy.data.meshes.new(part);mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(part,mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(MATERIALS[mat])
    buildings=[x for x in data['buildings'] if x.get('frontage')]
    # Select physical route frontage instead of invented review coordinates.
    candidates=[b for b in buildings if b.get('street')=='Page Street' and -900<b['frontage']['x']<-500]
    if not candidates:candidates=buildings
    b=candidates[len(candidates)//2];f=b['frontage'];nx,ny=f['nx'],f['nz'];z=ground(f['x'],f['z'])
    views=[('cerebral-neighborhood-page-study',(f['x']+nx*23+ny*12,f['z']+ny*23-nx*12,z+7),(f['x'],f['z'],z+6),38),('cerebral-neighborhood-aerial',(-550,-1050,560),(-650,-210,50),40)]
    for name,location,target,lens in views:
        cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
        scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)

if __name__=='__main__':main()
