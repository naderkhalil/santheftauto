"""Apply terrain footings to existing Cerebral GLBs/source without regenerating detail.
The main generator now makes these footings directly. This migration preserves
the reviewed geometry and only lowers original footprint wall-bottom vertices.
"""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/assets/cerebral-valley'
data=json.loads((ROOT/'art/references/cerebral-valley-layout.json').read_text())
background=json.loads((OUT/'background-buildings.json').read_text())
buildings={str(b['id']):b for b in data['buildings']+background['buildings']}
log=json.loads((ROOT/'art/references/cerebral-neighborhood-model-log.json').read_text())
g=data['elevationGrid'];nx=g['columns'];ny=g['rows'];v=g['values']
def ground(x,y):
 xx=max(0,min(nx-1.001,(x-g['minX'])/(g['maxX']-g['minX'])*(nx-1)));yy=max(0,min(ny-1.001,(g['maxZ']-y)/(g['maxZ']-g['minZ'])*(ny-1)));ix,iy=int(xx),int(yy);fx,fy=xx-ix,yy-iy
 return (v[iy*nx+ix]*(1-fx)+v[iy*nx+ix+1]*fx)*(1-fy)+(v[(iy+1)*nx+ix]*(1-fx)+v[(iy+1)*nx+ix+1]*fx)*fy
changes=[]
for item in log:
 if 'building' not in item:continue
 b=buildings[str(item['building'])];base=item['baseHeight']
 for p in b['polygon']:
  newz=min(base,ground(p['x'],p['z'])-.22)
  if newz<base-.001:changes.append((Vector((p['x'],p['z'],base)),newz))
kd=KDTree(len(changes))
for i,(co,newz) in enumerate(changes):kd.insert(co,i)
kd.balance()
def anchor():
 count=0
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH':continue
  matrix=ob.matrix_world;inverse=matrix.inverted();modified={}
  for vert in ob.data.vertices:
   world=matrix@vert.co;co,index,distance=kd.find(world)
   if distance<.012:
    delta=changes[index][1]-world.z;world.z=changes[index][1];vert.co=inverse@world;modified[vert.index]=delta;count+=1
  if modified and ob.data.uv_layers.active:
   uv=ob.data.uv_layers.active.data
   for loop in ob.data.loops:
    if loop.vertex_index in modified:uv[loop.index].uv.y+=modified[loop.vertex_index]/4
  ob.data.update()
 print('FOOTING_VERTICES',count,flush=True)
def export(path):
 bpy.ops.object.select_all(action='DESELECT')
 for ob in bpy.context.scene.objects:
  if ob.type=='MESH':ob.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/source/cerebral-neighborhood.blend'))
bpy.context.preferences.filepaths.save_version=0;anchor()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/cerebral-neighborhood.blend'),compress=True)
export(OUT/'neighborhood.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'neighborhood-lod.glb'));anchor();export(OUT/'neighborhood-lod.glb')
meta=json.loads((OUT/'neighborhood.meta.json').read_text());meta['bytes']=(OUT/'neighborhood.glb').stat().st_size;meta['lodBytes']=(OUT/'neighborhood-lod.glb').stat().st_size;meta['terrainFootings']=True;(OUT/'neighborhood.meta.json').write_text(json.dumps(meta,indent=2)+'\n')
