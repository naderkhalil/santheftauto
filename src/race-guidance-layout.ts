import { ROAD_HALF_WIDTH, ROUTE_POLYLINE, TRACK_LENGTH, routeCurvature, routeFrame, routePoint, routeProgressAt } from './route.ts';

export type RaceTurn = {
  id: number;
  entry: number;
  apex: number;
  exit: number;
  direction: 'left' | 'right';
  fromStreet: string;
  street: string;
  /** routePoint lateral on the outside of the bend, in semantic city axes. */
  signSide: -1 | 1;
};

const streets = ['Post Street', 'Stockton Street', 'Geary Street', 'Powell Street', 'Bush Street', 'Grant Avenue', 'Washington Street', 'The Embarcadero', 'Market Street'] as const;

/** Geometry follows the authored rounded route; no duplicated distance table. */
export const RACE_TURNS: readonly RaceTurn[] = ROUTE_POLYLINE.slice(1, -1).map(([x, z], id) => {
  const apex = routeProgressAt(x, z), curvature = routeCurvature(apex);
  const [ax, az] = ROUTE_POLYLINE[id], [cx, cz] = ROUTE_POLYLINE[id + 2];
  const inX = x - ax, inZ = z - az, outX = cx - x, outZ = cz - z;
  const angle = Math.abs(Math.atan2(inX * outZ - inZ * outX, inX * outX + inZ * outZ));
  const halfArc = angle / (2 * Math.abs(curvature));
  // The rendered city reflects semantic north into -Z. Positive route
  // curvature still means a physical right turn when viewed from the car.
  const direction = curvature > 0 ? 'right' : 'left';
  return {
    id, entry: apex - halfArc, apex, exit: apex + halfArc,
    direction, fromStreet: streets[id], street: streets[id + 1],
    signSide: direction === 'right' ? -1 : 1,
  };
});

/** Leaves room for the complete 3.9m-wide board when facing diagonally inward. */
export const RACE_GUIDANCE_PANEL_OFFSET = ROAD_HALF_WIDTH + 2.8;

export function raceTurnPanelPositions(turn: RaceTurn) {
  return [0, .25, .5, .75, 1].map(fraction => {
    const progress = turn.entry + (turn.exit - turn.entry) * fraction;
    const lateral = turn.signSide * RACE_GUIDANCE_PANEL_OFFSET;
    const frame = routeFrame(progress);
    return {
      progress, lateral, position: routePoint(progress, lateral), tangent: frame.tangent,
      inward: { x: -turn.signSide * frame.normal.x, z: -turn.signSide * frame.normal.z },
    };
  });
}

export const RACE_CORNER_SPEED = 23;
export type UpcomingRaceTurn = { turn: RaceTurn; distance: number; inTurn: boolean; brake: boolean };

/** Advisory only: horizontal metres and metres/second, never steering or pedals. */
export function upcomingRaceTurn(progress: number, speed: number): UpcomingRaceTurn | null {
  if (!Number.isFinite(progress) || progress >= TRACK_LENGTH) return null;
  const turn = RACE_TURNS.find(candidate => progress < candidate.exit);
  if (!turn) return null;
  const distance = Math.max(0, turn.entry - progress), inTurn = progress >= turn.entry;
  const forwardSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const slowdownDistance = Math.max(0, (forwardSpeed ** 2 - RACE_CORNER_SPEED ** 2) / (2 * 20));
  const warningDistance = slowdownDistance + forwardSpeed * .7 + 5;
  return { turn, distance, inTurn, brake: forwardSpeed > RACE_CORNER_SPEED + 2 && distance <= warningDistance };
}
