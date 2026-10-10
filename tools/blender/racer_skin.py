"""Original, restrained complexion maps for the anatomically modelled heads.

The caller supplies an equirectangular UV chart: front centre U=.5, rear seam
U=0/1, chin V=0 and crown V=1. Use this material on that head and matching facial
patches only; uncharted ears, necks and hands can keep their plain skin material.
No portrait, painted anatomy, baked lighting or photographic pixels are used.
The head mesh supplies all facial shape and likeness.
"""
import math

import bpy
import numpy as np

from racer_materials import TEXTURE_DIR, _cell_grain, _image, _linear, _normal, _png, _srgb


VERSION = 1
SIZE = 256
_MAPS = None


def _noise(size, count, seed):
    """Smooth periodic variation; no isolated freckles or gritty white noise."""
    field = np.random.default_rng(seed).uniform(-1, 1, (count, count))
    axis = (np.arange(size, dtype=np.float64) + .5) / size * count
    whole = np.floor(axis).astype(int)
    fraction = axis - whole
    blend = fraction * fraction * (3 - 2 * fraction)
    x, y = np.meshgrid(whole, whole)
    bx, by = np.meshgrid(blend, blend)
    lower = field[y % count, x % count] * (1 - bx) + field[y % count, (x + 1) % count] * bx
    upper = field[(y + 1) % count, x % count] * (1 - bx) + field[(y + 1) % count, (x + 1) % count] * bx
    return lower * (1 - by) + upper * by


def _maps():
    global _MAPS
    if _MAPS is not None:
        return _MAPS
    axis = (np.arange(SIZE, dtype=np.float64) + .5) / SIZE
    u, rows = np.meshgrid(axis, axis)
    v = 1 - rows  # PNG rows descend; the head's UV V ascends toward the crown.
    angle = math.tau * (u - .5)
    x = np.sin(angle)
    front = np.maximum(np.cos(angle), 0) ** 4
    cheek = np.exp(-((np.abs(x) - .54) / .22) ** 2 - ((v - .47) / .15) ** 2) * front
    nose = np.exp(-(x / .17) ** 2 - ((v - .44) / .14) ** 2) * front
    forehead = np.exp(-(x / .62) ** 2 - ((v - .76) / .17) ** 2) * front
    soft = _noise(SIZE, 11, 6017)
    fine = _noise(SIZE, 67, 8149)

    # Changes are deliberately a few percent: shape remains legible in a
    # neutral light, without a flat single-colour doll finish or painted lines.
    multiplier = np.repeat((1 + .012 * soft + .003 * fine)[..., None], 3, axis=-1)
    multiplier += cheek[..., None] * np.array([.029, -.013, -.018])
    multiplier += nose[..., None] * np.array([.016, -.009, -.012])
    roughness = np.clip(.655 - .065 * forehead - .095 * nose + .018 * cheek
                        + .020 * soft + .008 * fine, .52, .70)
    orm = np.stack((np.ones_like(roughness), roughness, np.zeros_like(roughness)), axis=-1) * 255

    # A separate 3 cm micro-normal tile repeats across the chart. At roughly
    # 1 mm grain and 11 micrometres relief, it breaks perfect smoothness only
    # in close views; it must never substitute for eyelid or nose geometry.
    micro_axis = (np.arange(128, dtype=np.float64) + .5) / 128
    mu, mv = np.meshgrid(micro_axis, micro_axis)
    height = .000011 * _cell_grain(mu, mv, count=32)
    normal = _normal(height, .03)
    _MAPS = (multiplier, orm, normal)
    return _MAPS


def build_skin_material(ident, basecolor):
    """Return a shared glTF-safe head material for either standing/seated pose.

    The active render UV layer must contain the caller's head chart. This
    material intentionally has no ``racer_tile_metres`` property, so garment
    projection never overwrites those UVs. All maps are packed into the GLB.
    """
    name = ident + ' / softly varied skin'
    material = bpy.data.materials.get(name)
    if (material is not None and material.get('racer_skin_version') == VERSION
            and material.get('racer_skin_basecolor') == basecolor):
        return material
    material = material or bpy.data.materials.new(name)
    multiplier, orm, normal = _maps()
    base = _srgb(basecolor)
    suffix = basecolor.lstrip('#').lower()
    images = {
        'complexion': _image(_png(TEXTURE_DIR / f'skin-{suffix}-color.png', base[None, None, :] * multiplier * 255), True),
        'roughness': _image(_png(TEXTURE_DIR / 'skin-complexion-roughness.png', orm)),
        'normal': _image(_png(TEXTURE_DIR / 'skin-micro-normal.png', normal)),
    }
    material.use_nodes = True
    material.diffuse_color = (*_linear(base), 1)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial'); output.location = (650, 100)
    shader = nodes.new('ShaderNodeBsdfPrincipled'); shader.location = (350, 100)
    shader.inputs['Base Color'].default_value = material.diffuse_color
    shader.inputs['Roughness'].default_value = .65
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['IOR'].default_value = 1.42
    shader.inputs['Specular IOR Level'].default_value = .35
    shader.inputs['Coat Weight'].default_value = 0
    shader.inputs['Subsurface Weight'].default_value = 0  # Keep browser and Blender consistent.
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])

    for index, (channel, image) in enumerate(images.items()):
        node = nodes.new('ShaderNodeTexImage'); node.image = image
        node.name = 'Export / skin ' + channel; node.label = 'Subtle skin ' + channel
        node.extension = 'REPEAT'; node.interpolation = 'Linear'
        node.location = (-450, 360 - index * 270)
        if channel == 'complexion':
            links.new(node.outputs['Color'], shader.inputs['Base Color'])
        elif channel == 'roughness':
            separate = nodes.new('ShaderNodeSeparateColor'); separate.mode = 'RGB'; separate.location = (-80, 0)
            links.new(node.outputs['Color'], separate.inputs['Color'])
            links.new(separate.outputs['Green'], shader.inputs['Roughness'])
            links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
        else:
            coordinates = nodes.new('ShaderNodeTexCoord'); coordinates.location = (-1030, -200)
            mapping = nodes.new('ShaderNodeMapping'); mapping.vector_type = 'POINT'; mapping.location = (-800, -200)
            mapping.inputs['Scale'].default_value = (32, 16, 1)
            links.new(coordinates.outputs['UV'], mapping.inputs['Vector'])
            links.new(mapping.outputs['Vector'], node.inputs['Vector'])
            bump = nodes.new('ShaderNodeNormalMap'); bump.space = 'TANGENT'; bump.location = (-80, -200)
            bump.inputs['Strength'].default_value = .42
            links.new(node.outputs['Color'], bump.inputs['Color'])
            links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    material['racer_skin_version'] = VERSION
    material['racer_skin_basecolor'] = basecolor
    material['racer_skin_uv'] = 'Head chart: front U=.5, chin V=0, crown V=1'
    material['racer_texture_origin'] = 'Original restrained complexion and micro-relief; no photographic images.'
    return material
