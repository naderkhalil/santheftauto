"""Sculpted caps, directional locks and layered lengths for seven drivers."""
import math
import bpy

TAU = math.tau


def build_hair(actor):
    # Import only during construction so the shared mesh helpers stay central.
    from racer_characters import mesh_object, material, smooth_path

    ident = actor.id
    long = ident in ('mira', 'feifei')
    curly = ident in ('dario', 'mark')
    width = actor.s['width']
    head = actor.hh
    base_color = actor.hair.diffuse_color
    shader = actor.hair.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .64 if long else .73
    shader.inputs['Specular IOR Level'].default_value = .27
    accent = actor.hair.copy()
    accent.name = ident + ' / directional hair sheen'
    tint = tuple(min(1, value * 1.07 + .00015) for value in base_color[:3])
    accent.diffuse_color = (*tint, 1)
    accent.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (*tint, 1)

    def hairline(angle):
        front = max(0, math.cos(angle))
        back = max(0, -math.cos(angle))
        side = math.sin(angle)
        if ident == 'dario':
            return .55 + .255 * front - .09 * back + .012 * math.sin(angle * 11) * front
        if ident == 'mark':
            return .59 + .227 * front - .12 * back + .009 * math.sin(angle * 15 + .5) * front
        if ident == 'sam':
            return .57 + .235 * front - .11 * back + .052 * side * front
        if ident == 'elon':
            return .59 + .265 * front - .11 * back + .028 * front * abs(side) - .018 * front ** 14
        if ident == 'jensen':
            return .58 + .240 * front - .12 * back - .021 * front ** 12 + .017 * side * front
        if ident == 'mira':
            return .50 + .370 * front + .041 * front ** 18 - .06 * back
        return .48 + .375 * front + .035 * side * front + .015 * front ** 12 - .065 * back

    def point(angle, u, extra=0):
        bottom = hairline(angle)
        t = bottom + (1 - bottom) * u
        w, d, c = actor.head_profile(t)
        sine, cosine = math.sin(angle), math.cos(angle)
        fade = max(0, math.sin(math.pi * u)) ** .6
        ripple = (math.sin(angle * 13 + u * 19 + 1.2 * math.sin(u * TAU))
                  + .6 * math.sin(angle * 23 - u * 27 + .8)) / 1.6
        depth = .004 + (.0055 if curly else .0025) * fade
        if curly:
            depth += .008 * (.5 + .5 * ripple) ** 2 * fade
        elif ident in ('sam', 'jensen', 'elon'):
            depth += .004 * max(0, cosine) * fade
        else:
            depth += .005 * fade
        depth += extra
        x = (w + depth) * sine
        z = actor.front(w * sine, t) + depth * cosine if cosine > 0 else c + (d + depth) * cosine
        # Broad, asymmetric swept volume breaks the perfectly radial cap.
        if ident in ('sam', 'jensen', 'elon'):
            sweep = (-.020 if ident == 'sam' else .014 if ident == 'jensen' else .007)
            x += sweep * math.sin(math.pi * u) * max(0, cosine)
        lift = (.008 if long else .012 if curly else .009) * u
        if not long:
            lift += (.010 if ident == 'sam' else .006) * fade * max(0, cosine) * (1 + .25 * sine)
        return (x, actor.y0 + head * t + lift, z)

    n, rows = 128, 40
    verts = [actor.p(point(TAU * i / n, j / rows)) for j in range(rows) for i in range(n)]
    faces = []
    for j in range(rows - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    crown = len(verts)
    verts.append(actor.p((0, actor.y0 + head + (.008 if long else .012 if curly else .009), actor.head_profile(1)[2])))
    for i in range(n):
        faces.append(((rows - 1) * n + i, (rows - 1) * n + (i + 1) % n, crown))
    obj = mesh_object(actor.prefix + ' / fitted hair cap', verts, faces, actor.hair, actor.root)
    # Open cap underside is intentionally absent. The scalp covers it.
    obj['racer_hair'] = True

    def ribbon(name, controls, widths, depth=.0035, mat=None):
        samples = smooth_path([(*p, w) for p, w in zip(controls, widths)], 7)
        rv, rf = [], []
        sides = 10
        for sample in samples:
            x, y, z, radius = sample
            radius = max(.0001, radius)
            for k in range(sides):
                a = TAU * k / sides
                ridge = 1 + .025 * math.cos(3 * a)
                rv.append(actor.p((x + radius * math.cos(a), y,
                                   z + depth * min(1, radius / max(widths)) * ridge * math.sin(a))))
        for j in range(len(samples) - 1):
            for k in range(sides):
                a, b = j * sides + k, j * sides + (k + 1) % sides
                rf.append((a, b, b + sides, a + sides))
        rf += [tuple(reversed(range(sides))), tuple((len(samples) - 1) * sides + k for k in range(sides))]
        return mesh_object(actor.prefix + ' / ' + name, rv, rf, mat or actor.hair, actor.root)

    if long:
        # A continuous mass carries the silhouette. Smaller locks only describe
        # the surface flow, so the ends read as layered hair rather than sticks.
        length = .18 if ident == 'mira' else .09
        curtain_columns = []
        columns = 72
        for i in range(columns + 1):
            angle = math.pi * (.38 + i / columns * 1.24)
            sine, cosine = math.sin(angle), math.cos(angle)
            end_y = actor.y0 - length + .009 * math.cos(angle * 7)
            controls = [point(angle, .34, .001),
                        (sine * (width + .016), actor.y0 + head * .40, -.024 + cosine * .116),
                        (sine * (width + .025), actor.y0 + .015, -.049 + cosine * .123),
                        (sine * (width + .037), end_y + .050, -.042 + cosine * .130),
                        (sine * (width + .032), end_y + .011, -.048 + cosine * .132)]
            curtain_columns.append(smooth_path(controls, 8))
        cv = [actor.p(tuple(point)) for column in curtain_columns for point in column]
        cr = len(curtain_columns[0])
        cf = [(i * cr + j, (i + 1) * cr + j,
               (i + 1) * cr + j + 1, i * cr + j + 1)
              for i in range(columns) for j in range(cr - 1)]
        curtain = mesh_object(actor.prefix + ' / continuous layered hair lengths',
                              cv, cf, actor.hair, actor.root)
        thickness = curtain.modifiers.new('Soft hair volume', 'SOLIDIFY')
        thickness.thickness = .006
        thickness.offset = -1
        for i in range(35):
            angle = math.pi * (.40 + i / 34 * 1.20)
            start = point(angle, .35, .003)
            sine, cosine = math.sin(angle), math.cos(angle)
            end_y = actor.y0 - length + .012 * math.cos(i * 1.6)
            end_x = sine * (width + .030 + .012 * math.sin(i * .8))
            controls = [start,
                        (sine * (width + .020), actor.y0 + head * .39, -.022 + cosine * .116),
                        (sine * (width + .018), actor.y0 + .005, -.05 + cosine * .12),
                        (end_x, end_y + .05, -.04 + cosine * .132),
                        (end_x + .009 * math.sin(i), end_y, -.050 + cosine * .132)]
            ribbon('layered shoulder length' if ident == 'feifei' else 'long softly waved length', controls,
                   [.0001, .010, .011, .009, .0005], .0015, actor.hair)
        for side in (-1, 1):
            for k in range(5):
                a = side * (.75 + k * .13)
                top = point(a, .64, .003)
                x = side * (width + .002 + k * .004)
                sweep = .018 if ident == 'feifei' else .010
                controls = [top, point(a, .40, .003), point(a, .08, .004),
                            (x, actor.y0 + head * .34, .048 - k * .007),
                            (x + side * sweep, actor.y0 + .01, .038 - k * .008),
                            (x + side * (.022 if ident == 'mira' else .031), actor.y0 - length + .04 + k * .008, .011 - k * .005)]
                ribbon('face framing lock', controls, [.0001, .006, .009, .011, .010, .0005], .0018,
                       accent if k == 2 else actor.hair)
        # Fine directions converge on a visible central or side part.
        part = -.09 if ident == 'feifei' else 0
        for side in (-1, 1):
            for k in range(12):
                base_angle = side * (.13 + k * .095) + part
                path = [point(base_angle * (1 - .26 * u) + side * .04 * u, u, .0015)
                        for u in (.05, .2, .4, .6, .78, .91)]
                actor.tube('parted hair direction', path, [.0001, .00022, .00025, .00025, .00020, .0001], accent, 5, 3)
    elif curly:
        # Irregular overlapping C-shaped crests describe curls without the old
        # regular stitch pattern. Their ends sink into the underlying volume.
        for band in range(6):
            for k in range(19 - band * 2):
                u = .10 + band * .13 + .018 * math.sin(k * 2.7)
                a = TAU * (k + .37 * band) / (19 - band * 2)
                path = [point(a + .064 * math.sin(v * math.pi * 1.6),
                              u + .035 * math.cos(v * math.pi * 1.6),
                              .0003 + .0015 * math.sin(math.pi * v))
                        for v in (0, .2, .4, .6, .8, 1)]
                actor.tube('soft curl crest', path, [.0001, .00065, .0011, .001, .00055, .0001],
                           actor.hair, 6, 3)
    else:
        for k in range(46):
            angle = TAU * (k + .10 * math.sin(k * 2.4)) / 46
            path = [point(angle + .45 * math.sin(u * 1.6) * (1 if ident == 'sam' else -.7), u, .0007)
                    for u in (.015, .15, .33, .52, .71, .87)]
            actor.tube('brushed hair strand group', path, [.0001, .0002, .0003, .0003, .00025, .0001],
                       accent if k % 3 == 0 else actor.hair, 5, 3)
