import type { ModuleInstance, ModuleType, SimulationState } from '../core/types';

type Voice = {
  oscillator?: OscillatorNode;
  gain: GainNode;
  noise?: AudioBufferSourceNode;
  filter?: BiquadFilterNode;
};

const SOUND_TYPES = new Set<ModuleType>([
  'motor', 'fan', 'propeller', 'drill', 'pump', 'conveyor', 'winch', 'mixer', 'buzzer', 'nozzle',
  'car-base', 'motorcycle-base', 'train-engine',
]);

export class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<string, Voice>();
  private enabled = true;

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) this.stopAll();
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  update(modules: Iterable<ModuleInstance>, state: SimulationState, running: boolean) {
    if (!running || !this.enabled || !this.context || !this.master) {
      this.stopAll();
      return;
    }

    const wanted = new Map<string, ModuleInstance>();
    for (const module of modules) {
      if (!SOUND_TYPES.has(module.type)) continue;
      const mechanicallyActive = state.rpm.has(module.id);
      const electricallyActive = state.active.has(module.id);
      const fluidActive = state.fluid.has(module.id);
      const on =
        module.type === 'buzzer' ? state.powered.has(module.id) :
        module.type === 'pump' || module.type === 'nozzle' ? fluidActive :
        mechanicallyActive || electricallyActive;
      if (on) wanted.set(module.id, module);
    }

    for (const [id, voice] of this.voices) {
      if (!wanted.has(id)) {
        this.stopVoice(voice);
        this.voices.delete(id);
      }
    }

    for (const [id, module] of wanted) {
      const speed = Math.abs(state.rpm.get(id) ?? 0);
      const existing = this.voices.get(id);
      if (existing) {
        this.tune(existing, module.type, speed);
      } else {
        this.voices.set(id, this.createVoice(module.type, speed));
      }
    }
  }

  stopAll() {
    for (const voice of this.voices.values()) this.stopVoice(voice);
    this.voices.clear();
  }

  private createVoice(type: ModuleType, rpm: number): Voice {
    const ctx = this.context!;
    const gain = ctx.createGain();
    gain.gain.value = this.volumeFor(type);
    gain.connect(this.master!);

    if (type === 'fan' || type === 'propeller' || type === 'pump' || type === 'nozzle') {
      const length = Math.max(1, Math.floor(ctx.sampleRate * 1.2));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = type === 'pump' ? 420 : type === 'nozzle' ? 1200 : 850;
      noise.connect(filter);
      filter.connect(gain);
      noise.start();
      return { gain, noise, filter };
    }

    const oscillator = ctx.createOscillator();
    oscillator.type =
      type === 'buzzer' ? 'square' :
      type === 'drill' ? 'sawtooth' :
      type === 'conveyor' || type === 'winch' ? 'triangle' :
      'sine';
    oscillator.connect(gain);
    oscillator.start();
    const voice = { gain, oscillator };
    this.tune(voice, type, rpm);
    return voice;
  }

  private tune(voice: Voice, type: ModuleType, rpm: number) {
    if (!voice.oscillator || !this.context) return;
    const now = this.context.currentTime;
    let frequency =
      type === 'buzzer' ? 720 :
      type === 'drill' ? 130 + rpm * 1.1 :
      type === 'conveyor' ? 70 + rpm * .25 :
      type === 'winch' ? 80 + rpm * .2 :
      type === 'mixer' ? 95 + rpm * .35 :
      type === 'car-base' ? 92 + rpm * .38 :
      type === 'motorcycle-base' ? 118 + rpm * .58 :
      type === 'train-engine' ? 72 + rpm * .26 :
      85 + rpm * .45;
    frequency = Math.min(1100, Math.max(45, frequency));
    voice.oscillator.frequency.setTargetAtTime(frequency, now, .04);
  }

  private volumeFor(type: ModuleType) {
    if (type === 'buzzer') return .11;
    if (type === 'drill') return .06;
    if (type === 'pump' || type === 'nozzle') return .055;
    if (type === 'car-base' || type === 'motorcycle-base' || type === 'train-engine') return .05;
    if (type === 'fan' || type === 'propeller') return .04;
    return .035;
  }

  private stopVoice(voice: Voice) {
    try { voice.oscillator?.stop(); } catch {}
    try { voice.noise?.stop(); } catch {}
    try { voice.oscillator?.disconnect(); } catch {}
    try { voice.noise?.disconnect(); } catch {}
    try { voice.filter?.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
  }
}
