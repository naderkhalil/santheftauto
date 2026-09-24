/**
 * Illustrative, north-up cartography of northeast San Francisco. Street positions
 * use a simplified geographic grid, not the game's deliberately compressed world.
 * This is authored artwork, with no map tiles, external requests, or runtime assets.
 */
type Point = readonly [number, number];

const project = (longitude: number, latitude: number): Point => [
  (longitude + 122.4295) * 12203.39,
  (37.8023 - latitude) * 15348.84,
];
const grid = (east: number, north: number): Point => project(
  -122.4084 + east - north * .18,
  37.7881 + north + east * .14,
);
const xy = ([x, y]: Point) => `${x.toFixed(1)},${y.toFixed(1)}`;
const line = (points: readonly Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${xy(p)}`).join(' ');
const polygon = (points: readonly Point[]) => `${line(points)} Z`;

/** Inline SVG. Each instance needs its own prefix for accessible names and clips. */
export function cityMapSvg(idPrefix: string, expanded = false): string {
  const id = `sf-map-${idPrefix.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const coast: Point[] = [
    project(-122.4003, 37.8023), project(-122.3994, 37.8010),
    project(-122.3984, 37.7998), project(-122.3976, 37.7986),
    project(-122.3962, 37.7967), project(-122.3946, 37.7951),
    project(-122.3936, 37.7938), project(-122.3915, 37.7919),
    project(-122.3891, 37.7900), project(-122.3873, 37.7884),
    project(-122.3874, 37.7864), project(-122.3879, 37.7848),
    project(-122.3875, 37.7824), project(-122.3868, 37.7808),
  ];
  const land = polygon([[0, 0], ...coast, [0, 330]]);
  const market = [project(-122.4165, 37.7782), project(-122.4079, 37.7845), project(-122.3946, 37.7951)];
  const northOfMarket = polygon([[0, 0], [720, 0], [720, 75], market[2], market[1], market[0], [0, 330]]);
  const southOfMarket = polygon([market[0], market[1], market[2], [720, 75], [720, 330], [0, 330]]);
  const eastings = [-.0208, -.0192, -.0176, -.016, -.0144, -.0128, -.0112, -.0096, -.008, -.0064, -.0048, -.0032, -.0016, 0, .0015, .003, .0045, .006, .0075, .009, .0105, .012, .0135, .015];
  const northings = [-.006, -.005, -.004, -.003, -.002, -.001, 0, .00095, .0019, .00288, .00386, .00484, .00582, .0068, .00778, .00876, .00974, .01072, .01170, .01268, .01366, .01464, .01562, .0166];
  const blocks: string[] = [];
  for (let col = 0; col < eastings.length - 1; col++) {
    for (let row = 0; row < northings.length - 1; row++) {
      const west = eastings[col] + .00016, east = eastings[col + 1] - .00016;
      const south = northings[row] + .00012, north = northings[row + 1] - .00012;
      const shade = ['#dcdccb', '#d5d9c9', '#e0dfcf', '#d4d7ca', '#e3decc'][(col * 7 + row * 3) % 5];
      blocks.push(`<path d="${polygon([grid(west, south), grid(east, south), grid(east, north), grid(west, north)])}" fill="${shade}"/>`);
      // A restrained second footprint makes the city read as buildings, not graph paper.
      if ((col + row) % 3 === 0) {
        blocks.push(`<path d="${polygon([grid(west + .00013, south + .00013), grid(east - .00013, south + .00013), grid(east - .00013, south + .00032), grid(west + .00013, south + .00032)])}" fill="#c5cebe" opacity=".52"/>`);
      }
    }
  }
  const somaRoads: string[] = [];
  for (let offset = 20; offset < 250; offset += 24) {
    somaRoads.push(`<path d="M ${180 + offset * .72},360 L ${462 + offset * .72},87"/>`);
  }
  for (let offset = 0; offset < 440; offset += 38) {
    somaRoads.push(`<path d="M ${160 + offset},141 L ${418 + offset},365"/>`);
  }
  const park = (points: Point[], fill = '#a5bf90') => `<path d="${polygon(points)}" fill="${fill}" stroke="#f4f0df" stroke-width="1.6"/>`;
  const route: Point[] = [
    grid(.0002, 0), grid(.0015, 0), grid(.0015, -.001), grid(0, -.001),
    grid(0, 0), grid(0, .0019), grid(.003, .0019), grid(.003, .0068),
    grid(.0129, .0068), project(-122.3951, 37.7952), project(-122.3939, 37.7955),
  ];
  const [startX, startY] = route[0], [finishX, finishY] = route[route.length - 1];
  const piers = [
    [project(-122.3995, 37.8013), project(-122.3978, 37.8020)],
    [project(-122.3986, 37.8001), project(-122.3967, 37.8009)],
    [project(-122.3977, 37.7988), project(-122.3958, 37.7996)],
    [project(-122.3969, 37.7976), project(-122.3952, 37.7984)],
    [project(-122.3936, 37.7938), project(-122.3919, 37.7947)],
    [project(-122.3917, 37.7921), project(-122.3902, 37.7930)],
    [project(-122.3895, 37.7903), project(-122.3880, 37.7912)],
  ];
  const details = expanded ? `
    <g fill="#6a8078" font-size="9.5" letter-spacing="1.1" font-weight="600" paint-order="stroke" stroke="#f4f0df" stroke-width="3" stroke-linejoin="round">
      <text x="138" y="110" transform="rotate(-10 138 110)">WASHINGTON ST</text>
      <text x="98" y="157" transform="rotate(-10 98 157)">CALIFORNIA ST</text>
      <text x="167" y="207" transform="rotate(-10 167 207)">SUTTER ST</text>
      <text x="313" y="197" transform="rotate(-10 313 197)">BUSH ST</text>
      <text x="208" y="85" transform="rotate(-98 208 85)">MASON ST</text>
      <text x="340" y="90" transform="rotate(-98 340 90)">MONTGOMERY</text>
      <text x="363" y="275" transform="rotate(-43 363 275)">MISSION ST</text>
      <text x="415" y="282" transform="rotate(-43 415 282)">HOWARD ST</text>
    </g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 330" role="img" aria-labelledby="${id}-title ${id}-desc" class="city-map-svg" preserveAspectRatio="xMidYMid meet">
    <title id="${id}-title">The City Loop on a map of San Francisco</title>
    <desc id="${id}-desc">North-up illustrated map of downtown San Francisco, with city blocks, Union Square, Nob Hill, Chinatown, North Beach, the waterfront and the Bay Bridge. The gold driving course loops around Union Square, climbs Powell Street, turns onto Bush and Grant, and follows Washington to the Embarcadero and the Ferry Building. Geography is simplified for the game.</desc>
    <defs>
      <clipPath id="${id}-land"><path d="${land}"/></clipPath>
      <clipPath id="${id}-north"><path d="${northOfMarket}"/></clipPath>
      <clipPath id="${id}-south"><path d="${southOfMarket}"/></clipPath>
      <linearGradient id="${id}-water" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#56a3af"/><stop offset=".65" stop-color="#287b8b"/><stop offset="1" stop-color="#246576"/>
      </linearGradient>
    </defs>
    <rect width="720" height="330" fill="url(#${id}-water)"/>
    <g fill="none" stroke="#b1d9d6" stroke-width="1" opacity=".15">
      <path d="M 457,-15 C 432,77 545,107 561,209 S 541,300 581,351"/>
      <path d="M 493,-15 C 472,68 574,108 592,204 S 567,294 615,351"/>
      <path d="M 530,-15 C 510,64 608,105 625,194 S 606,294 650,351"/>
    </g>
    <path d="${land}" fill="#f4f0df"/>
    <g clip-path="url(#${id}-land)">
      <g clip-path="url(#${id}-north)">${blocks.join('')}</g>
      <g clip-path="url(#${id}-south)">
        <path d="${southOfMarket}" fill="#d7ddcf"/>
        <g fill="none" stroke="#f7f3e4" stroke-width="4.5">${somaRoads.join('')}</g>
      </g>
      ${park([grid(.0002, -.00082), grid(.0013, -.00082), grid(.0013, -.00018), grid(.0002, -.00018)], '#9fbc80')}
      ${park([grid(.0032, .005), grid(.0042, .005), grid(.0042, .0065), grid(.0032, .0065)])}
      ${park([grid(-.0002, .0113), grid(.0011, .0113), grid(.0011, .0124), grid(-.0002, .0124)])}
      ${park([grid(-.0030, .003), grid(-.0019, .003), grid(-.0019, .0037), grid(-.0030, .0037)])}
      ${park([project(-122.4013, 37.7856), project(-122.3997, 37.7867), project(-122.3985, 37.7858), project(-122.4002, 37.7846)], '#a9c097')}
      <path d="${line(market)}" fill="none" stroke="#bdc7b6" stroke-width="10"/>
      <path d="${line(market)}" fill="none" stroke="#fff9e6" stroke-width="7"/>
      <path d="${line(market)}" fill="none" stroke="#b6bfae" stroke-width=".9" stroke-dasharray="1 5"/>
      <path d="${line(coast)}" fill="none" stroke="#c0cbb2" stroke-width="10"/>
      <path d="${line(coast)}" fill="none" stroke="#fff6dc" stroke-width="6"/>
    </g>
    <path d="${line(coast)}" fill="none" stroke="#e3ebd4" stroke-width="2"/>
    <g stroke="#e8e8d2" stroke-width="6" stroke-linecap="square">${piers.map(p => `<path d="${line(p)}"/>`).join('')}</g>
    <g stroke="#abc9bd" stroke-width="1.3">${piers.map(p => `<path d="${line(p)}"/>`).join('')}</g>
    <!-- Western Bay Bridge span, extending northeast from Rincon Hill. -->
    <g fill="none" stroke-linecap="round">
      <path d="M 518,220 L 658,28" stroke="#1f6775" stroke-width="10" opacity=".35"/>
      <path d="M 518,217 L 658,25" stroke="#c0d4c6" stroke-width="5"/>
      <path d="M 518,217 L 658,25" stroke="#edf0da" stroke-width="1"/>
      <path d="M 551,171 L 545,155 M 595,110 L 589,94 M 637,52 L 631,36" stroke="#f1eed5" stroke-width="3"/>
      <path d="M 518,217 Q 540,191 545,155 Q 575,138 589,94 Q 620,78 631,36 L 658,25" stroke="#e7ebd8" stroke-width="1.1"/>
    </g>
    ${details}
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="${line(route)}" stroke="#796b24" stroke-opacity=".22" stroke-width="10" transform="translate(0 1)"/>
      <path d="${line(route)}" stroke="#fff9e0" stroke-width="8"/>
      <path d="${line(route)}" stroke="#d49918" stroke-width="5.2"/>
      <path d="${line(route)}" stroke="#ffdb4e" stroke-width="3.2"/>
    </g>
    <circle cx="${startX.toFixed(1)}" cy="${startY.toFixed(1)}" r="5.6" fill="#24545b" stroke="#fff8db" stroke-width="2"/>
    <circle cx="${startX.toFixed(1)}" cy="${startY.toFixed(1)}" r="1.8" fill="#ffdf58"/>
    <circle cx="${finishX.toFixed(1)}" cy="${finishY.toFixed(1)}" r="7" fill="#ffdf58" stroke="#fff8db" stroke-width="2"/>
    <path d="M ${finishX - 2},${finishY + 3} v-8 h5 v4 h-5" fill="#24545b" stroke="#24545b" stroke-width="1.2"/>
    <g font-family="'Avenir Next', 'Segoe UI', sans-serif" fill="#3d625e">
      <g font-size="14" font-weight="700" letter-spacing="1.8" paint-order="stroke" stroke="#f0efde" stroke-width="4" stroke-linejoin="round">
        <text x="198" y="48" text-anchor="middle">NORTH BEACH</text>
        <text x="156" y="169" text-anchor="middle">NOB HILL</text>
        <text x="279" y="126" text-anchor="middle">CHINATOWN</text>
        <text x="352" y="155" text-anchor="middle" font-size="12" letter-spacing="1.5">FINANCIAL</text>
        <text x="352" y="172" text-anchor="middle" font-size="12" letter-spacing="1.5">DISTRICT</text>
        <text x="365" y="306" text-anchor="middle">SOMA</text>
      </g>
      <g font-size="10.5" font-weight="650" letter-spacing="1.3" paint-order="stroke" stroke="#f7f0d9" stroke-width="3" stroke-linejoin="round">
        <text x="244" y="210" transform="rotate(-98 244 210)">POWELL</text>
        <text x="310" y="192" transform="rotate(-98 310 192)">GRANT</text>
        <text x="320" y="86" transform="rotate(-10 320 86)">WASHINGTON</text>
        <text x="333" y="229" transform="rotate(-43 333 229)">MARKET ST</text>
      </g>
      <path d="M 256,238 L 246,251 L 216,251" fill="none" stroke="#7e9277" stroke-width="1.2"/>
      <text x="210" y="254" text-anchor="end" font-size="16" font-weight="800" fill="#234e52" paint-order="stroke" stroke="#f4f0df" stroke-width="4" stroke-linejoin="round">Union Square</text>
      <g fill="#f8f2d9">
        <path d="M 446,105 L 449,122 L 456,130" fill="none" stroke="#e1e8cb" stroke-width="1.2"/>
        <text x="460" y="145" font-size="16" font-weight="750">Ferry</text>
        <text x="460" y="163" font-size="16" font-weight="750">Building</text>
        <text x="614" y="156" text-anchor="middle" font-size="10.5" font-weight="600" letter-spacing="1.6" transform="rotate(-54 614 156)">BAY BRIDGE</text>
        <text x="620" y="236" text-anchor="middle" font-size="15" letter-spacing="3.4" opacity=".88">SAN FRANCISCO</text>
        <text x="620" y="259" text-anchor="middle" font-size="19" letter-spacing="6" opacity=".88">BAY</text>
      </g>
      <g transform="translate(29 31)" fill="#45695f">
        <circle r="18" fill="#f7f4e8" fill-opacity=".88"/>
        <text y="-7" text-anchor="middle" font-size="9" font-weight="800" letter-spacing=".5">N</text>
        <path d="M 0,-2 L -4,9 L 0,6 L 4,9 Z"/>
      </g>
      <g transform="translate(22 297)">
        <rect x="-8" y="-21" width="151" height="44" rx="5" fill="#f5f1df" fill-opacity=".93"/>
        <text font-size="11" letter-spacing="2.1" font-weight="750">SAN FRANCISCO</text>
        <text y="15" font-size="9" letter-spacing=".5" fill="#7b8b79">THE CITY LOOP · 2.3 KM</text>
      </g>
    </g>
  </svg>`;
}
