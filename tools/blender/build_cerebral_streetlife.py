"""Original street-scale cars, parking meters, hydrants and bicycles for Cerebral.
Native Blender X east / Y north / Z up. Prototypes use front +Y, local ground zero.
All geometry/materials original; existing CC0 vegetation is optimized separately.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/cerebral-valley';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
M={};B={};PART='';parents={}
def srgb(h):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)];return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)
def mat(name,color,rough=.6,metal=0,emit=0):
 m=bpy.data.materials.new('Cerebral Street / '+name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*srgb(color),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if emit:p.inputs['Emission Color'].default_value=(*srgb(color),1);p.inputs['Emission Strength'].default_value=emit
 m.diffuse_color=(*srgb(color),1);M[name]=m;return name
paint=mat('car paint','#7c96a2',.27,.4);rubber=mat('tire rubber','#202526',.88);black=mat('graphite rubber seals','#283133',.63);chrome=mat('brushed aluminum','#c6cecb',.25,.75);glass=mat('blue reflected automotive glass','#284555',.15,.5);red=mat('red tail lens','#982b29',.24,.1);amber=mat('amber indicator','#d38b36',.3);lamp=mat('headlamp lens','#d8e4db',.25,.2);ivory=mat('California license','#e4e4d6',.7);iron=mat('painted iron','#3c4441',.6,.35);green=mat('SF parking green','#344f41',.62);display=mat('meter LCD','#577973',.28,.2);yellow=mat('hydrant ochre','#b88b39',.7);leather=mat('bicycle saddle','#493a2e',.72)
def face(points,material):
 v,f=B.setdefault((PART,material),[[],[]]);n=len(v);v.extend(points);f.append(tuple(range(n,n+len(points))))
def box(x,y,z,w,d,h,m,bevel=0):
 if bevel:
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));o=bpy.context.object;o.dimensions=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);mod=o.modifiers.new('edge highlight','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name);capture(o,m);return
 points=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:face([points[i] for i in ids],m)
def capture(obj,m):
 verts=[obj.matrix_world@v.co for v in obj.data.vertices]
 for poly in obj.data.polygons:face([tuple(verts[i]) for i in poly.vertices],m)
 bpy.data.objects.remove(obj,do_unlink=True)
def cyl(x,y,z,r,h,m,n=16,axis='Z'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=(x,y,z));o=bpy.context.object
 if axis=='X':o.rotation_euler.y=math.pi/2
 elif axis=='Y':o.rotation_euler.x=math.pi/2
 bpy.context.view_layer.update();capture(o,m)
def rod(a,b,r,m,n=8):
 a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();bpy.context.view_layer.update();capture(o,m)
def ring(x,y,z,major,minor,m):
 bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=28,minor_segments=8,location=(x,y,z),rotation=(0,math.pi/2,0));capture(bpy.context.object,m)
def shell(sections,m):
 rings=[]
 for y,w,lo,hi in sections:rings.append([(-w,y,lo),(w,y,lo),(w,y,hi),(-w,y,hi)])
 face(list(reversed(rings[0])),m);face(rings[-1],m)
 for a,b in zip(rings,rings[1:]):
  for i in range(4):face([a[i],a[(i+1)%4],b[(i+1)%4],b[i]],m)
def car(kind):
 global PART
 PART=kind
 suv=kind=='Estate';compact=kind=='Hatchback';length=4.6 if not compact else 4.0
 front=length/2;back=-front;wh=.89;belt=.94 if suv else .86;roof=1.73 if suv else 1.42
 shell([(back,.67,.40,.63),(back+.25,.86,.36,belt-.10),(-1.38,.94,.38,belt),(.95,.94,.36,belt),(front-.25,.84,.40,.74),(front,.66,.46,.67)],paint)
 box(0,back+.18,.43,1.62,.15,.15,black,.04);box(0,front-.14,.45,1.66,.16,.13,black,.03)
 # Tapered cabin and a sloped windshield, independent of the body paint.
 cabinRear=-1.5 if suv or compact else -1.1;cabinFront=.98;roofRear=cabinRear+.25;roofFront=.35
 verts=[(-.85,cabinRear,belt),(.85,cabinRear,belt),(.85,cabinFront,belt),(-.85,cabinFront,belt),(-.68,roofRear,roof),(.68,roofRear,roof),(.66,roofFront,roof),(-.66,roofFront,roof)]
 for ids in [(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]:face([verts[i] for i in ids],paint)
 face([(-.61,roofFront+.055,roof-.07),(.61,roofFront+.055,roof-.07),(.77,cabinFront+.008,belt+.095),(-.77,cabinFront+.008,belt+.095)],glass)
 face([(-.61,roofRear-.035,roof-.085),(-.78,cabinRear-.008,belt+.11),(.78,cabinRear-.008,belt+.11),(.61,roofRear-.035,roof-.085)],glass)
 for side in [-1,1]:
  # Each door gets its own inset trapezoid, thin pillars, handles and shutlines.
  for rear,forw in [(cabinRear+.13,-.28),(-.19,cabinFront-.13)]:
   rr=roofRear+.1 if rear<-.5 else rear;ff=roofFront-.08 if forw>.4 else forw
   face([(side*.858,rear,belt+.10),(side*.858,forw,belt+.10),(side*.691,ff,roof-.08),(side*.702,rr,roof-.08)],glass)
   rod((side*.87,rear,belt+.02),(side*.87,forw,belt+.02),.018,chrome)
   box(side*.945,rear+.30,belt-.15,.035,.22,.035,chrome,.01)
  for yy in [-.24,cabinFront]:rod((side*.947,yy,.47),(side*.947,yy,belt-.08),.010,black,6)
  box(side*1.005,.63,belt+.14,.25,.20,.14,paint,.045)
  box(side*.965,.60,belt+.135,.01,.15,.095,glass)
  box(side*.91,0,.38,.095,length-.75,.12,black,.025)
  for y in [-1.37,1.34 if not compact else 1.15]:
   cyl(side*.91,y,.36,.34,.22,rubber,32,'X');ring(side*1.026,y,.36,.22,.025,chrome);cyl(side*1.027,y,.36,.195,.018,iron,24,'X');cyl(side*1.045,y,.36,.073,.035,chrome,16,'X')
   for k in range(5):
    a=k*math.tau/5;rod((side*1.051,y+math.sin(a)*.06,.36+math.cos(a)*.06),(side*1.051,y+math.sin(a)*.19,.36+math.cos(a)*.19),.022,chrome,6)
  box(side*.57,front-.03,.665,.40,.035,.14,lamp,.03);box(side*.77,front-.09,.57,.11,.03,.055,amber,.01);box(side*.59,back+.03,.68,.37,.035,.15,red,.02)
 box(0,front+.007,.53,.69,.025,.105,black,.02)
 for z in [.50,.535,.57]:box(0,front+.024,z,.64,.01,.012,chrome)
 box(0,back-.009,.555,.32,.015,.13,ivory,.012);box(0,front+.022,.46,.32,.015,.12,ivory,.01)
 if suv:
  for side in [-1,1]:rod((side*.61,-1.25,roof+.055),(side*.61,.31,roof+.055),.022,chrome)
 if not suv and not compact:box(0,back+.52,.82,1.35,.65,.085,paint,.03)
def meter():
 global PART;PART='ParkingMeter'
 cyl(0,0,.68,.042,1.36,chrome,12);cyl(0,0,.08,.075,.16,iron,12)
 box(0,0,1.47,.25,.20,.47,iron,.065);box(0,-.11,1.53,.17,.016,.18,display,.02);box(0,-.114,1.38,.08,.01,.026,black)
 box(0,-.12,1.30,.115,.022,.04,chrome,.012);box(0,0,1.745,.20,.17,.025,black)
def hydrant():
 global PART;PART='Hydrant'
 cyl(0,0,.41,.14,.62,yellow,16);cyl(0,0,.1,.22,.08,yellow,12);cyl(0,0,.68,.19,.075,yellow,16)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.17,location=(0,0,.73));capture(bpy.context.object,yellow)
 for side in [-1,1]:cyl(side*.195,0,.48,.078,.20,yellow,10,'X');cyl(side*.30,0,.48,.105,.07,yellow,8,'X')
 cyl(0,-.19,.40,.12,.16,yellow,12,'Y');cyl(0,-.28,.40,.055,.04,iron,6,'Y')
def bicycle():
 global PART;PART='Bicycle'
 for yy in [-.52,.56]:
  ring(0,yy,.35,.318,.026,rubber);ring(0,yy,.35,.291,.01,chrome);cyl(0,yy,.35,.028,.11,chrome,10,'X')
  for k in range(16):
   a=k*math.tau/16;rod((.035,yy,.35),(0,yy+math.cos(a)*.286,.35+math.sin(a)*.286),.0025,chrome,4)
 pedal=(0,0,.31);seat=(0,-.19,.88);head=(0,.40,.83);rear=(0,-.52,.35);front=(0,.56,.35)
 for a,b in [(pedal,seat),(seat,head),(head,pedal),(seat,rear),(rear,pedal),(head,front)]:rod(a,b,.019,green,10)
 rod(seat,(0,-.19,1.0),.017,chrome);box(0,-.24,1.025,.17,.29,.045,leather,.025)
 rod(head,(0,.42,1.04),.015,chrome);rod((-.25,.45,1.06),(.25,.45,1.06),.015,chrome)
 for side in [-1,1]:rod((side*.16,.45,1.06),(side*.29,.45,1.06),.022,black)
 rod((-.13,0,.31),(.13,0,.31),.016,chrome);box(.14,.10,.31,.10,.20,.023,black)
def bin_():
 global PART;PART='LitterBin'
 cyl(0,0,.43,.24,.80,iron,16);cyl(0,0,.06,.27,.10,iron,16)
 for k in range(14):
  a=k*math.tau/14;rod((math.sin(a)*.246,math.cos(a)*.246,.12),(math.sin(a)*.246,math.cos(a)*.246,.78),.014,chrome,6)
 cyl(0,0,.88,.275,.10,iron,16);box(0,-.24,.92,.30,.04,.10,black)
for name in ['Sedan','Hatchback','Estate']:car(name)
meter();hydrant();bicycle();bin_()
for index,part in enumerate(dict.fromkeys(k[0] for k in B)):
 parent=bpy.data.objects.new(part,None);bpy.context.collection.objects.link(parent);parent.location=(index*6,0,0);parents[part]=parent
for (part,m),(v,f) in B.items():
 mesh=bpy.data.meshes.new(part+' '+m);mesh.from_pydata(v,[],f);mesh.update();bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 o=bpy.data.objects.new(part+' / '+m,mesh);bpy.context.collection.objects.link(o);o.parent=parents[part];o.data.materials.append(M[m])
 for poly in mesh.polygons:poly.use_smooth=False
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Pacific skylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.54,.72,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(4,-8,13));sun=bpy.context.object;sun.data.energy=1800;sun.data.size=10;sun.rotation_euler=(Vector((6,0,0))-sun.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(9,-12,6));camera=bpy.context.object;camera.rotation_euler=(Vector((6,0,.6))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=44;scene.camera=camera;scene.render.resolution_x=1500;scene.render.resolution_y=850;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/cerebral-streetlife.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for parent in parents.values():
 parent.select_set(True)
 for child in parent.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'streetlife.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6)
scene.render.filepath=str(ROOT/'art/reviews/cerebral-streetlife.png');bpy.ops.render.render(write_still=True)
report={name:sum(sum(len(p.vertices)-2 for p in c.data.polygons) for c in obj.children) for name,obj in parents.items()};(OUT/'streetlife.meta.json').write_text(json.dumps(report,indent=2));print(report)
