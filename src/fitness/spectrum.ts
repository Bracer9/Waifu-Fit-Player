/** Request-only timbre/harmony descriptors for generation and beat analysis. These are not vocal detection
 * or verse/chorus labels. Streamed FFT frames are discarded after pooling. */
export type MusicSpectrumData = { rate: number; frames: number[][] };
const SAMPLE_RATE = 11025,
  SIZE = 2048,
  HOP = 1103;
const window = Float64Array.from(
  { length: SIZE },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SIZE - 1)),
);
function spectrum(values: Float64Array) {
  const real = Float64Array.from(values, (v, i) => v * window[i]),
    imaginary = new Float64Array(SIZE);
  for (let i = 1, j = 0; i < SIZE; i++) {
    let bit = SIZE >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let length = 2; length <= SIZE; length <<= 1) {
    const angle = (-2 * Math.PI) / length,
      wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < SIZE; start += length) {
      let ur = 1,
        ui = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = start + j,
          b = a + length / 2;
        const tr = real[b] * ur - imaginary[b] * ui,
          ti = real[b] * ui + imaginary[b] * ur;
        real[b] = real[a] - tr;
        imaginary[b] = imaginary[a] - ti;
        real[a] += tr;
        imaginary[a] += ti;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = next;
      }
    }
  }
  const bands = Array(12).fill(0) as number[],
    chroma = Array(12).fill(0) as number[];
  for (let bin = 4; bin < SIZE / 2; bin++) {
    const hz = (bin * SAMPLE_RATE) / SIZE,
      power = real[bin] ** 2 + imaginary[bin] ** 2;
    const band = Math.min(11, Math.max(0, Math.floor((Math.log2(hz / 40) * 12) / 7)));
    bands[band] += power;
    if (hz >= 80 && hz <= 2200) {
      const midi = 69 + 12 * Math.log2(hz / 440),
        pitch = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pitch] += power * Math.exp(-8 * (midi - Math.round(midi)) ** 2);
    }
  }
  const normalize = (v: number[]) => {
    const sum = v.reduce((s, x) => s + x, 0);
    return v.map((x) => Math.sqrt(x / (sum || 1)));
  };
  return [...normalize(bands), ...normalize(chroma)];
}
export class MusicSpectrum {
  private ring = new Float64Array(SIZE);
  private samples = 0;
  private bucket = -1;
  private sum = 0;
  private count = 0;
  private frames: number[][] = [];
  private append(value: number) {
    this.ring[this.samples % SIZE] = value;
    this.samples++;
    // Centre timestamps remain anchored to the original audio timeline.
    if (this.samples >= SIZE && (this.samples - SIZE) % HOP === 0) {
      const ordered = Float64Array.from(
        { length: SIZE },
        (_, i) => this.ring[(this.samples + i) % SIZE],
      );
      const at = Math.round(((this.samples - SIZE / 2) / SAMPLE_RATE) * 10);
      this.frames[at] = spectrum(ordered);
    }
  }
  push(channels: Float32Array[], sampleRate: number, timestamp: number) {
    if (!channels.length) return;
    // Pick a channel, don't sum opposite-phase stereo into silence.
    const channel = channels
      .map((values) => ({
        values,
        power: values.reduce((s, v, i) => (i % 32 === 0 ? s + v * v : s), 0),
      }))
      .sort((a, b) => b.power - a.power)[0].values;
    for (let i = 0; i < channel.length; i++) {
      const bucket = Math.floor((timestamp + i / sampleRate) * SAMPLE_RATE);
      if (bucket !== this.bucket) {
        if (this.count) this.append(this.sum / this.count);
        // Preserve leading silence and timestamp gaps instead of shifting music.
        while (this.samples < bucket) this.append(0);
        this.bucket = bucket;
        this.sum = 0;
        this.count = 0;
      }
      this.sum += channel[i];
      this.count++;
    }
  }
  data(): MusicSpectrumData {
    if (this.count) {
      this.append(this.sum / this.count);
      this.count = 0;
    }
    return {
      rate: 10,
      frames: Array.from(
        { length: this.frames.length },
        (_, i) => this.frames[i] ?? Array(24).fill(0),
      ),
    };
  }
}
