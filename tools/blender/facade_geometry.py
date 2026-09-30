"""Footprint-backed facade placement, independent of Blender for auditing."""
import math


def wall_frontages(poly, preferred_normal, minimum_width=4.5):
    """Return real outward-facing wall segments, never a projected parcel span.

    Survey frontage metadata is a bounding projection. On concave parcels that
    plane can be metres away from a wall, leaving windows and cornices in air.
    Ornament must instead use each physical edge's midpoint, normal and length.
    """
    area = sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(poly, poly[1:]+poly[:1]))
    result = []
    for a, b in zip(poly, poly[1:]+poly[:1]):
        width = math.dist(a, b)
        if width < minimum_width:
            continue
        ux, uy = (b[0]-a[0])/width, (b[1]-a[1])/width
        nx, ny = (uy, -ux) if area > 0 else (-uy, ux)
        if nx*preferred_normal[0]+ny*preferred_normal[1] < .8:
            continue
        result.append({'x': (a[0]+b[0])/2, 'z': (a[1]+b[1])/2,
                       'nx': nx, 'nz': ny, 'width': width})
    return result
