// 音声をフレーム（約 11.6ms ごと）の特徴量に変える。PCM は全部は持たず、流しながら計算する（15分の曲でも数 MB）。

import { PowerSpectrum } from './fft';

/** 1秒あたりのフレーム数の目安（22050Hz / 256 と同じ。サンプリング周波数に合わせて hop を決める） */
export const TARGET_FRAME_RATE = 86.1328125;
/** 帯域の数（30Hz〜16kHz を対数で等分） */
export const BAND_COUNT = 48;
/** 曲の区切りの推定に使う、帯域をまとめた数 */
export const GROUP_COUNT = 12;
const MIN_HZ = 30;
const MAX_HZ = 16000;
/** これより低い帯域の立ち上がりを「低音（キック等）」とする */
const LOW_HZ = 200;
/** 立ち上がりの検出が早く出る分の、窓の長さに対する割合（FrameFeatures.onsetLead） */
const ONSET_LEAD_RATIO = 0.3;
/** 無音でも log が発散しないようにする下限（dB） */
const FLOOR_DB = -100;

/** 伸びる Float32Array（フレームごとの値を溜める） */
class Series {
  data = new Float32Array(4096);
  length = 0;
  push(v: number) {
    if (this.length === this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = v;
  }
  toArray(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

export interface FrameFeatures {
  sampleRate: number;
  /** 1秒あたりのフレーム数 */
  frameRate: number;
  /** フレーム i の時刻（窓の中心、秒） */
  frameTime: (i: number) => number;
  /**
   * 立ち上がりの検出が実際の音より早く出る分（秒）。対数のスペクトルフラックスは、音が窓の端に入った時点で反応するため、
   * 窓の長さのおよそ 3 割だけ早くなる（合成音での実測値）。拍・立ち上がりの時刻にはこれを足す
   */
  onsetLead: number;
  /** 立ち上がりの強さ（全帯域のスペクトルフラックス） */
  flux: Float32Array;
  /** 低音の帯域だけの立ち上がりの強さ */
  lowFlux: Float32Array;
  /** 音量（RMS） */
  rms: Float32Array;
  /** 帯域グループごとの対数エネルギー（dB）。フレーム i の値は groups[i * GROUP_COUNT + g] */
  groups: Float32Array;
  /** 解析した音声の長さ（秒） */
  duration: number;
}

export class FrameExtractor {
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly hop: number;
  private readonly fft: PowerSpectrum;
  private readonly spec: Float64Array;
  /** 各帯域のビン範囲 [from, to) */
  private readonly bandBins: [number, number][];
  private readonly lowBands: number;
  private prevDb: Float64Array | null = null;
  /** まだフレームにしていないサンプル */
  private buf: Float32Array;
  private bufLen = 0;
  private samples = 0;
  private readonly flux = new Series();
  private readonly lowFlux = new Series();
  private readonly rms = new Series();
  private readonly groups = new Series();

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    // 窓は約 45ms（22kHz なら 1024、44.1/48kHz なら 2048）。長いと、音が窓の端に入った時点で反応して早めに出る
    this.fftSize = sampleRate > 32000 ? 2048 : 1024;
    this.hop = Math.max(1, Math.round(sampleRate / TARGET_FRAME_RATE));
    this.fft = new PowerSpectrum(this.fftSize);
    this.spec = new Float64Array(this.fftSize / 2 + 1);
    const nyq = sampleRate / 2;
    const top = Math.min(MAX_HZ, nyq * 0.95);
    const hzToBin = (hz: number) => (hz * this.fftSize) / sampleRate;
    this.bandBins = [];
    let lowBands = 0;
    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = MIN_HZ * (top / MIN_HZ) ** (b / BAND_COUNT);
      const hi = MIN_HZ * (top / MIN_HZ) ** ((b + 1) / BAND_COUNT);
      const from = Math.max(1, Math.floor(hzToBin(lo)));
      const to = Math.max(from + 1, Math.floor(hzToBin(hi)));
      this.bandBins.push([from, Math.min(to, this.fftSize / 2 + 1)]);
      if (Math.sqrt(lo * hi) < LOW_HZ) lowBands = b + 1;
    }
    this.lowBands = lowBands;
    // 先頭のフレームの中心が 0 秒になるよう、窓の半分だけ無音を前に足す
    this.buf = new Float32Array(this.fftSize * 4);
    this.bufLen = this.fftSize / 2;
  }

  get frameRate(): number {
    return this.sampleRate / this.hop;
  }

  /** モノラルの PCM（-1..1）を追加する */
  push(mono: Float32Array): void {
    this.samples += mono.length;
    let off = 0;
    while (off < mono.length) {
      const n = Math.min(mono.length - off, this.buf.length - this.bufLen);
      this.buf.set(mono.subarray(off, off + n), this.bufLen);
      this.bufLen += n;
      off += n;
      this.drain();
    }
  }

  private drain() {
    let start = 0;
    while (this.bufLen - start >= this.fftSize) {
      this.frame(start);
      start += this.hop;
    }
    if (start > 0) {
      this.buf.copyWithin(0, start, this.bufLen);
      this.bufLen -= start;
    }
  }

  private frame(start: number) {
    const { buf, fftSize, spec } = this;
    let sq = 0;
    for (let i = 0; i < fftSize; i++) sq += buf[start + i] * buf[start + i];
    this.rms.push(Math.sqrt(sq / fftSize));
    this.fft.power(buf, start, spec);
    const db = new Float64Array(BAND_COUNT);
    for (let b = 0; b < BAND_COUNT; b++) {
      const [from, to] = this.bandBins[b];
      let e = 0;
      for (let k = from; k < to; k++) e += spec[k];
      db[b] = Math.max(FLOOR_DB, 10 * Math.log10(e / (to - from) + 1e-12));
    }
    let f = 0;
    let lf = 0;
    if (this.prevDb) {
      for (let b = 0; b < BAND_COUNT; b++) {
        const d = db[b] - this.prevDb[b];
        if (d > 0) {
          f += d;
          if (b < this.lowBands) lf += d;
        }
      }
    }
    this.flux.push(f / BAND_COUNT);
    this.lowFlux.push(this.lowBands ? lf / this.lowBands : 0);
    const per = BAND_COUNT / GROUP_COUNT;
    for (let g = 0; g < GROUP_COUNT; g++) {
      let s = 0;
      for (let b = g * per; b < (g + 1) * per; b++) s += db[b];
      this.groups.push(s / per);
    }
    this.prevDb = db;
  }

  /** 残りのサンプルを処理して、特徴量を返す */
  finish(): FrameFeatures {
    // 最後の窓が末尾の音を含むよう、窓の半分だけ無音を足す
    this.push(new Float32Array(this.fftSize / 2));
    this.samples -= this.fftSize / 2;
    const { sampleRate, hop } = this;
    return {
      sampleRate,
      frameRate: this.frameRate,
      frameTime: (i: number) => (i * hop) / sampleRate,
      onsetLead: (ONSET_LEAD_RATIO * this.fftSize) / sampleRate,
      flux: this.flux.toArray(),
      lowFlux: this.lowFlux.toArray(),
      rms: this.rms.toArray(),
      groups: this.groups.toArray(),
      duration: this.samples / sampleRate,
    };
  }
}
