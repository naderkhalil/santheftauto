"""Build an original Powell combination cable car from public museum references.

Run with Blender 4.5: blender --background --python tools/blender/create_cable_car.py
Game coordinates: +Y up, +Z forward. Ground contact at origin; 2.25 x 7.2 m.
The saved .blend is editable; all visible meshes are exported in material batches.
"""
import bpy
import bmesh
import math
import json
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/models'
SOURCE = ROOT / 'art/source'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
random.seed(16)

def srgb(hex):
    values = [int(hex[i:i+2], 16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)

def material(name, color, rough=.5, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = srgb(color)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = srgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m

burgundy=material('Cable car / oxblood enamel','#741e29',.31,.08)
cream=material('Cable car / warm ivory paint','#f3e6c5',.48)
brass=material('Cable car / polished aged brass','#cfa04f',.27,.75)
wood=material('Cable car / varnished white oak','#a2662c',.39)
iron=material('Cable car / black iron','#202b2a',.53,.65)
glass=material('Cable car / carriage glass','#9ec2cc',.12,.06)
glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.24
glass.surface_render_method='DITHERED'
lamp=material('Cable car / warm lamp lenses','#fff1bd',.19,.1)
lamp.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=srgb('#fff1bd')
lamp.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.3

# A small, original timber texture gives the slats grain at close driving distance.
# Geometry carries ordinary UVs: no Blender-only shader is required at runtime.
import numpy as np
tex_size=512
rng=np.random.default_rng(1606)
xx,yy=np.meshgrid(np.linspace(0,1,tex_size),np.linspace(0,1,tex_size))
warp=xx+.009*np.sin(yy*22)+.002*np.sin(yy*74+xx*11)
grain=np.sin(warp*890+np.sin(warp*160)*2)*.020 + np.sin(warp*165)*.037
grain+=rng.normal(0,.008,(tex_size,tex_size))
grain+=.013*np.sin(yy*4.5+xx*7)
pixels=np.ones((tex_size,tex_size,4),dtype=np.float32)
for i,v in enumerate([.50,.254,.095]): pixels[:,:,i]=np.clip(v+grain*(1-i*.24),.015,.95)
timber=bpy.data.images.new('original_oak_grain',width=tex_size,height=tex_size,alpha=False)
timber.pixels.foreach_set(pixels.ravel())
timber.filepath_raw=str(OUT/'cable-car-oak.png');timber.file_format='PNG';timber.save();timber.pack()
node=wood.node_tree.nodes.new('ShaderNodeTexImage');node.image=timber
wood.node_tree.links.new(node.outputs['Color'],wood.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

parts=[]
def coord(v): return (v[0],-v[2],v[1])
def finish(obj,name,m,bevel=0,smooth=False):
    obj.name=name
    obj.data.materials.append(m)
    if bevel:
        mod=obj.modifiers.new('rounded manufactured edges','BEVEL');mod.width=bevel;mod.segments=1
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=obj.modifiers.new('weighted face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        for p in obj.data.polygons:p.use_smooth=True
    parts.append(obj)
    return obj

def box(name,pos,size,m,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=coord(pos))
    obj=bpy.context.object;obj.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,m,bevel)

def cylinder(name,pos,radius,length,m,axis=(0,1,0),verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=length,location=coord(pos))
    obj=bpy.context.object;direction=Vector(coord(axis))
    obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(direction)
    obj=finish(obj,name,m,.006 if radius>=.1 else 0,True)
    for p in obj.data.polygons:
        if len(p.vertices)>4:p.use_smooth=False
    return obj

def sphere(name,pos,scale,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=coord(pos))
    obj=bpy.context.object;obj.scale=(scale[0],scale[2],scale[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,m,0,True)

def rod(name,a,b,r,m=brass):
    va,vb=Vector(a),Vector(b)
    return cylinder(name,tuple((va+vb)/2),r,(vb-va).length,m,tuple((vb-va).normalized()),8)

def curve_roof(name,y,z,length,width,rise,thick,m):
    # A shallow barrel roof with real thickness and a rolled edge silhouette.
    verts=[];faces=[];n=24
    for end in [-1,1]:
        for lower in [0,1]:
            for i in range(n+1):
                x=-width/2+width*i/n
                h=y+rise*(1-(x/(width/2))**2)-lower*thick
                verts.append(coord((x,h,z+end*length/2)))
    ring=2*(n+1)
    for i in range(n):
        faces.extend([(i,i+1,ring+i+1,ring+i),
                      (n+1+i,ring+n+1+i,ring+n+2+i,n+2+i)])
        for e in [0,ring]:faces.append((e+i,e+n+1+i,e+n+2+i,e+i+1))
    faces.extend([(0,ring,ring+n+1,n+1),(n,2*n+1,ring+2*n+1,ring+n)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return finish(obj,name,m,.015,True)

def text(name,value,pos,width,height,m,face='front'):
    bpy.ops.object.text_add(location=coord(pos))
    obj=bpy.context.object;obj.data.body=value;obj.data.align_x='CENTER';obj.data.align_y='CENTER'
    obj.data.size=height;obj.data.extrude=0;obj.data.bevel_depth=0
    obj.data.resolution_u=3
    obj.rotation_euler=(math.pi/2,0,{'front':0,'back':math.pi,'right':math.pi/2,'left':-math.pi/2}[face])
    bpy.context.view_layer.update()
    if obj.dimensions.x>0:obj.scale.x=min(1,width/(obj.dimensions.x if face in ('front','back') else obj.dimensions.y))
    bpy.ops.object.convert(target='MESH');obj=bpy.context.object
    return finish(obj,name,m)

# Two bogies, wheel flanges and deep mechanical chassis visible beneath the deck.
box('riveted main chassis',(0,.53,0),(1.80,.30,6.64),iron)
for side in [-1,1]:
    box('side solebar',(side*.81,.45,0),(.13,.23,6.50),iron)
    for z in [-2.30,1.90]:
        box('bogie bearing saddle',(side*.76,.30,z),(.24,.22,1.22),iron)
        for zz in [z-.42,z+.42]:
            cylinder('steel rail wheel',(side*.78,.27,zz),.27,.15,iron,(1,0,0),20)
            cylinder('wheel flange',(side*.695,.27,zz),.291,.025,iron,(1,0,0),20)
            cylinder('brass axle cover',(side*.88,.27,zz),.095,.027,brass,(1,0,0),12)
        for k in range(3):box('leaf spring',(side*.87,.47+k*.027,z),(.08,.025,1.00-k*.1),iron,.007)
for z in [-2.72,-1.88,1.48,2.32]:rod('wheel axle',(-.90,.27,z),(.90,.27,z),.053,iron)
box('cable grip machinery',(0,.18,1.65),(.30,.24,.73),iron)

# The floor and narrow standing boards are real separate timbers.
box('cream deck rim',(0,.68,0),(2.14,.16,6.91),cream,.035)
for x in range(13):box('oak floor plank',(-.97+x*.162,.787,0),(.151,.060,6.73),wood,.008)
for side in [-1,1]:
    box('long running step',(side*1.035,.43,.60),(.18,.095,5.85),iron,.015)
    box('step brass wear strip',(side*1.111,.486,.60),(.025,.014,5.77),brass,.004)
    for z in [-2,-.5,1,2.5]:rod('step bracket',(side*.8,.55,z),(side*1.04,.40,z),.031,iron)
for z in [-3.53,3.53]:
    box('end black buffer',(0,.57,z),(1.91,.14,.12),iron,.045)
    box('end buffer brass lip',(0,.638,z),(1.71,.016,.14),brass,.006)

# Closed saloon occupies the rear half, not the middle as on California cars.
for side in [-1,1]:
    x=side*1.00
    box('burgundy saloon waist',(x,1.13,-1.63),(.095,.64,3.11),burgundy,.021)
    box('ivory lower waist stripe',(x+side*.056,.891,-1.63),(.018,.053,3.03),cream,.002)
    box('brass waist belt',(x+side*.060,1.43,-1.63),(.024,.026,3.14),brass,.004)
    for zi in range(4):
        z=-2.81+zi*.76
        box('raised saloon body panel',(x+side*.06,1.13,z),(.017,.40,.65),burgundy,.01)
        for yy in [.94,1.32]:box('gold panel moulding',(x+side*.075,yy,z),(.018,.014,.64),brass,.003)
        for zz in [-.32,.32]:box('gold panel upright',(x+side*.075,1.13,z+zz),(.018,.39,.014),brass,.003)
        box('saloon glazing',(x,1.94,z),(.015,.85,.61),glass,0)
        for zz in [-.345,.345]:box('ivory window stile',(x,1.96,z+zz),(.095,1.025,.07),cream,.01)
        for yy in [1.48,2.44]:box('ivory window rail',(x,yy,z),(.12,.075,.735),cream,.01)
        box('warm timber window inner sash',(x+side*.066,2.01,z),(.022,.026,.63),wood,.005)
        box('window bottom sill',(x+side*.022,1.51,z),(.16,.072,.72),wood,.01)
        box('brass window latch',(x+side*.085,2.01,z),(.034,.08,.016),brass,.003)
    # Long sign board below the clerestory keeps gold route lettering crisp.
    box('ivory route frieze',(side*.92,2.59,-.05),(.09,.20,6.15),cream,.018)
    text('carriage route lettering','POWELL & HYDE STS.',(side*.972,2.592,-.05),5.75,.145,burgundy,'right' if side>0 else 'left')
    # Small number and city name are original lettering, not a copied image.
    text('city side lettering','SAN FRANCISCO',(side*1.08,1.14,-1.65),2.62,.16,cream,'right' if side>0 else 'left')

# Bulkhead at the gripman's end: central door flanked by glazed lights.
for z in [-3.205,-.045]:
    box('saloon end waist',(0,1.12,z),(1.97,.65,.08),burgundy,.022)
    for xx in [-.66,0,.66]:
        box('end glazed panel',(xx,1.95,z),(.54,.87,.02),glass,0)
        for xoff in [-.305,.305]:box('end window upright',(xx+xoff,1.96,z),(.055,1.08,.10),cream,.009)
        for yy in [1.48,2.45]:box('end window horizontal',(xx,yy,z),(.64,.063,.10),cream,.009)
    box('end lower gold trim',(0,.89,z+( .05 if z> -1 else -.05)),(1.92,.032,.014),brass,.003)
    box('carriage door brass handle',(.28,1.54,z+(.063 if z>-1 else -.063)),(.025,.16,.025),brass,.004)
    # A distinct central door outline descends to the deck.
    for xx in [-.325,.325]:box('door lower border',(xx,1.13,z),(.03,.58,.112),cream,.004)
for side in [-1,1]:
    box('indoor timber bench seat',(side*.71,1.10,-1.60),(.45,.11,2.89),wood,.025)
    box('indoor timber backrest',(side*.92,1.34,-1.60),(.065,.43,2.89),wood,.018)

# The forward open grip end has outward-facing seats and a central aisle.
for side in [-1,1]:
    for xidx in range(4):box('open seat oak slat',(side*(.51+xidx*.127),1.12,1.60),(.117,.053,2.67),wood,.017)
    for k in range(5):box('open backrest oak slat',(side*.405,1.25+k*.083,1.60),(.064,.067,2.67),wood,.012)
    for z in [.32,1.50,2.90]:
        box('bench cast iron leg',(side*.64,.97,z),(.075,.31,.10),iron,.008)
        rod('bench back support',(side*.405,.89,z),(side*.405,1.61,z),.026,iron)
    box('bench lower panel',(side*.88,.93,1.6),(.06,.23,2.68),burgundy,.013)
    for z in [.42,1.20,1.99,2.78]:
        for yy in [.835,1.015]:box('open bench gold lining',(side*.918,yy,z),(.012,.013,.67),brass,.002)
        for zz in [-.33,.33]:box('open bench gold upright',(side*.918,.925,z+zz),(.012,.18,.013),brass,.002)
    for z in [.02,.81,1.60,2.39,3.18]:
        rod('brass roof pole',(side*1.005,.79,z),(side*1.005,2.48,z),.026,brass)
        cylinder('pole lower collar',(side*1.005,.85,z),.050,.13,brass)
        cylinder('pole upper collar',(side*1.005,2.40,z),.052,.09,brass)
        # Curved brackets visible as real curved silhouettes above the benches.
        for direction in [-1,1]:
            prev=(side*1.005,2.15,z)
            for segment in range(1,7):
                angle=(math.pi/2)*segment/6
                point=(side*1.005,2.15+.30*math.sin(angle),z+direction*.30*(1-math.cos(angle)))
                rod('arched roof filigree',prev,point,.013,brass);prev=point
        # Curved hand grips beside every other bench opening.
        if z in [.81,2.39]:
            rod('hanging handgrip',(side*.98,2.45,z),(side*.98,2.14,z),.012,iron)
            prev=None
            for i in range(13):
                a=2*math.pi*i/12;point=(side*.98,2.04+.085*math.cos(a),z+.058*math.sin(a))
                if prev:rod('hand loop',prev,point,.010,iron)
                prev=point

# Open nose dashboard, headlight, grip and brake levers, bell under the roof.
box('front dashboard',(0,1.05,3.19),(1.96,.54,.12),burgundy,.06)
box('front ivory inset',(0,1.055,3.256),(1.72,.34,.020),cream,.035)
text('front route placard','POWELL / HYDE',(0,1.125,3.272),1.6,.147,burgundy)
text('fleet number','16',(0, .954,3.275),.33,.14,burgundy)
cylinder('headlight outer brass rim',(0,1.38,3.26),.146,.10,brass,(0,0,1),24)
cylinder('headlight glass lens',(0,1.38,3.318),.118,.015,lamp,(0,0,1),24)
rod('front handrail',(-.92,1.46,3.21),(.92,1.46,3.21),.027,brass)
rod('grip lever',(0,.80,2.48),(0,1.85,2.17),.031,iron)
rod('grip handle',(-.18,1.85,2.17),(.18,1.85,2.17),.042,wood)
rod('brake lever',(.18,.8,2.68),(.18,1.75,2.84),.024,iron)
rod('brake handle',(.03,1.75,2.84),(.33,1.75,2.84),.036,wood)
sphere('polished cable car bell',(0,2.39,2.90),(.15,.10,.15),brass)
rod('bell pull cord',(0,2.35,2.90),(0,1.88,2.92),.006,iron)

# Rear boarding platform: lattice guard, central exit and tail marker.
for side in [-1,1]:
    rod('rear platform upright',(side*.99,.81,-3.42),(side*.99,2.48,-3.42),.027,brass)
    for j in range(5):
        xx=side*(.23+j*.155)
        rod('rear lattice', (xx,.89,-3.45),(xx-side*.23,1.65,-3.45),.009,iron)
        rod('rear lattice', (xx,1.65,-3.45),(xx-side*.23,.89,-3.45),.009,iron)
    rod('rear barrier top',(side*.15,1.67,-3.45),(side*.99,1.67,-3.45),.025,brass)
text('rear number','16',(0,1.13,-3.255),.43,.27,cream,'back')
cylinder('tail light brass rim',(-.72,1.12,-3.271),.08,.06,brass,(0,0,-1),16)
cylinder('tail light burgundy lens',(-.72,1.12,-3.306),.062,.015,burgundy,(0,0,-1),16)

# Barrel roof and narrow ventilated clerestory form the recognisable double roof.
curve_roof('main curved roof',2.49,-.02,7.10,2.25,.17,.065,burgundy)
for side in [-1,1]:
    box('roof rolled brass edge',(side*1.113,2.48,-.02),(.021,.028,7.03),brass,.008)
    box('clerestory enamel side',(side*.69,2.745,-.15),(.071,.30,5.76),burgundy,.008)
    for i in range(9):
        z=-2.68+i*.625
        box('clerestory glass',(side*.734,2.808,z),(.016,.126,.50),glass,0)
        for dz in [-.285,.285]:box('clerestory cream stile',(side*.741,2.808,z+dz),(.024,.18,.03),cream,.003)
    for y in [2.706,2.90]:box('clerestory cream belt',(side*.738,y,-.15),(.023,.022,5.8),cream,.002)
curve_roof('raised clerestory roof',2.925,-.15,5.94,1.58,.078,.047,iron)
for z in [-3.13,2.82]:box('clerestory rounded end',(0,2.792,z),(1.42,.22,.052),cream,.025)

# Add modest rivets where the eye passes close, without unique materials or draws.
for side in [-1,1]:
    for i in range(24):
        z=-3.19+i*.274
        cylinder('deck rivet',(side*1.074,.678,z),.011,.014,brass,(1,0,0),8)

# Join by material into seven draw calls. These remain separate, named mesh layers.
bpy.ops.object.select_all(action='DESELECT')
joined=[]
material_parts={m:[obj for obj in parts if obj.data.materials[0] == m] for m in [burgundy,cream,brass,wood,iron,glass,lamp]}
for m in [burgundy,cream,brass,wood,iron,glass,lamp]:
    members=material_parts[m]
    if not members:continue
    for obj in members:obj.select_set(True)
    bpy.context.view_layer.objects.active=members[0]
    if len(members)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name=m.name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    joined.append(obj);obj.select_set(False)

for obj in joined:obj.select_set(True)
bpy.context.view_layer.objects.active=joined[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'cable-car.glb'),export_format='GLB',use_selection=True,
    export_yup=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in joined)
print(f'CABLE_CAR_METRICS triangles={triangles} meshes={len(joined)} bytes={(OUT/"cable-car.glb").stat().st_size}')
(OUT/'cable-car-metrics.json').write_text(json.dumps({'triangles':triangles,'drawCalls':len(joined),'dimensionsMetres':[2.25,3.0,7.2],'front':'+Z','up':'+Y'},indent=2)+'\n')

# A daylight product study is stored with the editable source for art review.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.world.color=(.25,.30,.37)
scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=100
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02));floor=bpy.context.object;floor.name='render ground (not exported)'
floor.data.materials.append(material('render ground','#b8c7bd',.9))
def area(name,location,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=location);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler()
area('soft coastal key',(3,-5,8),1500,5,(1,.86,.69))
area('cool fill',(-5,-2,5),1000,6,(.65,.82,1))
area('roof edge',(1,5,7),1700,4,(1,.94,.81))
bpy.ops.object.camera_add(location=(9,-10,6.4));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=10.2;scene.camera=camera
scene.render.filepath=str(SOURCE/'cable-car-study.png')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'cable-car.blend'),compress=True)
bpy.ops.render.render(write_still=True)
