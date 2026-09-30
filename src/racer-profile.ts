/** Public cosmetics catalogue. All sponsors are fictional placeholders. */
export const DRIVERS = [
  { id: 'nova', name: 'Nova', color: '#ba96ff', emoji: '🚀', bio: 'Always chasing the next launch.' },
  { id: 'kai', name: 'Kai', color: '#62dcc8', emoji: '🌊', bio: 'Smooth corners. Ocean energy.' },
  { id: 'sunny', name: 'Sunny', color: '#ffd15e', emoji: '☀️', bio: 'Here for the hills and good times.' },
  { id: 'remy', name: 'Remy', color: '#ff9379', emoji: '⚡', bio: 'A shortcut around every corner.' },
] as const;
export const CARS = [
  { id: 'sundrop', name: 'Sundrop Coupe', color: '#ff5439', roof: '#ffe4aa', description: 'The original city flyer' },
  { id: 'comet', name: 'Comet Sport', color: '#8a78fa', roof: '#ebe7ff', description: 'Sport wing · racing stripes' },
  { id: 'tide', name: 'Tide Roadster', color: '#39bfae', roof: '#142f48', description: 'Open roof · twin roll hoops' },
] as const;
export const SPONSORS: readonly {id:string;name:string;mark:string;color:string;background:string;logo?:string}[] = [
  { id: 'none', name: 'Independent', mark: '', color: '#153e54', background: '#fff6dc' },
  { id: 'orbit', logo: '/assets/sponsors/orbit.svg', name: 'Orbit / demo', mark: 'ORBIT', color: '#f4edff', background: '#5b40c9' },
  { id: 'sprout', logo: '/assets/sponsors/sprout.svg', name: 'Sprout / demo', mark: 'sprout', color: '#153f2e', background: '#bdf290' },
  { id: 'spark', logo: '/assets/sponsors/spark.svg', name: 'Spark / demo', mark: 'SPARK', color: '#331e16', background: '#ffd363' },
] as const;
export type RacerProfile = { name: string; driver: string; car: string; sponsor: string };
export const DEFAULT_PROFILE: RacerProfile = { name: 'Racer', driver: 'nova', car: 'sundrop', sponsor: 'orbit' };
export function normalizeProfile(value: Partial<RacerProfile> = {}): RacerProfile {
  const pick = (list: readonly {id:string}[], id: unknown, fallback: string) => list.some(item => item.id === id) ? String(id) : fallback;
  return {
    name: typeof value.name === 'string' ? value.name.replace(/[<>\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 24) || 'Racer' : 'Racer',
    driver: pick(DRIVERS, value.driver, 'nova'), car: pick(CARS, value.car, 'sundrop'), sponsor: pick(SPONSORS, value.sponsor, 'none'),
  };
}
