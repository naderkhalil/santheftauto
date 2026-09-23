"""Reference-informed Post Street frontage and occupied Union Square corners.
Original geometry/textures. World X east, Z north, Y relative to street (22m).
Official Apple store photograph and audited parcel relationships guide the scene.
"""
import bpy,bmesh,math,json,random
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/assets/north-square';SOURCE=ROOT/'art/source'
OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
BATCH={};M={};PART='north';rng=random.Random(301)
def srgb(h):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)];return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)
def mat(name,color,rough=.7,metal=0,alpha=1,emit=0):
 m=bpy.data.materials.new('Union Square / '+name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*srgb(color),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Alpha'].default_value=alpha
 if alpha<1:m.surface_render_method='DITHERED'
 if emit:p.inputs['Emission Color'].default_value=(*srgb(color),1);p.inputs['Emission Strength'].default_value=emit
 m.diffuse_color=(*srgb(color),alpha);M[name]=m;return name
stone=mat('honed limestone','#cebfaa');trim=mat('carved warm stone','#e9ddc8');granite=mat('gray granite plinth','#888d86');bronze=mat('bronze sash and doors','#4e473c',.4,.65);glass=mat('deep recessed glazing','#426778',.24,.35);inside=mat('linen curtains','#bbae94');roof=mat('roof and interior shade','#41494c');steel=mat('Apple bead blasted steel','#d6dcd8',.28,.62);white=mat('Apple luminous soffit','#eeeae1',.6,0,emit=.12);clear=mat('Apple structural glass','#c4e5e7',.13,.12,.17);oak=mat('Apple oak furniture','#bf8c53',.55);leaf=mat('living foliage','#386337');bark=mat('tree trunks','#79654c');tiffany=mat('Tiffany bronze green','#497f7b',.46,.2);red=mat('Beacon terracotta brick','#976552');darkred=mat('Handlery brick','#ad7a63');concrete=mat('Hyatt precast concrete','#b8b5a7');hyattglass=mat('Hyatt smoked bronze glass','#465b63',.24,.4);copper=mat('Beacon oxidized copper','#4d7365',.48,.35);gold=mat('hotel gilt lettering','#d4b56d',.33,.55)
leafsun=mat('Apple tree sunlit leaves','#668c42');leafshade=mat('Apple tree shaded leaves','#366242')
# Correctly colored baked, tileable stone pore/roughness maps.
for name in [stone,trim,granite,concrete,red,darkred]:
 m=M[name];p=m.node_tree.nodes.get('Principled BSDF');n=256;rr=np.random.default_rng(100+len(name));noise=rr.normal(0,.025,(n,n));px=np.ones((n,n,4),dtype=np.float32);px[:,:,:3]=np.clip(.65+noise[:,:,None],0,1)
 im=bpy.data.images.new(name+' roughness',width=n,height=n);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(px.ravel());im.pack();tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;m.node_tree.links.new(tex.outputs['Color'],p.inputs['Roughness'])

def face(points,m,uv=None):
 key=(PART,m);data=BATCH.setdefault(key,[[],[],[]]);v,f,u=data;n=len(v);v.extend(points);f.append(list(range(n,n+len(points))))
 if uv is None:
  norm=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]));ax=max(range(3),key=lambda i:abs(norm[i]));ids=[i for i in range(3) if i!=ax];uv=[(p[ids[0]]/2,p[ids[1]]/2) for p in points]
 u.append(uv)
def box(x,y,z,w,h,d,m,b=.0,yaw=0):
 if b<.045:b=0 # subpixel edge rounding does not warrant twenty extra faces
 half=[w/2,h/2,d/2];b=min(b,min(half)*.4);c=math.cos(yaw);s=math.sin(yaw)
 def tr(p):return(x+c*p[0]+s*p[2],y+p[1],z-s*p[0]+c*p[2])
 for ax in range(3):
  ij=[i for i in range(3) if i!=ax]
  for sign in [-1,1]:
   pts=[]
   for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
    p=[0,0,0];p[ax]=half[ax]*sign;p[ij[0]]=u*(half[ij[0]]-b);p[ij[1]]=v*(half[ij[1]]-b);pts.append(tr(p))
   face(pts,m)
 if not b:return
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
    signs=[sx,sy,sz];face([tr([signs[i]*(half[i]-(0 if i==a else b)) for i in range(3)]) for a in range(3)],m)
def cyl(x,y,z,r,h,m,n=12,r2=None):
 r2=r if r2 is None else r2;rings=[[(x+math.sin(i*math.tau/n)*rr,yy,z+math.cos(i*math.tau/n)*rr) for i in range(n)] for yy,rr in [(y-h/2,r),(y+h/2,r2)]]
 face(rings[0],m);face(rings[1],m)
 for i in range(n):j=(i+1)%n;face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],m)
def sphere(x,y,z,rx,ry,rz,m):
 n=10;q=6
 for j in range(q):
  for i in range(n):
   face([(x+rx*math.sin(math.pi*(j+dj)/q)*math.cos(math.tau*(i+di)/n),y+ry*math.cos(math.pi*(j+dj)/q),z+rz*math.sin(math.pi*(j+dj)/q)*math.sin(math.tau*(i+di)/n)) for di,dj in [(0,0),(1,0),(1,1),(0,1)]],m)
def text(body,x,y,z,size,m,yaw=math.pi):
 curve=bpy.data.curves.new(body,'FONT');curve.body=body;curve.align_x='CENTER';curve.size=size;curve.extrude=.006;curve.bevel_depth=.002;curve.bevel_resolution=0
 obj=bpy.data.objects.new(body,curve);bpy.context.collection.objects.link(obj);obj.rotation_euler=(math.pi/2,0,yaw);obj.location=(x,-z,y);bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj=bpy.context.object
 for p in obj.data.polygons:
  pts=[obj.matrix_world@obj.data.vertices[i].co for i in p.vertices];face([(v.x,v.z,-v.y) for v in pts],m)
 bpy.data.objects.remove(obj,do_unlink=True)
class Facade:
 def __init__(self,x,z,yaw=math.pi):self.x=x;self.z=z;self.a=yaw;self.c=math.cos(yaw);self.s=math.sin(yaw)
 def b(self,x,y,z,w,h,d,m,bevel=0):box(self.x+self.c*x+self.s*z,y,self.z-self.s*x+self.c*z,w,h,d,m,bevel,self.a)
 def letter(self,body,y,size,m):text(body,self.x,y,self.z+(-.06 if self.a==math.pi else .06),size,m,self.a)
 def facade(self,w,h,cols,wall=stone,style=0):
  pitch=w/cols;winw=min(2.0,pitch*.5);wh=2.5;ys=list(np.arange(7,h-2,3.5));low=4.8
  if style<0:
   self.b(0,h/2,-.32,w,h,.64,wall)
   for yy in ys:
    for j in range(cols):
     xx=-w/2+(j+.5)*pitch;self.b(xx,yy,.015,winw,wh,.04,glass)
     self.b(xx,yy-wh/2-.09,.06,winw+.30,.16,.35,trim)
   for yy in [4.8,h-.4,h]:self.b(0,yy,.12,w+.5,.22,.7,trim)
   return
  for fi,yy in enumerate(ys):
   sill=yy-wh/2
   self.b(0,(low+sill)/2,-.32,w,sill-low,.64,wall)
   for i in range(cols+1):
    xx=-w/2+i*pitch;edge=i in (0,cols);ww=(pitch-winw)/2 if edge else pitch-winw;offset=(ww/2 if i==0 else -ww/2) if edge else 0;self.b(xx+offset,yy,-.32,ww,wh,.64,wall)
   for j in range(cols):
    xx=-w/2+(j+.5)*pitch;self.b(xx,yy,-.48,winw,wh,.06,glass);self.b(xx,yy,-.57,winw,wh,.05,inside)
    for sign in [-1,1]:self.b(xx+sign*(winw/2+.07),yy,-.12,.14,wh+.22,.55,trim,.02)
    self.b(xx,yy-wh/2-.09,.06,winw+.38,.16,.48,trim,.025);self.b(xx,yy+wh/2+.10,.0,winw+.3,.17,.31,trim,.02)
    self.b(xx,yy,-.37,.06,wh,.10,bronze);self.b(xx,yy+.15,-.36,winw,.055,.10,bronze)
    if style and fi in [0,len(ys)-2]:self.b(xx,yy+wh/2+.35,.10,winw+.7,.17,.57,trim,.03)
   low=yy+wh/2
  self.b(0,(low+h)/2,-.3,w,h-low,.6,wall)
  for yy,deep in [(4.7,.5),(5.0,.6),(h-1.1,.55),(h-.4,.85),(h,1.2)]:self.b(0,yy,.12,w+.5,.22,deep,trim,.04)
  for j in range(cols):
   xx=-w/2+(j+.5)*pitch;self.b(xx,2.28,-.25,pitch-.45,4.2,.10,glass)
   for sign in [-1,1]:self.b(xx+sign*(pitch-.2)/2,2.3,-.06,.28,4.6,.65,wall,.03)
   self.b(xx,2.15,-.08,.09,4.1,.12,bronze);self.b(xx,3.4,-.06,pitch-.45,.09,.12,bronze)
   # Warm deep display case, shelves and a restrained object silhouette.
   self.b(xx,1.3,-.6,pitch-.8,.14,.7,oak)
   self.b(xx,.7,-.75,pitch-.8,1.2,.12,inside)

# Post's four different parcels: no giant anonymous wall or empty gap.
for name,cx,w,h,wall,cols in [('Saks Fifth Avenue',-40,52,27,stone,11),('Tiffany & Co.',-2.5,23,42,trim,5),('Williams Sonoma',15,12,17,stone,3)]:
 PART=name;depth=49;box(cx,h/2,106,w-1.5,h,45,wall)
 front=Facade(cx,81);front.facade(w,h,cols,wall,1)
 for side in [-1,1]:
  end=Facade(cx+side*w/2,105.5,side*math.pi/2);end.facade(depth,h,max(4,int(depth/4.7)),wall,0)
 rear=Facade(cx,130);rear.facade(w,h,cols,wall,-1)
 front.letter(name.upper(),4.72,.41 if w<15 else .48,bronze)
 for xx in [cx-w*.27,cx+w*.27]:
  box(xx,3.8,79.85,w*.34,.16,1.55,tiffany if 'Tiffany' in name else bronze,.03)
  box(xx,3.57,79.09,w*.34,.38,.10,tiffany if 'Tiffany' in name else bronze,.02)
 if 'Saks' in name:
  for xx in np.arange(cx-w/2+1.5,cx+w/2,3):box(xx,h+.7,81.5,1.25,1.0,.8,trim,.08)
 if 'Tiffany' in name:
  for xx in [cx-9,cx+9]:box(xx,21,80.3,.60,32,.7,stone,.05)
  box(cx,42.8,103,20,1.2,42,trim,.08)

# Apple: closed silver side walls, two monumental operable portals, a glowing
# ceiling, visible mezzanine and matching flanking staircases (official photo).
PART='Apple Union Square';cx=41;w=42;d=32;z=98.8;h=15.0
box(cx,.22,z,w,.44,d,granite,.08);box(cx,h,z,w+.6,.6,d+.3,steel,.10)
for x in [20.3,61.7]:box(x,7.5,z,.65,15,d,steel,.04)
box(cx,14.5,z,w-.8,.12,d-.8,white)
# Front portal has deep3D returns and panel joints; transparent sidewalls were wrong.
for x in [21.2,60.8]:box(x,7.5,82.75,2.4,15,.62,steel,.045)
box(cx,14.5,82.62,w,1.0,.9,steel,.05)
for x in [29,52.8]:
 for edge in [-1,1]:box(x+edge*3.95,7.1,82.35,.16,14.0,.26,bronze,.015)
 box(x,14.1,82.35,8.05,.23,.26,bronze,.015)
 box(x,7.12,82.45,7.82,13.86,.075,clear)
for x in [36.8,44.8]:box(x,7.12,82.6,7.78,13.85,.065,clear)
# Full upper gallery, with an open front edge revealing both levels.
box(cx,6.8,104.9,40.8,.34,18.8,white,.045)
box(cx,7.6,95.45,39.4,1.35,.05,clear)
for x in [24,58]:
 for step in range(24):
  start=85.7+step*.47;rise=.55+step*.277
  box(x,rise/2,(start+97.5)/2,3.8,rise,97.5-start,white)
 box(x+(1.85 if x<41 else -1.85),4.2,91.3,.045,6.0,11.5,clear)
# Original oak tables, devices, avenue shelving and indoor planters.
for yy,zs in [(.45,[88.8,95,105]),(7.0,[101,108])]:
 for zz in zs:
  for xx in [31,41,51]:
   box(xx,yy+1.1,zz,5.3,.16,2.2,oak,.045)
   for side in [-1,1]:box(xx+side*1.95,yy+.55,zz,.18,1.0,1.8,oak,.015)
   for dx in [-1.4,0,1.4]:box(xx+dx,yy+1.21,zz,.52,.09,.36,steel,.025)
for xx in range(24,61,4):
 box(xx,2.6,114.45,3.7,4.3,.18,oak,.02)
 for yy in [1.2,2.3,3.4]:box(xx,yy,114.13,3.7,.09,.6,oak,.02)
for x in [26,32,38,44,50,56]:
 cyl(x,.6,80.9,.62,.9,white,24,r2=.68);cyl(x,3.3,80.9,.09,5.0,bark,10,r2=.045)
 # Fine, individually folded leaves allow daylight between the branches;
 # this is a tree canopy, not a stack of opaque green spheres.
 for k in range(420):
  a=rng.random()*math.tau;r=math.sqrt(rng.random());dy=rng.uniform(-1,1)
  xx=x+math.sin(a)*r*1.4;zz=80.9+math.cos(a)*r*1.05;yy=5.75+dy*1.45*math.sqrt(max(.12,1-r*r*.7))
  length=rng.uniform(.20,.42);wide=length*.36;turn=rng.random()*math.tau
  u=Vector((math.cos(turn),rng.uniform(-.8,.8),math.sin(turn))).normalized()*length
  v=Vector((-math.sin(turn),.10,math.cos(turn)))*wide;p=Vector((xx,yy,zz));mid=p+Vector((0,.035,0))
  color=leafsun if k%3 else leafshade
  for p0,p1 in [(p-u,p+v),(p+v,p+u),(p+u,p-v),(p-v,p-u)]:face([tuple(p0),tuple(p1),tuple(mid)],color)
# Two-story luminous display wall with original gradient art (not copied pixels).
box(cx,10.3,114.4,16,5.2,.25,white,.08)
for i in range(14):box(33.7+i*1.1,9.2+(i%5)*.2,114.17,.8,1.2+(i%5)*.4,.06,gold)
text('300',59.6,1.7,82.1,.30,bronze)
# Discreet Apple silhouette is modeled as a filled curve, independent of texture.
shape=bpy.data.curves.new('Apple silhouette','CURVE');shape.dimensions='2D';shape.fill_mode='BOTH';shape.extrude=.015
spline=shape.splines.new('BEZIER');pts=[(0,-.7),(-.47,-.68),(-.80,-.1),(-.77,.47),(-.40,.72),(0,.58),(.40,.73),(.71,.49),(.51,.13),(.78,-.15),(.44,-.67)];spline.bezier_points.add(len(pts)-1)
for p,co in zip(spline.bezier_points,pts):p.co=(*co,0);p.handle_left_type='AUTO';p.handle_right_type='AUTO'
spline.use_cyclic_u=True;o=bpy.data.objects.new('Apple silhouette',shape);bpy.context.collection.objects.link(o);o.rotation_euler=(math.pi/2,0,math.pi);o.location=(41,-82.15,11.2);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object
for p in o.data.polygons:
 pts=[o.matrix_world@o.data.vertices[i].co for i in p.vertices];face([(v.x,v.z,-v.y) for v in pts],white)
bpy.data.objects.remove(o,do_unlink=True)
# The tilted leaf above the mark is a slim lens, not a rectangular glyph.
face([(41.05,11.96,82.1),(41.07,12.32,82.1),(41.42,12.62,82.1),(41.42,12.26,82.1)],white)
# Public garden behind Apple separates its pavilion from the Hyatt tower.
box(cx,.38,122,42,.36,14,granite,.04)
for xx in [23,59]:box(xx,.9,122,2.8,1.2,12,stone,.05);box(xx,1.56,122,2.5,.10,11.5,leaf)
box(cx,7.4,129.1,40,14.6,.65,leaf,.05)
for xx in [30,37,44,51]:box(xx,.7,120,5.4,.2,1.2,oak,.04)
cyl(52,.65,124,2.1,1.0,bronze,24);cyl(52,1.2,124,1.85,.15,hyattglass,24)
# Grand Hyatt belongs BEHIND Apple, west of Stockton, not on its opposite corner.
PART='Grand Hyatt';cx=46.5;z=158.5;w=30;d=51;h=94
box(cx,h/2,z,w-1,h,d-1,roof)
for yaw,xx,zz,span,depth in [(0,cx,z+d/2,w,d),(math.pi,cx,z-d/2,w,d),(math.pi/2,cx+w/2,z,d,w),(-math.pi/2,cx-w/2,z,d,w)]:
 f=Facade(xx,zz,yaw);cols=10 if span==w else 6
 for i in range(cols):
  u=-span/2+(i+.5)*span/cols
  f.b(u,h/2,0,span/cols-.48,h-1.2,.12,hyattglass)
  f.b(u-span/cols/2,h/2,.24,.46,h,.85,concrete,.04)
  for yy in np.arange(3,91,3.05):f.b(u,yy,.28,span/cols,.56,1.0,concrete,.025)
 f.b(0,h-.4,.20,span+.4,.8,1.6,concrete,.055)
text('GRAND HYATT',46.5,8.0,132.8,.58,gold)

# The tall Beacon is EAST of Powell, behind Saks. Chancellor and the lower
# historic retail rooms occupy the other side of that intersection.
for name,cx,z,w,d,h,wall in [
 ('Beacon Grand',-47.5,157.5,37,49,62,red),
 ('Chancellor Hotel',-100,122.5,24,25,52,stone),
 ('Post Powell corner',-109,95.5,42,29,20,trim),
 ('Inn at Union Square',-136,108,12,54,29,darkred),
 ('278 Post corner',109,106,40,50,27,stone),
 ('Taj Campton Place',108,153.5,38,29,33,trim),
 ('Elkan Gunst Building',-108,-110,40,54,27,stone),
 ('Handlery Union Square',-157,-110,56,54,28,darkred)]:
 PART=name;box(cx,h/2,z,w-2,h,d-2,wall)
 for yaw,xx,zz,span in [(0,cx,z+d/2,w),(math.pi,cx,z-d/2,w),(math.pi/2,cx+w/2,z,d),(-math.pi/2,cx-w/2,z,d)]:
  street_side=(yaw==math.pi if z>0 else yaw==0) or (yaw==math.pi/2 if cx<0 else yaw==-math.pi/2)
  f=Facade(xx,zz,yaw);f.facade(span,h,max(6,int(span/4.7)),wall,1 if street_side else -1)
 # An occupied roofscape, shaped parapets and cornice around all four sides.
 box(cx,h+.35,z,w+1,.65,d+1,trim,.10)
 for side in [-1,1]:box(cx+side*(w/2-1.2),h+1.35,z,1.1,1.4,d,trim,.06)
 if name=='Beacon Grand':
  box(cx,h+3,z,24,5,27,stone,.1);box(cx,h+6.2,z,27,1.0,30,copper,.1)
  for side in [-1,1]:
   cyl(cx+side*11,h+9,z-11,1.3,5,copper,8,r2=.18)
  text('BEACON GRAND',cx,h+3,z-d/2-.14,.78,gold)
 elif name=='Handlery Union Square':text('HANDLERY',cx,5.25,z+d/2+.05,.85,gold,0)
 elif name=='Chancellor Hotel':
  # Powell's projecting vertical sign makes the hotel legible from the road.
  box(cx+w/2+.8,18,z-7,1.4,12,.7,bronze,.10)
  for i,ch in enumerate('CHANCELLOR'):text(ch,cx+w/2+1.52,23-i*1.06,z-7,.74,gold,math.pi/2)
 elif name=='Taj Campton Place':text('CAMPTON PLACE',cx,5.1,z-d/2-.1,.58,bronze)
 elif name=='Elkan Gunst Building':
  text('GEARY',cx,4.9,z+d/2+.07,.65,bronze,0)
 elif name=='278 Post corner':
  # A deep two-storey display plinth and emphatic square cornice distinguish
  # this occupied diagonal corner from Apple's low, glazed pavilion.
  box(cx,5.2,z-d/2-.4,w,1.0,1.2,trim,.1)
  for xx in [cx-15,cx-5,cx+5,cx+15]:box(xx,13.0,z-d/2-.10,1.0,14,.9,trim,.04)

# Export world coordinates to the usual glTF Y-up convention.
objects=[]
for (part,m),(verts,faces,uvs) in BATCH.items():
 # Apple is a narrower pavilion on the easternmost Post parcel. Keep its
 # authored proportions internally coherent with one shared transform.
 if part=='Apple Union Square':verts=[(27+(x-20)*36/42,y,z-2) for x,y,z in verts]
 mesh=bpy.data.meshes.new(part+' / '+m);mesh.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);mesh.update();uv=mesh.uv_layers.new()
 for p,coords in zip(mesh.polygons,uvs):
  for i,co in zip(p.loop_indices,coords):uv.data[i].uv=co
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 o=bpy.data.objects.new(part+' / '+m,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(M[m]);objects.append(o)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
world=bpy.data.worlds.new('soft blue daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.42,.56,.7,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(0,170,140));sun=bpy.context.object;sun.data.energy=190000;sun.data.size=80;sun.rotation_euler=(Vector((0,-70,20))-sun.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(105,70,65));camera=bpy.context.object;camera.rotation_euler=(Vector((15,-115,28))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=38;scene.camera=camera
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'north-square.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'north-square.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16)
report={'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'draws':len(objects),'origin':'world XZ; Y relative to22m street datum'}
scene.render.filepath=str(ROOT/'art/reviews/north-square.png');bpy.ops.render.render(write_still=True)
camera.location=(78,-33,26);camera.rotation_euler=(Vector((44,-94,8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=52
scene.render.filepath=str(ROOT/'art/reviews/apple-post-street.png');bpy.ops.render.render(write_still=True)
# Collapse bevels/window returns only for distant and performance-mode views.
for o in objects:
 bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new('Distant facade simplification','DECIMATE');mod.ratio=.36;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.export_scene.gltf(filepath=str(OUT/'north-square-lod.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16)
report['lodTriangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
(OUT/'north-square.meta.json').write_text(json.dumps(report,indent=2));print(report)
