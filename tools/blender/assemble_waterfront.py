"""Assemble the actual editable waterfront assets into one framed Blender scene.
Run after the three waterfront generators. Runtime uses their separate GLBs.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene

def append_asset(path,name,offset=(0,0,0)):
    collection=bpy.data.collections.new(name);scene.collection.children.link(collection)
    with bpy.data.libraries.load(str(path),link=False) as (source,target):target.objects=source.objects
    accepted=[]
    for ob in target.objects:
        if not ob or ob.type!='MESH':continue
        if not ob.get('asset_section') and ob.get('asset_role')!='landmark_geometry':continue
        collection.objects.link(ob);ob.location+=Vector(offset);accepted.append(ob)
    return accepted

ferry=append_asset(ROOT/'art/source/ferry-building.blend','01 Ferry Building',(730,250,2.3))
quay=append_asset(ROOT/'art/source/embarcadero.blend','02 Embarcadero and historic piers')
bridge=append_asset(ROOT/'art/source/bay-bridge.blend','03 Bay Bridge and eastern islands')
assert ferry and quay and bridge, 'Generate each component before assembly'
planting=bpy.data.collections.new('04 PortWalk date palms');scene.collection.children.link(planting)
with bpy.data.libraries.load(str(ROOT/'art/blender/date-palm.blend'),link=False) as (source,target):
    target.objects=[name for name in source.objects if name.startswith('date-palm / ')]
parts=[ob for ob in target.objects if ob and ob.type=='MESH']
height=max(v.co.z for ob in parts for v in ob.data.vertices)-min(v.co.z for ob in parts for v in ob.data.vertices)
layout=json.loads((ROOT/'public/assets/waterfront/embarcadero.json').read_text())
anchors=layout['palmAnchors']+layout.get('southernPalmAnchors',[])
for i,anchor in enumerate(anchors):
    scale=(14.5+(i%4)*.8)/height
    for part in parts:
        ob=part.copy();ob.data=part.data;ob.name=f'PortWalk palm {i+1:02d} / '+part.name.split(' / ')[-1]
        ob.location=(anchor['x'],anchor['north'],anchor['height']);ob.scale=(scale,)*3;ob.rotation_euler.z=i*2.399;planting.objects.link(ob)
# Review context is separate from the selectable production architecture.
context=bpy.data.collections.new('05 Review context — not exported');scene.collection.children.link(context)
def context_mesh(ob):
    for c in list(ob.users_collection):c.objects.unlink(ob)
    context.objects.link(ob);ob['asset_role']='review_stage'
water=bpy.data.materials.new('Review / Bay water');water.diffuse_color=(.025,.29,.34,1);water.use_nodes=True
bsdf=water.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=(.025,.29,.34,1);bsdf.inputs['Roughness'].default_value=.29;bsdf.inputs['Metallic'].default_value=.18
bpy.ops.mesh.primitive_plane_add(size=2,location=(2300,270,-2));ob=bpy.context.object;ob.scale=(1700,2100,1);ob.name='Review bay water';ob.data.materials.append(water);context_mesh(ob)
land=bpy.data.materials.new('Review / sidewalk and road');land.diffuse_color=(.19,.205,.195,1)
bpy.ops.mesh.primitive_plane_add(size=2,location=(541,180,1.85));ob=bpy.context.object;ob.scale=(62,950,1);ob.name='Review inland road edge';ob.data.materials.append(land);context_mesh(ob)
# The runtime race ribbon fills this deliberate opening in the PortWalk.
# Include its surface for the combined Blender review, without exporting it.
bpy.ops.mesh.primitive_plane_add(size=2,location=(644,250,2.13));ob=bpy.context.object;ob.scale=(41,7.7,1);ob.name='Review Market Street approach';ob.data.materials.append(land);context_mesh(ob)
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
world=bpy.data.worlds.new('Waterfront afternoon study');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.43,.63,.84,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.70;scene.world=world
bpy.ops.object.light_add(type='SUN',location=(390,20,500));sun=bpy.context.object;sun.name='Pacific afternoon sunlight';sun.data.energy=2.3;sun.data.angle=.07;sun.rotation_euler=(.48,-.62,-.20)
bpy.ops.object.light_add(type='AREA',location=(590,275,75));fill=bpy.context.object;fill.name='Soft reflected plaza light';fill.data.energy=15000;fill.data.shape='DISK';fill.data.size=150;fill.rotation_euler=(Vector((730,250,25))-fill.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(555,420,98));camera=bpy.context.object;camera.name='Ferry Building and Bay Bridge';camera.rotation_euler=(Vector((748,245,28))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=34;camera.data.clip_end=5500;scene.camera=camera
scene.render.resolution_x=1800;scene.render.resolution_y=1150;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene['readme']='Editable San Francisco waterfront. Collections separate Ferry Building, historic piers, Bay Bridge and instanced palms. +X east / +Y north / +Z up. Rebuild individual scripts for game exports. Review water/lights are not game assets.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.clip_end=5500;space.region_3d.view_perspective='CAMERA';space.region_3d.view_camera_zoom=0;space.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=None
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/waterfront.blend'))
print('MASTER_WATERFRONT_SAVED',len(ferry),len(quay),len(bridge),len(anchors),flush=True)
if '--skip-render' not in sys.argv:
    scene.render.filepath=str(ROOT/'art/reviews/waterfront-master.png');bpy.ops.render.render(write_still=True)
