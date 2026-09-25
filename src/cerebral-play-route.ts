import type { CoursePoint } from './courses.ts';
import { CEREBRAL_POINTS, cerebralGroundHeight } from './cerebral-geography.ts';

const point = (x: number, z: number, label: string): CoursePoint => ({ x, z, y: cerebralGroundHeight(x, z), label });
const street = (index: number, label = CEREBRAL_POINTS[index].label): CoursePoint => {
  const source = CEREBRAL_POINTS[index];
  return point(source.x, source.z, label);
};

/** The source map remains unchanged. This race uses the mapped southwest
 * asphalt entrance and western climbing path, then makes one fictional glide
 * over the open lawn to the real southeast asphalt junction. It avoids the
 * central Hayes/Pierce stair entrance and the east-side Steiner stairs. */
export const CEREBRAL_PLAY_POINTS: readonly CoursePoint[] = [
  street(0),
  street(1, 'Hayes Street · Laguna boost'),
  street(2),
  street(3, 'Hayes Street · Webster boost'),
  street(4),
  street(5, 'Hayes Street · Painted Ladies overlook'),
  street(6, 'Alamo Square · southwest asphalt entrance'),
  point(-1018.012, -91.004, 'Alamo Square · uphill park path'),
  point(-984.339, -76.221, 'Alamo Square · summit approach'),
  point(-967.296, -67.293, 'Alamo Square · skyline launch'),
  point(-856.440, -55.304, 'Alamo Square · southeast path landing'),
  point(-834.038, -60.324, 'Alamo Square · southeast path'),
  point(-803.374, -78.525, 'Alamo Square · Painted Ladies exit'),
  street(5, 'Steiner Street · downhill to Page'),
  point(-750.062277, -205.674832, 'Steiner Street · Fell'),
  point(-733.458946, -309.669976, 'Steiner Street · Oak'),
  street(15, 'Steiner → Page'),
  street(16),
  street(17),
  street(18),
  street(19),
  street(20),
  street(21),
  street(22),
  street(23),
];

/** Named indices let course mechanics, scenery, cameras and instructions share
 * the same beats without silently relying on the old Alamo perimeter lap. */
export const CEREBRAL_PLAY_ANCHORS = {
  start: 0,
  laguna: 1,
  buchanan: 2,
  websterAscent: 3,
  fillmoreAscent: 4,
  hayesSteiner: 5,
  parkEntrance: 6,
  parkClimb: 7,
  summitApproach: 8,
  launchCrest: 9,
  landing: 10,
  southeastPath: 11,
  paintedLadiesExit: 12,
  steinerDescent: 13,
  fell: 14,
  oak: 15,
  page: 16,
  fillmorePage: 17,
  page531: 18,
  websterPage: 19,
  haight: 20,
  waller: 21,
  fillmoreWaller: 22,
  reveille: 23,
  duboce: 24,
} as const;

const A = CEREBRAL_PLAY_ANCHORS;

export const CEREBRAL_PLAY_FEATURES = {
  launches: [{
    from: A.launchCrest, to: A.landing, startOffset: 5,
    label: 'Alamo Skyline Glide', height: 15, minSpeed: 24, halfWidth: 7,
  }],
  boosts: [
    { from: A.laguna, to: A.laguna, startOffset: 14, endOffset: 36, label: 'Hayes Express', speed: 74, duration: 4, halfWidth: 3.2 },
    { from: A.websterAscent, to: A.websterAscent, startOffset: 15, endOffset: 39, label: 'Hayes Hill Sprint', speed: 76, duration: 3.6, halfWidth: 3.2 },
    { from: A.parkClimb, to: A.summitApproach, startOffset: 5, endOffset: 4, label: 'Skyline Run-up', speed: 36, duration: 1.5, halfWidth: 2.8 },
  ],
  widths: [
    { from: A.parkEntrance, to: A.launchCrest, halfWidth: 4.2 },
    { from: A.launchCrest, to: A.landing, halfWidth: 7 },
    { from: A.landing, to: A.steinerDescent, halfWidth: 4.4 },
  ],
};
