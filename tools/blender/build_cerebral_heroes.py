"""Original, reference-informed Cerebral Valley landmark architecture.
Canonical Blender axes X east/Y north/Z up. Standard glTF export => north=-Z.
No reflected root compensation. Reproducible with Blender 4.5 LTS, numpy built-in.
Photographs and uncertainty documented in art/references/cerebral-heroes.md.
"""
import bpy, bmesh, math, json, random, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/cerebral-valley'; OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'art/source'; REVIEW=ROOT/'art/reviews'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
BATCH={}; M={}; PART=''; ORIGIN=(0,0,0); ANGLE=0.; SCALE=1.; SIGN=[]; REPORT=[]; PROBES=[]
rng=random.Random(531)
def srgb(c):
 v=[int(c[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(n/12.92 if n<=.04045 else ((n+.055)/1.055)**2.4 for n in v)
def material(name,color,rough=.68,metal=0.,emit=0.,alpha=1):
 m=bpy.data.materials.new('Cerebral / '+name); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*srgb(color),1)
 p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
 if emit:p.inputs['Emission Color'].default_value=(*srgb(color),1);p.inputs['Emission Strength'].default_value=emit
 if alpha<1:p.inputs['Alpha'].default_value=alpha;m.surface_render_method='DITHERED'
 m.diffuse_color=(*srgb(color),alpha); M[name]=m; return name
cream=material('ivory carved wood','#eee3cc'); warm=material('aged oyster wood','#d8cbb6'); dark=material('deep window and roof shadow','#273d40',.45,.08)
glass=material('blue gray reflected sash glazing','#46585c',.2,.38); goldglass=material('warm reflected glazing','#766654',.25,.2)
curtain=material('linen behind sash','#bcb29b'); roof=material('charcoal asphalt shingles','#515355',.91); brick=material('weathered chimney brick','#916a59'); iron=material('blackened metal','#343e3b',.4,.65)
concrete=material('worn front steps','#aaa899',.9); granite=material('sidewalk sandstone','#c3beb0',.86); wood=material('oiled cafe oak','#aa7954',.58)
sage=material('sage green painted wood','#b7c0a7'); forest=material('deep bottle green paint','#3e5849'); white=material('Reveille chalk white','#f2efe4'); pink=material('Reveille soft pink','#e9a9b2'); taupe=material('Reveille taupe siding','#b3a59f'); green=material('Absinthe enamel green','#254f43',.36,.25); abscream=material('Absinthe pale warm siding','#cbbd96'); canopyglass=material('frosted canopy glass','#adcbc0',.3,.06); neon=material('green illuminated lettering','#93c9a6',.4,0,.5)
leaf=material('planter leaves','#6b8043'); leaf2=material('dark planter leaves','#415c35'); soil=material('planter soil','#40362b')
# Shared original PBR maps. An explicitly baked material roughness and tangent
# normal preserve pore/grain detail in glTF; no Blender-only procedural nodes.
def image_map(name,pix,noncolor=True):
 n=pix.shape[0]; im=bpy.data.images.new(name,width=n,height=n);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';im.pixels.foreach_set(pix.astype(np.float32).ravel());im.pack();return im
rr=np.random.default_rng(53); n=256
noise=rr.normal(0,.025,(n,n)); px=np.ones((n,n,4));px[:,:,:3]=np.clip(.68+noise[:,:,None],.4,.9);rim=image_map('Original painted timber roughness',px)
normal=np.ones((n,n,4));normal[:,:,0]=.5+rr.normal(0,.014,(n,n));normal[:,:,1]=.5+rr.normal(0,.006,(n,n));normal[:,:,2]=1.;nim=image_map('Original fine wood grain tangent normal',normal)
def texture_material(m):
 nt=M[m].node_tree;p=nt.nodes.get('Principled BSDF');t=nt.nodes.new('ShaderNodeTexImage');t.image=rim;nt.links.new(t.outputs['Color'],p.inputs['Roughness']);t=nt.nodes.new('ShaderNodeTexImage');t.image=nim;nn=nt.nodes.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.35;nt.links.new(t.outputs['Color'],nn.inputs['Color']);nt.links.new(nn.outputs['Normal'],p.inputs['Normal'])
for m in [cream,warm,sage,forest,white,taupe,abscream]:texture_material(m)
def tr(p):
 x,y,z=p;c=math.cos(ANGLE);s=math.sin(ANGLE)
 return (ORIGIN[0]+SCALE*(x*c-y*s),ORIGIN[1]+SCALE*(x*s+y*c),ORIGIN[2]+z)
def face(points,m,uv=None,world=False):
 v,f,u=BATCH.setdefault((PART,m),[[],[],[]]);start=len(v);v.extend(points if world else [tr(p) for p in points]);f.append(list(range(start,start+len(points))))
 if uv is None:
  norm=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]));ax=max(range(3),key=lambda i:abs(norm[i]));ids=[i for i in range(3) if i!=ax];uv=[(p[ids[0]]/2,p[ids[1]]/2) for p in points]
 u.append(uv)
def box(x,y,z,w,d,h,m):
 if min(w,d,h)<=0:return
 vs=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 for inds in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:face([vs[i] for i in inds],m)
def cylinder(x,y,z,r,h,m,n=12,r2=None):
 r2=r if r2 is None else r2;a=[(x+math.cos(i*math.tau/n)*r,y+math.sin(i*math.tau/n)*r,z-h/2) for i in range(n)];b=[(x+math.cos(i*math.tau/n)*r2,y+math.sin(i*math.tau/n)*r2,z+h/2) for i in range(n)];face(a[::-1],m);face(b,m)
 for i in range(n):j=(i+1)%n;face([a[i],a[j],b[j],b[i]],m)
def beam(a,b,r,m,n=6):
 a=Vector(a);b=Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.01:u=axis.cross(Vector((1,0,0)))
 u.normalize();v=axis.cross(u);rings=[[p+(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))*r for i in range(n)] for p in [a,b]]
 for i in range(n):j=(i+1)%n;face([tuple(rings[0][i]),tuple(rings[0][j]),tuple(rings[1][j]),tuple(rings[1][i])],m)
 face([tuple(p) for p in rings[0]],m);face([tuple(p) for p in rings[1]],m)
def text(body,x,y,z,size,m,font=None):
 cu=bpy.data.curves.new(body,'FONT');cu.body=body;cu.align_x='CENTER';cu.size=size;cu.extrude=.006;cu.resolution_u=5
 if font:
  try:cu.font=bpy.data.fonts.load(font)
  except:pass
 o=bpy.data.objects.new(body,cu);bpy.context.collection.objects.link(o);o.location=(x,y,z);o.rotation_euler=(math.pi/2,0,0);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object
 vertices=[o.matrix_world@v.co for v in o.data.vertices];front=min(v.y for v in vertices);samples=[]
 for p in o.data.polygons:
  points=[vertices[i] for i in p.vertices];face([tuple(v) for v in points],m)
  if all(abs(v.y-front)<.0001 for v in points):samples.append(tr(tuple(sum(points,Vector())/len(points))))
 normal=(math.sin(ANGLE),-math.cos(ANGLE),0)
 PROBES.append({'part':PART,'text':body,'normal':normal,'samples':samples})
 bpy.data.objects.remove(o,do_unlink=True);SIGN.append({'part':PART,'text':body,'position':tr((x,y,z)),'normal':normal})
def balcony_rail(x,y,z,w,m=cream):
 box(x,y,z+.85,w,.12,.13,m);box(x,y,z+.16,w,.10,.09,m)
 count=max(2,int(w/.25))
 for i in range(count+1):
  xx=x-w/2+i*w/count;cylinder(xx,y,z+.5,.028,.65,m,6);cylinder(xx,y,z+.53,.044,.23,m,8,r2=.036)
 for xx in [x-w/2,x+w/2]:box(xx,y,z+.48,.12,.15,.98,m);box(xx,y,z+1.01,.18,.2,.10,m)
def column(x,y,z,h,m=cream):
 cylinder(x,y,z+h/2,.09,h,m,12,r2=.073)
 for dz,r,hh in [(.05,.15,.1),(.16,.12,.1),(h-.12,.14,.14),(h-.02,.19,.1)]:cylinder(x,y,z+dz,r,hh,m,12)
 box(x,y,z+h+.06,.28,.28,.14,m)
def window(x,y,z,w,h,trim=cream,sash=dark,arch=False,ornament=False,divider=True):
 # A real inset opening: glazing sits 12cm behind projecting trim.
 box(x,y+.075,z,w,.055,h,glass);box(x,y+.16,z,w,.06,h,curtain)
 for xx in [x-w/2-.065,x+w/2+.065]:box(xx,y-.045,z,.13,.22,h+.21,trim)
 box(x,y-.08,z-h/2-.08,w+.34,.34,.16,trim);box(x,y-.055,z+h/2+.065,w+.24,.24,.13,trim)
 for xx in [x-w/2+.05,x+w/2-.05]:box(xx,y-.01,z,.065,.08,h-.04,sash)
 box(x,y-.015,z,w,.09,.06,sash)
 if divider:box(x,y-.012,z,.05,.1,h,sash)
 # Slightly parted curtains make individual rooms vary under reflections.
 for sg in [-1,1]:box(x+sg*w*.38,y+.12,z,w*.17,.028,h-.08,curtain)
 if ornament:
  box(x,y-.11,z+h/2+.26,w+.34,.25,.09,trim)
  for dx in [-w*.45,w*.45]:box(x+dx,y-.10,z+h/2+.16,.12,.23,.18,trim)
 if arch:
  for i in range(16):
   a=math.pi*i/16;b=math.pi*(i+1)/16;r=w/2+.15
   face([(x+math.cos(a)*r,y-.15,z+h/2-.13+math.sin(a)*.43),(x+math.cos(b)*r,y-.15,z+h/2-.13+math.sin(b)*.43),(x+math.cos(b)*(r-.09),y-.15,z+h/2-.13+math.sin(b)*.34),(x+math.cos(a)*(r-.09),y-.15,z+h/2-.13+math.sin(a)*.34)],trim)
def angled_box(cx,cy,z,w,d,h,m,angle):
 c=math.cos(angle);s=math.sin(angle);vs=[(cx+c*x-s*y,cy+s*x+c*y,z+zz) for x,y,zz in [(-w/2,-d/2,-h/2),(w/2,-d/2,-h/2),(w/2,d/2,-h/2),(-w/2,d/2,-h/2),(-w/2,-d/2,h/2),(w/2,-d/2,h/2),(w/2,d/2,h/2),(-w/2,d/2,h/2)]]
 for inds in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:face([vs[i] for i in inds],m)
def sidewindow(cx,cy,z,w,h,a,trim=cream):
 # Local x/u plane rotated about vertical; use the same honest sash assembly.
 oldO,oldA=ORIGIN,ANGLE
 # Instead of changing asset transform, rotate the just-authored vertices.
 keycounts={k:len(v[0]) for k,v in BATCH.items()}
 window(0,0,z,w,h,trim)
 ca=math.cos(a);sa=math.sin(a);c=math.cos(oldA);s=math.sin(oldA)
 for key,data in BATCH.items():
  start=keycounts.get(key,0)
  for i in range(start,len(data[0])):
   X,Y,Z=data[0][i];lx=((X-oldO[0])*c+(Y-oldO[1])*s)/SCALE;ly=(-(X-oldO[0])*s+(Y-oldO[1])*c)/SCALE
   data[0][i]=tr((cx+ca*lx-sa*ly,cy+sa*lx+ca*ly,Z-oldO[2]))
def sided_body(w,d,h,m,base=0):
 # Recess the structural volume 75cm behind street openings. Side/rear have
 # their own cladding, fenestration and downspouts, no paper-thin front set.
 box(0,d/2+.8,base+h/2,w,d-1.6,h,m)
 for z in np.arange(base+.12,base+h,.165):
  spans=[(.8,d)]
  for sy in [4.,8.,12.,16.]:
   if any(abs(z-zz)<1.04 for zz in [base+3.6,base+6.9]):
    nxt=[]
    for l,r in spans:
     if sy+.73<l or sy-.73>r:nxt.append((l,r))
     else:
      if l<sy-.73:nxt.append((l,sy-.73))
      if r>sy+.73:nxt.append((sy+.73,r))
    spans=nxt
  for l,r in spans:
   box(-w/2-.018,(l+r)/2,z,.045,r-l,.018,warm);box(w/2+.018,(l+r)/2,z,.045,r-l,.018,warm)
 for sy in [4.,8.,12.,16.]:
  if sy>d-1:continue
  for zz in [base+3.6,base+6.9]:
   if zz>base+h-1:continue
   sidewindow(-w/2-.025,sy,zz,1.15,1.95,-math.pi/2);sidewindow(w/2+.025,sy,zz,1.15,1.95,math.pi/2)
 for xx in [-w*.28,w*.28]:
  for zz in [base+3.5,base+6.8]:sidewindow(xx,d,zz,1.25,1.95,math.pi)
 for xx in [-w/2+.06,w/2-.06]:cylinder(xx,d-.1,base+h/2,.045,h,iron,8)
def dentils(y,z,w,trim=cream):
 for x in np.arange(-w/2+.15,w/2,.32):box(x,y,z,.14,.25,.19,trim)
def banded_facade(w,y,z0,z1,wall,openings):
 # Narrow horizontal siding planks are cut around every real window/door.
 for z in np.arange(z0,z1,.15):
  za=z;zb=min(z+.145,z1);intervals=[(-w/2,w/2)]
  for ox,oz,ow,oh in openings:
   if zb<oz-oh/2-.06 or za>oz+oh/2+.06:continue
   out=[]
   for l,r in intervals:
    if ox+ow/2<l or ox-ow/2>r:out.append((l,r))
    else:
     if l<ox-ow/2-.05:out.append((l,ox-ow/2-.05))
     if r>ox+ow/2+.05:out.append((ox+ow/2+.05,r))
   intervals=out
  for l,r in intervals:box((l+r)/2,y,(za+zb)/2,r-l,.18,zb-za,wall)
def gable(w,y,z,peak,wall,trim,accent,style=0):
 face([(-w/2,y,z),(w/2,y,z),(0,y,z+peak)],wall)
 # Multi-layer raking trim; shadow lies under its full depth.
 for sg in [-1,1]:
  beam((sg*(w/2+.14),y-.15,z-.06),(0,y-.15,z+peak+.1),.13,trim,4)
  beam((sg*(w/2-.08),y-.24,z+.02),(0,y-.24,z+peak-.08),.045,accent,4)
 # Decorative cladding boards shrink with the gable triangle.
 for dz in np.arange(.1,peak-.25,.17):
  ww=w*(1-dz/peak)-.35
  if ww>.25:box(0,y-.032,z+dz,ww,.045,.026,trim)
 # The photographs have six individual attic treatments.
 if style in [0,1,2,3]:window(0,y-.15,z+.95,.80,1.05,trim,accent,False,True,False)
 else:
  for xx in [-.34,.34]:window(xx,y-.15,z+1.04,.54,1.42,trim,accent,False,False,False)
 # Setback painted triangularcheeks are diagnostic in the yellow/rosehouses.
 if style in [2,3]:
  for sg in [-1,1]:
   face([(sg*.8,y-.065,z+.36),(sg*(w/2-.6),y-.065,z+.36),(sg*.8,y-.065,z+peak-1.06)],accent)
 # Sunburst rays in colored triangular gable cheeks, not generic labels.
 for sg in [-1,1]:
  px=sg*w*.29;pz=z+.47
  for i in range(8):
   theta=math.pi*.14+i*.12
   endx=px+sg*math.cos(theta)*.64;endz=pz+math.sin(theta)*.74
   if abs(endx)<w/2*(1-(endz-z)/peak):beam((px,y-.11,pz),(endx,y-.11,endz),.022,accent,4)
 cylinder(0,y,z+peak+.29,.075,.43,trim,8,r2=.025)
def bay(x,y,z,w,h,wall,trim,accent,floors=2):
 # A canted bay is authored as three deep wall planes with individual glazing.
 segs=[(-w*.35,.42,w*.30,-math.pi/4),(0,0,w*.42,0),(w*.35,.42,w*.30,math.pi/4)]
 for dx,dy,ww,a in segs:
  angled_box(x+dx,y+dy,z+h/2,ww,.17,h,wall,a)
  for floor in range(floors):
   zz=z+1.76+floor*3.22;sidewindow(x+dx,y+dy-.29,zz,ww-.30,2.07,a,trim)
  for dz in [.12,3.24,h-.25,h]:angled_box(x+dx,y+dy-.11,z+dz,ww+.15,.36,.16,trim,a)
  for sx in [-1,1]:
   xx=x+dx+sx*ww*.5*math.cos(a);yy=y+dy+sx*ww*.5*math.sin(a)
   box(xx,yy-.1,z+h/2,.1,.17,h,trim)
 # Real panels and applied rosettes under the upper bay's sash.
 for dx,dy,ww,a in segs:
  for zz in [z+.34,z+3.51]:
   angled_box(x+dx,y+dy-.16,zz,ww-.25,.05,.40,accent,a)
   angled_box(x+dx,y+dy-.2,zz,ww-.41,.045,.25,wall,a)
 for dx in [-w*.47,0,w*.47]:
  box(x+dx,y-.24,z+h+.1,.18,.43,.4,trim)
  beam((x+dx,y-.35,z+h-.3),(x+dx,y-.06,z+h+.18),.08,trim,6)
 # Canted roof cap seals the projection.
 pp=[(x-w/2,y+.9,z+h+.23),(x-w*.23,y-.25,z+h+.23),(x+w*.23,y-.25,z+h+.23),(x+w/2,y+.9,z+h+.23)]
 face(pp,roof)
def painted_lady(address,palette,style,w=7.25,d=19.5):
 wall=material(str(address)+' weatherboard',palette[0]);accent=material(str(address)+' accent',palette[1]);texture_material(wall);texture_material(accent)
 base=2.0;h=8.75
 sided_body(w,d,h,wall)
 # Deep plinth reaches below uneven sidewalk grade without floating steps.
 box(0,1.,.77,w,2.,2.05,concrete)
 # Actual basement sash plus garage/service door retained separately.
 window(-1.4,-.1,.96,2.15,1.18,warm,forest,False,False)
 box(2.13,-.035,.98,1.40,.08,1.92,accent)
 for i in range(9):box(2.13,-.09,.18+i*.19,1.32,.025,.03,warm)
 openings=[(-1.22,5.25,4.2,6.5),(2.25,3.4,1.45,2.6),(2.23,6.91,1.25,2.14)]
 banded_facade(w,0,base,h,wall,openings)
 bay(-1.23,-.93,base,4.15,6.52,wall,cream,accent)
 # Recessed porch and real glass/panel door beneath upper-right sash.
 box(2.23,.46,3.43,1.48,.1,2.73,accent)
 for xx in [1.90,2.54]:
  box(xx,.385,3.96,.46,.05,1.35,glass);box(xx,.365,2.72,.46,.08,.75,wall)
 for xx in [1.40,3.06]:box(xx,.10,3.54,.14,.28,3.05,cream)
 box(2.23,.06,4.96,1.95,.30,.26,cream)
 text(str(address),2.25,-.10,4.58,.21,accent)
 for xx in [1.42,3.03]:column(xx,-1.35,2.14,2.87,cream)
 box(2.24,-.57,5.20,2.36,2.08,.22,cream)
 balcony_rail(2.24,-1.48,5.33,2.30,cream)
 window(2.24,-.02,7.05,1.34,2.17,cream,accent,style in [2,3],True)
 for i in range(12):
  tready=-4.85+i*.287;zz=.02+(i+1)*.176
  box(2.22,(tready-1.45)/2,zz/2,1.72,-1.45-tready,zz,concrete)
 for sx in [-1,1]:
  xx=2.22+sx*.98
  beam((xx,-4.80,1.),(xx,-1.5,3.04),.045,cream,8)
  for i in range(12):
   yy=-4.7+i*.276;zz=.11+i*.177;box(xx,yy,zz+.48,.06,.06,.91,cream)
  box(xx,-1.53,2.62,.16,.18,1.12,cream)
 # Broad carved entablatures, brackets and dentils characteristic of the row.
 for zz,depth,hh in [(5.18,.40,.15),(5.39,.35,.14),(8.47,.46,.20),(8.68,.74,.19),(8.86,.88,.13)]:box(0,-.10,zz,w+.25,depth,hh,cream)
 dentils(-.43,8.57,w,accent)
 for xx in np.arange(-w/2+.33,w/2,.65):
  box(xx,-.40,8.30,.13,.36,.30,cream);beam((xx,-.46,8.11),(xx,-.16,8.53),.055,cream,5)
 gable(w+.16,-.26,8.9,3.13,wall,cream,accent,style)
 # Full long pitched roof, ridge, separate rear gable and shingle rows.
 for sg in [-1,1]:
  face([(0,-.30,12.06),(sg*(w/2+.28),-.30,8.87),(sg*(w/2+.28),d+.28,8.87),(0,d+.28,12.06)],roof)

 face([(-w/2,d,8.75),(w/2,d,8.75),(0,d,12.0)],wall)
 beam((0,-.33,12.07),(0,d+.3,12.07),.08,accent,6)
 for yy in [5.7,14.3]:
  box(w*.29,yy,11.19,.83,.93,2.7,brick)
  for zz in np.arange(10,12.5,.20):box(w*.29,yy,zz,.86,.97,.023,warm)
  box(w*.29,yy,12.63,1.02,1.10,.18,cream)
 # Delineated front garden, never occupies the road.
 box(-1.82,-3.2,.17,3.2,2.8,.40,concrete);box(-1.82,-3.2,.40,2.98,2.55,.08,soil)
 for xx in np.arange(-3.15,-.4,.55):
  for j in range(18):
   a=rng.random()*math.tau;l=rng.uniform(.27,.72);beam((xx,-3.1,.45),(xx+math.sin(a)*l,-3.1+math.cos(a)*l,.65+rng.random()*.4),.025,leaf if j%2 else leaf2,4)
 balcony_rail(-1.84,-4.70,.1,3.35,cream)
 REPORT.append({'name':PART,'base':ORIGIN,'front':tr((0,-5,0)),'width':w*SCALE,'depth':d*SCALE,'roofHeight':12.63})

def page531(w=9.2,d=21.5):
 h=11.6;wall=material('531 Page warm pale taupe','#cac0ac');trim=material('531 Page bone trim','#eee9da');texture_material(wall);texture_material(trim)
 sided_body(w,d,h,wall);box(0,.58,.53,w,1.1,1.4,granite)
 # Photographed double square towers frame a central notch in the cornice.
 for xx in [-2.34,2.34]:
  box(xx,.12,5.7,4.30,.32,11.4,wall)
  for zz in [2.16,5.55,9.0]:
   box(xx,-.12,zz,3.63,.18,2.67,wall)
   for dx in [-.78,.78]:window(xx+dx,-.42,zz,1.25,2.29,trim,dark,False,zz!=2.16)
  for zz in [3.68,7.12,10.72,11.38]:box(xx,-.22,zz,4.48,.52,.21,trim)
  for xedge in [xx-2.02,xx+2.02]:box(xedge,-.10,5.75,.20,.38,11.42,trim)
  box(xx,-.06,11.58,4.62,.79,.21,trim)
  for dx in np.arange(-1.95,2.,.29):box(xx+dx,-.38,11.31,.12,.23,.17,trim)
  for zz in np.arange(.45,11.1,.17):
   if any(abs(zz-z)<1.26 for z in [2.16,5.55,9.]):continue
   box(xx,-.09,zz,4.16,.08,.025,trim)
 # Ground door lies in the right bay's right third, matching split-levelentry.
 box(3.4,-.50,1.32,1.28,.09,2.5,dark);window(3.4,-.57,1.77,.91,1.21,trim,dark,False,False)
 box(3.4,-.79,3.22,.71,.06,.34,trim);text('531',3.4,-.836,3.13,.24,dark)
 for i in range(3):box(3.4,-.65-i*.28,.10*(3-i),1.58,.33,.2*(3-i),concrete)
 # Paneled entrance companion and letter boxes are subtle localrecognizers.
 box(.15,-.35,1.36,1.20,.12,2.55,forest)
 for zz in [.8,1.67]:box(.15,-.43,zz,.87,.055,.65,wall)
 for xx in [.02,.30]:cylinder(xx,-.50,1.34,.022,.14,iron,8)
 box(0,d/2,11.6,w+.28,d+.25,.22,trim)
 box(-1.4,d*.63,12.0,2.3,3.4,.58,roof)
 REPORT.append({'name':PART,'base':ORIGIN,'front':tr((0,-1,0)),'width':w*SCALE,'depth':d*SCALE})

def cafe_chair(x,y,a=0):
 angled_box(x,y,.45,.42,.42,.07,iron,a)
 for sx in [-1,1]:
  for sy in [-1,1]:beam((x+sx*.18,y+sy*.18,.43),(x+sx*.22,y+sy*.22,.03),.013,iron,6)
 beam((x-.2,y+.18,.44),(x-.2,y+.18,.91),.016,iron);beam((x+.2,y+.18,.44),(x+.2,y+.18,.91),.016,iron);beam((x-.2,y+.18,.9),(x+.2,y+.18,.9),.02,iron)
def cafe_table(x,y):
 cylinder(x,y,.74,.36,.035,wood,24);cylinder(x,y,.38,.036,.70,iron,8)
 for a in [0,math.pi/2]:beam((x-math.cos(a)*.28,y-math.sin(a)*.28,.045),(x+math.cos(a)*.28,y+math.sin(a)*.28,.045),.021,iron)
def reveille(w=14.0,d=19.):
 # Localfront -Y is Steiner; localleft -X is Waller. The chamferedcorner
 # is a small entry volume, upper cantedbays continue over both streets.
 h=11.4
 box(.9,d/2,8.22,w-1.8,d,6.36,taupe)
 for yy in np.arange(5.25,h,.36):
  box(0,.025,yy,w,.055,.022,warm);box(-w/2-.015,d/2,yy,.05,d,.022,warm)
 for zz in [5.1,8.3,11.3]:box(0,.01,zz,w+.15,.44,.15,white)
 # Tall open storefrontglazing + transoms, white structuralpiers.
 for xx in [-4.7,-.4,3.9]:
  window(xx,-.025,2.45,3.54,2.93,white,dark,False,False)
  for dx in [-1.15,0,1.15]:window(xx+dx,-.025,4.26,1.05,1.03,white,dark,False,False,False)
  box(xx,1.8,1.14,2.8,1.15,.11,wood)
 for xx in [-w/2,-2.56,1.74,w/2]:box(xx,.01,2.48,.28,.44,5.,white)
 box(0,-.01,.42,w,.34,.75,white);box(0,-.01,5.0,w+.2,.45,.30,white)
 # Wallerstreet frontage: four additionaltallbays orientedwest.
 for yy in [3.6,7.9,12.2,16.5]:
  sidewindow(-w/2-.03,yy,2.55,3.65,3.16,-math.pi/2,white)
  for dy in [-1.1,0,1.1]:sidewindow(-w/2-.04,yy+dy,4.50,.98,.80,-math.pi/2,white)
  box(-w/2,yy-2.02,2.52,.36,.26,5.0,white)
 box(-w/2,d/2,5.04,.5,d+.2,.30,white)
 # Oriel bay massing above groundfloor, taupe panels betweenwhitesash.
 for xx in [-4.6,.0,4.4]:
  for zz in [6.75,9.95]:
   box(xx,-.59,zz,3.56,1.15,2.83,taupe)
   window(xx,-1.34,zz+.05,1.95,1.91,warm,dark,False,False)
   for sg in [-1,1]:sidewindow(xx+sg*1.76,-.62,zz+.05,.75,1.91,sg*math.pi/2,warm)
   box(xx,-.62,zz-1.41,3.68,1.27,.18,warm)
 for yy in np.arange(4.,d-1,6.):
  for zz in [6.75,9.95]:
   box(-w/2-.54,yy,zz,1.08,3.2,2.85,taupe);sidewindow(-w/2-1.28,yy,zz+.04,1.94,1.91,-math.pi/2,warm);box(-w/2-.58,yy,zz-1.40,1.26,3.4,.18,warm)
 # A corner white vestibule withdoubletransom, pinknameplate, open doorway.
 angled_box(-w/2-.04,-.15,2.5,2.35,.30,5.0,white,-math.pi/4)
 sidewindow(-w/2-.26,-.35,2.5,1.52,3.9,-math.pi/4,white)
 box(-4.65,-.255,5.14,3.75,.055,.42,pink)
 text('CAFÉ RÉVEILLE',-4.65,-.29,5.04,.27,iron,'/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf')
 # Smallerrepeatedfascia is ontheWallerfront, signsremainoutofthefacade.
 # Actualfront door, customer path remainsfree betweenfurniture.
 box(-5.85,-.38,1.52,1.13,.10,2.82,white);window(-5.85,-.45,2.00,.89,1.65,white,dark,False,False)
 box(-5.51,-.53,1.39,.035,.07,.67,iron)
 for xx in [-.6,2.6,5.6]:
  cafe_table(xx,-2.08);cafe_chair(xx-.6,-2.09);cafe_chair(xx+.6,-2.09)
 for yy in [5.,9.,13.]:
  cafe_table(-w/2-2.04,yy);cafe_chair(-w/2-2.05,yy-.62);cafe_chair(-w/2-2.05,yy+.62)
 # Whiteplanters w/ thinindividualgrassblades andpinkA-frame.
 for xx,yy in [(-2.5,-1.4),(-w/2-1.3,1.7)]:
  box(xx,yy,.43,1.5,.69,.84,white);box(xx,yy,.86,1.37,.56,.06,soil)
  for j in range(50):
   dx=rng.uniform(-.60,.60);dy=rng.uniform(-.2,.2);a=rng.random()*math.tau;l=rng.uniform(.35,.85)
   p=(xx+dx,yy+dy,.85);q=(p[0]+math.cos(a)*.30,p[1]+math.sin(a)*.3,p[2]+l)
   beam(p,q,.009,leaf if j%2 else leaf2,4)
 for sg in [-1,1]:
  face([(-5.4+sg*.36,-2.35-sg*.36,.05),(-4.55+sg*.36,-2.35-sg*.36,.05),(-4.55,-2.35,1.1),(-5.4,-2.35,1.1)],pink)
 text('RÉVEILLE',-4.96,-2.55,.56,.16,iron)
 # Cafe cable lights and small heatersatactualsoffitheight.
 for xx in [-4,0,4]:
  box(xx,-.75,4.85,1.28,.32,.17,iron)
 for i in range(18):
  xx=-w/2+.25+i*(w-.5)/17;zz=4.80-.22*math.sin(i/17*math.pi);beam((xx,-1.,zz+.1),(xx,-1.,zz),.01,iron);cylinder(xx,-1.,zz-.045,.037,.085,cream,8)
 beam((-w/2,-1,4.83),(w/2,-1,4.83),.011,iron)
 box(0,d/2,h+.1,w+.35,d+.25,.3,warm)
 REPORT.append({'name':PART,'base':ORIGIN,'front':tr((0,-1,0)),'width':w*SCALE,'depth':d*SCALE})

def absinthe(w=14.5,d=21.):
 sided_body(w,d,10.55,abscream)
 cols=max(3,int(w/4.8));centers=[-w/2+(i+.5)*w/cols for i in range(cols)]
 openings=[(xx,zz,3.75,2.8) for xx in centers for zz in [5.95,9.20]]
 openings.extend((xx,2.,4.20,3.2) for xx in centers)
 banded_facade(w,0,.15,10.55,abscream,openings)
 for zz in [5.95,9.20]:
  for xx in centers:
   bay(xx,-.40,zz-1.50,3.60,2.96,abscream,warm,green,1)
 for zz in [3.75,4.02,10.62,10.87]:box(0,-.09,zz,w+.2,.64,.2,warm)
 dentils(-.42,10.64,w,warm)
 for xx in centers:
  window(xx,-.22,2.,4.20,3.20,green,dark,False,False)
  box(xx,-.12,.49,4.26,.12,.62,green)
  for dx in np.arange(-1.85,2.,.47):box(xx+dx,-.21,.49,.09,.06,.60,warm)
 # Gough Streetreturn storefront anddiagonalcornerdoor underglasscanopy.
 for yy in [2.5,6.6,10.7,14.8]:
  sidewindow(-w/2-.20,yy,2.,3.65,3.1,-math.pi/2,green)
  box(-w/2-.2,yy,.45,.12,3.9,.59,green)
  for zz in [5.95,9.2]:sidewindow(-w/2-.18,yy,zz,1.55,2.13,-math.pi/2,warm)
 angled_box(-w/2+.15,-.31,1.94,2.45,.22,3.86,green,-math.pi/4)
 sidewindow(-w/2-.04,-.55,2.0,1.65,3.16,-math.pi/4,green)
 # Distinctive roundedcornerbay andsegmentedartnouveaufan canopy.
 for zz in [5.95,9.22]:
  for i in range(5):
   a=-math.pi/2+(i+.5)*math.pi/5;cx=-w/2+math.cos(a)*1.65;cy=.20+math.sin(a)*1.65
   angled_box(cx,cy,zz,1.07,.26,2.82,abscream,a+math.pi/2);sidewindow(cx,cy-.32,zz, .84,1.97,a+math.pi/2,warm)
  cylinder(-w/2,.20,zz-1.49,1.88,.19,warm,20)
 center=(-w/2,-.80,3.66);n=14;r=3.4
 for i in range(n):
  a=math.pi+(i/n)*math.pi;b=math.pi+((i+1)/n)*math.pi
  p=(center[0]+math.cos(a)*r,center[1]+math.sin(a)*r,3.38);q=(center[0]+math.cos(b)*r,center[1]+math.sin(b)*r,3.38)
  face([center,p,q],canopyglass);beam(center,p,.05,green,8);beam(p,q,.09,green,8)
 text('Absinthe',-w/2,-2.85,4.0,.93,neon,'/System/Library/Fonts/Supplemental/Apple Chancery.ttf')
 for xx in [-w/2-1.7,-w/2+1.7]:column(xx,-1.9,.0,3.36,green)
 for xx in [-3,1.4,5.5]:cafe_table(xx,-1.5);cafe_chair(xx-.65,-1.5);cafe_chair(xx+.65,-1.5)
 box(0,d/2,11.04,w+.3,d+.3,.22,warm)
 REPORT.append({'name':PART,'base':ORIGIN,'front':tr((0,-1,0)),'width':w*SCALE,'depth':d*SCALE})

# Placements loaded from the geography audit; fallback used only by --study.
# The final generation refuses unverified approximate global placements.
LAYOUT=ROOT/'art/references/cerebral-layout.json'
if not LAYOUT.exists():
 candidates=list((ROOT/'art').rglob('*cerebral*json'))+list((ROOT/'public').rglob('*cerebral*json'))
 if candidates:LAYOUT=candidates[0]
GEO=json.loads(LAYOUT.read_text()) if LAYOUT.exists() else None

def placement(name,base,a=0,scale=1):
 global PART,ORIGIN,ANGLE,SCALE
 PART=name;ORIGIN=tuple(base);ANGLE=a;SCALE=scale

# Verified OSM frontageanchors plusUSGSgroundheights; meshesaredesignedaround
# the streetfaçade, withfront-Yawayfromthelotinterior. Housesmaintainphysical
# widthanddepth; tallercoresareflattenedonlywherephotographsconfirmtheheight.
assert GEO and 'landmarks' in GEO, 'Geographical layout required before export'
ANCHORS={x['id']:x for x in GEO['landmarks']};BUILDINGS={b['id']:b for b in GEO['buildings']}
ASSETS={}
def set_asset(name,id,angle=None,inset=0):
 lm=ANCHORS[id];angle=lm['rotation'] if angle is None else angle
 poly=BUILDINGS[id]['polygon'];c=math.cos(angle);s=math.sin(angle)
 pp=[(p['x']*c+p['z']*s,-p['x']*s+p['z']*c) for p in poly]
 lo=min(p[0] for p in pp);hi=max(p[0] for p in pp);front=min(p[1] for p in pp)
 lx=(lo+hi)/2;ly=front+inset;point=(lx*c-ly*s,lx*s+ly*c,lm['y'])
 placement(name,point,angle);ASSETS[name]={'origin':point,'angle':angle,'id':id,'width':hi-lo,'depth':max(p[1] for p in pp)-front};return ASSETS[name]
def local_to_world(name,p):
 a=ASSETS[name];o=a['origin'];c=math.cos(a['angle']);s=math.sin(a['angle'])
 return (o[0]+p[0]*c-p[1]*s,o[1]+p[0]*s+p[1]*c,o[2]+p[2])
PAL=[('#c2c8a9','#79866c'),('#afc3d0','#63788b'),('#cbbbae','#7a6156'),('#e0cc98','#ae6750'),('#b9c0ad','#717d6d'),('#d8d1b8','#92856f')]
for i,(address,id) in enumerate([(710,'261412896'),(712,'261412895'),(714,'261412900'),(716,'261412894'),(718,'261412879'),(720,'261412899')]):
 name='Painted Lady '+str(address);asset=set_asset(name,id,inset=1.02)
 # Finewidthadaptationpreservesasymmetricfrontageofeachindividualhouse.
 SCALE=asset['width']/7.25
 painted_lady(address,PAL[i],5-i,7.25,(asset['depth']-1.02)/SCALE)

# 722 is the broad seventh house, witha roundedcorneroriel andconicalturret,
# a lowhippedroof, archedsash, and smallerforwardgable, notaseventhclonedgable.
asset=set_asset('722 Steiner corner','261412887',inset=.72)
w=asset['width'];d=asset['depth']-.72;wall=material('722 muted sage weatherboard','#aebca9');accent=material('722 forest accent','#617365');texture_material(wall)
sided_body(w,d,9.2,wall);box(0,.25,.8,w,1.0,1.9,concrete)
for zz in np.arange(2.0,9.2,.16):box(0,-.025,zz,w,.08,.024,warm)
for zz in [3.74,7.0]:
 window(1.55,-.12,zz,1.2,2.15,cream,accent,True,True)
 # Round 5-sidedorieloccupiesleftsideofstreetfront.
 for k in range(5):
  a=-math.pi+(k+.5)*math.pi/5
  xx=-1.9+math.cos(a)*1.70;yy=.4+math.sin(a)*1.70
  angled_box(xx,yy,zz,1.17,.16,3.20,wall,a+math.pi/2)
  sidewindow(xx,yy-.34,zz, .88,2.16,a+math.pi/2,cream)
 for zband in [zz-1.56,zz+1.54]:cylinder(-1.9,.4,zband,1.92,.16,cream,20)
for zz in [2.0,5.28,8.63,9.14]:box(0,-.08,zz,w+.28,.56,.21,cream)
window(3.02,-.15,3.2,1.20,2.6,cream,accent,True,False)
text('722',3.02,-.42,4.73,.24,accent)
for i in range(11):box(3.02,-.65-i*.28,.092*(11-i),1.55,.31,.184*(11-i),concrete)
for sg in [-1,1]:beam((3.02+sg*.9,-3.5,.92),(3.02+sg*.9,-.3,2.89),.04,cream)
# Hiproof terminatesbehindtheturret, withrectangularridgeandgablefacingpark.
face([(-w/2-.2,-.2,9.25),(w/2+.2,-.2,9.25),(w/2-1.8,2,11.4),(-w/2+1.8,2,11.4)],roof)
face([(w/2+.2,-.2,9.25),(w/2+.2,d+.2,9.25),(w/2-1.8,d-2,11.4),(w/2-1.8,2,11.4)],roof)
face([(-w/2-.2,-.2,9.25),(-w/2-.2,d+.2,9.25),(-w/2+1.8,d-2,11.4),(-w/2+1.8,2,11.4)],roof)
face([(-w/2+1.8,2,11.4),(w/2-1.8,2,11.4),(w/2-1.8,d-2,11.4),(-w/2+1.8,d-2,11.4)],roof)
cylinder(-1.9,.4,10.15,2.05,3.15,roof,28,r2=.04);cylinder(-1.9,.4,12.0,.065,.69,accent,12,r2=.015)
box(2.05,6.,11.05,.82,.87,2.35,brick);box(2.05,6.,12.25,1.0,1.05,.16,cream)
REPORT.append({'name':PART,'base':ORIGIN,'front':tr((0,-1,0)),'width':w,'depth':d,'roofHeight':12.35})

asset=set_asset('531 Page','261432385',inset=.3);SCALE=asset['width']/9.2
page531(9.2,(asset['depth']-.3)/SCALE)
# Café is NWcornerWaller/Steiner. ReorientitsprimaryfronttoEASTSteiner;
# localleft(-X)thereforefacesSOUTHWaller,followingtheinspectedphotograph.
asset=set_asset('Cafe Reveille','261429607',angle=.15969899+math.pi/2,inset=1.15)
reveille(asset['width']-.1,asset['depth']-1.15)
asset=set_asset('Absinthe Hayes','256720167',inset=.9)
# Groundfootprintcontainsrearwing; thehistoricHayesfacecontinuesacross35m.
absinthe(asset['width']-.1,asset['depth']-.9)

# 450 Hayes / a Mano: Handel Architects' contemporary four-story building.
# The actual SOUTHedge is39.75m, not the61m overalldiagonalboundingbox.
# Its rear wing isseparatedbyaninternalbirchcourtyard, as documentedbyHandel.
id='28015901';b=BUILDINGS[id];poly=b['polygon'];p0=poly[8];p1=poly[7]
ang=math.atan2(p1['z']-p0['z'],p1['x']-p0['x']);ww=math.hypot(p1['x']-p0['x'],p1['z']-p0['z']);ori=((p0['x']+p1['x'])/2,(p0['z']+p1['z'])/2,b['baseHeight'])
placement('450 Hayes a Mano',ori,ang);ASSETS[PART]={'origin':ori,'angle':ang,'id':id,'width':ww,'depth':38}
c=math.cos(ang);ss=math.sin(ang);pp=[((p['x']-ori[0])*c+(p['z']-ori[1])*ss,-(p['x']-ori[0])*ss+(p['z']-ori[1])*c) for p in poly]
graphite=material('450 graphite metal','#555b5b',.38,.42);silver=material('450 window aluminum','#b7b9af',.28,.62);oak450=[material('450 cedar tone '+str(i),co) for i,co in enumerate(['#af754f','#bd895e','#c59769','#99654c','#b87d5a'])]
for m in oak450:texture_material(m)
fen=material('450 reflected sky glass','#819eaa',.18,.4);lightcurtain=material('450 silver roller blinds','#bab9ab',.65);con450=material('450 fair-faced concrete','#999b90',.86)
def clip_y(points,edge,greater):
 out=[]
 for i,p in enumerate(points):
  q=points[(i+1)%len(points)];inside=lambda v:v[1]>=edge if greater else v[1]<=edge
  if inside(p):out.append(p)
  if inside(p)!=inside(q):t=(edge-p[1])/(q[1]-p[1]);out.append((p[0]+t*(q[0]-p[0]),edge))
 return out

def prism(points,z,h,m):
 face([(x,y,z) for x,y in points][::-1],m);face([(x,y,z+h) for x,y in points],m)
 for i,(x,y) in enumerate(points):xx,yy=points[(i+1)%len(points)];face([(x,y,z),(xx,yy,z),(xx,yy,z+h),(x,y,z+h)],m)
front_poly=clip_y(clip_y(pp,1.1,True),16.8,False);rear_poly=clip_y(pp,25.0,True)
prism(front_poly,0,13.8,graphite);prism(rear_poly,0,13.8,graphite)
prism(clip_y(clip_y(pp,.25,True),16.9,False),13.8,.18,silver);prism(rear_poly,13.8,.18,silver)
# The continuousgroundfloorplinthandthreeunequalupperwindowrows.
cols=11;pitch=ww/cols;window_heights=[5.85,9.0,12.15]
for j in range(cols):
 xx=-ww/2+(j+.5)*pitch
 # Verticalcedarboards areindividuallymodeledin theinterwindowstrips.
 for k in range(16):
  xpos=xx+pitch/2+(k-7.5)*.115
  if xpos<ww/2-.05:box(xpos,-.025,9.03,.108,.12,9.46,oak450[(j+k)%5])
 for fi,zz in enumerate(window_heights):
  wid=1.82 if (j+fi)%3 else 2.34;hh=2.83
  project=(j,fi) in {(0,2),(2,0),(3,1),(5,2),(6,0),(7,1),(9,0),(10,2)}
  depth=.77 if project else .09
  # SomewindowboxesareangledtowardPatricia'sGreen,notuniformbaystacks.
  yaw=-.09 if project and j%2==0 else .04 if project else 0
  angled_box(xx,-depth+.08,zz,wid+.17,.18,hh+.18,silver,yaw)
  angled_box(xx,-depth-.032,zz,wid,.035,hh,fen,yaw)
  angled_box(xx,-depth-.062,zz,wid*.035,.04,hh,graphite,yaw)
  if (j+fi)%4==0:angled_box(xx,-depth-.051,zz+.47,wid-.12,.022,hh*.32,lightcurtain,yaw)
  # Deepreturnconnectsprojectingwindowtothefacadeandcastsproper shadows.
  if project:
   for sg in [-1,1]:box(xx+sg*(wid/2+.04),-.25,zz,.09,1.05,hh+.18,graphite)
   box(xx,-.33,zz-hh/2-.09,wid+.28,1.1,.16,graphite)
 # Retailhas2.8mtransparent-lookingdarkglazingandthinmetalframes.
 window(xx,-.02,2.13,pitch-.16,3.94,graphite,dark,False,False)
 for side in [-1,1]:box(xx+side*pitch/2,-.12,2.11,.11,.40,4.24,con450)
 for zz in [4.18,13.79]:box(xx,-.07,zz,pitch+.06,.36,.19,graphite)
# Recessedwoodentranceunderanoverhangandsmall450numeralsonit.
entry=-ww*.19
box(entry,-.17,4.08,5.45,1.10,.42,oak450[2]);text('450',entry,-.76,4.20,.68,silver)
box(entry,.78,1.86,2.75,.12,3.62,graphite)
for xx in [entry-.69,entry+.69]:window(xx,.69,2.0,1.22,3.3,silver,dark,False,False)
for zz in np.arange(.2,4.,.16):box(entry-2.38,.04,zz,.7,1.13,.025,oak450[0])
# ActualaMano slenderblackblade, positionedabovethe easternretailentry.
box(ww*.31,-.50,3.08,.78,.10,2.50,graphite)
for i,ch in enumerate(['a','M','a','n','o']):text(ch,ww*.31,-.57,4.0-i*.44,.38,white,'/System/Library/Fonts/Supplemental/Times New Roman.ttf')
# Side-returnmetalwindowgridsfollowtheexistingangledfootprintwalls.
for points in [front_poly,rear_poly]:
 for i,p in enumerate(points):
  q=points[(i+1)%len(points)];dx=q[0]-p[0];dy=q[1]-p[1];length=math.hypot(dx,dy)
  if abs(dy)<.3:continue
  count=max(1,int(length/3.7));a=math.atan2(dy,dx)
  for k in range(count):
   t=(k+.5)/count;xx=p[0]+dx*t;yy=p[1]+dy*t
   for zz in window_heights:sidewindow(xx,yy,zz,1.64,2.60,a,graphite)
# Residentialcourtyard:two slenderconnectingwalkwaysandbirchtrunks.
for xx in [-ww*.32,ww*.46]:box(xx,20.9,4.15,1.4,8.4,.19,con450)
box(3.,20.9,.12,30.,8.0,.22,con450)
for xx in [-8.,0.,8.,16.]:
 cylinder(xx,21.,4.,.10,8.,warm,10,r2=.045)
 for k in range(18):
  aa=k*2.4;yy=5.5+k*.1;beam((xx,21,yy),(xx+math.cos(aa)*1.8,21+math.sin(aa)*1.5,yy+1.3),.028,warm,6)
REPORT.append({'name':PART,'base':ORIGIN,'front':tr((0,-1,0)),'width':ww,'depth':38,'roofHeight':13.98,'source':'https://handelarchitects.com/project/450-hayes'})

# Finalize into material-batched spatial groups; flat architecturaledgesremain
# flat, cylinders keep polygonal silhouettes smallenoughforbrowserGPU.
objects=[]
for (part,m),(verts,faces,uvs) in BATCH.items():
 mesh=bpy.data.meshes.new(part+' / '+m);mesh.from_pydata(verts,[],faces);mesh.update();uv=mesh.uv_layers.new(name='Architectural metres')
 for p,coords in zip(mesh.polygons,uvs):
  for i,co in zip(p.loop_indices,coords):uv.data[i].uv=co
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 o=bpy.data.objects.new(part+' / '+m,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(M[m]);objects.append(o)
# Test realglyphface samples againstthe authoredarchitecture. Thecamera sees
# readable signs ratherthanlettersburiedwithin a cornice orheatingunit.
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();sign_audit=[]
for probe in PROBES:
 normal=Vector(probe['normal']);blocked=0
 for sample in probe['samples']:
  hit,*rest=bpy.context.scene.ray_cast(deps,Vector(sample)+normal*.018,normal,distance=1.)
  if hit:blocked+=1
 sign_audit.append({'part':probe['part'],'text':probe['text'],'glyphFaceSamples':len(probe['samples']),'blockedSamples':blocked})
assert all(s['glyphFaceSamples'] and not s['blockedSamples'] for s in sign_audit), sign_audit
print('CEREBRAL_SIGN_MOUNT_AUDIT',json.dumps(sign_audit))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
world=bpy.data.worlds.new('Pacific pale blue daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.52,.64,.76,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
bpy.ops.object.light_add(type='SUN',location=(-10,-70,120));sun=bpy.context.object;sun.data.energy=3.0;sun.data.angle=.08;sun.rotation_euler=(math.radians(35),math.radians(-24),math.radians(-32))
bpy.ops.object.camera_add(location=(38,-50,25));camera=bpy.context.object;camera.data.lens=42;scene.camera=camera
scene.view_settings.view_transform='AgX';scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'cerebral-heroes.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
opts=dict(export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16)
bpy.ops.export_scene.gltf(filepath=str(OUT/'heroes.glb'),**opts)
meta={'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'drawCalls':len(objects),'coordinates':'Blender X east Y north Z up; glTF X east Y elevation Z south','origin':{'lon':-122.42415,'lat':37.77655},'landmarks':REPORT,'placements':ASSETS,'signs':SIGN,'reference':'art/references/cerebral-heroes.md','signMountAudit':sign_audit}
def render(name,eye,target,lens=45):
 if '--skip-renders' in sys.argv:return
 if '--450-only' in sys.argv and name!='cerebral-450-hayes.png':return
 camera.location=eye;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=lens;scene.render.filepath=str(REVIEW/name);bpy.ops.render.render(write_still=True)
render('cerebral-450-hayes.png',local_to_world('450 Hayes a Mano',(-20,-49,14)),local_to_world('450 Hayes a Mano',(0,2,7)),45)
render('cerebral-painted-ladies.png',local_to_world('Painted Lady 716',(27,-52,23)),local_to_world('Painted Lady 716',(0,2,5.8)),48)
render('cerebral-painted-lady-detail.png',local_to_world('Painted Lady 716',(4.8,-14,5.4)),local_to_world('Painted Lady 716',(0,0,5.8)),40)
render('cerebral-page-531.png',local_to_world('531 Page',(11,-25,9)),local_to_world('531 Page',(0,1,5.8)),43)
render('cerebral-reveille.png',local_to_world('Cafe Reveille',(-23,-30,12)),local_to_world('Cafe Reveille',(-3,3,4.5)),42)
render('cerebral-absinthe.png',local_to_world('Absinthe Hayes',(-34,-30,10)),local_to_world('Absinthe Hayes',(-14,1,5.7)),42)
for o in objects:
 bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new('Architectural distant LOD','DECIMATE');mod.ratio=.42;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.export_scene.gltf(filepath=str(OUT/'heroes-lod.glb'),**opts)
meta['lodTriangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
(OUT/'heroes.meta.json').write_text(json.dumps(meta,indent=2));print('CEREBRAL_HERO_REPORT',json.dumps(meta))
