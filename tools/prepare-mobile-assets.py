#!/usr/bin/env python3
"""Create the mobile racer kit without changing its scene graph or geometry.

Run with Python 3 and Pillow: python3 tools/prepare-mobile-assets.py
The original asset remains the source of truth. Every embedded image is capped
at 512 pixels on its longest side; alpha-bearing images remain lossless PNGs.
"""
import argparse
import io
import json
from pathlib import Path
import struct

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def prepare(source: Path, destination: Path, maximum: int = 512) -> dict:
    raw = source.read_bytes()
    magic, version, length = struct.unpack_from('<III', raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError('Expected a complete glTF 2 binary asset.')
    json_length, json_kind = struct.unpack_from('<II', raw, 12)
    if json_kind != 0x4E4F534A:
        raise ValueError('Missing glTF JSON chunk.')
    document = json.loads(raw[20:20 + json_length])
    bin_header = 20 + json_length
    bin_length, bin_kind = struct.unpack_from('<II', raw, bin_header)
    if bin_kind != 0x004E4942 or len(document['buffers']) != 1:
        raise ValueError('Expected one embedded binary buffer.')
    binary = raw[bin_header + 8:bin_header + 8 + bin_length]
    replacements = {}
    original_rgba = mobile_rgba = 0
    for image in document.get('images', []):
        if 'bufferView' not in image:
            raise ValueError('All racer images must be embedded.')
        view = document['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        image_bytes = binary[start:start + view['byteLength']]
        with Image.open(io.BytesIO(image_bytes)) as decoded:
            original_rgba += decoded.width * decoded.height * 4
            if max(decoded.size) > maximum:
                alpha = 'A' in decoded.getbands() or 'transparency' in decoded.info
                resized = decoded.convert('RGBA' if alpha else 'RGB')
                resized.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                if alpha:
                    resized.save(output, format='PNG', optimize=True)
                    image['mimeType'] = 'image/png'
                else:
                    resized.save(output, format='JPEG', quality=90, optimize=True)
                    image['mimeType'] = 'image/jpeg'
                image_bytes = output.getvalue()
                mobile_rgba += resized.width * resized.height * 4
            else:
                mobile_rgba += decoded.width * decoded.height * 4
        replacements[image['bufferView']] = image_bytes

    # Keep every bufferView index and its content, except resized image bytes.
    # Draco extensions, accessors, materials, animation and node names are intact.
    rebuilt = bytearray()
    for index, view in enumerate(document['bufferViews']):
        if view.get('buffer', 0) != 0:
            raise ValueError('Unexpected external buffer.')
        rebuilt.extend(b'\0' * (-len(rebuilt) % 4))
        start = view.get('byteOffset', 0)
        content = replacements.get(index, binary[start:start + view['byteLength']])
        view['byteOffset'], view['byteLength'] = len(rebuilt), len(content)
        rebuilt.extend(content)
    document['buffers'][0]['byteLength'] = len(rebuilt)
    rebuilt.extend(b'\0' * (-len(rebuilt) % 4))
    encoded = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    payload = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(rebuilt))
    payload += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    payload += struct.pack('<II', len(rebuilt), 0x004E4942) + rebuilt
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    return {'source': str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
            'destination': str(destination.relative_to(ROOT)) if destination.is_relative_to(ROOT) else str(destination),
            'images': len(document.get('images', [])), 'maximumDimension': maximum,
            'originalBytes': len(raw), 'mobileBytes': len(payload),
            'originalDecodedRgbaBytes': original_rgba, 'mobileDecodedRgbaBytes': mobile_rgba}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'public/assets/models/racer-kit.glb')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/assets/models/racer-kit-mobile.glb')
    args = parser.parse_args()
    print(json.dumps(prepare(args.source.resolve(), args.output.resolve()), indent=2))
