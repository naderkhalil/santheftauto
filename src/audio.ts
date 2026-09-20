/** Lightweight synthesized racing sound; no audio or network assets required. */
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engine?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private oscillators: OscillatorNode[] = [];
  private wind?: GainNode;
  private tires?: GainNode;
  private muted = false;
  private ready = false;

  async unlock(): Promise<void> {
    try {
      if (!this.context) this.initialize();
      await this.context?.resume();
      this.ready = this.context?.state === 'running';
      this.master?.gain.setTargetAtTime(this.muted ? 0 : .42, this.context!.currentTime, .12);
    } catch {
      // Audio is optional; privacy/browser policies must never block play.
      this.ready = false;
    }
  }

  private initialize(): void {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor(); this.context = ctx;
    const master = ctx.createGain(); master.gain.value = 0; this.master = master;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -17; compressor.ratio.value = 5; compressor.knee.value = 18;
    master.connect(compressor); compressor.connect(ctx.destination);
    const engine = ctx.createGain(); engine.gain.value = 0; this.engine = engine;
    const engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 500; engineFilter.Q.value = .8;
    this.engineFilter = engineFilter; engineFilter.connect(engine); engine.connect(master);
    for (const [i, type] of (['sawtooth', 'triangle', 'sine'] as OscillatorType[]).entries()) {
      const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = 32 * (i + 1);
      const level = ctx.createGain(); level.gain.value = [.17, .25, .33][i];
      osc.connect(level); level.connect(engineFilter); osc.start(); this.oscillators.push(osc);
    }
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true;
    const windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 850;
    const wind = ctx.createGain(); wind.gain.value = 0; this.wind = wind;
    noise.connect(windFilter); windFilter.connect(wind); wind.connect(master);
    const tireFilter = ctx.createBiquadFilter(); tireFilter.type = 'bandpass'; tireFilter.frequency.value = 1700; tireFilter.Q.value = 2.5;
    const tires = ctx.createGain(); tires.gain.value = 0; this.tires = tires;
    noise.connect(tireFilter); tireFilter.connect(tires); tires.connect(master); noise.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.context && this.master) this.master.gain.setTargetAtTime(muted ? 0 : .42, this.context.currentTime, .07);
  }

  update(speed: number, throttle: number, drifting: boolean, boosting: boolean, glide = 0): void {
    if (!this.ready || !this.context) return;
    const t = this.context.currentTime;
    const velocity = Math.abs(speed);
    // Each upshift drops the engine pitch; acceleration raises it again.
    const gear = Math.min(5, Math.floor(velocity / 12));
    const revs = (velocity - gear * 12) / 12;
    const pitch = 34 + gear * 3 + revs * 41 + Math.max(0, throttle) * 8 + (boosting ? 7 : 0);
    for (let i = 0; i < this.oscillators.length; i++) this.oscillators[i].frequency.setTargetAtTime(pitch * (i + 1) + (i === 1 ? .8 : 0), t, .09);
    this.engine?.gain.setTargetAtTime((.23 + Math.max(0, throttle) * .37 + Math.min(velocity / 100, .25)) * (1-glide*.65), t, .12);
    this.engineFilter?.frequency.setTargetAtTime(240 + Math.max(0, throttle) * 380 + velocity * 8, t, .15);
    this.wind?.gain.setTargetAtTime(Math.min(.44, Math.pow(velocity / 60, 2) * .22) + (boosting ? .15 : 0) + glide*.16, t, .15);
    this.tires?.gain.setTargetAtTime(drifting && velocity > 5 ? .09 + Math.min(.1, velocity / 400) : 0, t, .10);
  }

  cue(kind: 'count' | 'go' | 'checkpoint' | 'finish' | 'crash' | 'launch' | 'land'): void {
    if (!this.context || !this.master || !this.ready) return;
    const ctx = this.context, t = ctx.currentTime;
    const notes = kind==='launch'?[330,440,660,880]:kind==='land'?[220,440]:kind === 'finish' ? [523, 659, 784, 1047] : kind === 'checkpoint' ? [660, 880] : kind === 'go' ? [880] : kind === 'count' ? [440] : [75];
    notes.forEach((freq, index) => {
      const start = t + index * .10;
      const osc = ctx.createOscillator(); osc.type = kind === 'crash' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      if (kind === 'crash') osc.frequency.exponentialRampToValueAtTime(25, start + .16);
      const envelope = ctx.createGain(); envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(kind === 'crash' ? .35 : .30, start + .009);
      const duration = kind === 'go' || kind === 'finish' ? .42 : .22;
      envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
      osc.connect(envelope); envelope.connect(this.master!); osc.start(start); osc.stop(start + duration + .02);
      osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
    });
  }

  /** A short, positional two-strike brass bell for passing a cable car. */
  cableBell(distance: number, pan: number): void {
    if (!this.context || !this.master || !this.ready || this.muted || this.context.state !== 'running') return;
    if (!Number.isFinite(distance) || !Number.isFinite(pan)) return;
    const ctx = this.context, t = ctx.currentTime + .006;
    const metres = Math.max(0, distance);
    const attenuation = 1 / (1 + Math.pow(metres / 22, 1.4));
    const bell = ctx.createGain(); bell.gain.value = .28 * attenuation;
    const panner = ctx.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(bell); bell.connect(this.master);
    // Inharmonic modes and faster high-frequency decay produce a small brass
    // bell's metallic ring without a looping sample or a sustained synth tone.
    const partials = [
      { ratio: 1, level: .62, decay: 1.12 },
      { ratio: 2.76, level: .25, decay: .78 },
      { ratio: 4.07, level: .12, decay: .48 },
      { ratio: 5.43, level: .055, decay: .31 },
    ];
    let remaining = partials.length * 2;
    for (let hit = 0; hit < 2; hit++) {
      const start = t + hit * .205, strength = hit === 0 ? 1 : .79;
      for (const partial of partials) {
        const osc = ctx.createOscillator(); osc.type = 'sine';
        const frequency = 617 * partial.ratio;
        osc.frequency.setValueAtTime(frequency * 1.002, start);
        osc.frequency.exponentialRampToValueAtTime(frequency, start + .075);
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(.00001, start);
        envelope.gain.exponentialRampToValueAtTime(partial.level * strength, start + .004);
        envelope.gain.exponentialRampToValueAtTime(.00001, start + partial.decay);
        osc.connect(envelope); envelope.connect(panner);
        osc.onended = () => {
          osc.disconnect(); envelope.disconnect();
          if (--remaining === 0) { panner.disconnect(); bell.disconnect(); }
        };
        osc.start(start); osc.stop(start + partial.decay + .015);
      }
    }
  }

  suspend(): void {
    if (!this.context) return;
    const t = this.context.currentTime;
    this.engine?.gain.setTargetAtTime(0, t, .06);
    this.wind?.gain.setTargetAtTime(0, t, .06);
    this.tires?.gain.setTargetAtTime(0, t, .06);
  }
}
