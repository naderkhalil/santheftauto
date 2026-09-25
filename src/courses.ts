import { cerebralGroundHeight } from './cerebral-geography.ts';
import { CEREBRAL_PLAY_POINTS, CEREBRAL_PLAY_FEATURES } from './cerebral-play-route.ts';

/** Authored, geographically inspired race itineraries. Distances and grades are
 * compressed for play; these are closed game courses, not street directions. */
export type CourseId = 'vc-circle' | 'cerebral-valley' | 'golden-gate-surfride' | 'lands-end' | 'presidio' | 'hawk-hill';
export type CoursePoint = { x: number; z: number; y: number; label: string };
export type CourseRange = { from: number; to: number; startOffset?: number; endOffset?: number };
export type CourseDefinition = {
  id: CourseId;
  name: string;
  subtitle: string;
  description: string;
  theme: 'city' | 'victorian' | 'park' | 'coast' | 'presidio' | 'bridge';
  accent: string;
  difficulty: string;
  points: readonly CoursePoint[];
  highlights: readonly string[];
  landmarks: readonly { name: string; at: number; side: -1 | 1; kind: 'tower' | 'park' | 'cafe' | 'shop' | 'houses' | 'windmill' | 'cliff' | 'bridge' | 'bunker' | 'view' }[];
  fog?: { start: number; end: number };
  cornerRadius?: number;
  roadHalfWidth?: number;
  terrainHeight?: (x:number,z:number)=>number;
  launches?: readonly (CourseRange & { label: string; height: number; minSpeed: number; halfWidth: number })[];
  boosts?: readonly (CourseRange & { label: string; speed: number; duration: number; halfWidth: number })[];
  widths?: readonly (CourseRange & { halfWidth: number })[];
};

const p = (x: number, z: number, y: number, label: string): CoursePoint => ({ x, z, y, label });

export const COURSES: readonly CourseDefinition[] = [
  {
    id: 'vc-circle', name: 'VC Circle', subtitle: 'SALESFORCE TOWER → SOUTH PARK', theme: 'city', accent: '#98efb0', difficulty: 'QUICK LAP',
    description: 'Launch beneath Salesforce Tower, cut through SoMa, then carry your speed around the complete South Park loop.',
    highlights: ['Salesforce Tower', 'Howard & Second', 'One full South Park lap'],
    points: [
      p(180, 360, 8, 'Salesforce Tower · Mission & Fremont'),
      p(180, 200, 8, 'Fremont → Howard'),
      p(-100, 200, 7, 'Howard → Second'),
      p(-100, -100, 6, 'Second → South Park'),
      p(-180, -100, 6, 'South Park · enter the loop'),
      p(-450, -100, 6, 'South Park · north side'),
      p(-510, -150, 6, 'South Park · west bend'),
      p(-450, -200, 6, 'South Park · south side'),
      p(-150, -200, 6, 'South Park · east bend'),
      p(-100, -150, 6, 'South Park · round the island'),
      p(-150, -100, 6, 'South Park · return to the north side'),
      p(-220, -100, 6, 'South Park · full lap finish'),
    ],
    landmarks: [
      { name: 'Salesforce Tower', at: .015, side: -1, kind: 'tower' },
      { name: 'SoMa', at: .30, side: 1, kind: 'houses' },
      { name: 'South Park', at: .63, side: -1, kind: 'park' },
      { name: 'South Park cafés', at: .83, side: 1, kind: 'cafe' },
    ],
  },
  {
    id: 'cerebral-valley', name: 'Cerebral Valley', subtitle: 'HAYES VALLEY → DUBOCE PARK', theme: 'victorian', accent: '#d0b2ff', difficulty: 'HILLS & CORNERS',
    description: 'Catch a rainbow rush up Hayes. Climb into Alamo Square, fly toward the Painted Ladies and skyline, then roll down Steiner to Page, Réveille, and Duboce.',
    highlights: ['Hayes rainbow rush', 'Painted Ladies skyline glide', '531 Page Street', 'Café Réveille → Duboce'],
    points: CEREBRAL_PLAY_POINTS,
    ...CEREBRAL_PLAY_FEATURES,
    cornerRadius: 12, roadHalfWidth: 6.4, terrainHeight: cerebralGroundHeight,
    landmarks: [
      { name: 'Hayes Valley', at: .04, side: 1, kind: 'cafe' },
      { name: 'Alamo Square', at: .34, side: 1, kind: 'park' },
      { name: 'Painted Ladies', at: .487, side: -1, kind: 'houses' },
      { name: 'Steiner → Page', at: .675, side: 1, kind: 'houses' },
      { name: '531 Page St', at: .775, side: 1, kind: 'houses' },
      { name: 'Café Réveille', at: .960, side: 1, kind: 'cafe' },
      { name: 'Duboce Park', at: 1, side: 1, kind: 'park' },
    ],
  },
  {
    id: 'golden-gate-surfride', name: 'Golden Gate Surfride', subtitle: 'PANHANDLE → OCEAN BEACH', theme: 'park', accent: '#92e3d2', difficulty: 'LONG CRUISE',
    description: 'Ride west from the Panhandle through Golden Gate Park, drop onto Irving, and pass Mollusk and Hook Fish before the Pacific.',
    highlights: ['Panhandle', 'Golden Gate Park', 'Mollusk · 46th', 'Hook Fish · 47th', 'Ocean Beach'],
    points: [
      p(900, 0, 42, 'Panhandle · Baker Street'),
      p(480, 0, 45, 'Stanyan · enter Golden Gate Park'),
      p(360, 90, 48, 'JFK Promenade'),
      p(100, 130, 50, 'Conservatory of Flowers'),
      p(-160, 110, 47, 'Music Concourse · de Young'),
      p(-450, 80, 35, 'Spreckels Lake'),
      p(-850, 90, 25, 'Chain of Lakes Drive'),
      p(-980, -100, 23, 'MLK Drive · southwest park exit'),
      p(-1000, -260, 20, 'Lincoln Way → 41st Avenue'),
      p(-1000, -370, 18, '41st Avenue → Irving'),
      p(-1260, -370, 10, 'Mollusk · Irving & 46th'),
      p(-1320, -370, 8, 'Hook Fish · Irving & 47th'),
      p(-1460, -370, 4, 'Ocean Beach · finish'),
    ],
    landmarks: [
      { name: 'Panhandle', at: .06, side: 1, kind: 'park' },
      { name: 'Conservatory of Flowers', at: .30, side: 1, kind: 'park' },
      { name: 'de Young', at: .40, side: -1, kind: 'tower' },
      { name: 'Spreckels Lake', at: .50, side: 1, kind: 'park' },
      { name: 'Golden Gate windmills', at: .73, side: 1, kind: 'windmill' },
      { name: 'Mollusk · 4500 Irving', at: .93, side: 1, kind: 'shop' },
      { name: 'Hook Fish · 4542 Irving', at: .95, side: 1, kind: 'cafe' },
      { name: 'Ocean Beach', at: 1, side: 1, kind: 'view' },
    ],
  },
  {
    id: 'lands-end', name: 'Lands End', subtitle: 'LEGION OF HONOR → SUTRO → OCEAN', theme: 'coast', accent: '#f3bc86', difficulty: 'COASTAL TECHNICAL',
    description: 'A fictional coastal race links the Legion of Honor, Eagle’s Point, and the Lands End trail before descending past Sutro Baths.',
    highlights: ['Legion of Honor', 'Eagle’s Point', 'Mile Rock overlook', 'Sutro Baths', 'Cliff House'],
    points: [
      p(200, -180, 70, 'Legion of Honor · start'),
      p(200, 60, 76, 'El Camino del Mar'),
      p(450, 170, 72, 'Eagle’s Point · coastal trail'),
      p(200, 270, 66, 'Lands End · cypress ridge'),
      p(-100, 260, 58, 'Mile Rock overlook'),
      p(-350, 90, 50, 'Coastal descent'),
      p(-480, -150, 25, 'Sutro Baths overlook'),
      p(-380, -280, 38, 'Point Lobos Avenue'),
      p(-500, -380, 20, 'Cliff House'),
      p(-480, -630, 5, 'Ocean Beach · finish'),
    ],
    landmarks: [
      { name: 'Legion of Honor', at: .01, side: -1, kind: 'view' },
      { name: 'Eagle’s Point', at: .20, side: -1, kind: 'cliff' },
      { name: 'Mile Rock overlook', at: .46, side: 1, kind: 'cliff' },
      { name: 'Sutro Baths', at: .74, side: 1, kind: 'view' },
      { name: 'Cliff House', at: .88, side: 1, kind: 'houses' },
      { name: 'Pacific Ocean', at: 1, side: 1, kind: 'view' },
    ],
  },
  {
    id: 'presidio', name: 'Presidio Run', subtitle: 'ARGUELLO GATE → CRISSY FIELD', theme: 'presidio', accent: '#cedb92', difficulty: 'FOREST DESCENT',
    description: 'Climb through the eucalyptus to Inspiration Point, sweep past coastal batteries, and descend to the open air of Crissy Field.',
    highlights: ['Inspiration Point', 'Immigrant Point', 'Coastal batteries', 'Crissy Field'],
    points: [
      p(320, -500, 40, 'Arguello Gate · start'),
      p(260, -260, 75, 'Arguello Boulevard · Inspiration Point'),
      p(120, -140, 80, 'Arguello → Washington Boulevard'),
      p(-150, -110, 65, 'Immigrant Point overlook'),
      p(-330, 50, 56, 'Washington → Lincoln Boulevard'),
      p(-200, 200, 48, 'Lincoln Boulevard · Golden Gate overlook'),
      p(120, 300, 24, 'Lincoln → McDowell Avenue'),
      p(180, 430, 8, 'Crissy Field · waterfront'),
      p(480, 430, 5, 'Crissy Field · finish'),
    ],
    landmarks: [
      { name: 'Arguello Gate', at: .01, side: -1, kind: 'houses' },
      { name: 'Inspiration Point', at: .13, side: 1, kind: 'view' },
      { name: 'Presidio eucalyptus', at: .26, side: -1, kind: 'park' },
      { name: 'Immigrant Point', at: .36, side: -1, kind: 'view' },
      { name: 'Coastal batteries', at: .58, side: -1, kind: 'bunker' },
      { name: 'Golden Gate overlook', at: .62, side: -1, kind: 'view' },
      { name: 'Crissy Field', at: .97, side: 1, kind: 'park' },
    ],
  },
  {
    id: 'hawk-hill', name: 'Golden Gate → Hawk Hill', subtitle: 'CRISSY FIELD → THE BRIDGE → MARIN', theme: 'bridge', accent: '#ff947c', difficulty: 'FOG CHALLENGE',
    description: 'Pass Fort Point, enter the Golden Gate, clear the bridge’s fog stage, then climb Conzelman Road to the Hawk Hill finish.',
    highlights: ['Fort Point', 'Golden Gate Bridge', 'Mandatory fog stage', 'Battery Spencer', 'Hawk Hill'],
    points: [
      p(500, -420, 4, 'Crissy Field · start'),
      p(170, -300, 6, 'Marine Drive'),
      p(20, -200, 8, 'Fort Point · turn inland'),
      p(200, -160, 18, 'Long Avenue'),
      p(200, 0, 30, 'Lincoln Boulevard'),
      p(50, 70, 40, 'Merchant Road · bridge approach'),
      p(0, 240, 48, 'Golden Gate · south entrance'),
      p(0, 520, 58, 'Golden Gate · south tower'),
      p(0, 890, 64, 'Golden Gate · fog stage'),
      p(0, 1260, 58, 'Golden Gate · north tower'),
      p(0, 1470, 48, 'Golden Gate · bridge complete'),
      p(120, 1550, 40, 'Alexander Avenue connector'),
      p(70, 1690, 50, 'Conzelman Road · begin the climb'),
      p(-180, 1660, 85, 'Battery Spencer'),
      p(-350, 1840, 110, 'Marin Headlands · ridge road'),
      p(-610, 1850, 145, 'Hawk Hill · finish'),
    ],
    landmarks: [
      { name: 'Crissy Field', at: .02, side: 1, kind: 'park' },
      { name: 'Fort Point', at: .15, side: -1, kind: 'bunker' },
      { name: 'Golden Gate Bridge', at: .35, side: 1, kind: 'bridge' },
      { name: 'South tower', at: .43, side: -1, kind: 'bridge' },
      { name: 'North tower', at: .64, side: 1, kind: 'bridge' },
      { name: 'Battery Spencer', at: .86, side: 1, kind: 'bunker' },
      { name: 'Hawk Hill', at: 1, side: 1, kind: 'view' },
    ],
    fog: { start: .43, end: .60 },
  },
] as const;

export function courseById(id: string): CourseDefinition | undefined {
  return COURSES.find(course => course.id === id);
}
