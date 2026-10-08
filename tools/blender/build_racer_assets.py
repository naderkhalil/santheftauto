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
g['placement']('Garage / Victorian', (0,3.8,0))
wall=g['material']('garage eucalyptus weatherboard','#8a998c');accent=g['material']('garage deep olive','#4b6458');g['texture_material'](wall);g['texture_material'](accent)
box=g['box'];beam=g['beam'];cream=g['cream'];wood=g['wood'];iron=g['iron'];glass=g['glass'];concrete=g['concrete']
# Full dimensional garage ground floor, with an actual opening and interior.
box(-3.05,3.8,1.65,1.1,8.0,3.3,wall);box(3.05,3.8,1.65,1.1,8,3.3,wall)
box(0,7.7,1.65,6.2,.25,3.3,wall);box(0,3.8,3.3,7.2,8,.26,concrete)
box(0,3.8,.035,7.2,8,.10,concrete)
for x in [-2.52,2.52]:
 box(x,-.1,1.65,.16,.3,3.3,cream);box(x,-.20,1.67,.045,.36,3.34,accent)
box(0,-.12,3.2,5.3,.32,.23,cream)
for x in [-2.4,2.4]:
 box(x,2.3,3.01,.04,4.8,.08,iron)
for y in [i*.28 for i in range(17)]:
 box(0,y,3.1,4.77,.266,.075,wood)
 for x in [-1.62,0,1.62]:box(x,y,3.055,1.48,.20,.02,accent)
# Workshop interior: panelled oak bench, drawers, shelves, bicycle/tool shapes.
box(0,6.7,.95,4.5,.9,.12,wood)
for x in [-1.8,1.8]:box(x,6.7,.48,.13,.7,.9,iron)
for x in [-1.7,-.8,.1]:
 for z in [.25,.47,.69]:
  box(x,6.75,z,.82,.65,.19,accent);box(x,6.40,z,.25,.04,.025,iron)
for z in [1.7,2.35]:
 box(0,7.35,z,4.3,.5,.06,wood)
 for x in [-1.8,-.9,0,.8,1.7]:box(x,7.30,z+.18,.28,.27,.3,accent if x<0 else cream)
for x in [-1.8,-.9,0,.9,1.8]:
 beam((x,7.50,1.1),(x,7.50,1.58),.02,iron,8)
 box(x,7.50,1.59,.14,.04,.08,iron)
# Upper storeys are the exact canted bay, sash, cornice and gable assemblies of the map.
g['sided_body'](7.2,10,6.6,wall,base=3.3)
g['banded_facade'](7.2,0,3.3,9.7,wall,[(-1.30,6.4,3.8,6.1),(2.05,4.95,1.35,2.15),(2.05,8.15,1.35,2.15)])
g['bay'](-1.25,-.8,3.3,3.8,6.45,wall,cream,accent)
for z in [4.95,8.15]:g['window'](2.05,-.1,z,1.35,2.15,cream,accent,False,True)
for z,d,h in [(6.55,.38,.15),(9.65,.5,.19),(9.88,.78,.20)]:box(0,-.05,z,7.45,d,h,cream)
g['dentils'](-.36,9.68,7.2,accent);g['gable'](7.35,-.18,10,2.8,wall,cream,accent,2)
for side in [-1,1]:g['face']([(0,-.24,12.85),(side*3.8,-.24,9.98),(side*3.8,10.3,9.98),(0,10.3,12.85)],g['roof'])
for x in [-3.15,3.15]:
 g['cylinder'](x,-.25,1.15,.31,.58,g['warm'],16,r2=.4)
 for i in range(26):
  a=i*2.399;beam((x,-.25,1.45),(x+math.sin(a)*.44,-.25+math.cos(a)*.44,1.7+(i%4)*.1),.025,g['leaf'] if i%2 else g['leaf2'],5)
 box(x,-.15,2.35,.08,.22,.38,iron);box(x,-.35,2.4,.22,.2,.34,g['warm'])
 for zz in [2.20,2.60]:box(x,-.35,zz,.3,.28,.04,iron)
g['text']('738',0,-.31,3.31,.20,accent)
for x,pal,address in [(-7.6,('#b0bdc2','#556b76'),736),(7.6,('#c7bba5','#786951'),740)]:
 g['placement']('Garage / neighbor '+str(address),(x,4.1,0));g['painted_lady'](address,pal,1,7.25,12)
g['placement']('Garage / paving',(0,0,0))
for x in range(-12,13):
 for y in range(-3,5):box(x*1.2,y*1.2,.01,1.193,1.193,.13,concrete)
box(0,-6,-.13,40,10,.12,g['dark'])
for x in range(-15,16):box(x*1.1,-3.5,-.035,1.094,.22,.23,g['granite'])
# Finalize the same material batches and UVs as the map.
garage=bpy.data.objects.new('Garage',None);bpy.context.collection.objects.link(garage)
for (part,m),(verts,faces,uvs) in g['BATCH'].items():
 mesh=bpy.data.meshes.new(part+' / '+m);mesh.from_pydata(verts,[],faces);mesh.update();uv=mesh.uv_layers.new(name='Architectural metres')
 for p,coords in zip(mesh.polygons,uvs):
  for i,co in zip(p.loop_indices,coords):uv.data[i].uv=co
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 o=bpy.data.objects.new(part+' / '+m,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(g['M'][m]);o.parent=garage
# Use local modeling helpers from the earlier study without its old scene.
old=(ROOT/'tools/blender/create_garage_study.py').read_text()
helpers=old[old.index('def xyz'):old.index('# Victorian facade')]
# Avoid deleting or replacing the architecture just created.
exec(helpers,globals())
# Remove the unused old root only; the garage above owns the new architecture.
bpy.data.objects.remove(roots['Garage'],do_unlink=True);roots['Garage']=garage
exec(old[old.index('# Coupe, modeled'):old.index('# Jensen:')],globals())
vehicle=roots['Coupe'];vehicle.name='Vehicle'
# The entire car is an open cockpit: an actual visible driver in every paint variant.
for o in list(vehicle.children):
 if any(o.name.startswith(n) for n in ['Cabin glass','Ivory roof','C pillar','B pillar','Window surround']):bpy.data.objects.remove(o,do_unlink=True)
# Low raked windscreen, slim surround. No opaque solid greenhouse.
parent=vehicle
wind=mat('Windscreen','#b2ced0',.12,.05)
p=wind.node_tree.nodes.get('Principled BSDF');p.inputs['Alpha'].default_value=.24;wind.surface_render_method='DITHERED';wind.diffuse_color=(*wind.diffuse_color[:3],.24)
w=box('Windscreen',(0,1.035,.60),(1.29,.47,.024),wind,.02);w.rotation_euler.x=math.radians(27)
leather=mat('Saddle leather','#87523a',.71);stitch=mat('Leather stitching','#bba588',.85)
box('Cabin tub',(0,.57,-.17),(1.44,.18,1.66),black,.10)
for side in [-1,1]:
 box('Seat cushion',(side*.35,.67,-.38),(.49,.13,.57),leather,.09)
 box('Seat back',(side*.35,.94,-.68),(.49,.52,.13),leather,.09)
 box('Headrest',(side*.35,1.19,-.71),(.25,.16,.13),leather,.06)
 for i in [-1,0,1]:line('Seat seam',[(side*.35+i*.105,.753,-.57),(side*.35+i*.105,.753,-.17)],.004,stitch)
 line('Cockpit rim',[(side*.7,.89,-.95),(side*.78,.88,-.3),(side*.74,.89,.43)],.025,chrome)
box('Dashboard',(0,.90,.35),(1.39,.20,.19),black,.06)
for x in [-.45,-.25]:cyl('Instrument bezel',(x,.947,.238),.067,.02,chrome,(0,.2,-1));cyl('Instrument dial',(x,.947,.222),.054,.018,black,(0,.2,-1))
steering=bpy.data.objects.new('Steering',None);bpy.context.collection.objects.link(steering);steering.parent=vehicle
parent=steering
line('Steering wheel',[(-.35+math.cos(i*math.pi/24)*.19,.99+math.sin(i*math.pi/24)*.14,.04+math.sin(i*math.pi/24)*.08) for i in range(49)],.02,black)
for i in range(3):
 a=i*math.tau/3;line('Steering spoke',[(-.35,.99,.04),(-.35+math.cos(a)*.18,.99+math.sin(a)*.13,.04+math.sin(a)*.08)],.012,chrome)
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
# Sculpted, individually differentiated caricatures in standing AND driving poses.
# Each face uses cheek/jaw/temple sections, eyelids, lip planes and scalp surfaces.
bpy.data.objects.remove(roots['Jensen'],do_unlink=True)
def actor(id,seated):
 global parent
 root=bpy.data.objects.new(('Seated_' if seated else 'Standing_')+id,None);bpy.context.collection.objects.link(root);parent=root
 skin=mat(id+' / skin',{'jensen':'#bd947c','dario':'#ceaa95','sam':'#d4b09c','elon':'#d1ac97'}[id],.67)
 hair=mat(id+' / hair',{'jensen':'#aeb2b0','dario':'#3b302b','sam':'#625247','elon':'#473d37'}[id],.84)
 cloth=mat(id+' / jacket',{'jensen':'#232929','dario':'#46515a','sam':'#b5a98d','elon':'#303538'}[id],.43 if id=='jensen' else .88)
 trousers=mat(id+' / trousers','#343c42',.88);lip=mat(id+' / lip','#9c7567',.79);eye=mat(id+' / eyes','#d5c9b7',.5)
 # Seated coordinates are rigged to a chair origin, hands on the actual wheel.
 yoffset=-.39 if seated else 0
 def P(x,y,z):return (x,y+yoffset,z)
 def S(name,p,size,m):return ell(id+' '+name,P(*p),size,m)
 def L(name,points,r,m):return line(id+' '+name,[P(*p) for p in points],r,m)
 def B(name,p,size,m,r=.015):return box(id+' '+name,P(*p),size,m,r)
 def body(name,rings,m):return loft(id+' '+name,[(h+yoffset,w,d,cx,cz) for h,w,d,cx,cz in rings],m)
 if seated:
  for s in [-1,1]:
   limb('Thigh',P(s*.13,.85,-.02),P(s*.14,.64,.36),.11,trousers,.10)
   limb('Shin',P(s*.14,.64,.36),P(s*.14,.26,.49),.09,trousers,.075)
   B('shoe',(s*.14,.20,.58),(.19,.13,.32),black,.04)
 else:
  for s in [-1,1]:
   body('trousers',[(.16,.085,.09,s*.14,.03),(.49,.105,.11,s*.14,0),(.84,.13,.15,s*.115,-.01)],trousers)
   B('shoe',(s*.145,.10,.085),(.21,.15,.34),black,.045);B('sole',(s*.145,.028,.095),(.215,.025,.35),rubber,.01)
 body('torso',[(.8,.23,.155,0,0),(.91,.265,.165,0,0),(1.14,.275,.165,0,0),(1.35,.30,.14,0,-.01),(1.41,.19,.10,0,0)],cloth)
 body('neck',[(1.34,.09,.09,0,0),(1.51,.10,.095,0,.01)],skin)
 wide=1.1 if id=='elon' else 1
 body('face',[(1.47,.078,.076,0,.035),(1.52,.13*wide,.12,0,.035),(1.59,.169*wide,.13,0,.02),(1.70,.199*wide,.157,0,-.008),(1.78,.18*wide,.156,0,-.016),(1.87,.179*wide,.141,0,-.02),(1.95,.145*wide,.115,0,-.025),(1.99,.045,.045,0,-.025)],skin)
 for s in [-1,1]:
  S('ear',(s*.19*wide,1.73,-.01),(.033,.069,.032),skin);S('ear hollow',(s*.211*wide,1.73,.005),(.008,.038,.019),lip)
  S('cheek',(s*.108,1.69,.117),(.074,.047,.041),skin)
  S('eye',(s*.071,1.788,.136),(.040,.015,.011),eye)
  S('iris',(s*.07,1.788,.147),(.011,.012,.004),hair)
  S('pupil',(s*.07,1.788,.15),(.005,.009,.003),black)
  L('upper lid',[(s*.03,1.795,.14),(s*.07,1.807,.143),(s*.111,1.795,.131)],.005,skin)
  L('brow',[(s*.028,1.833,.144),(s*.072,1.846,.141),(s*.122,1.834,.119)],.010 if id!='jensen' else .007,hair)
 S('nose bridge',(0,1.735,.149),(.024,.054,.024),skin);S('nose tip',(0,1.701,.171),(.036,.019,.030),skin)
 for s in [-1,1]:S('nostril',(s*.022,1.69,.163),(.009,.006,.007),lip)
 S('upper lip',(0,1.626,.14),(.049,.009,.012),lip);S('lower lip',(0,1.610,.14),(.045,.009,.012),lip)
 L('mouth',[(-.045,1.619,.146),(0,1.618,.153),(.046,1.625,.141)],.0027,black)
 # Hair follows the head; varied crowns and clumps describe each person's silhouette.
 body('scalp',[(1.875,.18*wide,.144,0,-.025),(1.958,.15*wide,.124,0,-.03),(2.005,.08,.065,0,-.025),(2.018,.01,.01,0,-.025)],hair)
 for s in [-1,1]:S('side hair',(s*.173*wide,1.847,-.045),(.028,.073,.092),hair)
 if id=='dario':
  for i in range(34):
   a=i*2.399;r=.165*math.sqrt((i+.5)/34);S('curl',(math.cos(a)*r,1.97+.045*math.cos(i*.8),math.sin(a)*r-.025),(.042,.05,.043),hair)
  for s in [-1,1]:
   L('beard',[(s*.15,1.65,.08),(s*.11,1.57,.12),(s*.045,1.54,.13)],.021,hair)
  S('chin beard',(0,1.537,.12),(.073,.023,.038),hair)
 else:
  for i in range(11):
   x=-.13+i*.024;L('combed hair',[(x,1.914,.109),(x-.022,1.99,.025),(x-.02,1.976,-.07)],.005,cream if id=='jensen' else hair)
 if id=='jensen':
  for s in [-1,1]:
   L('acetate glasses',[(s*.073+math.cos(a)*.056,1.784+math.sin(a)*.033,.163) for a in [i*math.pi/20 for i in range(41)]],.007,black)
   L('glasses arm',[(s*.125,1.793,.148),(s*.187,1.794,-.01)],.006,black)
  L('glasses bridge',[(-.018,1.796,.16),(.018,1.796,.16)],.005,black)
 for s in [-1,1]:
  L('collar',[(s*.027,1.383,.126),(s*.105,1.415,.10),(s*.198,1.343,.145)],.022,cloth)
  if id in ['jensen','elon']:
   L('pocket zip',[(s*.13,.97,.158),(s*.23,1.10,.126)],.0045,chrome)
  a=P(s*.275,1.32,0);b=P(s*.35,1.10,.02 if not seated else .14);c=P(s*.29,.88,.11) if not seated else P(s*.17,1.07,.47)
  limb(id+' upper sleeve',a,b,.083,cloth,.09);ell(id+' elbow',b,(.086,.085,.082),cloth);limb(id+' forearm',b,c,.076,cloth,.056)
  ell(id+' hand',c,(.05,.072,.035),skin)
  for i in range(4):ell(id+' finger',(c[0]+(i-1.5)*.018,c[1]-.025,c[2]+.026),(.009,.031,.012),skin)
  L('shoulder seam',[(s*.12,1.375,-.10),(s*.26,1.355,-.06),(s*.285,1.32,.06)],.003,stitch)
 if id in ['jensen','elon']:L('jacket zipper',[(0,.825,.163),(0,1.35,.15)],.005,chrome)
 if id=='sam':B('shirt collar',(0,1.36,.132),(.1,.11,.012),cream,.01)
 return root
actors=[]
for id in ['dario','sam','elon','jensen']:
 actors.extend([actor(id,False),actor(id,True)])
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
for root in [vehicle,steering,*actors,*[o for o in vehicle.children if o.name.startswith('Wheel_')]]:
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
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False)
OUT=ROOT/'public/assets/models'
export(OUT/'racer-kit.glb',[vehicle,*actors]);export(OUT/'racer-garage.glb',[garage])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/racers-and-garage.blend'),compress=True)
print('RACER_ASSETS_READY')
