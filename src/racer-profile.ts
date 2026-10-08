/** Public cosmetics catalogue. All sponsors are fictional placeholders. */
export const DRIVERS = [
  { id: 'dario', name: 'Dario Amodei', short: 'Dario', color: '#f3aa7d', emoji: '◈', title: 'THE SAFETY DRIVER', bio: 'Ran 47 evals on this left turn.', move: 'Constitutional cornering', stat: 'CAUTION 99 · VIBES 100' },
  { id: 'sam', name: 'Sam Altman', short: 'Sam', color: '#b8a3ff', emoji: '✳', title: 'THE LAUNCH GUY', bio: 'The next lap will change everything.', move: 'One more launch', stat: 'HYPE 100 · ETA SOON' },
  { id: 'elon', name: 'Elon Musk', short: 'Elon', color: '#80c8f8', emoji: '↗', title: 'THE ROCKET WILDCARD', bio: 'Missed the turn. Entered orbit.', move: 'Unscheduled space program', stat: 'THRUST 100 · CHILL 0' },
  { id: 'jensen', name: 'Jensen Huang', short: 'Jensen', color: '#c4f36a', emoji: '▧', title: 'THE GPU DADDY', bio: 'The more you boost, the more you save.', move: 'Full leather acceleration', stat: 'JACKET 100 · VRAM 999' },
] as const;
export const CARS = [
  { id: 'sundrop', name: 'Sundrop Roadster', color: '#427e7c', roof: '#ffe4aa', description: 'The original city flyer' },
  { id: 'comet', name: 'Comet Sport', color: '#b36b51', roof: '#ebe7ff', description: 'Terracotta open cockpit' },
  { id: 'tide', name: 'Tide Roadster', color: '#d9b66e', roof: '#142f48', description: 'Buttercream open cockpit' },
] as const;
export const SPONSORS: readonly {id:string;name:string;mark:string;color:string;background:string;logo?:string}[] = [
  { id: 'none', name: 'Independent', mark: '', color: '#153e54', background: '#fff6dc' },
  { id: 'orbit', logo: '/assets/sponsors/orbit.svg', name: 'Orbit / demo', mark: 'ORBIT', color: '#f4edff', background: '#5b40c9' },
  { id: 'sprout', logo: '/assets/sponsors/sprout.svg', name: 'Sprout / demo', mark: 'sprout', color: '#153f2e', background: '#bdf290' },
  { id: 'spark', logo: '/assets/sponsors/spark.svg', name: 'Spark / demo', mark: 'SPARK', color: '#331e16', background: '#ffd363' },
] as const;
export type RacerProfile = { name: string; driver: string; car: string; sponsor: string };
export const DEFAULT_PROFILE: RacerProfile = { name: 'Racer', driver: 'dario', car: 'sundrop', sponsor: 'orbit' };
export function normalizeProfile(value: Partial<RacerProfile> = {}): RacerProfile {
  const pick = (list: readonly {id:string}[], id: unknown, fallback: string) => list.some(item => item.id === id) ? String(id) : fallback;
  return {
    name: typeof value.name === 'string' ? value.name.replace(/[<>\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 24) || 'Racer' : 'Racer',
    driver: pick(DRIVERS, ({nova:'dario',kai:'sam',sunny:'elon',remy:'jensen'} as Record<string,string>)[value.driver??'']??value.driver, 'dario'), car: pick(CARS, value.car, 'sundrop'), sponsor: pick(SPONSORS, value.sponsor, 'none'),
  };
}
