"""Original Victorian garage, coupe and Jensen character study. No external assets.
Editable source: art/source/victorian-garage.blend. Coordinates below use game Y-up.
"""
import bpy, math, bmesh
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0

def xyz(p): return (p[0],-p[2],p[1])
def mat(name,color,rough=.5,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=tuple((int(color[i:i+2],16)/255)**2.2 for i in (1,3,5))+(1,); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if name=='Coupe paint':p.inputs['Coat Weight'].default_value=.65
 return m
cream=mat('Warm painted trim','#f1e7ce'); sage=mat('Sage clapboard','#78998d'); dark=mat('Garage interior','#33443d'); wood=mat('Oak garage door','#ad7950'); glass=mat('Smoky blue glass','#294957',.16,.32); brass=mat('Aged brass','#c9a35f',.27,.7); pavement=mat('Warm concrete','#c9c2ac',.92); road=mat('Asphalt','#797b73',.95); clay=mat('Terracotta','#ba7155'); leaf=mat('Foliage','#426c47'); paint=mat('Coupe paint','#427e7c',.24,.25); rubber=mat('Rubber','#24282a',.83); chrome=mat('Satin aluminium','#adb8b6',.25,.8); black=mat('Charcoal','#222e30'); lamp=mat('Warm headlight','#fff2ca',.17); red=mat('Tail lamp','#b14435',.25); skin=mat('Jensen skin','#bb8e70',.7); hair=mat('Silver hair','#aab0ab',.8); jacket=mat('Soft black leather','#252b2a',.43,.08); denim=mat('Black denim','#343a39',.85); white=mat('Eye whites','#cfc7b3',.6)
roots={}
for name in ['Garage','Coupe','Jensen']:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);roots[name]=o
parent=roots['Garage']
def finish(o,name,material,bevel=0):
 o.name=name;o.data.materials.append(material);o.parent=parent
 if bevel:
  mod=o.modifiers.new('Crafted edges','BEVEL');mod.width=bevel;mod.segments=3
  mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def box(name,p,size,material,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,material,bevel)
def ell(name,p,s,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=xyz(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in o.data.polygons:f.use_smooth=True
 return finish(o,name,material)
def line(name,points,r,material):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('POLY');s.points.add(len(points)-1)
 for v,p in zip(s.points,points):v.co=(*xyz(p),1)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.parent=parent;c.materials.append(material);return o
def cyl(name,p,r,depth,material,axis=(0,1,0),r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=xyz(p));o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector(xyz(axis)));finish(o,name,material,.008)
 for f in o.data.polygons:f.use_smooth=True
 return o
def limb(name,a,b,r,material,r2=None):
 av,bv=Vector(a),Vector(b);return cyl(name,(av+bv)/2,r,(bv-av).length,material,(bv-av).normalized(),r2)
def loft(name,rings,material):
 # rings = (height, half width, half depth, center x, center z); shaped torso/head.
 verts=[];faces=[];N=32
 for h,w,d,cx,cz in rings:
  for i in range(N):
   t=i/N*2*math.pi;verts.append(xyz((cx+math.cos(t)*w,h,cz+math.sin(t)*d)))
 for k in range(len(rings)-1):
  for i in range(N):a=k*N+i;b=k*N+(i+1)%N;faces.append((a,b,b+N,a+N))
 faces.extend([tuple(reversed(range(N))),tuple((len(rings)-1)*N+i for i in range(N))]);mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);finish(o,name,material)
 for f in mesh.polygons:f.use_smooth=True
 mod=o.modifiers.new('Sculpted surface','SUBSURF');mod.levels=2
 return o
# Victorian facade: garage below an inhabited bay-window floor.
box('Street',(0,-.17,2),(24,.25,17),road,.03)
box('Sidewalk',(0,-.035,-2.6),(24,.25,4.6),pavement,.045)
for x in range(-10,12,2):line('Sidewalk joint',[(x,.094,-4.8),(x,.094,-.35)],.009,dark)
box('Driveway',(0,.065,-.2),(4.5,.10,3.6),pavement,.01)
box('Garage shadow',(0,1.6,-4.7),(4.2,3.2,.16),dark)
box('Garage left wall',(-2.55,1.6,-3.2),(.9,3.2,3.2),sage)
box('Garage right wall',(2.55,1.6,-3.2),(.9,3.2,3.2),sage)
box('Upper floor',(0,5,-3.6),(6,3.7,2.5),sage)
# Clapboard siding and corner boards, including side return.
for y in [3.3+i*.145 for i in range(26)]:
 box('Horizontal weatherboard',(0,y,-2.28),(6.05,.025,.08),cream,.005)
for x in [-3,3]:box('Corner trim',(x,4.8,-2.22),(.15,4.2,.18),cream)
for x in [-2.15,2.15]:box('Garage jamb',(x,1.63,-1.57),(.18,3.25,.25),cream)
box('Garage header',(0,3.22,-1.57),(4.5,.24,.3),cream)
# Raised sectional oak door in the open position.
for z in [-1.7-i*.29 for i in range(10)]:box('Raised oak door',(0,2.98,z),(4.08,.10,.265),wood,.008)
for x in [-1.96,1.96]:box('Door track',(x,2.87,-3),(.035,.05,2.8),chrome)
# Interior cabinets, work bench, pegboard, hanging wheels.
box('Workbench',(0,.94,-4.25),(3.2,.12,.7),wood)
for x in [-1.35,1.35]:box('Bench legs',(x,.48,-4.25),(.1,.92,.55),dark)
box('Pegboard',(-.25,1.75,-4.48),(2.8,1.2,.06),wood)
for x in [-1.3,-.9,-.5,-.1,.3,.7]:
 for y in [1.4,1.65,1.9,2.15]:cyl('Peg hole',(x,y,-4.44),.018,.015,dark,(0,0,1))
box('Tool chest',(1.65,.55,-3.85),(.65,1,.65),paint)
for y in [.3,.5,.7,.9]:box('Tool drawer',(1.65,y,-3.5),(.56,.025,.025),chrome)
# Broad bay window and ornamental brackets.
box('Bay base',(0,3.9,-1.99),(3.25,.22,.95),cream)
box('Bay roof',(0,6.26,-2),(3.5,.22,1.05),cream)
for x in [-1.06,0,1.06]:
 box('Bay window glass',(x,5.03,-1.66),(.87,1.96,.08),glass)
 for dx in [-.48,.48]:box('Window mullion',(x+dx,5.03,-1.58),(.09,2.15,.12),cream)
 for y in [4.0,5.02,6.1]:box('Window sash',(x,y,-1.57),(1.02,.075,.12),cream)
 box('Curtain',(x+.3,5.12,-1.72),(.2,1.7,.035),cream)
for x in [-1.35,1.35]:
 box('Bay bracket',(x,3.62,-1.94),(.12,.42,.6),cream)
 line('Bracket scroll',[(x,3.38,-2.25),(x,3.4,-1.75),(x,3.7,-1.75)],.045,cream)
for y,w in [(6.7,6.2),(6.83,6.4),(6.96,6.65)]:box('Cornice',(0,y,-2.22),(w,.13,.45),cream)
for x in [-2.7+i*.38 for i in range(15)]:box('Dentil',(x,6.57,-2.16),(.12,.19,.23),cream)
# Adjacent pastel houses give the scene street context.
for x,c in [(-6,mat('Peach neighbor','#c88e79')),(6,mat('Butter neighbor','#d7bc7e'))]:
 box('Neighbor',(x,3.3,-3.7),(5.6,6.6,2.6),c)
 for xx in [x-1.4,x,x+1.4]:
  for y in [2,4.6]:
   box('Neighbor glass',(xx,y,-2.34),(.85,1.6,.1),glass)
   for dx in [-.49,.49]:box('Neighbor casing',(xx+dx,y,-2.25),(.09,1.83,.12),cream)
   for yy in [y-.87,y,y+.87]:box('Neighbor sash',(xx,yy,-2.23),(1.06,.08,.16),cream)
 box('Neighbor cornice',(x,6.6,-2.3),(5.7,.22,.5),cream)
# Planters and porch lights.
for x in [-2.65,2.65]:
 cyl('Terracotta planter',(x,.35,-.75),.28,.52,clay,r2=.36)
 for i in range(9):
  a=i*2.4;ell('Geranium',(x+math.cos(a)*.23,.72+(i%3)*.15,-.75+math.sin(a)*.23),(.25,.23,.23),leaf)
 box('Lantern bracket',(x,2.12,-1.56),(.1,.35,.22),black)
 box('Lantern',(x,2.13,-1.35),(.18,.28,.18),lamp)
 for y in [1.97,2.29]:box('Lantern cap',(x,y,-1.35),(.24,.035,.24),black)
# Coupe, modeled in metal panels, +Z front, floor at 0.
parent=roots['Coupe']
# Longitudinal body shell with soft shoulder; real carved wheel wells.
sections=[(-2.03,.67,.57,.17),(-1.86,.86,.61,.26),(-1.45,.91,.63,.30),(-.9,.9,.64,.29),(.4,.88,.63,.26),(1.15,.9,.6,.27),(1.7,.83,.57,.23),(1.95,.68,.53,.15)]
verts=[];faces=[];N=32
for z,w,y,h in sections:
 for i in range(N):
  a=i/N*2*math.pi;verts.append(xyz((math.cos(a)*w,y+math.sin(a)*h,z)))
for k in range(len(sections)-1):
 for i in range(N):a=k*N+i;b=k*N+(i+1)%N;faces.append((a,a+N,b+N,b))
faces.extend([tuple(range(N)),tuple(reversed([(len(sections)-1)*N+i for i in range(N)]))]);me=bpy.data.meshes.new('Body shell');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Coachbuilt body',me);bpy.context.collection.objects.link(o);finish(o,o.name,paint)
for f in me.polygons:f.use_smooth=True
bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Body surfacing','SUBSURF');mod.levels=2;bpy.ops.object.modifier_apply(modifier=mod.name)
for z in [-1.27,1.22]:
 for side in [-1,1]:
  cutter=cyl('Wheel cutter',(side*.98,.40,z),.42,.68,black,(1,0,0));bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
box('Undertray',(0,.27,0),(1.52,.10,3.45),black,.035)
# Glass cabin with a more upright, continuous greenhouse.
loft('Cabin glass',[(.8,.70,1.02,0,-.22),(1.05,.65,.87,0,-.28),(1.35,.53,.59,0,-.34),(1.4,.46,.49,0,-.34)],glass)
box('Ivory roof',(0,1.405,-.34),(1.08,.075,1.14),cream,.16)
for s in [-1,1]:
 line('A pillar',[(s*.69,.81,.79),(s*.54,1.36,.23)],.036,paint)
 line('C pillar',[(s*.70,.82,-1.21),(s*.54,1.36,-.90)],.05,paint)
 line('Window surround',[(s*.7,.85,-1.15),(s*.55,1.38,-.87),(s*.55,1.38,.18),(s*.71,.85,.78)],.015,chrome)
 line('B pillar',[(s*.66,.85,-.35),(s*.55,1.36,-.37)],.027,paint)
 line('Door seam',[(s*.89,.77,.68),(s*.902,.48,.52),(s*.89,.39,-.65),(s*.906,.79,-.81)],.007,black)
 box('Door handle',(s*.9,.79,-.55),(.035,.03,.17),chrome,.013)
 box('Rocker chrome',(s*.84,.34,-.02),(.025,.035,1.53),chrome,.009)
 ell('Mirror',(s*.98,.99,.57),(.12,.075,.16),paint)
 line('Mirror stem',[(s*.72,.9,.53),(s*.95,.96,.56)],.023,chrome)
 for z in [-1.27,1.22]:
  # Wheel arch lip follows the actual opening.
  line('Rolled arch',[(s*.90,.4+math.sin(a)*.441,z+math.cos(a)*.441) for a in [i*math.pi/32 for i in range(33)]],.018,paint)
  cyl('Road tire',(s*.90,.40,z),.384,.205,rubber,(1,0,0))
  cyl('Alloy dish',(s*1.011,.40,z),.274,.024,chrome,(1,0,0))
  cyl('Wheel recess',(s*1.027,.40,z),.227,.026,black,(1,0,0))
  for i in range(8):
   a=i*math.pi/4;line('Alloy spoke',[(s*1.047,.40+math.cos(a)*.065,z+math.sin(a)*.065),(s*1.043,.40+math.cos(a+.14)*.23,z+math.sin(a+.14)*.23)],.026,chrome)
  cyl('Hub cap',(s*1.06,.40,z),.086,.03,chrome,(1,0,0))
  for i in range(5):
   a=i*math.pi/2.5;cyl('Lug bolt',(s*1.08,.40+math.cos(a)*.055,z+math.sin(a)*.055),.012,.012,black,(1,0,0))
for s in [-1,1]:
 cyl('Headlamp bezel',(s*.56,.69,1.82),.175,.07,chrome,(0,.25,1))
 cyl('Headlamp glass',(s*.56,.70,1.86),.143,.035,lamp,(0,.25,1))
 for i in [-2,-1,0,1,2]:line('Lens fluting',[(s*.56+i*.038,.60,1.887),(s*.56+i*.038,.79,1.855)],.004,cream)
 box('Rear lamp',(s*.59,.66,-1.955),(.29,.12,.055),red,.045)
box('Front bumper',(0,.405,1.96),(1.46,.065,.10),chrome,.035)
box('Grille recess',(0,.52,1.973),(.69,.13,.025),black,.035)
for x in [-.28+i*.07 for i in range(9)]:box('Grille fin',(x,.52,1.995),(.015,.09,.02),chrome,.003)
box('Rear bumper',(0,.39,-2),(1.5,.065,.12),chrome,.03)
box('Rear plate',(0,.57,-2.025),(.37,.14,.016),cream,.012)
# Jensen: adult stylized proportions, tailored jacket, quiet expression.
parent=roots['Jensen']
for s in [-1,1]:
 loft('Trouser leg',[(.16,.095,.105,s*.12,.02),(.5,.10,.10,s*.12,.0),(.87,.125,.13,s*.10,0)],denim)
 box('Leather shoe',(s*.12,.095,.085),(.22,.15,.38),black,.06)
 box('Shoe sole',(s*.12,.033,.095),(.225,.03,.38),rubber,.016)
loft('Leather jacket',[(.81,.235,.135,0,0),(.88,.25,.15,0,0),(1.14,.26,.17,0,0),(1.38,.295,.145,0,-.01),(1.44,.21,.12,0,-.01)],jacket)
loft('Neck',[(1.4,.09,.085,0,0),(1.58,.09,.085,0,.01)],skin)
loft('Sculpted face',[(1.51,.08,.085,0,.025),(1.56,.14,.11,0,.02),(1.67,.186,.14,0,0),(1.79,.184,.143,0,0),(1.92,.17,.125,0,-.01),(1.98,.115,.085,0,-.018),(2.0,.02,.02,0,-.02)],skin)
for s in [-1,1]:
 ell('Ear',(s*.182,1.74,-.003),(.033,.065,.027),skin)
 ell('Eye',(s*.072,1.79,.13),(.042,.018,.008),white)
 ell('Iris',(s*.072,1.79,.138),(.013,.015,.006),black)
 line('Brow',[(s*.035,1.826,.137),(s*.076,1.839,.137),(s*.116,1.831,.122)],.008,hair)
 # Rounded rectangular acetate frames, not cartoon circles.
 pts=[(s*.072+math.cos(a)*.058,1.79+math.sin(a)*.036,.153) for a in [i*math.pi/16 for i in range(33)]];line('Glasses',pts,.009,black)
 line('Glasses arm',[(s*.13,1.797,.14),(s*.185,1.79,-.015)],.008,black)
line('Bridge',[(-.019,1.80,.157),(.019,1.80,.157)],.006,black)
ell('Nose',(0,1.737,.148),(.025,.041,.032),skin)
line('Smile',[(-.06,1.641,.112),(-.025,1.634,.131),(.025,1.634,.131),(.057,1.644,.112)],.004,mat('Lip','#8a6151'))
# Swept short silver hair hugs skull; individual comb lines.
loft('Silver hair cap',[(1.895,.177,.128,0,-.025),(1.97,.143,.114,0,-.025),(2.01,.08,.08,0,-.025),(2.015,.01,.01,0,-.025)],hair)
for s in [-1,1]:ell('Sideburn',(s*.168,1.85,-.015),(.018,.068,.085),hair)
for i in range(12):
 x=-.14+i*.025;line('Hair sweep',[(x,1.92,.095),(x-.018,1.977,.035),(x-.026,1.975,-.055)],.005,cream)
# Tailoring: zipper, collar, yoke and zipped pockets.
line('Zipper',[(0,.83,.151),(0,1.36,.17)],.008,chrome)
for s in [-1,1]:
 line('Collar',[(s*.03,1.39,.145),(s*.1,1.46,.095),(s*.20,1.39,.125)],.035,jacket)
 line('Chest seam',[(s*.045,1.29,.17),(s*.23,1.29,.14)],.005,denim)
 line('Pocket zip',[(s*.11,.96,.161),(s*.20,1.09,.149)],.006,chrome)
 a=(s*.27,1.36,0);b=(s*.33,1.08,.015);c=(s*.26,.88,.14)
 limb('Jacket sleeve',a,b,.097,jacket,.086);ell('Elbow',b,(.09,.10,.09),jacket);limb('Forearm',b,c,.081,jacket,.067)
 ell('Hand',(s*.25,.84,.16),(.062,.09,.035),skin)
 for i in range(4):ell('Fingers',(s*.218+s*i*.018,.80,.177),(.01,.047,.014),skin)
# Ensure every modeled surface faces outwards before subdivision/export.
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
# Export a source scene with three separate named root groups.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/victorian-garage.blend'))
# Convert curves for predictable glTF export.
for o in list(bpy.context.scene.objects):
 if o.type=='CURVE':
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/models/victorian-garage.glb'),export_format='GLB',export_apply=True)
