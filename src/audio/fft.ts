// 実数信号のパワースペクトル（基数2の FFT）。リズム解析の STFT に使う

export class PowerSpectrum {
  readonly size: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;
  /** Hann 窓 */
  readonly window: Float64Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of 2: ${size}`);
    this.size = size;
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    this.rev = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.window = new Float64Array(size);
    for (let i = 0; i < size; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }

  /**
   * input[offset .. offset+size) に窓をかけ、パワー |X[k]|^2 / size（k = 0..size/2）を out に書く。
   * 振幅 1 の正弦波で、そのビンの値がおよそ size/16 になる（窓の分を含む。相対比較に使うので絶対値は問わない）
   */
  power(input: ArrayLike<number>, offset: number, out: Float64Array): void {
    const { size, re, im, rev, window } = this;
    for (let i = 0; i < size; i++) {
      const j = rev[i];
      re[j] = input[offset + i] * window[i];
      im[j] = 0;
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let s = 0; s < size; s += len) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * step];
          const sn = this.sin[k * step];
          const a = s + k;
          const b = a + half;
          const tr = re[b] * c - im[b] * sn;
          const ti = re[b] * sn + im[b] * c;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    for (let k = 0; k <= size / 2; k++) out[k] = (re[k] * re[k] + im[k] * im[k]) / size;
  }
}
