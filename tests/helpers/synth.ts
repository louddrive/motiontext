// リズム解析のテスト用の合成音（決定的な乱数で作る）。実曲は著作権があるのでリポジトリに入れない
import { mulberry32 } from '../../src/director/rng';

export const SR = 44100;

export interface Synth {
  pcm: Float32Array;
  /** 正解の拍の時刻（秒） */
  beats: number[];
  /** 正解の小節の頭の時刻（秒） */
  downbeats: number[];
}

/** 拍の時刻の列を作る。bpmAt(t) でテンポを時刻ごとに変えられる */
export function beatTimes(bpmAt: (t: number) => number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t < to; t += 60 / bpmAt(t)) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

function addAt(pcm: Float32Array, t: number, sound: (i: number) => number, len: number) {
  const start = Math.round(t * SR);
  for (let i = 0; i < len && start + i < pcm.length; i++) if (start + i >= 0) pcm[start + i] += sound(i);
}

/** キック（低い音程が下がっていく正弦波） */
function kick(pcm: Float32Array, t: number, gain = 0.9) {
  let phase = 0;
  addAt(
    pcm,
    t,
    (i) => {
      const f = 50 + 90 * Math.exp(-i / (SR * 0.03));
      phase += (2 * Math.PI * f) / SR;
      return gain * Math.sin(phase) * Math.exp(-i / (SR * 0.12));
    },
    Math.round(SR * 0.4),
  );
}

/** スネア（ノイズ + 胴鳴り） */
function snare(pcm: Float32Array, t: number, rand: () => number, gain = 0.5) {
  addAt(pcm, t, (i) => gain * ((rand() * 2 - 1) * 0.8 + 0.3 * Math.sin((2 * Math.PI * 190 * i) / SR)) * Math.exp(-i / (SR * 0.06)), Math.round(SR * 0.25));
}

/** ハイハット（高い帯域のノイズ） */
function hat(pcm: Float32Array, t: number, rand: () => number, gain = 0.15) {
  let prev = 0;
  addAt(
    pcm,
    t,
    (i) => {
      const n = rand() * 2 - 1;
      const hp = n - prev;
      prev = n;
      return gain * hp * Math.exp(-i / (SR * 0.015));
    },
    Math.round(SR * 0.06),
  );
}

/** 短いクリック音（小節の頭は高く強い音） */
function click(pcm: Float32Array, t: number, accent: boolean) {
  const f = accent ? 1760 : 1320;
  addAt(pcm, t, (i) => (accent ? 0.9 : 0.5) * Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / (SR * 0.01)), Math.round(SR * 0.05));
}

export interface SynthOptions {
  bpm?: number;
  bpmAt?: (t: number) => number;
  seconds: number;
  /** 音が始まる時刻（それより前は無音） */
  start?: number;
  /** 常に鳴っているノイズの大きさ */
  noise?: number;
  seed?: number;
}

/** クリック音だけの曲（4拍ごとに強拍） */
export function clickTrack(o: SynthOptions): Synth {
  const pcm = new Float32Array(Math.round(o.seconds * SR));
  const beats = beatTimes(o.bpmAt ?? (() => o.bpm ?? 120), o.start ?? 0.5, o.seconds - 0.3);
  beats.forEach((t, k) => click(pcm, t, k % 4 === 0));
  addNoise(pcm, o.noise ?? 0, o.seed ?? 1);
  return { pcm, beats, downbeats: beats.filter((_, k) => k % 4 === 0) };
}

/** ドラムの曲: キックは1・3拍目、スネアは2・4拍目、ハイハットは8分音符。低いベースの音も鳴らす */
export function drumTrack(o: SynthOptions & { bass?: boolean }): Synth {
  const rand = mulberry32(o.seed ?? 7);
  const pcm = new Float32Array(Math.round(o.seconds * SR));
  const beats = beatTimes(o.bpmAt ?? (() => o.bpm ?? 120), o.start ?? 0.5, o.seconds - 0.5);
  beats.forEach((t, k) => {
    const pos = k % 4;
    if (pos === 0 || pos === 2) kick(pcm, t, pos === 0 ? 0.95 : 0.75);
    else snare(pcm, t, rand);
    hat(pcm, t, rand);
    const next = beats[k + 1] ?? t + 60 / (o.bpm ?? 120);
    hat(pcm, (t + next) / 2, rand, 0.08);
  });
  if (o.bass !== false) {
    // 小節ごとに音程が変わるベース（音量の変化が小さい持続音）
    const notes = [55, 65.4, 49, 58.3];
    beats.forEach((t, k) => {
      if (k % 4 !== 0) return;
      const f = notes[(k / 4) % notes.length];
      const len = Math.round((60 / (o.bpm ?? 120)) * 4 * SR);
      addAt(pcm, t, (i) => 0.12 * Math.sin((2 * Math.PI * f * i) / SR) * Math.min(1, i / 400), len);
    });
  }
  addNoise(pcm, o.noise ?? 0, (o.seed ?? 7) + 1);
  return { pcm, beats, downbeats: beats.filter((_, k) => k % 4 === 0) };
}

export function addNoise(pcm: Float32Array, level: number, seed: number) {
  if (level <= 0) return;
  const rand = mulberry32(seed);
  for (let i = 0; i < pcm.length; i++) pcm[i] += level * (rand() * 2 - 1);
}

/** 持続音（音色の違う区間を作る）。from〜to 秒に、倍音を含む和音を足す */
export function addPad(pcm: Float32Array, from: number, to: number, freqs: number[], gain: number) {
  const a = Math.round(from * SR);
  const b = Math.min(pcm.length, Math.round(to * SR));
  for (let i = a; i < b; i++) {
    let s = 0;
    for (const f of freqs) s += Math.sin((2 * Math.PI * f * i) / SR) + 0.4 * Math.sin((4 * Math.PI * f * i) / SR);
    pcm[i] += (gain * s) / freqs.length;
  }
}

/** 音量を区間ごとに変える */
export function scale(pcm: Float32Array, from: number, to: number, gain: number) {
  for (let i = Math.round(from * SR); i < Math.min(pcm.length, Math.round(to * SR)); i++) pcm[i] *= gain;
}

/** 線形補間でサンプリング周波数を変える（テスト用。音質は問わない） */
export function resample(pcm: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(Math.floor((pcm.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const x = (i * from) / to;
    const k = Math.floor(x);
    const f = x - k;
    out[i] = (pcm[k] ?? 0) * (1 - f) + (pcm[k + 1] ?? 0) * f;
  }
  return out;
}

/** 拍と関係のない位置（16分音符のランダムな位置）に、音程のある短い音（メロディーの代わり）を足す */
export function addMelody(pcm: Float32Array, bpm: number, from: number, to: number, seed: number, gain = 0.25) {
  const r = mulberry32(seed);
  const step = 60 / bpm / 4;
  for (let t = from; t < to; t += step) {
    if (r() > 0.35) continue;
    const f = 220 * 2 ** (Math.floor(r() * 12) / 12);
    const start = Math.round(t * SR);
    const len = Math.round(SR * step * (1 + Math.floor(r() * 3)));
    for (let i = 0; i < len && start + i < pcm.length; i++) {
      pcm[start + i] += gain * Math.sin((2 * Math.PI * f * i) / SR) * Math.min(1, i / 300) * Math.exp(-i / (SR * 0.3));
    }
  }
}
