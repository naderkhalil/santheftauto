"""Fast anatomy/hair review without building the character bodies.

Blender --background --factory-startup -t 4 --python this_file --
    --ids dario,sam,elon,jensen,mira,feifei,mark --out /tmp/racer-heads

Writes a head-only .blend, .glb, and front/three-quarter PNGs. Review outputs are
staged separately from the production racer asset until visual approval.
"""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/blender'))
from racer_characters import Sculptor
from racer_faces import FACE_SPECS


def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser=argparse.ArgumentParser()
    parser.add_argument('--ids',default=','.join(FACE_SPECS))
    parser.add_argument('--out',default='/tmp/racer-heads')
    opts=parser.parse_args(args)
    ids=[ident.strip() for ident in opts.ids.split(',') if ident.strip()]
    if not ids or any(ident not in FACE_SPECS for ident in ids):
        raise ValueError('Choose one or more of '+', '.join(FACE_SPECS))
    out=Path(opts.out).resolve();out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    actors=[]
    for i,ident in enumerate(ids):
        print('HEAD',ident,flush=True)
        actor=Sculptor(ident,False);actor.face()
        actor.root.location.x=(i-(len(ids)-1)/2)*.43
        actors.append(actor)
        bpy.ops.object.text_add(location=(actor.root.location.x,-.05,1.15),rotation=(math.pi/2,0,0))
        text=bpy.context.object;text.name='Proof label '+ident
        text.data.body=ident.upper();text.data.align_x='CENTER';text.data.size=.027
    scene=bpy.context.scene;scene.render.engine='CYCLES'
    scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.world.use_nodes=True
    background=scene.world.node_tree.nodes['Background']
    background.inputs[0].default_value=(.20,.23,.26,1)
    background.inputs[1].default_value=.35
    for name,pos,power,size in [('Key',(-3,-4,4),800,2.5),('Fill',(3,-2,3),220,3.),('Rim',(1,1,4),650,2.)]:
        bpy.ops.object.light_add(type='AREA',location=pos)
        light=bpy.context.object;light.name=name
        light.data.energy=power;light.data.shape='DISK';light.data.size=size
        light.rotation_euler=(Vector((0,0,1.6))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(0,-4,1.58))
    camera=bpy.context.object
    camera.rotation_euler=(Vector((0,0,1.58))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=max(.60,len(ids)*.43+.16)
    scene.camera=camera
    scene.render.resolution_x=max(800,500*len(ids))
    scene.render.resolution_y=round(scene.render.resolution_x*.93/camera.data.ortho_scale)
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG'
    bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
    scene.render.filepath=str(out)+'-front.png';bpy.ops.render.render(write_still=True)
    for actor in actors:actor.root.rotation_euler.z=math.radians(-30)
    scene.render.filepath=str(out)+'-three-quarter.png';bpy.ops.render.render(write_still=True)
    for actor in actors:actor.root.rotation_euler.z=0
    bpy.ops.object.select_all(action='DESELECT')
    for actor in actors:
        actor.root.select_set(True)
        for obj in actor.root.children:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out.with_suffix('.glb')),export_format='GLB',
        use_selection=True,export_apply=True,export_yup=True,export_cameras=False,
        export_lights=False,export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6)
    print('HEAD PROOF COMPLETE',out,flush=True)


if __name__=='__main__':main()
