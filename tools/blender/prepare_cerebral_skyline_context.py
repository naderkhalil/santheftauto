"""Reduce public OSM/USGS responses for the distant Cerebral skyline.

Arguments: Overpass JSON, USGS exportImage JSON, its float TIFF.
Requires Pillow. Raw responses are read only; the reduced source is checked in.
"""
import json, math, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
raw, dem_export, dem_tiff = map(Path, sys.argv[1:4])
origin = {'longitude': -122.42415, 'latitude': 37.77655}
sx = 111320 * math.cos(math.radians(origin['latitude']))
def project(lon, lat):
    return ((lon-origin['longitude'])*sx, (lat-origin['latitude'])*111320)

response = json.loads(dem_export.read_text())
extent = response['extent']
im = Image.open(dem_tiff)
columns, rows = im.size
x0, z0 = project(extent['xmin'], extent['ymin'])
x1, z1 = project(extent['xmax'], extent['ymax'])
dx, dz = (x1-x0)/columns, (z1-z0)/rows
grid = dict(columns=columns, rows=rows, minX=round(x0+dx/2,3), maxX=round(x1-dx/2,3),
            minZ=round(z0+dz/2,3), maxZ=round(z1-dz/2,3),
            values=[round(float(v),2) for v in im.getdata()])

known = set()
for name in ['layout.json', 'background-buildings.json']:
    known.update(str(b['id']) for b in json.loads((ROOT/'public/assets/cerebral-valley'/name).read_text())['buildings'])
buildings = []
for way in json.loads(raw.read_text())['elements']:
    tags = way.get('tags', {})
    if 'building' not in tags or str(way['id']) in known:
        continue
    points = [project(p['lon'],p['lat']) for p in way.get('geometry',[]) if p]
    if len(points)<4 or points[0] != points[-1]:
        continue
    points.pop()
    x, z = (sum(p[i] for p in points)/len(points) for i in (0,1))
    if x < 150 or not -1000 < z < 2800:
        continue
    area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))/2
    if abs(area)<60:
        continue
    if area<0:
        points.reverse()
    source = 'OSM height'
    try:
        height = float(re.search(r'[\d.]+',tags['height']).group())
        if 'ft' in tags['height'] or "'" in tags['height']:
            height *= .3048
    except (KeyError, ValueError, AttributeError):
        try:
            height = float(tags['building:levels'])*3.25+1
            source = 'OSM levels × interpreted 3.25m floors'
        except (KeyError, ValueError):
            height = 16 if tags['building'] in ['commercial','office','retail'] else 11
            source = 'interpreted low-rise infill'
    # The backdrop expresses lower-city mass. Named tall silhouettes are
    # authored independently; unmodeled very tall parcels stay below them.
    height = max(3,min(height,105))
    buildings.append(dict(id=str(way['id']), name=tags.get('name',''),
                          polygon=[[round(a,2),round(b,2)] for a,b in points],
                          height=round(height,2), heightSource=source))

out = dict(origin=origin, retrieved='2026-09-24',
           sources=dict(buildings='© OpenStreetMap contributors, ODbL 1.0; Overpass building ways',
                        query='[out:json][timeout:45];way["building"](37.768,-122.4248,37.801,-122.3880);out tags geom;',
                        terrain='USGS 3DEP Elevation ImageServer; 144×144 float export; EPSG:4326',
                        extent=extent),
           notes='Known near-district parcel IDs excluded. Heights capped at 105m for a subordinate city backdrop. The Blender generator excludes hero skyline footprints and samples the source DEM for all bases.',
           elevationGrid=grid, buildings=buildings)
target=ROOT/'art/references/cerebral-skyline-context.json'
target.write_text(json.dumps(out,separators=(',',':'))+'\n')
print(len(buildings),'distant footprints;',len(grid['values']),'elevation samples;',target.stat().st_size,'bytes')
