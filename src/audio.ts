type Music = 'menu' | 'battle' | 'none';
type Wave = OscillatorType;

const note = (semitones: number) => 440 * 2 ** (semitones / 12);

export class ArcadeAudio {
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private trackBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private timer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private track: Music = 'none';
  private noiseBuffer: AudioBuffer | null = null;
  musicVolume = Number(localStorage.getItem('caf-music') ?? '0.45');
  effectsVolume = Number(localStorage.getItem('caf-effects') ?? '0.75');
  muted = localStorage.getItem('caf-muted') === 'true';

  async unlock(context: AudioContext): Promise<void> {
    if (!this.context) {
      this.context = context;
      this.musicBus = context.createGain();
      this.effectsBus = context.createGain();
      this.musicBus.connect(context.destination);
      this.effectsBus.connect(context.destination);
      this.noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') await context.resume();
    this.updateGains();
  }

  setLevels(music: number, effects: number, muted: boolean): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.effectsVolume = Math.max(0, Math.min(1, effects));
    this.muted = muted;
    localStorage.setItem('caf-music', String(this.musicVolume));
    localStorage.setItem('caf-effects', String(this.effectsVolume));
    localStorage.setItem('caf-muted', String(this.muted));
    this.updateGains();
  }

  private updateGains(): void {
    if (this.musicBus) this.musicBus.gain.value = this.muted ? 0 : this.musicVolume;
    if (this.effectsBus) this.effectsBus.gain.value = this.muted ? 0 : this.effectsVolume;
  }

  private tone(freq: number, when: number, duration: number, wave: Wave, volume: number, music = false, endFreq?: number, lowpass = 6000): void {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(30, freq), when);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), when + duration);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpass, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(music ? this.trackBus! : this.effectsBus!);
    osc.start(when);
    osc.stop(when + duration + 0.02);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private noise(when: number, duration: number, volume: number, music = false, filterType: BiquadFilterType = 'highpass', frequency = 900): void {
    if (!this.context || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(music ? this.trackBus! : this.effectsBus!);
    source.start(when);
    source.stop(when + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private kick(when: number, music = true): void {
    this.tone(155, when, 0.19, 'sine', music ? 0.19 : 0.26, music, 44, 420);
    this.noise(when, 0.025, music ? 0.015 : 0.045, music, 'lowpass', 1300);
  }

  private snare(when: number, music = true): void {
    this.noise(when, 0.13, music ? 0.07 : 0.13, music, 'bandpass', 1800);
    this.tone(180, when, 0.08, 'triangle', music ? 0.04 : 0.08, music, 110);
  }

  music(kind: Music): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.trackBus?.disconnect();
    this.trackBus = null;
    this.track = kind;
    this.beat = 0;
    if (!this.context || kind === 'none') return;
    this.trackBus = this.context.createGain();
    this.trackBus.connect(this.musicBus!);
    this.nextBeat = this.context.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), 70);
    this.schedule();
  }

  private schedule(): void {
    if (!this.context || this.track === 'none') return;
    const battle = this.track === 'battle';
    const step = 60 / (battle ? 142 : 108) / 2;
    const melody = battle
      ? [7, -99, 10, 12, 14, 12, 10, -99, 7, 10, 15, 14, 12, -99, 10, 7,
         5, -99, 8, 10, 12, 10, 8, -99, 5, 8, 12, 15, 14, 12, 10, -99]
      : [7, -99, 10, 12, 14, -99, 12, 10, 7, -99, 5, 7, 10, -99, 7, 5,
         3, -99, 7, 10, 12, -99, 10, 7, 5, 3, 5, 7, 10, -99, 7, -99];
    const roots = battle ? [-17, -14, -12, -19] : [-17, -12, -14, -19];
    while (this.nextBeat < this.context.currentTime + 0.2) {
      const pos = this.beat % 32;
      const time = this.nextBeat;
      const root = roots[Math.floor(pos / 8)];
      if (melody[pos] > -90) {
        this.tone(note(melody[pos] + 7), time, step * 0.69, 'square', battle ? 0.044 : 0.036, true, undefined, 2400);
        if (pos % 4 === 2) this.tone(note(melody[pos] + 19), time + 0.02, step * 0.4, 'triangle', 0.018, true);
      }
      if (pos % 2 === 0) {
        this.tone(note(root), time, step * (battle ? 1.65 : 1.85), 'sawtooth', battle ? 0.084 : 0.073, true, undefined, 400);
        this.tone(note(root - 12), time, step * 1.55, 'sine', 0.11, true);
      }
      if (pos % 2 === 1) {
        const arp = [0, 7, 12, 7][Math.floor(pos / 2) % 4];
        this.tone(note(root + arp + 24), time, step * 0.55, 'triangle', battle ? 0.028 : 0.022, true, undefined, 3100);
      }
      if (pos % 8 === 0 || (battle && pos % 8 === 3)) this.kick(time);
      if (pos % 8 === 4) this.snare(time);
      if (pos % 2 === 1 || (battle && pos % 2 === 0)) this.noise(time, 0.035, battle ? 0.012 : 0.008, true, 'highpass', 6500);
      if (pos === 15 || pos === 31) this.noise(time, step * 1.5, battle ? 0.04 : 0.025, true, 'bandpass', 2400);
      this.beat++;
      this.nextBeat += step;
    }
  }

  sound(type: string): void {
    if (!this.context || this.muted) return;
    const t = this.context.currentTime + 0.005;
    switch (type) {
      case 'select': this.tone(660, t, 0.07, 'square', 0.07, false, 950); this.tone(990, t + 0.035, 0.13, 'triangle', 0.055); break;
      case 'count': [0, 1, 2].forEach(i => { this.tone(i === 2 ? 880 : 550, t + i * 0.15, 0.12, 'square', 0.08); this.noise(t + i * 0.15, 0.02, 0.025); }); break;
      case 'jump': this.tone(190, t, 0.24, 'triangle', 0.13, false, 680); this.tone(400, t + 0.035, 0.15, 'square', 0.035, false, 900); this.noise(t, 0.11, 0.045); break;
      case 'land': this.kick(t, false); this.noise(t, 0.12, 0.08, false, 'lowpass', 850); break;
      case 'punch': this.noise(t, 0.1, 0.14, false, 'bandpass', 1300); this.tone(220, t, 0.12, 'sawtooth', 0.1, false, 75, 1400); break;
      case 'hit': this.kick(t, false); this.snare(t + 0.018, false); this.tone(135, t, 0.22, 'sawtooth', 0.11, false, 48, 900); break;
      case 'block': this.noise(t, 0.14, 0.085, false, 'highpass', 3000); this.tone(880, t, 0.25, 'triangle', 0.1, false, 330); this.tone(1300, t + 0.03, 0.16, 'sine', 0.035); break;
      case 'ready': [0, 4, 7, 12].forEach((n, i) => this.tone(note(n + 3), t + i * 0.075, 0.2, 'square', 0.055)); break;
      case 'ko': this.kick(t, false); [0, -3, -7, -12].forEach((n, i) => { this.tone(note(n - 4), t + i * 0.16, 0.31, 'sawtooth', 0.095); this.snare(t + i * 0.16, false); }); break;
      case 'kalliane': this.noise(t, 0.23, 0.1, false, 'bandpass', 3100); this.tone(580, t + 0.06, 0.23, 'triangle', 0.08, false, 1150); this.noise(t + 0.25, 0.07, 0.1, false, 'highpass', 5100); break;
      case 'laura': [0, 1, 2].forEach(i => this.tone(740 + i * 155, t + i * 0.065, 0.09, 'square', 0.055)); this.noise(t + 0.18, 0.09, 0.075, false, 'highpass', 4500); this.kick(t + 0.22, false); break;
      case 'caio': this.tone(660, t, 0.21, 'square', 0.08, false, 280); this.noise(t + 0.1, 0.1, 0.055, false, 'bandpass', 1800); [0, 1, 2].forEach(i => this.tone(320 + i * 180, t + 0.2 + i * 0.06, 0.085, 'triangle', 0.045)); break;
      case 'rui': this.tone(150, t, 0.42, 'sawtooth', 0.11, false, 60, 750); this.noise(t + 0.07, 0.25, 0.08, false, 'bandpass', 650); this.tone(830, t + 0.24, 0.14, 'square', 0.06, false, 220); break;
      case 'monteiro': this.noise(t, 0.24, 0.11, false, 'bandpass', 1300); this.tone(220, t, 0.32, 'sawtooth', 0.09, false, 75, 950); this.tone(540, t + 0.12, 0.2, 'square', 0.045, false, 220); break;
      case 'vinicius': this.tone(170, t, 0.4, 'sawtooth', 0.09, false, 1200, 2300); [0, 1, 2, 3].forEach(i => this.tone(600 + i * 180, t + 0.1 + i * 0.06, 0.09, 'square', 0.035)); this.noise(t + 0.25, 0.16, 0.055, false, 'highpass', 3700); break;
      case 'super': this.kick(t, false); this.noise(t, 0.5, 0.09, false, 'bandpass', 1350); [0, 3, 7, 12, 15].forEach((n, i) => { this.tone(note(n + 5), t + i * 0.09, 0.37, 'square', 0.075); this.tone(note(n + 17), t + i * 0.09, 0.18, 'triangle', 0.025); }); break;
    }
  }

  jingle(won: boolean): void {
    this.music('none');
    if (!this.context) return;
    const notes = won ? [0, 4, 7, 12] : [0, -3, -7, -12];
    notes.forEach((n, i) => this.tone(note(n + 3), this.context!.currentTime + 0.09 + i * 0.17, i === 3 ? 0.5 : 0.16, 'square', 0.1));
  }
}
