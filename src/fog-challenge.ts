export type FogChallengeEvent = 'none' | 'beacon' | 'retry' | 'complete';
export type FogBeacon = { readonly progress: number; readonly lateral: number };

/** Ordered steering gates inside the bridge fog. The caller performs retries. */
export class FogChallenge {
  readonly startDistance: number;
  readonly endDistance: number;
  private readonly beacons: readonly FogBeacon[];
  private count = 0;
  private entered = false;

  constructor(startDistance: number, endDistance: number) {
    if (!Number.isFinite(startDistance) || !Number.isFinite(endDistance) || endDistance <= startDistance) {
      throw new RangeError('A fog challenge needs a finite, increasing distance range.');
    }
    this.startDistance = startDistance;
    this.endDistance = endDistance;
    const span = endDistance - startDistance;
    this.beacons = [-3, 3, 0].map((lateral, index) => ({
      progress: startDistance + span * [.22, .5, .78][index], lateral,
    }));
  }

  get collected(): number { return this.count; }
  get total(): number { return this.beacons.length; }
  get complete(): boolean { return this.count === this.total; }
  get active(): boolean { return this.entered && !this.complete; }
  get nextBeacon(): FogBeacon | undefined { return this.beacons[this.count]; }

  reset() {
    this.count = 0;
    this.entered = false;
  }

  /** Cross each beacon forward within 2.6 m; staying centered misses the first. */
  update(previousProgress: number, progress: number, lateral: number, previousLateral = lateral): FogChallengeEvent {
    if (this.complete || ![previousProgress, progress, lateral, previousLateral].every(Number.isFinite)) return 'none';
    if (progress < this.startDistance) return 'none';
    this.entered = true;
    if (progress <= previousProgress) return 'none';
    let result: FogChallengeEvent = 'none';
    while (this.nextBeacon && progress >= this.nextBeacon.progress) {
      const beacon = this.nextBeacon;
      const crossing = (beacon.progress - previousProgress) / (progress - previousProgress);
      const crossingLateral = previousLateral + (lateral - previousLateral) * crossing;
      if (previousProgress > beacon.progress || Math.abs(crossingLateral - beacon.lateral) > 2.6) {
        this.reset();
        return 'retry';
      }
      this.count++;
      result = this.complete ? 'complete' : 'beacon';
    }
    return result;
  }
}
