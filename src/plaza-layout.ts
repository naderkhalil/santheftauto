/** Union Square compressed game survey: +X east, +Z north, metres.
 * Ground remains aligned with the drivable block. Landscaping rises above it.
 * Reference: the 2018 public overview photograph of the current plaza,
 * https://commons.wikimedia.org/wiki/File:San_Francisco_Union_Square.jpg
 * Terraces are interpreted for this compressed block, not survey elevations.
 */
export const PLAZA_LEVELS = {
  street: 22,
  perimeter: 22.34,
  center: 24.40,
  north: 25.12,
  northSoil: 25.66,
  sideSoil: 24.94,
  southSoil: 22.90,
} as const;

export const PLAZA_PALMS = [
  {x:-48.4,z:-25,y:PLAZA_LEVELS.sideSoil,scale:.97,angle:.3},
  {x:-48.4,z:9,y:PLAZA_LEVELS.sideSoil,scale:1.04,angle:1.7},
  {x:48.4,z:-17,y:PLAZA_LEVELS.sideSoil,scale:.94,angle:2.4},
  {x:-47,z:36,y:PLAZA_LEVELS.northSoil,scale:1.02,angle:1.2},
  {x:47,z:36,y:PLAZA_LEVELS.northSoil,scale:.98,angle:2.8},
  {x:-31,z:-44,y:PLAZA_LEVELS.southSoil,scale:.98,angle:.2},
  {x:49,z:-31,y:PLAZA_LEVELS.southSoil,scale:1.04,angle:1.9},
];

export const PLAZA_TREES = [
  {x:-32,z:36,y:PLAZA_LEVELS.northSoil,height:10.4,angle:.4},
  {x:-20,z:36,y:PLAZA_LEVELS.northSoil,height:9.3,angle:2.1},
  {x:20,z:36,y:PLAZA_LEVELS.northSoil,height:9.5,angle:1.6},
  {x:32,z:36,y:PLAZA_LEVELS.northSoil,height:10.6,angle:3.2},
];
