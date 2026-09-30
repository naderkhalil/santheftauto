import json
import math
import unittest
from pathlib import Path
from facade_geometry import wall_frontages


def distance(p, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    t = max(0, min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/max(1e-12, dx*dx+dy*dy)))
    return math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)


class FacadeGeometryTests(unittest.TestCase):
    def assert_backed(self, poly, walls):
        for wall in walls:
            for t in (-.5, -.25, 0, .25, .5):
                p = (wall['x']+wall['nz']*wall['width']*t,
                     wall['z']-wall['nx']*wall['width']*t)
                self.assertLess(min(distance(p, a, b) for a, b in zip(poly, poly[1:]+poly[:1])), 1e-7)

    def test_recessed_facade_never_bridges_empty_courtyard(self):
        poly = [(0, 0), (20, 0), (20, 20), (15, 20), (15, 8), (5, 8), (5, 20), (0, 20)]
        for footprint in (poly, poly[::-1]):
            walls = wall_frontages(footprint, (0, 1))
            self.assertEqual(len(walls), 3)
            self.assert_backed(footprint, walls)
            self.assertEqual(sorted(w['width'] for w in walls), [5, 5, 10])

    def test_every_surveyed_front_is_backed_by_its_own_wall(self):
        root = Path(__file__).resolve().parents[2]
        data = json.loads((root/'art/references/cerebral-valley-layout.json').read_text())
        checked = 0
        for building in data['buildings']:
            front = building.get('frontage')
            if not front:
                continue
            poly = [(p['x'], p['z']) for p in building['polygon']]
            walls = wall_frontages(poly, (front['nx'], front['nz']))
            with self.subTest(building=building['id']):
                self.assert_backed(poly, walls)
            checked += len(walls)
        self.assertGreater(checked, 1000)


if __name__ == '__main__':
    unittest.main()
