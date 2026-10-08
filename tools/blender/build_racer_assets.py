"""Playable racer kit and garage using the existing Cerebral Victorian kit.
All original geometry. Game-local +Y up / +Z forward. No baked beauty render swap.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
# Reuse the map's actual facade builders, materials, textured wood and ornaments.
source=ROOT/'tools/blender/build_cerebral_heroes.py'
namespace={'__file__':str(source),'__name__':'garage_architecture'}
exec(source.read_text().split('# Verified OSM frontage')[0],namespace)
g=namespace
import sys
sys.path.insert(0,str(ROOT/'tools/blender'))
from racer_garage import build_architecture, finish_architecture, add_fixtures
print('Building close-view Victorian architecture',flush=True)
build_architecture(g)
# Finalize the same material batches and UVs as the map.
garage=bpy.data.objects.new('Garage',None);bpy.context.collection.objects.link(garage)
for (part,m),(verts,faces,uvs) in g['BATCH'].items():
 mesh=bpy.data.meshes.new(part+' / '+m);mesh.from_pydata(verts,[],faces);mesh.update();uv=mesh.uv_layers.new(name='Architectural metres')
 for p,coords in zip(mesh.polygons,uvs):
  for i,co in zip(p.loop_indices,coords):uv.data[i].uv=co
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 o=bpy.data.objects.new(part+' / '+m,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(g['M'][m]);o.parent=garage
 finish_architecture(o)
# Use local modeling helpers from the earlier study without its old scene.
old=(ROOT/'tools/blender/create_garage_study.py').read_text()
helpers=old[old.index('def xyz'):old.index('# Victorian facade')]
# Avoid deleting or replacing the architecture just created.
exec(helpers,globals())
# Remove the unused old root only; the garage above owns the new architecture.
bpy.data.objects.remove(roots['Garage'],do_unlink=True);roots['Garage']=garage
add_fixtures(garage,g['M'])
print('Building the open-cockpit roadster',flush=True)
exec(old[old.index('# Coupe, modeled'):old.index('# Jensen:')],globals())
vehicle=roots['Coupe'];vehicle.name='Vehicle'
# The entire car is an open cockpit: an actual visible driver in every paint variant.
for o in list(vehicle.children):
 if any(o.name.startswith(n) for n in ['Cabin glass','Ivory roof','A pillar','C pillar','B pillar','Window surround']):bpy.data.objects.remove(o,do_unlink=True)
# Open the original coachwork for a real recessed cockpit. The closed coupe
# shell otherwise passes straight through the seats and driver's waist.
parent=vehicle
body=next(o for o in vehicle.children if o.name.startswith('Coachbuilt body'))
cutter=box('Cockpit cutter',(0,1.11,-.21),(1.36,.99,1.58),black,.145)
bpy.context.view_layer.objects.active=cutter
for mod in list(cutter.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active=body
cut=body.modifiers.new('Open passenger cell','BOOLEAN');cut.operation='DIFFERENCE';cut.object=cutter
bpy.ops.object.modifier_apply(modifier=cut.name);bpy.data.objects.remove(cutter,do_unlink=True)
# A properly connected, low roadster windscreen. Its four corners coincide
# exactly with the slim metal surround; the coupe's old A-pillars are gone.
wind=mat('Windscreen','#c1d9d7',.09,.025)
p=wind.node_tree.nodes.get('Principled BSDF');p.inputs['Alpha'].default_value=.19;wind.surface_render_method='DITHERED';wind.diffuse_color=(*wind.diffuse_color[:3],.19)
windpoints=[(-.685,.91,.65),(.685,.91,.65),(.622,1.25,.415),(-.622,1.25,.415)]
mesh=bpy.data.meshes.new('Roadster windscreen');mesh.from_pydata([xyz(p) for p in windpoints],[],[(0,1,2,3)]);mesh.update()
w=bpy.data.objects.new('Windscreen',mesh);bpy.context.collection.objects.link(w);finish(w,'Windscreen',wind)
line('Windscreen surround',windpoints+[windpoints[0]],.019,chrome)
line('Windscreen lower seal',[(-.686,.909,.651),(.686,.909,.651)],.012,rubber)
for side in [-1,1]:
 box('Windscreen foot',(side*.677,.898,.644),(.085,.024,.115),chrome,.012)
leather=mat('Saddle leather','#79523f',.60);stitch=mat('Leather stitching','#ab8a69',.84)
box('Cabin tub',(0,.565,-.19),(1.39,.14,1.59),black,.08)
for side in [-1,1]:
 ell('Seat cushion',(side*.35,.682,-.39),(.241,.087,.286),leather)
 loft('Bucket seat back',[(.68,.205,.057,side*.35,-.68),(.79,.242,.075,side*.35,-.695),(1.01,.220,.066,side*.35,-.74),(1.12,.183,.057,side*.35,-.77),(1.145,.145,.034,side*.35,-.77)],leather)
 ell('Seat back insert',(side*.35,.905,-.659),(.155,.179,.031),leather)
 for i in [-1,0,1]:
  line('Seat cushion seam',[(side*.35+i*.10,.753,-.57),(side*.35+i*.105,.768,-.38),(side*.35+i*.10,.741,-.16)],.0028,stitch)
  line('Seat back seam',[(side*.35+i*.089,.76,-.62),(side*.35+i*.101,.895,-.62),(side*.35+i*.087,1.052,-.69)],.0028,stitch)
 line('Cockpit side rim',[(side*.61,.87,-.98),(side*.72,.88,-.78),(side*.73,.88,-.30),(side*.71,.89,.45)],.016,chrome)
line('Cockpit rear rim',[(-.61,.87,-.98),(-.36,.89,-1.04),(0,.90,-1.065),(.36,.89,-1.04),(.61,.87,-.98)],.016,chrome)
box('Dashboard',(0,.90,.35),(1.39,.20,.19),black,.06)
for x in [-.45,-.25]:cyl('Instrument bezel',(x,.947,.238),.067,.02,chrome,(0,.2,-1));cyl('Instrument dial',(x,.947,.222),.054,.018,black,(0,.2,-1))
steering=bpy.data.objects.new('Steering',None);bpy.context.collection.objects.link(steering);steering.parent=vehicle
parent=steering
line('Steering wheel',[(-.35+math.cos(i*math.pi/24)*.19,.99+math.sin(i*math.pi/24)*.14,.04+math.sin(i*math.pi/24)*.08) for i in range(49)],.02,black)
for i in range(3):
 a=i*math.tau/3;line('Steering spoke',[(-.35,.99,.04),(-.35+math.cos(a)*.18,.99+math.sin(a)*.13,.04+math.sin(a)*.08)],.012,chrome)
# Steering rotates about its hub, while all authored geometry stays in place.
steering_children=[(child,child.matrix_world.copy()) for child in steering.children]
steering.location=xyz((-.35,.99,.04));bpy.context.view_layer.update()
for child,world in steering_children:child.matrix_world=world
# Detail physically modeled tire tread, tread sidewalls, panel shut lines, fuel cap.
parent=vehicle
for s in [-1,1]:
 for z in [-1.27,1.22]:
  for i in range(48):
   a=i*math.tau/48
   line('Tire groove',[(s*.82,.40+math.cos(a)*.385,z+math.sin(a)*.385),(s*.98,.40+math.cos(a+.024)*.385,z+math.sin(a+.024)*.385)],.0035,black)
line('Hood seam',[(-.44,.80,.79),(-.48,.81,1.16),(-.38,.72,1.68),(0,.715,1.77),(.38,.72,1.68),(.48,.81,1.16),(.44,.80,.79)],.005,black)
cyl('Fuel cap',(.87,.76,-.98),.064,.012,chrome,(1,.4,0))
# Independent wheel pivots preserve steering, spin and hover folding in the game.
wheel_names=['Road tire','Alloy dish','Wheel recess','Alloy spoke','Hub cap','Lug bolt','Tire groove']
for s in [-1,1]:
 for z in [-1.27,1.22]:
  root=bpy.data.objects.new(('Wheel_F' if z>0 else 'Wheel_R')+('L' if s<0 else 'R'),None);bpy.context.collection.objects.link(root);root.parent=vehicle;root.location=xyz((s*.9,.4,z));bpy.context.view_layer.update()
  for obj in list(vehicle.children):
   if obj==root or not any(obj.name.startswith(n) for n in wheel_names):continue
   # Curves' points are in world-local coordinates; average actual geometry.
   if obj.type=='CURVE':points=[Vector(p.co[:3]) for sp in obj.data.splines for p in sp.points];center=sum(points,Vector())/len(points)
   else:center=obj.location
   if abs(center.x-s*.9)<.26 and abs(-center.y-z)<.5:
    world=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=world
# Detailed, coherent founder sculptures share the same standing and driving wardrobe.
bpy.data.objects.remove(roots['Jensen'],do_unlink=True)
import importlib.util
spec=importlib.util.spec_from_file_location('racer_characters',ROOT/'tools/blender/racer_characters.py')
characters=importlib.util.module_from_spec(spec);spec.loader.exec_module(characters)
print('Sculpting standing and seated drivers',flush=True)
actors=characters.build_actors()
print('Finalizing and batching model surfaces',flush=True)
# Convert curves, apply sculpt modifiers, then merge by material within rigid groups.
for obj in list(bpy.context.scene.objects):
 if obj.type not in ['CURVE','MESH']:continue
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 if obj.type=='CURVE':bpy.ops.object.convert(target='MESH')
 for mod in list(obj.modifiers):
  try:bpy.ops.object.modifier_apply(modifier=mod.name)
  except RuntimeError:pass
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
# Keep wheel origins and each actor independent for runtime posing and animation.
for root in [garage,vehicle,steering,*actors,*[o for o in vehicle.children if o.name.startswith('Wheel_')]]:
 batches={}
 for o in list(root.children):
  if o.type=='MESH' and len(o.data.materials)==1:batches.setdefault(o.data.materials[0].name,[]).append(o)
 for material,parts in batches.items():
  if len(parts)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in parts:o.select_set(True)
  bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();parts[0].name=root.name+' / '+material
# Save separate loadable assets: gameplay never loads the garage architecture.
def export(path,roots):
 bpy.ops.object.select_all(action='DESELECT')
 for root in roots:
  root.select_set(True)
  for child in root.children_recursive:child.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
OUT=ROOT/'public/assets/models'
print('Exporting compressed racer kit and garage',flush=True)
export(OUT/'racer-kit.glb',[vehicle,*actors]);export(OUT/'racer-garage.glb',[garage])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/racers-and-garage.blend'),compress=True)
print('RACER_ASSETS_READY')
