/** Public cosmetics catalogue. Brand artwork sources live in public/assets/sponsors/SOURCES.md. */
export const DRIVERS = [
  { id: 'dario', name: 'Dario Amodei', short: 'Dario', color: '#f3aa7d', emoji: '◈', title: 'THE SAFETY DRIVER', bio: 'Ran 47 evals on this left turn.', move: 'Constitutional cornering', stat: 'CAUTION 99 · VIBES 100' },
  { id: 'sam', name: 'Sam Altman', short: 'Sam', color: '#b8a3ff', emoji: '✳', title: 'THE LAUNCH GUY', bio: 'The next lap will change everything.', move: 'One more launch', stat: 'HYPE 100 · ETA SOON' },
  { id: 'elon', name: 'Elon Musk', short: 'Elon', color: '#80c8f8', emoji: '↗', title: 'THE ROCKET WILDCARD', bio: 'Missed the turn. Entered orbit.', move: 'Unscheduled space program', stat: 'THRUST 100 · CHILL 0' },
  { id: 'jensen', name: 'Jensen Huang', short: 'Jensen', color: '#c4f36a', emoji: '▧', title: 'THE GPU DADDY', bio: 'Fully accelerated.', move: 'Full leather acceleration', stat: 'JACKET 100 · VRAM 999' },
] as const;
export const CARS = [
  { id: 'sundrop', name: 'Sundrop Roadster', color: '#427e7c', roof: '#ffe4aa', description: 'The original city flyer' },
  { id: 'comet', name: 'Comet Sport', color: '#b36b51', roof: '#ebe7ff', description: 'Terracotta open cockpit' },
  { id: 'tide', name: 'Tide Roadster', color: '#d9b66e', roof: '#142f48', description: 'Buttercream open cockpit' },
] as const;
export const SPONSORS: readonly {id:string;name:string;mark:string;color:string;background:string;logo?:string;tileLogo?:string;logoPadding?:number}[] = [
  { id: 'none', name: 'Independent', mark: '', color: '#153e54', background: '#fff6dc' },
  { id: 'nvidia', logo: '/assets/sponsors/nvidia.svg', name: 'NVIDIA', mark: 'NVIDIA', color: '#ffffff', background: '#76b900', logoPadding: 44 },
  { id: 'roboflow', logo: '/assets/sponsors/roboflow.svg', tileLogo: '/assets/sponsors/roboflow-symbol.svg', name: 'Roboflow', mark: 'Roboflow', color: '#f4f2ec', background: '#8033eb' },
  { id: 'sf-compute', logo: '/assets/sponsors/sf-compute.svg', tileLogo: '/assets/sponsors/sf-compute-symbol.svg', name: 'SF Compute', mark: 'SF Compute', color: '#000000', background: '#ffffff' },
] as const;
export type RacerProfile = { name: string; driver: string; car: string; sponsor: string };
export const DEFAULT_PROFILE: RacerProfile = { name: 'Racer', driver: 'dario', car: 'sundrop', sponsor: 'nvidia' };
export function normalizeProfile(value: Partial<RacerProfile> = {}): RacerProfile {
  const pick = (list: readonly {id:string}[], id: unknown, fallback: string) => list.some(item => item.id === id) ? String(id) : fallback;
  return {
    name: typeof value.name === 'string' ? value.name.replace(/[<>\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 24) || 'Racer' : 'Racer',
    driver: pick(DRIVERS, ({nova:'dario',kai:'sam',sunny:'elon',remy:'jensen'} as Record<string,string>)[value.driver??'']??value.driver, 'dario'), car: pick(CARS, value.car, 'sundrop'), sponsor: pick(SPONSORS, ({orbit:'nvidia',sprout:'roboflow',spark:'sf-compute'} as Record<string,string>)[value.sponsor??'']??value.sponsor, 'none'),
  };
}
