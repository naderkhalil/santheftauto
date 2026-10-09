"""Original, seamless PBR fabrics for the exported racer kit.

Only image textures, Separate Color and tangent-space Normal Map nodes are used:
all visible detail survives glTF export. No photographs or external textures.
Call build_character_materials(ident, spec) once for either pose; repeated calls
reuse the same Blender materials/images and the same packed PNG source files.

UVs must be generated AFTER remeshing. One UV unit covers the material's
``racer_tile_metres`` metres (leather .064 m, cloth/knit .032 m). Use the active UV
map, equal physical texel density across islands, and no mirrored islands.
For rib trim, U crosses the ribs and V runs along their length. Geometry owns
the large folds, seam rolls and panel wear; these maps add restrained microdetail.
"""
from pathlib import Path
import math
import struct
import zlib

import bpy
import numpy as np


VERSION = 2
SIZE = 128
ROOT = Path(__file__).resolve().parents[2]
TEXTURE_DIR = ROOT / 'art/textures/racers'
TILE_METRES = {'leather': .064, 'jersey': .032, 'poplin': .032, 'twill': .032, 'rib': .032}
_SURFACES = {}


def _png(path, pixels):
    """Write deterministic 8-bit RGB PNGs, with simple per-row PNG filtering."""
    pixels = np.ascontiguousarray(np.clip(np.rint(pixels), 0, 255), dtype=np.uint8)
    rows = []
    previous = np.zeros(pixels.shape[1] * 3, dtype=np.uint8)
    for row in pixels.reshape(pixels.shape[0], -1):
        left = np.concatenate((np.zeros(3, dtype=np.uint8), row[:-3]))
        candidates = [row, row - left, row - previous]
        choice = min(range(3), key=lambda index: np.abs(candidates[index].view(np.int8).astype(np.int16)).sum())
        rows.append(bytes([choice]) + candidates[choice].tobytes())
        previous = row

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    header = struct.pack('>IIBBBBB', pixels.shape[1], pixels.shape[0], 8, 2, 0, 0, 0)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)
    return path


def _normal(height_metres, tile_metres):
    pitch = tile_metres / SIZE
    dx = (np.roll(height_metres, -1, axis=1) - np.roll(height_metres, 1, axis=1)) / (2 * pitch)
    dy = (np.roll(height_metres, -1, axis=0) - np.roll(height_metres, 1, axis=0)) / (2 * pitch)
    # PNG rows run downwards; tangent +V runs upwards (OpenGL/glTF normal maps).
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    return (normal * .5 + .5) * 255


def _cell_grain(u, v, count=28):
    """Periodic jittered cells: irregular leather pores, without white-noise paint."""
    rng = np.random.default_rng(7319)
    centers = rng.uniform(.17, .83, (count, count, 2))
    x, y = u * count, v * count
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    first = np.full_like(u, np.inf)
    second = np.full_like(u, np.inf)
    for sy in (-1, 0, 1):
        for sx in (-1, 0, 1):
            cell = centers[(iy + sy) % count, (ix + sx) % count]
            distance = np.hypot(x - (ix + sx + cell[..., 0]), y - (iy + sy + cell[..., 1]))
            second = np.minimum(second, np.maximum(first, distance))
            first = np.minimum(first, distance)
    edge = np.clip((second - first) / .31, 0, 1)
    return edge * edge * (3 - 2 * edge)


def _surface(kind):
    if kind in _SURFACES:
        return _SURFACES[kind]
    axis = (np.arange(SIZE, dtype=np.float64) + .5) / SIZE
    u, v = np.meshgrid(axis, axis)
    tau = math.tau
    if kind == 'leather':
        # Slightly open, irregular pebbles remain legible at portrait distance.
        # The periodic warp avoids a neat repeated grid without adding noise.
        grain = _cell_grain(u + .009 * np.sin(tau * 3 * v),
                            v + .007 * np.sin(tau * (2 * u + v)), count=20)
        # Very shallow natural creases; the tailored mesh supplies major folds.
        crease = .5 + .5 * np.sin(tau * (3 * u + .12 * np.sin(tau * 2 * v)))
        secondary = .5 + .5 * np.cos(tau * (5 * v + .08 * np.sin(tau * 3 * u)))
        height = .00015 * grain + .000025 * crease * secondary
        wear = np.clip(grain, 0, 1) ** 2
        variation = .96 + .09 * grain + .018 * (crease - .5)
        roughness = np.clip(.65 - .14 * wear + .025 * (secondary - .5), .49, .67)
    elif kind == 'rib':
        ribs = (.5 + .5 * np.cos(tau * 12 * u)) ** 1.7
        stitch = .5 + .5 * np.cos(tau * (24 * v + .2 * np.sin(tau * 12 * u)))
        height = .00012 * ribs + .000026 * stitch * ribs
        variation = .94 + .07 * ribs + .012 * stitch
        roughness = .87 - .065 * ribs
    elif kind == 'jersey':
        # Tiny interlocking V loops distinguish a crewneck from woven shirts.
        column = (u * 16 + .5) % 1 - .5
        row = (v * 20 + .68 * np.abs(column) + .5) % 1 - .5
        loop = np.exp(-(row / .13) ** 2)
        fiber = .5 + .5 * np.cos(tau * (48 * u + 20 * v))
        height = .000055 * loop + .000008 * fiber
        variation = .97 + .045 * loop + .007 * fiber
        roughness = .89 - .055 * loop
    else:
        # Warp and weft alternately sit proud; no coarse painted checkerboard.
        count = 24
        x, y = u * count, v * count
        warp = np.cos(math.pi * x) ** 6
        weft = np.cos(math.pi * y) ** 6
        if kind == 'twill':
            over = .5 + .5 * np.sin(tau * (x - y) / 3)
            relief = warp * over + weft * (1 - over)
            height = .000055 * relief
            variation = .975 + .035 * relief
            roughness = .79 + .065 * (1 - relief)
        elif kind == 'poplin':
            over = .5 + .5 * np.cos(math.pi * x) * np.cos(math.pi * y)
            relief = warp * over + weft * (1 - over)
            height = .000034 * relief
            variation = .98 + .025 * relief
            roughness = .83 + .045 * (1 - relief)
        else:
            raise ValueError('Unknown racer fabric: ' + kind)
    normal = _normal(height, TILE_METRES[kind])
    # glTF metallic-roughness: R unused/white, G roughness, B non-metal/zero.
    orm = np.stack((np.ones_like(roughness), roughness, np.zeros_like(roughness)), axis=-1) * 255
    _SURFACES[kind] = (normal, orm, variation)
    return _SURFACES[kind]


def _image(path, color=False):
    name = 'Racer PBR / ' + path.stem
    image = bpy.data.images.get(name)
    if image is None:
        image = bpy.data.images.load(str(path), check_existing=True)
        image.name = name
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    image.pack()
    return image


def _srgb(hex_color):
    return np.array([int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)])


def _linear(srgb):
    return np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)


def _material(name, kind, color, color_scale=1, seam=False):
    material = bpy.data.materials.get(name)
    if material is not None and material.get('racer_pbr_version') == VERSION:
        return material
    material = material or bpy.data.materials.new(name)
    normal, orm, variation = _surface(kind)
    base = np.clip(_srgb(color) * color_scale, 0, 1)
    swatch = np.clip(base[None, None, :] * variation[..., None], 0, 1)
    suffix = ''.join(f'{round(value * 255):02x}' for value in base)
    images = {
        'color': _image(_png(TEXTURE_DIR / f'{kind}-{suffix}-color.png', swatch * 255), True),
        'normal': _image(_png(TEXTURE_DIR / f'{kind}-normal.png', normal)),
        'roughness': _image(_png(TEXTURE_DIR / f'{kind}-roughness.png', orm)),
    }
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial'); output.location = (620, 100)
    shader = nodes.new('ShaderNodeBsdfPrincipled'); shader.location = (310, 100)
    shader.inputs['Base Color'].default_value = (*_linear(base), 1)
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['IOR'].default_value = 1.46
    shader.inputs['Specular IOR Level'].default_value = .34 if kind == 'leather' else .23
    shader.inputs['Coat Weight'].default_value = .03 if kind == 'leather' and not seam else 0
    shader.inputs['Coat Roughness'].default_value = .48
    material.diffuse_color = (*_linear(base), 1)
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    for index, (channel, image) in enumerate(images.items()):
        node = nodes.new('ShaderNodeTexImage'); node.name = 'Export / ' + channel
        node.label = kind + ' ' + channel; node.image = image
        node.extension = 'REPEAT'; node.interpolation = 'Linear'; node.location = (-620, 350 - index * 270)
        if channel == 'color':
            links.new(node.outputs['Color'], shader.inputs['Base Color'])
        elif channel == 'roughness':
            separate = nodes.new('ShaderNodeSeparateColor'); separate.mode = 'RGB'; separate.location = (-240, -200)
            links.new(node.outputs['Color'], separate.inputs['Color'])
            links.new(separate.outputs['Green'], shader.inputs['Roughness'])
            links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
        else:
            bump = nodes.new('ShaderNodeNormalMap'); bump.space = 'TANGENT'; bump.location = (-240, 50)
            bump.inputs['Strength'].default_value = .92 if kind == 'leather' else .72
            links.new(node.outputs['Color'], bump.inputs['Color'])
            links.new(bump.outputs['Normal'], shader.inputs['Normal'])
            if kind == 'leather' and not seam:
                # A smooth untextured coat reads as rubber over the grain.
                links.new(bump.outputs['Normal'], shader.inputs['Coat Normal'])
    material['racer_pbr_version'] = VERSION
    material['racer_fabric'] = kind
    material['racer_tile_metres'] = TILE_METRES[kind]
    material['racer_texture_origin'] = 'Original deterministic seamless maps; no external images.'
    return material


def build_character_materials(ident, spec):
    """Return shared cloth/trim/seam materials plus optional woven pants/tee.

    Assign trim to cuffs/hem/crewneck ribs, seam to small rolled seam geometry.
    Keep leather collar panels on cloth. Seated/standing share exact materials,
    so the glTF exporter embeds each referenced source image only once.
    """
    fabrics = {'jensen': ('leather', 'charcoal pebbled leather'), 'dario': ('jersey', 'cotton jersey'),
               'sam': ('poplin', 'woven cotton poplin'), 'elon': ('twill', 'charcoal cotton twill')}
    if ident not in fabrics:
        raise ValueError('Unknown racer character: ' + ident)
    kind, label = fabrics[ident]
    color = spec['cloth']
    return {
        'cloth': _material(ident + ' / ' + label, kind, color),
        'trim': _material(ident + ' / soft rib knit trim', 'rib', color, .88),
        'seam': _material(ident + ' / softly worn tailored seam', kind, color, 1.13 if kind == 'leather' else .94, seam=True),
        'pants': _material(ident + ' / fine woven trousers', 'twill', spec['pants']),
        'tee': _material(ident + ' / soft cotton undershirt', 'jersey', '#e1d9c7' if ident in ('dario', 'sam') else '#343739'),
    }
