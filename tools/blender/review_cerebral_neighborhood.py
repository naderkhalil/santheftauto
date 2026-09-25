"""Reframe and visually audit saved Cerebral Valley neighborhood without rebuilding."""
import bpy,json,math,sys
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/assets/cerebral-valley';REVIEW=ROOT/'art/reviews'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/source/cerebral-neighborhood.blend'))
bpy.context.preferences.filepaths.save_version=0
data=json.loads((ROOT/'art/references/cerebral-valley-layout.json').read_text())
g=data['elevationGrid'];nx=g['columns'];ny=g['rows'];v=g['values']
def ground(x,y):
 xx=max(0,min(nx-1.001,(x-g['minX'])/(g['maxX']-g['minX'])*(nx-1)));yy=max(0,min(ny-1.001,(g['maxZ']-y)/(g['maxZ']-g['minZ'])*(ny-1)));ix,iy=int(xx),int(yy);fx,fy=xx-ix,yy-iy
 return (v[iy*nx+ix]*(1-fx)+v[iy*nx+ix+1]*fx)*(1-fy)+(v[(iy+1)*nx+ix]*(1-fx)+v[(iy+1)*nx+ix+1]*fx)*fy
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
if '--compact' in sys.argv:
 grouped={}
 for ob in objects:grouped.setdefault((ob['spatial_block'],ob.data.materials[0].name),[]).append(ob)
 objects=[]
 for (part,mat),items in grouped.items():
  bpy.ops.object.select_all(action='DESELECT')
  for ob in items:ob.select_set(True)
  bpy.context.view_layer.objects.active=items[0];roles=sorted(set(ob['role'] for ob in items))
  if len(items)>1:bpy.ops.object.join()
  ob=items[0];ob.name=part+' / '+mat;ob['roles']=roles;objects.append(ob)
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objects:ob.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/cerebral-neighborhood.blend'),compress=True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/'neighborhood.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
 report=json.loads((OUT/'neighborhood.meta.json').read_text());report['meshes']=len(objects);report['bytes']=(OUT/'neighborhood.glb').stat().st_size;(OUT/'neighborhood.meta.json').write_text(json.dumps(report,indent=2)+'\n')
 print('COMPACT_MESHES',len(objects),flush=True)
def mat(name,c):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*c,1);return m
def mesh(name,verts,faces,m):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(m)
terrain=mat('review neutral sidewalk context',(.34,.32,.29));road=mat('review asphalt context',(.17,.19,.19))
verts=[(g['minX']+(g['maxX']-g['minX'])*x/(nx-1),g['maxZ']-(g['maxZ']-g['minZ'])*y/(ny-1),v[y*nx+x]-.06) for y in range(ny) for x in range(nx)]
faces=[(y*nx+x,y*nx+x+1,(y+1)*nx+x+1,(y+1)*nx+x) for y in range(ny-1) for x in range(nx-1)];mesh('temporary terrain context',verts,faces,terrain)
for street in data['streets']:
 verts=[];faces=[];width=street['width'];pts=street['points']
 for a,b in zip(pts,pts[1:]):
  dx,dy=b['x']-a['x'],b['z']-a['z'];ll=math.hypot(dx,dy)
  if ll<.01:continue
  xx,yy=-dy/ll*width/2,dx/ll*width/2;i=len(verts)
  for p,sg in [(a,1),(a,-1),(b,-1),(b,1)]:x,y=p['x']+sg*xx,p['z']+sg*yy;verts.append((x,y,ground(x,y)+.02))
  faces.append((i,i+1,i+2,i+3))
 mesh('temporary '+street['name'],verts,faces,road)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
cam=scene.camera;cam.data.clip_end=5000
views=[('cerebral-neighborhood-page-study',(-781,-423,ground(-781,-423)+4.0),(-744,-417,ground(-744,-417)+7),29),('cerebral-neighborhood-alamo-study',(-1037,-146,ground(-1037,-146)+4),(-979,-137,ground(-979,-137)+8),29),('cerebral-neighborhood-aerial',(-670,-1170,910),(-670,-220,45),37),('cerebral-hayes-restaurants',(-73,10,ground(-73,10)+2.5),(-70.5,-1.13,24.3),31)]
if '--stores-only' in sys.argv:views=views[-1:]
if '--parks-only' in sys.argv:views=[('cerebral-duboce-perimeter',(-688,-744,ground(-688,-744)+4),(-881,-785,ground(-881,-785)+7),35)]
for name,loc,target,lens in views:
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)
