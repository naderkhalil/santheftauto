"""Patricia's Green: surveyed narrow park and original close landscape details.

Blender --background --factory-startup -t 4 --python tools/blender/build_cerebral_patricias_green.py
Native axes X east, Y north, Z elevation. The standard glTF export needs no mirror.
"""
import bpy, bmesh, math, json, sys, random
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
# Shared material/mesh primitives retain the neighborhood's texture scale.
import build_cerebral_neighborhood as kit
OUT=ROOT/'public/assets/cerebral-valley';SOURCE=ROOT/'art/source';REVIEW=ROOT/'art/reviews'
data=json.loads((ROOT/'art/references/cerebral-valley-layout.json').read_text())
park=next(p for p in data['parks'] if p['id']=='28015862')
ground=kit.ground_sampler(data)
kit.PART="Patricia's Green / surveyed landscape"
kit.DETAIL='close landscape'
LAWN=kit.material('Patricia / tended green lawn','#77945d',.98,kind='grass')
PAVE=kit.material('Patricia / warm pale concrete','#c6c0ae',.91,kind='stucco')
PAVER=kit.material('Patricia / sand concrete pavers','#b4aa96',.94,kind='gravel')
GRAVEL=kit.material('Patricia / pale plaza gravel','#c5b895',.96,kind='gravel')
BORDER=kit.material('Patricia / charcoal concrete edge','#747d73',.89,kind='stucco')
STEEL=kit.material('Patricia / olive black park metal','#34483c',.57,.32)
TIMBER=kit.material('Patricia / weathered redwood seating','#95785a',.86)
SIGN=kit.material('Patricia / park sign green','#244f42',.64)
LETTER=kit.material('Patricia / cream park lettering','#f1ead4',.65)
MULCH=kit.material('Patricia / playground natural mulch','#8e7353',.98,kind='gravel')
LEAF=kit.material('Patricia / low planting sage','#78946e',.98)
STONE=kit.material('Patricia / pale granite boulders','#a9aa98',.97,kind='stucco')

p0,p1,p2,p3=[Vector((p['x'],p['z'])) for p in park['polygon'][:4]]
c=(p0+p1)/2; across=(p1-p0).normalized();north=((p3-p0)+(p2-p1)).normalized();length=((p3-p0).length+(p2-p1).length)/2;width=(p1-p0).length

def xy(u,v):return (c.x+across.x*u+north.x*v,c.y+across.y*u+north.y*v)
def point(u,v,rise=0):
 x,y=xy(u,v);return (x,y,ground(x,y)+rise)
def rect(u0,u1,v0,v1,rise,mat,step=1.6):
 nu=max(1,math.ceil((u1-u0)/step));nv=max(1,math.ceil((v1-v0)/step))
 for j in range(nv):
  for i in range(nu):
   a=u0+(u1-u0)*i/nu;b=u0+(u1-u0)*(i+1)/nu;d=v0+(v1-v0)*j/nv;e=v0+(v1-v0)*(j+1)/nv
   kit.face([point(a,d,rise),point(b,d,rise),point(b,e,rise),point(a,e,rise)],mat)
def ring(cx,cy,r0,r1,rise,mat,count=96):
 for i in range(count):
  angles=(math.tau*i/count,math.tau*(i+1)/count)
  pts=[]
  for r,a in [(r0,angles[0]),(r1,angles[0]),(r1,angles[1]),(r0,angles[1])]:
   x,y=cx+math.cos(a)*r,cy+math.sin(a)*r;pts.append((x,y,ground(x,y)+rise))
  kit.face(pts,mat)
def disk(cx,cy,r,rise,mat):
 for j in range(1,max(2,math.ceil(r/.8))+1):
  n=max(2,math.ceil(r/.8));ring(cx,cy,r*(j-1)/n,r*j/n,rise,mat)
def path(points,w,mat,rise=.235):
 # Fine terrain tessellation prevents different ribbons from cutting through
 # one another at the DEM's bilinear cell boundaries.
 dense=[]
 for a,b in zip(points,points[1:]):
  n=max(1,math.ceil(math.dist(a,b)/.4))
  for i in range(n):dense.append((a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))
 dense.append(points[-1]);rows=[];nw=max(1,math.ceil(w/.4))
 for i,(x,y) in enumerate(dense):
  a=dense[max(0,i-1)];b=dense[min(len(dense)-1,i+1)];dx=b[0]-a[0];dy=b[1]-a[1];ln=math.hypot(dx,dy) or 1
  row=[]
  for j in range(nw+1):
   lateral=w*(j/nw-.5);xx=x-dy/ln*lateral;yy=y+dx/ln*lateral;row.append((xx,yy,ground(xx,yy)+rise))
  rows.append(row)
 for a,b in zip(rows,rows[1:]):
  for j in range(nw):kit.face([a[j],b[j],b[j+1],a[j+1]],mat)
def worldbox(u,v,rise,w,d,h,mat):kit.box(*point(u,v,rise),w,d,h,mat,math.atan2(across.y,across.x))
def linepoints(points,r,mat):
 for a,b in zip(points,points[1:]):kit.rod(a,b,r,mat,8)

# Exact rotated mapped footprint: no clipped 3m cells projecting into Octavia.
rect(-width/2,width/2,0,length,.155,LAWN)
# Perimeter walks and flush mowing kerbs define the long green clearly.
for side in (-1,1):
 rect(side*(width/2-1.60) if side>0 else -width/2, width/2 if side>0 else -width/2+1.60,0,length,.211,PAVE)
 x0=side*(width/2-1.64)
 path([xy(x0,v) for v in (0,length)],.13,BORDER,.226)
rect(-width/2,width/2,0,2.2,.215,PAVE)
rect(-width/2,width/2,length-2.4,length,.215,PAVE)
# Surveyed longitudinal loops, circular Hayes plaza, crosspaths and connectors.
paths=[]
for i,pp in enumerate(park['paths']):
 pts=pp.get('points',[]) if isinstance(pp,dict) else pp
 points=[(p['x'],p['z']) for p in pts]
 if len(points)<2:continue
 paths.append(points)
 w=1.65 if i in (3,4,6,7,8,10,11,12,13,14,15,16,17,18,19,20) else 1.9
 if i==9:w=1.85
 # Dark fine edge is only a few centimetres, never a raised traffic barrier.
 path(points,w+.13,BORDER,.229+i*.002);path(points,w,PAVER,.243+i*.002)
# The circular north plaza and the small southern play space are anchored to
# the actual path circles; furnishings are a reference-informed interpretation.
north_c=(-29.07,-4.11)
disk(*north_c,5.50,.239,GRAVEL);ring(*north_c,5.48,5.69,.248,PAVE)
for a in range(0,360,30):
 rad=math.radians(a)
 pts=[(north_c[0]+math.cos(rad)*r,north_c[1]+math.sin(rad)*r) for r in (4.82,5.53)]
 path(pts,.045,BORDER,.252)
# Central path arcs enclose a level, low play/sitting place.
disk(-23.85,-35.74,4.2,.241,PAVE)
disk(-19.08,-64.76,4.68,.241,MULCH);ring(-19.08,-64.76,4.66,4.86,.256,TIMBER)
# Very low granite play stones: quiet human-scale details, no invented tower.
rng=random.Random(28015862)
for x,y,r,h in [(-20.2,-64.4,.65,.55),(-18.5,-63.1,.75,.67),(-17.7,-65.4,.52,.40),(-21.2,-66.1,.44,.35)]:
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,ground(x,y)+.24+h*.32))
 ob=bpy.context.object;ob.name='Patricia / low natural play stone';ob.scale=(r,r*.80,h)
 ob.data.materials.append(kit.MATERIALS[STONE]);ob['patricias_green']=True

# Correctly oriented benches: full seat/back/slats, curved iron supports and
# accessible gaps keep sightlines across the green open from Hayes.
benches=[]
def bench_at(u,v,heading,length=2.05):
 x,y=xy(u,v);z=ground(x,y)+(.255 if v>80 else .158);co,si=math.cos(heading),math.sin(heading)
 def p(a,b,h):return (x+co*a-si*b,y+si*a+co*b,z+h)
 def b(a,b,h,w,d,hh,m):kit.box(*p(a,b,h),w,d,hh,m,heading)
 for j in range(5):b(0,(j-2)*.108,.46,length,.092,.065,TIMBER)
 for j in range(5):b(0,.245+j*.012,.67+j*.086,length,.064,.067,TIMBER)
 for side in (-1,1):
  a=side*(length/2-.27)
  linepoints([p(a,-.20,.05),p(a,-.20,.44),p(a,.24,.44),p(a,.31,1.07)],.036,STEEL)
  linepoints([p(a,-.17,.63),p(a,-.17,.73),p(a,.27,.73)],.030,STEEL)
  b(a,0,.05,.26,.55,.08,STEEL)
 benches.append({'x':round(x,3),'z':round(y,3),'length':length,'facing':heading-math.pi/2})
axis=math.atan2(across.y,across.x)
for side in (-1,1):
 for v in (22,35,56,68):bench_at(side*8.25,v,axis+(-math.pi/2 if side>0 else math.pi/2))
# North-edge benches face the circular art/plaza space rather than blocking it.
bench_at(-5.1,84.7,axis);bench_at(5.0,84.7,axis)
# Small dark-green park sign on the Hayes edge. This is original wayfinding,
# using the real park name; exact current municipal graphic layout is not claimed.
sx,sy=xy(-6.5,length-1.8);sz=ground(sx,sy)
front=Vector((north.x,north.y,0));uvec=Vector((across.x,across.y,0))
for sign in (-1,1):
 pp=Vector((sx,sy,sz))+uvec*(sign*.79)
 kit.box(pp.x,pp.y,sz+.74,.075,.075,1.4,STEEL,axis)
kit.box(sx,sy,sz+1.15,1.85,.12,.78,SIGN,axis)
def sign_text(text,size,h):
 curve=bpy.data.curves.new('Patricia park lettering','FONT');curve.body=text;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=size;curve.extrude=.0007;curve.resolution_u=3
 ob=bpy.data.objects.new(text,curve);bpy.context.collection.objects.link(ob)
 ob.location=(sx+front.x*.069,sy+front.y*.069,sz+h);ob.rotation_euler=(math.pi/2,0,axis+math.pi);ob.data.materials.append(kit.MATERIALS[LETTER]);ob['patricias_green']=True
sign_text("PATRICIA'S",.17,1.30);sign_text('GREEN',.19,1.07);sign_text('HAYES VALLEY',.085,.88)
# Sparse low planting at the southern corners; most of the park remains lawn.
for side in (-1,1):
 for v in (6,11):
  x,y=xy(side*8.1,v);disk(x,y,.85,.23,kit.EARTH)
  for j in range(10):
   a=rng.random()*math.tau;r=rng.random()*.56;z=ground(x,y)+.25
   linepoints([(x+math.cos(a)*r,y+math.sin(a)*r,z),(x+math.cos(a)*(r+.11),y+math.sin(a)*(r+.11),z+.18+rng.random()*.17)],.028,LEAF)
# Explicit small canopy anchors are consumed by the runtime, not exported as
# enormous opaque trees. Keep the entire Hayes-side sculpture circle open.
trees=[]
for u,v,h,canopy in [(-8.1,14,5.5,3.7),(8.1,14,5.5,3.7),(-8.1,43,6.0,4.2),(8.1,43,6.0,4.2),(-8.1,65,5.8,3.8),(8.1,65,5.8,3.8)]:
 x,y=xy(u,v);trees.append({'x':round(x,3),'z':round(y,3),'y':round(ground(x,y)+.23,3),'height':h,'canopyWidth':canopy,'park':park['name']})
 disk(x,y,.75,.229,kit.EARTH);ring(x,y,.74,.87,.242,BORDER)
# Fine saw cuts on the perimeter paving give it human scale without decals.
for v in range(3,int(length)-2,3):
 for side in (-1,1):path([xy(side*(width/2-1.52),v),xy(side*(width/2-.08),v)],.021,BORDER,.218)

objects=[ob for ob in bpy.context.scene.objects if ob.type in ('MESH','FONT')]
for (part,detail,mat),(verts,faces,uvs) in kit.BATCH.items():
 me=bpy.data.meshes.new(mat);me.from_pydata(verts,[],faces);me.update();uv=me.uv_layers.new(name='UVMap')
 for poly,coords in zip(me.polygons,uvs):
  for i,co in zip(poly.loop_indices,coords):uv.data[i].uv=co
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00005);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(mat,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(kit.MATERIALS[mat]);objects.append(ob)
for ob in objects:
 ob['patricias_green']=True;ob['spatial_block']="park / Patricia's Green";ob['origin_contract']='X east, native Y north, native Z elevation; glTF -Z north'
 if ob.type=='FONT':
  bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
world=bpy.data.worlds.new('Patricia / clear marine daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.54,.65,.78,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
bpy.ops.object.light_add(type='SUN',location=(100,-160,180));sun=bpy.context.object;sun.data.energy=2.7;sun.data.angle=.06;sun.rotation_euler=(.44,-.55,-.35)
bpy.ops.object.camera_add(location=(55,50,50));cam=bpy.context.object;cam.data.clip_end=3000;scene.camera=cam
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene['reference_note']='Mapped OSM park boundary and paths; original interpreted furniture, paving and planting. No claim of current public-art installation.'
for ob in list(bpy.context.selected_objects):ob.select_set(False)
for ob in objects:ob.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'cerebral-patricias-green.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'patricias-green.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18)
report={'parkId':park['id'],'name':park['name'],'footprint':park['polygon'],'mappedPathCount':len(paths),'meshes':len(objects),'triangles':sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in objects),'treeAnchors':trees,'benches':benches,'sculpture':'No installation asserted current; circular exhibition plaza kept open.','interpretation':'Furniture, sign typography, natural play stones, paving and low planting are authored from mapped park layout and public descriptions.','coordinates':'+X east, +Y elevation, glTF -Z north; no mirror','bytes':(OUT/'patricias-green.glb').stat().st_size}
(OUT/'patricias-green.meta.json').write_text(json.dumps(report,indent=2)+'\n');print('PATRICIAS_GREEN_REPORT',json.dumps(report),flush=True)
if '--skip-render' not in sys.argv:
 # Review-only slender canopy placeholders show intended shade without adding
 # any trees to the GLB, avoiding duplicate instances at runtime.
 for t in trees:
  kit.PART='review trees';kit.DETAIL='review only'
  x,y,z=t['x'],t['z'],t['y'];h=t['height'];r=t['canopyWidth']/2
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.12,depth=h*.7,location=(x,y,z+h*.35));bpy.context.object.data.materials.append(kit.MATERIALS[TIMBER])
  for dx,dy,dh,sc in [(0,0,0,1),(.55,.45,-.35,.85),(-.45,.15,-.30,.8)]:
   bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1,location=(x+dx,y+dy,z+h-r*.55+dh));ob=bpy.context.object;ob.scale=(r*sc,r*sc,r*.65*sc);ob.data.materials.append(kit.MATERIALS[LEAF])
 for name,eye,target,lens in [('cerebral-patricias-green-aerial',(33,-17,115),(-25,-35,21),43),('cerebral-patricias-green-hayes',(19,26,28.4),(-27,-15,22.5),40)]:
  cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)
