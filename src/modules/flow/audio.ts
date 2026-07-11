export type Ambiance = "brown" | "pink" | "white" | "rain" | "metronome";

/**
 * Motor de ambiência do modo Fluxo — 100% procedural (Web Audio), sem arquivos.
 * Ruídos (marrom/rosa/branco/chuva) em loop ou metrônomo por BPM.
 */
export class FlowAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private chain: AudioNode[] = [];
  private metro: number | null = null;
  private nextNote = 0;
  private bpm = 90;
  private volume = 0.5;
  private ambiance: Ambiance = "brown";
  private running = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  setBpm(b: number) {
    this.bpm = b;
  }

  setAmbiance(a: Ambiance) {
    this.ambiance = a;
    if (this.running) {
      this.stopSound();
      this.startSound();
    }
  }

  async start() {
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
    this.running = true;
    this.startSound();
  }

  stop() {
    this.running = false;
    this.stopSound();
  }

  /** Toque gentil pra chamar de volta ao foco. */
  chime() {
    const ctx = this.ensure();
    const t = ctx.currentTime;
    for (const [i, freq] of [523.25, 659.25].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(this.master!);
      const start = t + i * 0.16;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      o.start(start);
      o.stop(start + 0.55);
    }
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }

  private startSound() {
    if (this.ambiance === "metronome") this.startMetronome();
    else this.startNoise(this.ambiance);
  }

  private stopSound() {
    this.stopNoise();
    this.stopMetronome();
  }

  private makeBuffer(type: Ambiance): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (type === "white" || type === "rain") {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      // brown
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private startNoise(type: Ambiance) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.makeBuffer(type);
    src.loop = true;
    let node: AudioNode = src;
    const chain: AudioNode[] = [];
    if (type === "rain") {
      // filtra o branco pra soar como chuva/shhh
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1600;
      node.connect(hp);
      hp.connect(lp);
      node = lp;
      chain.push(hp, lp);
    }
    node.connect(this.master!);
    src.start();
    this.noise = src;
    this.chain = chain;
  }

  private stopNoise() {
    if (this.noise) {
      try {
        this.noise.stop();
      } catch {
        /* já parado */
      }
      this.noise.disconnect();
      this.noise = null;
    }
    this.chain.forEach((n) => n.disconnect());
    this.chain = [];
  }

  private startMetronome() {
    const ctx = this.ctx!;
    this.nextNote = ctx.currentTime + 0.1;
    const tick = () => {
      while (this.nextNote < ctx.currentTime + 0.2) {
        this.click(this.nextNote);
        this.nextNote += 60 / this.bpm;
      }
      this.metro = window.setTimeout(tick, 50);
    };
    tick();
  }

  private click(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1100;
    o.connect(g);
    g.connect(this.master!);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.start(t);
    o.stop(t + 0.06);
  }

  private stopMetronome() {
    if (this.metro) {
      clearTimeout(this.metro);
      this.metro = null;
    }
  }
}
