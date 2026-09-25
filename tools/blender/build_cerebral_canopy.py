"""UV-preserving distant foliage for the existing CC0 Poly Haven jacaranda.

The source's 55k leaf triangles include disconnected, alpha-textured cards.
Edge-collapse decimation destroys their UV coverage. This LOD instead samples
whole spatially connected leaf islands, copying all retained vertices, faces,
UV corners, and shading normals unchanged. Branch and trunk meshes may decimate.
Runtime reuses the credited original textures and material names.
"""
import bpy, json, math, random, collections, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/cerebral-valley'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/assets/vegetation/jacaranda.glb'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
report=[]

def leaf_islands(mesh):
    """Connectivity across duplicated UV/normal-seam vertices, without welding."""
    parent=list(range(len(mesh.vertices)))
    def find(a):
        while parent[a]!=a:
            parent[a]=parent[parent[a]];a=parent[a]
        return a
    def union(a,b):
        a=find(a);b=find(b)
        if a!=b:parent[a]=b
    for p in mesh.polygons:
        for v in p.vertices[1:]:union(p.vertices[0],v)
    tree=KDTree(len(mesh.vertices))
    for v in mesh.vertices:tree.insert(v.co,v.index)
    tree.balance()
    # 0.01 mm only reconnects coincident seam copies; it does not merge leaves
    # that overlap in projection or join neighboring branches into a giant card.
    for v in mesh.vertices:
        for co,index,distance in tree.find_range(v.co,0.00001):
            if index>v.index:union(v.index,index)
    groups={}
    for p in mesh.polygons:groups.setdefault(find(p.vertices[0]),[]).append(p.index)
    islands=[]
    for faceids in groups.values():
        vertexids=set(i for f in faceids for i in mesh.polygons[f].vertices)
        center=sum((mesh.vertices[i].co for i in vertexids),Vector())/len(vertexids)
        islands.append({'faces':faceids,'center':center,'triangles':sum(len(mesh.polygons[f].vertices)-2 for f in faceids)})
    return islands

for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH':continue
    obj.name=obj.data.materials[0].name
    before=sum(len(p.vertices)-2 for p in obj.data.polygons)
    bpy.context.view_layer.objects.active=obj
    if 'leaves' not in obj.name.lower():
        mod=obj.modifiers.new('Distant woody structure','DECIMATE');mod.ratio=.32
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.validate(clean_customdata=False)
        report.append({'name':obj.name,'before':before,'after':sum(len(p.vertices)-2 for p in obj.data.polygons),'method':'edge collapse on woody structure only'})
        continue
    src=obj.data
    islands=leaf_islands(src)
    histogram=collections.Counter(i['triangles'] for i in islands)
    # Estimate actual textured surface coverage. Uniform random thinning spends
    # too much of a finite budget on small, nearly transparent atlas fragments.
    # Preserve full cards with the most visible foliage area per triangle.
    alpha_image=next(node.image for node in src.materials[0].node_tree.nodes if node.type=='TEX_IMAGE' and node.image and 'leaves_diff' in (node.image.name+node.image.filepath))
    width,height=alpha_image.size;pixels=np.empty(width*height*4,dtype=np.float32);alpha_image.pixels.foreach_get(pixels);alpha=pixels.reshape(height,width,4)[:,:,3]
    uvdata=src.uv_layers.active.data
    for island in islands:
        area=0.
        for fi in island['faces']:
            face=src.polygons[fi];uv=[uvdata[k].uv for k in face.loop_indices]
            a,b,c=uv[:3]
            samples=[(a+b+c)/3,(a*2+b+c)/4,(a+b*2+c)/4,(a+b+c*2)/4,(a+b)/2,(a+c)/2,(b+c)/2]
            opacity=sum(float(alpha[min(height-1,max(0,int(t.y*height))),min(width-1,max(0,int(t.x*width)))]) for t in samples)/len(samples)
            area+=face.area*opacity
        island['leafArea']=area
    # One representative in every occupied small spatial cell maintains fine
    # peripheral sprays instead of spending the budget only in the dense core.
    # The rest is unbiased deterministic sampling of complete islands.
    rng=random.Random(53124);order=list(range(len(islands)));rng.shuffle(order)
    cells={}
    for index in order:
        center=islands[index]['center'];key=tuple(math.floor(c/.50) for c in center)
        cells.setdefault(key,[]).append(index)
    selected=set(max(indices,key=lambda i:islands[i]['leafArea']/islands[i]['triangles']) for indices in cells.values())
    # Retain the outermost island in many viewing directions. Real source card
    # vertices stay fixed, so the canopy outline is not contracted by decimation.
    for k in range(96):
        z=1-2*(k+.5)/96;r=math.sqrt(1-z*z);a=k*math.pi*(3-math.sqrt(5));direction=Vector((r*math.cos(a),r*math.sin(a),z))
        selected.add(max(range(len(islands)),key=lambda i:islands[i]['center'].dot(direction)))
    target=27000
    current=sum(islands[i]['triangles'] for i in selected)
    assert current<target, ('Spatial stratification exceeds budget',current)
    ranked=sorted(order,key=lambda i:islands[i]['leafArea']/islands[i]['triangles'],reverse=True)
    for index in ranked:
        if index in selected:continue
        cost=islands[index]['triangles']
        if current+cost<=target:selected.add(index);current+=cost
        if current>=target:break
    keep=sorted(f for i in selected for f in islands[i]['faces'])
    verts=sorted(set(v for f in keep for v in src.polygons[f].vertices));mapping={v:i for i,v in enumerate(verts)}
    old_normals=[n.vector.copy() for n in src.corner_normals]
    faces=[[mapping[v] for v in src.polygons[f].vertices] for f in keep]
    mesh=bpy.data.meshes.new('Jacaranda intact leaf cards / distant')
    mesh.from_pydata([tuple(src.vertices[i].co) for i in verts],[],faces);mesh.update()
    layer=mesh.uv_layers.new(name=src.uv_layers.active.name)
    normals=[];max_uv_error=0.
    for newpoly,oldidx in zip(mesh.polygons,keep):
        oldpoly=src.polygons[oldidx];newpoly.use_smooth=oldpoly.use_smooth
        for newloop,oldloop in zip(newpoly.loop_indices,oldpoly.loop_indices):
            layer.data[newloop].uv=src.uv_layers.active.data[oldloop].uv
            max_uv_error=max(max_uv_error,(layer.data[newloop].uv-src.uv_layers.active.data[oldloop].uv).length)
            normals.append(tuple(old_normals[oldloop]))
    mesh.normals_split_custom_set(normals)
    for m in src.materials:mesh.materials.append(m)
    max_position_error=max((mesh.vertices[mapping[i]].co-src.vertices[i].co).length for i in verts)
    assert max_position_error==0 and max_uv_error==0
    assert len(mesh.polygons)==sum(len(islands[i]['faces']) for i in selected)
    obj.data=mesh
    record={'name':obj.name,'before':before,'after':current,'method':'whole leaf-island sampling, no leaf edge collapse','sourceConnectedIslands':len(islands),'retainedIslands':len(selected),'sourceIslandTriangleHistogram':dict(sorted(histogram.items())),'spatialCells':len(cells),'sourceLeafVertices':len(src.vertices),'retainedLeafVertices':len(mesh.vertices),'maximumRetainedVertexDisplacement':max_position_error,'maximumRetainedUVDisplacement':max_uv_error,'silhouetteDirections':96,'seed':53124,'sourceTexturedLeafArea':sum(i['leafArea'] for i in islands),'retainedTexturedLeafArea':sum(islands[i]['leafArea'] for i in selected),'selection':'per-cell coverage representative plus highest visible leaf area per triangle'}
    report.append(record)
    print('CEREBRAL_INTACT_LEAF_AUDIT',json.dumps(record),flush=True)

bpy.ops.export_scene.gltf(filepath=str(OUT/'canopy-lod.glb'),export_format='GLB',export_materials='NONE',export_normals=True,export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
(OUT/'canopy-lod.meta.json').write_text(json.dumps(report,indent=2)+'\n')
print('CEREBRAL_CANOPY_REPORT',json.dumps(report),flush=True)

# Optional temporary QA only; never exports lights or duplicate material maps.
if '--review' in sys.argv:
    for m in bpy.data.materials:
        if 'leaves' not in m.name:continue
        p=m.node_tree.nodes.get('Principled BSDF')
        if p:p.inputs['Roughness'].default_value=.83
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
    scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('Temporary clear daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.63,.78,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
    bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.data.energy=2.8;sun.data.angle=.08;sun.rotation_euler=(.6,-.4,-.4)
    meshes=[o for o in scene.objects if o.type=='MESH'];points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    center=Vector(((min(p.x for p in points)+max(p.x for p in points))/2,(min(p.y for p in points)+max(p.y for p in points))/2,(min(p.z for p in points)+max(p.z for p in points))/2))
    bpy.ops.object.camera_add(location=center+Vector((31,-35,8)));cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=50;scene.camera=cam
    scene.render.filepath='/private/tmp/cerebral-canopy-intact-card-review.png';bpy.ops.render.render(write_still=True)
