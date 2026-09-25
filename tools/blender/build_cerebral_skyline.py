"""Original SF skyline for the Alamo Square reveal, authored in Blender.

WGS84 landmark centres use the district's projection. X east, Y north, Z up;
standard glTF maps north to -Z. Heights use a documented 1.12 storybook lift.
Run Blender 4.5 LTS --background --factory-startup -t 4 --python this_file.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/cerebral-valley'
REVIEW = ROOT / 'art/reviews'
HEIGHT_LIFT = 1.12
ORIGIN_LON, ORIGIN_LAT = -122.42415, 37.77655
CONTEXT = json.loads((ROOT/'art/references/cerebral-skyline-context.json').read_text())
GROUND_GRID = CONTEXT['elevationGrid']
NEAR_GRID = json.loads((ROOT/'art/references/cerebral-valley-layout.json').read_text())['elevationGrid']
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
BATCH, MATERIAL, FEATURES = {}, {}, []
CURRENT = None


def srgb(color):
    values = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, color, roughness=.5, metalness=.1):
    m = bpy.data.materials.new('Cerebral skyline / ' + name)
    m.use_nodes = True
    m.diffuse_color = (*srgb(color), 1)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = m.diffuse_color
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metalness
    MATERIAL[name] = m
    return name


GLASS = material('Pacific blue glazing', '#718f9e', .27, .35)
LIGHT = material('silver sky glazing', '#a4b8bb', .29, .3)
DEEP = material('cool recessed glazing', '#526a77', .36, .2)
SILVER = material('pale aluminum fins', '#c0c7c2', .46, .35)
CREAM = material('sunlit quartz aggregate', '#dddbcb', .75, .04)
STONE = material('warm limestone', '#c9bba6', .8, .02)
BRONZE = material('555 California carnelian granite', '#947b67', .62, .13)
BRONZE_DARK = material('bronze window recesses', '#5a605d', .45, .2)
TERRA = material('warm sandstone', '#b69a84', .74)
ROOF = material('roof machinery', '#727f82', .78)
DOME = material('City Hall patinated dome', '#7d9189', .52, .3)
GOLD = material('City Hall gilded trim', '#d5b473', .36, .4)
CITY_GROUND = material('distant city ground', '#aaa99f', .94, 0)
CITY_ROOF = material('distant flat rooftops', '#919897', .92, 0)
CITY_WALLS = [material('distant masonry '+str(i), c, .87, .01) for i,c in enumerate(
    ['#aaa89f','#bbb4a6','#b5b5ad','#a6afae','#baa998','#b8b2a8'])]


def sample_grid(grid, x, north):
    cols, rows = grid['columns'], grid['rows']
    u=max(0,min(cols-1,(x-grid['minX'])/(grid['maxX']-grid['minX'])*(cols-1)))
    v=max(0,min(rows-1,(grid['maxZ']-north)/(grid['maxZ']-grid['minZ'])*(rows-1)))
    a,b=int(u),int(v)
    c,d=min(a+1,cols-1),min(b+1,rows-1)
    tx,tz=u-a,v-b
    values=grid['values']
    return ((values[b*cols+a]*(1-tx)+values[b*cols+c]*tx)*(1-tz)
            +(values[d*cols+a]*(1-tx)+values[d*cols+c]*tx)*tz)


def ground(x, north):
    height=max(0,sample_grid(GROUND_GRID,x,north))
    # Match the finer district at the overlap; outside the measured city use a
    # low ground skirt extending beyond the camera's far plane, never a cliff.
    if x<180 and NEAR_GRID['minZ']<north<NEAR_GRID['maxZ']:
        mix=max(0,min(1,(x-80)/100))
        height=sample_grid(NEAR_GRID,x,north)*(1-mix)+height*mix
    outside=max(0,x-GROUND_GRID['maxX'],GROUND_GRID['minZ']-north,north-GROUND_GRID['maxZ'])
    return height*max(0,1-outside/1800)


def world_face(points, mat):
    vertices, faces = BATCH.setdefault(mat, ([], []))
    start=len(vertices)
    vertices.extend(points)
    faces.append(tuple(range(start,start+len(points))))


def point(p):
    x, y, z = p
    c, s = math.cos(CURRENT['rotation']), math.sin(CURRENT['rotation'])
    return (CURRENT['x'] + x*c-y*s, CURRENT['north'] + x*s+y*c,
            CURRENT['base'] + z*HEIGHT_LIFT)


def face(points, mat):
    vertices, faces = BATCH.setdefault(mat, ([], []))
    start = len(vertices)
    vertices.extend(point(p) for p in points)
    faces.append(tuple(range(start, start+len(points))))


def box(x, y, z, width, depth, height, mat):
    v = [(x+dx*width/2, y+dy*depth/2, z+dz*height/2)
         for dx, dy, dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                           (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        face([v[i] for i in ids], mat)


def ring(z0, z1, radius0, radius1, mat, count=48, ratio=1., exponent=1.):
    def circle(z, r):
        result = []
        for i in range(count):
            a = i*math.tau/count
            c, s = math.cos(a), math.sin(a)
            result.append((math.copysign(abs(c)**exponent, c)*r,
                           math.copysign(abs(s)**exponent, s)*r*ratio, z))
        return result
    lower, upper = circle(z0, radius0), circle(z1, radius1)
    face(lower[::-1], mat)
    face(upper, mat)
    for i in range(count):
        j = (i+1) % count
        face([lower[i], lower[j], upper[j], upper[i]], mat)


def beam(a, b, radius, mat, sides=5):
    a, b = Vector(a), Vector(b)
    normal = (b-a).normalized()
    u = normal.cross(Vector((0,0,1)))
    if u.length < .01:
        u = normal.cross(Vector((1,0,0)))
    u.normalize()
    v = normal.cross(u)
    rings = [[p + radius*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))
              for i in range(sides)] for p in (a, b)]
    for i in range(sides):
        j = (i+1) % sides
        face([rings[0][i], rings[0][j], rings[1][j], rings[1][i]], mat)


def frustum(z0, z1, w0, d0, w1, d1, mat):
    a = [(-w0/2,-d0/2,z0),(w0/2,-d0/2,z0),(w0/2,d0/2,z0),(-w0/2,d0/2,z0)]
    b = [(-w1/2,-d1/2,z1),(w1/2,-d1/2,z1),(w1/2,d1/2,z1),(-w1/2,d1/2,z1)]
    face(a[::-1], mat)
    face(b, mat)
    for i in range(4):
        j = (i+1) % 4
        face([a[i],a[j],b[j],b[i]], mat)


def landmark(name, lat, lon, height, base=8, rotation=0, reference=None):
    global CURRENT
    CURRENT = dict(name=name, latitude=lat, longitude=lon, publishedHeight=height,
                   modeledHeight=height*HEIGHT_LIFT, base=base,
                   x=(lon-ORIGIN_LON)*111320*math.cos(math.radians(ORIGIN_LAT)),
                   north=(lat-ORIGIN_LAT)*111320, rotation=math.radians(rotation),
                   reference=reference or 'https://en.wikipedia.org/wiki/'+name.replace(' ', '_'))
    CURRENT['base']=ground(CURRENT['x'],CURRENT['north'])-.12
    FEATURES.append(CURRENT)


def curtain_tower(w, d, h, body=GLASS, fins=SILVER, floor=4.1, vertical=4.5):
    box(0,0,h/2,w,d,h,body)
    for i in range(1, int(h/floor)):
        box(0,0,i*floor,w+.22,d+.22,.26,fins)
    for side in (-1, 1):
        for i in range(1, int(w/vertical)):
            x = -w/2+i*w/int(w/vertical)
            box(x,side*(d/2+.12),h/2,.25,.24,h,fins)
        for i in range(1, int(d/vertical)):
            y = -d/2+i*d/int(d/vertical)
            box(side*(w/2+.12),y,h/2,.24,.25,h,fins)
    box(0,0,h+1,w+.6,d+.6,2,fins)
    box(0,0,h+2.9,w*.42,d*.52,3.8,ROOF)


# Rounded four-sided profile, continuously tapering fins and illuminated crown.
landmark('Salesforce Tower',37.7899,-122.3969,326,7,45)
def salesforce_radius(z):
    if z <= 292:
        return 33-11*(z/292)**1.8
    return 22*math.sqrt(max(0,1-((z-292)/34)**2))
for level in range(64):
    z = level*4.56
    ring(z,z+4.29,salesforce_radius(z),salesforce_radius(z+4.29),
         LIGHT if level > 44 else GLASS,48,.96,.84)
    ring(z+4.29,z+4.56,salesforce_radius(z+4.29)+.38,salesforce_radius(z+4.56)+.38,
         SILVER,48,.96,.84)
for i in range(14):
    z = 292+i*34/14
    ring(z,z+34/14,salesforce_radius(z),salesforce_radius(z+34/14),LIGHT,48,.96,.84)
    ring(z,z+.22,salesforce_radius(z)+.16,salesforce_radius(z+.22)+.16,SILVER,48,.96,.84)
for i in range(32):
    a=i*math.tau/32
    for j in range(24):
        z0,z1=j*324/24,(j+1)*324/24
        points=[]
        for z in (z0,z1):
            r=salesforce_radius(z)+.4
            points.append((math.copysign(abs(math.cos(a))**.84,math.cos(a))*r,
                           math.copysign(abs(math.sin(a))**.84,math.sin(a))*r*.96,z))
        beam(points[0],points[1],.20,SILVER,4)

# Transamerica's tapered quartz pyramid, shoulder wings and narrow spire.
landmark('Transamerica Pyramid',37.7952,-122.4028,260,10,-9)
frustum(0,202,51,51,9,9,CREAM)
frustum(202,260,9,9,.7,.7,CREAM)
for z in range(16,202,4):
    half=25.5-21*z/202
    for side in (-1,1):
        box(0,side*(half+.03),z,half*1.67,.13,1.05,DEEP)
        box(side*(half+.03),0,z,.13,half*1.67,1.05,DEEP)
for side in (-1,1):
    box(side*17.7,0,103,6.6,13,109,CREAM)
    box(side*17.7,0,159,6.6,13,3,CREAM)
    for z in range(68,157,8):
        box(side*21.1,0,z,.15,10,2,DEEP)

# Broad carnelian granite tower with deep vertical bays and stepped roof.
landmark('555 California Street',37.7919,-122.4038,237,26,-9)
curtain_tower(76,49,227,BRONZE_DARK,BRONZE,4.25,4.8)
for x in (-29,-15,0,15,29):
    box(x,0,231-abs(x)*.10,13,46,12-abs(x)*.20,BRONZE)

# 181 Fremont's asymmetrical crown and silver megabraced exoskeleton.
landmark('181 Fremont',37.78970,-122.39535,244,8,45)
curtain_tower(34,31,211,GLASS,SILVER,4.1,5.2)
frustum(211,228,34,31,20,22,LIGHT)
beam((11,8,218),(11,8,244),.8,SILVER,6)
for side in (-1,1):
    for z in (0,105):
        beam((-17,side*15.8,z),(17,side*15.8,z+105),.9,SILVER)
        beam((17,side*15.8,z),(-17,side*15.8,z+105),.9,SILVER)
        beam((side*17.4,-15.5,z),(side*17.4,15.5,z+105),.9,SILVER)

# The intermediate skyline is named architecture, not randomly scattered blocks.
landmark('50 Fremont Center',37.790472,-122.39725,183,8,45)
curtain_tower(52,47,179,CREAM,DEEP,3.9,5.1)
landmark('44 Montgomery',37.7898,-122.4018,172.2,18,-9)
curtain_tower(40,49,168,BRONZE_DARK,BRONZE,4,4.2)
landmark('101 California Street',37.79285,-122.39793,183,5,0)
for i in range(46):
    ring(i*3.9,i*3.9+3.65,31,31,GLASS,48)
    ring(i*3.9+3.65,(i+1)*3.9,31.3,31.3,SILVER,48)
ring(179.4,183,31,28,LIGHT,48)
landmark('345 California Center',37.7925,-122.4005,212,12,-9)
curtain_tower(41,44,172,GLASS,STONE,4.1,5)
for side in (-1,1):
    box(side*13,0,188,15,38,30,LIGHT)
    frustum(203,209,41,38,27,21,SILVER)
    beam((side*13,0,201),(side*13,0,212),.4,SILVER)
landmark('One California',37.7932,-122.3972,133.5,5,-9)
curtain_tower(54,48,129,DEEP,STONE,4.2,5)
landmark('Millennium Tower (San Francisco)',37.7904,-122.3961,184,7,45)
curtain_tower(48,31,180,GLASS,LIGHT,3.9,5.4)
landmark('Park Tower at Transbay',37.7903,-122.3943,184,5,45)
curtain_tower(54,42,169,GLASS,SILVER,4.1,5.3)
box(10,3,176,29,32,16,GLASS)
landmark('Salesforce East',37.7908,-122.3966,129,5,45)
curtain_tower(55,42,125,LIGHT,SILVER,4.1,5.3)
landmark('One Market Plaza',37.79329,-122.39452,172,5,-9)
curtain_tower(38,61,168,DEEP,BRONZE,4.1,5)
landmark('One Rincon Hill',37.785778,-122.392139,200,23,45)
curtain_tower(34,31,193,GLASS,LIGHT,3.4,4.5)
box(0,0,196,25,24,8,SILVER)
landmark('One Rincon Hill north tower',37.78636,-122.39201,165,22,45,
         'https://en.wikipedia.org/wiki/One_Rincon_Hill')
curtain_tower(35,32,161,GLASS,LIGHT,3.4,4.5)
landmark('140 New Montgomery',37.7868194444444,-122.399905555556,132.7,11,45)
curtain_tower(46,35,119,DEEP,STONE,4,3.6)
for step in range(3):
    box(0,0,121+step*4,36-step*9,28-step*7,5,STONE)
landmark('Four Seasons Hotel, San Francisco',37.786361,-122.404417,121,19,45)
curtain_tower(65,30,116,GLASS,STONE,3.7,5.2)

# Marriott's familiar stepped fan is a useful intermediate skyline silhouette.
landmark('San Francisco Marriott Marquis',37.7849,-122.4043,133,16,45)
curtain_tower(83,40,96,BRONZE_DARK,TERRA,3.8,4.6)
for i in range(-5,6):
    top=132-abs(i)*5.6
    box(i*6.7,0,(97+top)/2,6.45,30,top-97,LIGHT)
    box(i*6.7,0,top+.45,6.7,31,.9,STONE)

# Fox Plaza anchors the eastern Hayes vista at its real Civic Center bearing.
landmark('Fox Plaza (San Francisco)',37.77714,-122.41723,107.9,21,-9)
curtain_tower(69,31,103.8,BRONZE_DARK,STONE,3.5,4.5)

# City Hall's tall gilded dome appears beyond the Painted Ladies' roofline.
landmark('San Francisco City Hall',37.77919,-122.41914,93.7,16,-9)
box(0,0,13,122,84,26,STONE)
box(0,0,27.3,125,87,2.6,CREAM)
box(0,0,30.5,75,45,4,STONE)
for x in range(-54,55,9):
    for side in (-1,1):
        box(x,side*42.2,16,4.4,.3,11,DEEP)
        box(x-3.1,side*43,16,.9,1.1,15,CREAM)
ring(29,43,17,17,CREAM,48)
ring(42,45,19,19,STONE,48)
for i in range(24):
    a=i*math.tau/24
    beam((16.2*math.cos(a),16.2*math.sin(a),32),(16.2*math.cos(a),16.2*math.sin(a),44),.5,CREAM)
for i in range(16):
    a,b=i*math.pi/32,(i+1)*math.pi/32
    ring(45+30*math.sin(a),45+30*math.sin(b),19*math.cos(a),19*math.cos(b),DOME,48)
for i in range(16):
    a=i*math.tau/16
    for j in range(10):
        t0,t1=j*math.pi/20,(j+1)*math.pi/20
        beam((19.2*math.cos(t0)*math.cos(a),19.2*math.cos(t0)*math.sin(a),45+30*math.sin(t0)),
             (19.2*math.cos(t1)*math.cos(a),19.2*math.cos(t1)*math.sin(a),45+30*math.sin(t1)),.17,GOLD)
ring(73,83,3.3,3.3,CREAM,20)
ring(82,84,4,4,GOLD,20)
ring(84,89,4,.6,DOME,20)
beam((0,0,88),(0,0,93.7),.24,GOLD,6)

# Continuous terrain and real lower-city parcels anchor the tower bases. This
# entire layer begins behind the foreground district, east of the park view.
context_count=0
for building in CONTEXT['buildings']:
    polygon=building['polygon']
    x=sum(p[0] for p in polygon)/len(polygon)
    north=sum(p[1] for p in polygon)/len(polygon)
    if any(math.hypot(x-f['x'],north-f['north']) <
           (100 if f['name']=='San Francisco City Hall' else 57 if f['name']=='555 California Street' else 43)
           for f in FEATURES):
        continue
    wall=CITY_WALLS[int(building['id'])%len(CITY_WALLS)]
    top=ground(x,north)+building['height']
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        world_face([(a[0],a[1],ground(*a)-.3),(b[0],b[1],ground(*b)-.3),
                    (b[0],b[1],top),(a[0],a[1],top)],wall)
    world_face([(p[0],p[1],top) for p in polygon],CITY_ROOF)
    context_count+=1

xs=list(range(80,6201,60))+[10000]
ns=list(range(-2400,5401,60))+[10000]
for x0,x1 in zip(xs,xs[1:]):
    for n0,n1 in zip(ns,ns[1:]):
        world_face([(x0,n0,ground(x0,n0)-.55),(x1,n0,ground(x1,n0)-.55),
                    (x1,n1,ground(x1,n1)-.55),(x0,n1,ground(x0,n1)-.55)],CITY_GROUND)
# A skyline camera can see northwest beyond the detailed terrain rectangle.
# Close the distant patch's exposed edges and put a low floor under the entire
# district. It stays beneath every measured route/park surface; it only replaces
# sky seen through otherwise open terrain boundaries, including wide viewports.
floor_z=-2.
world_face([(-12000,-12000,floor_z),(12000,-12000,floor_z),
            (12000,12000,floor_z),(-12000,12000,floor_z)],CITY_GROUND)
for north0,north1 in zip(ns,ns[1:]):
    for east,reverse in [(xs[0],False),(xs[-1],True)]:
        wall=[(east,north0,floor_z),(east,north0,ground(east,north0)-.55),
              (east,north1,ground(east,north1)-.55),(east,north1,floor_z)]
        world_face(wall[::-1] if reverse else wall,CITY_GROUND)
for east0,east1 in zip(xs,xs[1:]):
    for north,reverse in [(ns[0],False),(ns[-1],True)]:
        wall=[(east0,north,floor_z),(east1,north,floor_z),
              (east1,north,ground(east1,north)-.55),(east0,north,ground(east0,north)-.55)]
        world_face(wall[::-1] if reverse else wall,CITY_GROUND)

objects=[]
for mat,(vertices,faces) in BATCH.items():
    mesh=bpy.data.meshes.new('Cerebral skyline / '+mat)
    mesh.from_pydata(vertices,[],faces)
    mesh.materials.append(MATERIAL[mat])
    mesh.update()
    if mat==CITY_GROUND:
        for polygon in mesh.polygons:
            polygon.use_smooth=True
    obj=bpy.data.objects.new(mesh.name,mesh)
    bpy.context.collection.objects.link(obj)
    objects.append(obj)

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(*srgb('#c6d8e3'),1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.75
bpy.ops.object.light_add(type='SUN',location=(-300,-300,700))
sun=bpy.context.object
sun.rotation_euler=(math.radians(48),math.radians(-45),math.radians(-40))
sun.data.energy=2.3
sun.data.angle=.09
bpy.ops.object.camera_add(location=(-900,-30,100))
camera=bpy.context.object
camera.data.lens=48
camera.data.clip_end=12000
scene.camera=camera
camera.rotation_euler=(Vector((2300,1000,115))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1920
scene.render.resolution_y=1080
scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/cerebral-skyline.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'skyline.glb'),export_format='GLB',
    use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=18,export_draco_normal_quantization=10)
triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in objects)
metadata=dict(origin=dict(longitude=ORIGIN_LON,latitude=ORIGIN_LAT),heightLift=HEIGHT_LIFT,
              axes='Blender X east, Y north, Z elevation; glTF X east, Y elevation, negative Z north',
              triangles=triangles,materialBatches=len(objects),landmarks=FEATURES,
              contextBuildings=context_count,contextTerrain='USGS 3DEP 144×144 grid; closed edge skirts and y=-2 ground floor beneath entire region',
              notes='Landmark coordinates and published heights are sourced. Bases sample USGS terrain. Horizontal dimensions and facade detail are artistic approximations. Rendered landmark heights use 1.12 lift; no horizontal position compression. Distant context uses OSM footprints and subdued height massing capped at 105m.')
(OUT/'skyline.meta.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('SKYLINE',triangles,'triangles,',len(objects),'material batches,',len(FEATURES),'landmarks')
if '--skip-render' not in sys.argv:
    scene.render.filepath=str(REVIEW/'cerebral-skyline-panorama.png')
    bpy.ops.render.render(write_still=True)
    # A second view includes the actual hero architecture for scale and bearing.
    bpy.ops.import_scene.gltf(filepath=str(OUT/'heroes.glb'))
    camera.location=(-917,-36,89)
    camera.data.lens=24
    camera.rotation_euler=(Vector((-620,10,60))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(REVIEW/'cerebral-skyline-painted-ladies.png')
    bpy.ops.render.render(write_still=True)
