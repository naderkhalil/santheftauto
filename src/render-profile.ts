export type RenderEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  coarsePointer: boolean;
  search?: string;
};

/** Decide before allocating any WebGL targets or downloading detailed assets. */
export function getRenderProfile(environment?: RenderEnvironment) {
  const device = environment ?? {
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    platform: typeof navigator === 'undefined' ? '' : navigator.platform,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    search: typeof location === 'undefined' ? '' : location.search,
  };
  // The reported startup failure is on iOS. Touch input or Android alone must
  // not lower quality on devices that were already running the full game.
  const mobile = /iPhone|iPad|iPod/i.test(device.userAgent)
    || device.platform === 'MacIntel' && device.maxTouchPoints > 1
    // A conservative override lets desktop QA exercise the identical mobile path.
    || new URLSearchParams(device.search).get('graphics') === 'mobile';
  return { mobile, maxPixelRatio: mobile ? 1 : 1.6, postprocessing: !mobile, highDetailAssets: !mobile };
}

/** Also bound iPad/large-screen framebuffers without changing CSS/touch coordinates. */
export function renderPixelRatio(pixelRatio: number, width: number, height: number, maximum: number, mobile: boolean) {
  return Math.min(pixelRatio || 1, maximum, mobile ? Math.sqrt(1_000_000 / Math.max(1, width * height)) : Infinity);
}
