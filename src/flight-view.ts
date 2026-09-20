type FlightViewState = {
  speed: number;
  y: number;
  verticalVelocity: number;
  altitude: number;
  glide: number;
  driftAngle: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function smoothstep(value: number, min: number, max: number) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Presentation follows separation from the road, never the binary launch event. */
export function flightView(state: FlightViewState, groundSlope: number, aheadGroundHeight: number) {
  const clearance = smoothstep(state.altitude, .08, 3.5);
  const weight = clearance * lerp(.5, 1, smoothstep(state.glide, 0, .8));
  // Ground velocity and launch velocity share a tangent. Keep that full pitch
  // through release, then gently adopt the more level hover attitude in flight.
  const roadPitch = -Math.atan(groundSlope);
  const velocityPitch = -Math.atan2(state.verticalVelocity, Math.max(state.speed, .01));
  const travelPitch = lerp(roadPitch, velocityPitch, smoothstep(state.speed, .25, 1));
  const pitch = lerp(travelPitch, clamp(travelPitch, -.18, .22), weight);
  const roadLook = state.y + clamp((aheadGroundHeight - state.y) * .3, -5, 4) + 1.2;
  return {
    weight,
    pitch,
    bank: -state.driftAngle * lerp(.1, .55, weight),
    lookHeight: lerp(roadLook, state.y - 1.8, weight),
  };
}
