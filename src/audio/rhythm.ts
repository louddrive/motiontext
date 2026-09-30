// フレームの特徴量から、テンポ・拍・小節の頭・音の立ち上がり・音量・曲の区切りを求める（純粋関数）。
// 拍の追跡は Ellis (2007) "Beat Tracking by Dynamic Programming" の方法を、論文の説明をもとに実装している。
// どれも推定であり、倍・半分のテンポの取り違えや、小節の頭のずれは起こりうる。

import { GROUP_COUNT, type FrameFeatures } from './frames';
import { RHYTHM_VERSION, type Onset, type Rhythm } from './types';

/** テンポの探索範囲（拍/分） */
export const MIN_BPM = 60;
export const MAX_BPM = 200;
/** テンポの事前分布の中心（拍/分）と広がり（オクターブ）。倍・半分の候補のうち、よくあるテンポに寄せる */
const PRIOR_BPM = 120;
const PRIOR_OCTAVES = 1;
/** 拍の間隔が理想からずれることへの罰則の強さ（大きいほどテンポを一定に保つ） */
const TIGHTNESS = 100;
/** 音量の変化の時間分解能（回/秒） */
export const ENERGY_RATE = 20;
/** 音量を 0..1 にするときの幅（dB）。曲の大きい部分（95パーセンタイル）から、これだけ下までを使う */
const ENERGY_RANGE_DB = 30;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

function mean(a: ArrayLike<number>, from = 0, to = a.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i];
  return to > from ? s / (to - from) : 0;
}

function std(a: ArrayLike<number>): number {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return Math.sqrt(s / Math.max(1, a.length));
}

function percentile(a: ArrayLike<number>, p: number): number {
  const sorted = Float64Array.from(a).sort();
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

/** 移動平均（窓は ±half フレーム） */
function movingAverage(a: ArrayLike<number>, half: number): Float64Array {
  const out = new Float64Array(a.length);
  const prefix = new Float64Array(a.length + 1);
  for (let i = 0; i < a.length; i++) prefix[i + 1] = prefix[i] + a[i];
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(a.length, i + half + 1);
    out[i] = (prefix[hi] - prefix[lo]) / (hi - lo);
  }
  return out;
}

/** ガウス窓でならす（sigma はフレーム数） */
function gaussianSmooth(a: ArrayLike<number>, sigma: number): Float64Array {
  const r = Math.ceil(sigma * 3);
  const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-0.5 * ((k - r) / sigma) ** 2));
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    let ws = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= a.length) continue;
      s += a[j] * w[k + r];
      ws += w[k + r];
    }
    out[i] = s / ws;
  }
  return out;
}

/** 立ち上がりの強さから、ゆっくりした変化（音量の変化）を除き、負の値を 0 にする */
export function onsetEnvelope(flux: ArrayLike<number>, frameRate: number): Float64Array {
  const local = movingAverage(flux, Math.round(frameRate * 0.25));
  const out = new Float64Array(flux.length);
  for (let i = 0; i < flux.length; i++) out[i] = Math.max(0, flux[i] - local[i]);
  return out;
}

export interface TempoEstimate {
  bpm: number;
  /** 拍の間隔（フレーム） */
  period: number;
  /**
   * 周期性の強さ（選んだ周期での自己相関 ÷ ずらし 0 の自己相関、-1..1）。
   * はっきりした拍のある曲では大きく、ノイズや持続音だけでは 0 に近い
   */
  periodicity: number;
}

/**
 * テンポを推定する。立ち上がりの強さの自己相関を、よくあるテンポを好む事前分布で重み付けし、最も強い周期を選ぶ。
 * その後、裏拍と1拍おきの強さを見て、倍・半分のテンポに直す（refineOctave）
 */
export function estimateTempo(env: ArrayLike<number>, frameRate: number): TempoEstimate | null {
  const n = env.length;
  const minLag = Math.floor((frameRate * 60) / MAX_BPM);
  const maxLag = Math.ceil((frameRate * 60) / MIN_BPM);
  if (n < maxLag * 4) return null;
  // 拍の周期はフレームの整数倍とは限らない。鋭いピークのままだと、周期が整数の中間に来たときに相関を取りこぼし、
  // たまたま整数に近い倍の周期（半分のテンポ）を選んでしまうので、ガウス窓でならしてから相関をとる
  const smooth = gaussianSmooth(env, 2);
  const m = mean(smooth);
  const e = Float64Array.from(smooth, (v) => v - m);
  const ac = new Float64Array(maxLag * 2 + 2);
  for (let lag = minLag; lag < ac.length && lag < n; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag];
    ac[lag] = s / (n - lag);
  }
  const score = (lag: number) => {
    const bpm = (frameRate * 60) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / PRIOR_BPM) / PRIOR_OCTAVES) ** 2);
    return ac[lag] * prior;
  };
  let best = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const s = score(lag);
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  if (best < 0 || bestScore <= 0) return null;
  // 放物線補間で周期を細かく求める
  let period = best;
  if (best > minLag && best < maxLag) {
    const a = score(best - 1);
    const b = score(best);
    const c = score(best + 1);
    const d = a - 2 * b + c;
    if (d < 0) period = best + (0.5 * (a - c)) / d;
  }
  period = refineOctave(smooth, period, frameRate);
  let ac0 = 0;
  for (let i = 0; i < n; i++) ac0 += e[i] * e[i];
  ac0 /= n;
  const lagAt = (p: number) => {
    const l = Math.round(p);
    if (l < ac.length) return ac[l];
    let s = 0;
    for (let i = 0; i + l < n; i++) s += e[i] * e[i + l];
    return s / (n - l);
  };
  // 周期が整数の中間のときに低く出ないよう、前後のずらしも見る
  const peakAc = Math.max(lagAt(period - 1), lagAt(period), lagAt(period + 1));
  return { bpm: (frameRate * 60) / period, period, periodicity: ac0 > 0 ? peakAc / ac0 : 0 };
}

/** 周期 period の拍の格子のうち、立ち上がりが最も強くそろう位相（フレーム） */
function gridPhase(env: ArrayLike<number>, period: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let phase = 0; phase < period; phase++) {
    let s = 0;
    for (let t = phase; t < env.length; t += period) s += env[Math.round(t)] ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = phase;
    }
  }
  return best;
}

/** 格子の点（phase + k * period）での立ち上がりの強さの平均。every と offset で1拍おき等を選ぶ */
function gridMean(env: ArrayLike<number>, phase: number, period: number, every = 1, offset = 0): number {
  let s = 0;
  let c = 0;
  for (let k = offset; phase + k * period < env.length; k += every) {
    const i = Math.round(phase + k * period);
    s += Math.max(env[i - 1] ?? 0, env[i] ?? 0, env[i + 1] ?? 0);
    c++;
  }
  return c ? s / c : 0;
}

/** 裏拍が拍と同じくらい強ければ倍のテンポ、1拍おきに極端に弱ければ半分のテンポとみなす（しきい値は経験的な値） */
const DOUBLE_IF_OFFBEAT = 0.6;
const HALVE_IF_ALTERNATE = 0.35;

/**
 * 倍・半分のテンポの取り違えを直す。
 * - 拍の中間（裏拍）の立ち上がりが拍と同じくらい強い → 本当の拍はその倍の速さ（例: キックとスネアが交互で、2拍分を1拍と見ていた）
 * - 1拍おきに立ち上がりが極端に弱い → 本当の拍はその半分の速さ（例: 8分音符のハイハットを拍と見ていた）
 */
export function refineOctave(env: ArrayLike<number>, period: number, frameRate: number): number {
  const minPeriod = (frameRate * 60) / MAX_BPM;
  const maxPeriod = (frameRate * 60) / MIN_BPM;
  for (let step = 0; step < 2; step++) {
    const phase = gridPhase(env, period);
    const beat = gridMean(env, phase, period);
    if (beat <= 0) break;
    const off = gridMean(env, phase + period / 2, period);
    if (off / beat >= DOUBLE_IF_OFFBEAT && period / 2 >= minPeriod) {
      period /= 2;
      continue;
    }
    const even = gridMean(env, phase, period, 2, 0);
    const odd = gridMean(env, phase, period, 2, 1);
    const weak = Math.min(even, odd);
    const strong = Math.max(even, odd);
    if (strong > 0 && weak / strong <= HALVE_IF_ALTERNATE && period * 2 <= maxPeriod) {
      period *= 2;
      continue;
    }
    break;
  }
  return period;
}

/** 拍の追跡（動的計画法）。返り値は拍のフレーム番号（昇順） */
export function trackBeats(env: ArrayLike<number>, period: number): number[] {
  const n = env.length;
  const sd = std(env) || 1;
  // 各フレームの「拍らしさ」: 立ち上がりの強さを、拍の間隔に比例した幅のガウス窓でならす
  const width = Math.max(1, Math.round(period / 32));
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -4 * width; k <= 4 * width; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += (env[j] / sd) * Math.exp(-0.5 * (k / width) ** 2);
    }
    local[i] = s;
  }
  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const minPrev = Math.round(period / 2);
  const maxPrev = Math.round(period * 2);
  // 前の拍までの間隔ごとの罰則（理想の間隔から離れるほど大きい）
  const cost = new Float64Array(maxPrev + 1);
  for (let d = minPrev; d <= maxPrev; d++) cost[d] = -TIGHTNESS * Math.log(d / period) ** 2;
  // 長い曲では要素が数万個になるので、スプレッド構文（Math.max(...local)）は使わない
  let peak = 0;
  for (let i = 0; i < n; i++) if (local[i] > peak) peak = local[i];
  const threshold = 0.01 * peak;
  let started = false;
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let arg = -1;
    for (let d = minPrev; d <= maxPrev && i - d >= 0; d++) {
      const v = cum[i - d] + cost[d];
      if (v > best) {
        best = v;
        arg = i - d;
      }
    }
    // 最初の拍より前は、前の拍が無いものとして数える
    if (!started || arg < 0) {
      cum[i] = local[i];
      if (local[i] > threshold) started = true;
    } else {
      cum[i] = local[i] + best;
      back[i] = arg;
    }
  }
  // 最後の拍: cum の極大のうち、極大値の中央値の半分以上ある最後のもの
  const maxima: number[] = [];
  for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) maxima.push(i);
  if (!maxima.length) return [];
  const med = percentile(
    maxima.map((i) => cum[i]),
    0.5,
  );
  let last = maxima[maxima.length - 1];
  for (let k = maxima.length - 1; k >= 0; k--) {
    if (cum[maxima[k]] >= 0.5 * med) {
      last = maxima[k];
      break;
    }
  }
  const beats: number[] = [];
  for (let i = last; i >= 0; i = back[i]) beats.unshift(i);
  // 前後の、音の立ち上がりが弱い区間（無音・フェード）の拍を落とす
  const strength = beats.map((b) => local[b]);
  const rmsStrength = Math.sqrt(mean(strength.map((v) => v * v)));
  const keep = strength.map((v) => v >= 0.5 * rmsStrength);
  const first = keep.indexOf(true);
  const end = keep.lastIndexOf(true);
  return first < 0 ? [] : beats.slice(first, end + 1);
}

/**
 * 小節の頭（4拍子を仮定）。拍の位置を 4 通りにずらしたうち、低音の立ち上がり（キック等）と全体の立ち上がりが
 * 最も強くそろうものを選ぶ。返り値は小節の頭になる拍の番号のずれ（0..3）
 */
export function downbeatPhase(beats: number[], lowFlux: ArrayLike<number>, env: ArrayLike<number>): number {
  if (beats.length < 8) return 0;
  const near = (a: ArrayLike<number>, i: number) => Math.max(a[i - 1] ?? 0, a[i] ?? 0, a[i + 1] ?? 0, a[i + 2] ?? 0);
  const lowSd = std(lowFlux) || 1;
  const envSd = std(env) || 1;
  let best = 0;
  let bestScore = -Infinity;
  for (let phase = 0; phase < 4; phase++) {
    let s = 0;
    let c = 0;
    for (let k = phase; k < beats.length; k += 4) {
      s += near(lowFlux, beats[k]) / lowSd + 0.5 * (near(env, beats[k]) / envSd);
      c++;
    }
    const score = c ? s / c : 0;
    if (score > bestScore) {
      bestScore = score;
      best = phase;
    }
  }
  return best;
}

/** 音の立ち上がりの時刻（ピーク検出）。強さは曲の中の 99 パーセンタイルを 1 とする */
export function pickOnsets(env: ArrayLike<number>, frameTime: (i: number) => number, frameRate: number): Onset[] {
  const top = percentile(env, 0.99) || 1;
  const norm = Float64Array.from(env, (v) => Math.min(1, v / top));
  const w = Math.max(1, Math.round(frameRate * 0.03));
  const avgW = Math.round(frameRate * 0.1);
  const avg = movingAverage(norm, avgW);
  const out: Onset[] = [];
  let lastIdx = -Infinity;
  for (let i = 0; i < norm.length; i++) {
    const v = norm[i];
    if (v < 0.07 || v < avg[i] + 0.07) continue;
    let isMax = true;
    for (let k = Math.max(0, i - w); k <= Math.min(norm.length - 1, i + w); k++) {
      if (norm[k] > v || (norm[k] === v && k < i)) {
        isMax = false;
        break;
      }
    }
    if (!isMax || i - lastIdx < w) continue;
    out.push({ t: round3(frameTime(i)), s: round3(v) });
    lastIdx = i;
  }
  return out;
}

/** 音量の変化（ENERGY_RATE 回/秒、0..1） */
export function energyCurve(rms: ArrayLike<number>, frameRate: number, duration: number): number[] {
  const count = Math.max(1, Math.ceil(duration * ENERGY_RATE));
  const db = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const from = Math.floor((k / ENERGY_RATE) * frameRate);
    const to = Math.max(from + 1, Math.floor(((k + 1) / ENERGY_RATE) * frameRate));
    let sq = 0;
    let c = 0;
    for (let i = from; i < to && i < rms.length; i++) {
      sq += rms[i] * rms[i];
      c++;
    }
    db[k] = 10 * Math.log10((c ? sq / c : 0) + 1e-10);
  }
  const loud = percentile(db, 0.95);
  return Array.from(db, (v) => round3(Math.min(1, Math.max(0, 1 + (v - loud) / ENERGY_RANGE_DB))));
}

/** 曲の区切りとみなすノベルティの下限（0..1。合成音での実測をもとにした経験的な値） */
export const SECTION_MIN_NOVELTY = 0.2;

/**
 * 曲の区切り（Foote のノベルティ）。拍ごとの音色（帯域ごとの音の大きさ）の似ている度合いの表に、
 * 市松模様の窓をかけて、前後で音色が大きく変わる拍を探す。区切りは小節の頭にそろえる。返り値は拍の番号
 */
export function findSections(beats: number[], groups: ArrayLike<number>, downbeatSet: Set<number>): number[] {
  const nb = beats.length;
  const half = 16;
  if (nb < half * 3) return [];
  // 拍ごとの特徴（その拍から次の拍までの平均）を、次元ごとに標準化する
  const feats: Float64Array[] = [];
  for (let j = 0; j < nb; j++) {
    const from = beats[j];
    const to = j + 1 < nb ? beats[j + 1] : from + 1;
    const f = new Float64Array(GROUP_COUNT);
    for (let g = 0; g < GROUP_COUNT; g++) {
      let s = 0;
      for (let i = from; i < to; i++) s += groups[i * GROUP_COUNT + g] ?? 0;
      f[g] = s / Math.max(1, to - from);
    }
    feats.push(f);
  }
  for (let g = 0; g < GROUP_COUNT; g++) {
    const col = feats.map((f) => f[g]);
    const m = mean(col);
    const sd = std(col) || 1;
    for (const f of feats) f[g] = (f[g] - m) / sd;
  }
  const norm = feats.map((f) => Math.sqrt(f.reduce((s, v) => s + v * v, 0)) || 1);
  const sim = (a: number, b: number) => {
    let s = 0;
    for (let g = 0; g < GROUP_COUNT; g++) s += feats[a][g] * feats[b][g];
    return s / (norm[a] * norm[b]);
  };
  // 市松模様の窓: 同じ側どうしは +、反対側どうしは −。中心から離れるほど弱くする。重みの絶対値の和で割り、
  // ノベルティを -1..1 にそろえる（前後が完全に別の音色なら 1 に近い）
  const kernel: number[] = [];
  let kernelSum = 0;
  for (let a = -half; a < half; a++) {
    for (let b = -half; b < half; b++) {
      const sign = (a < 0) === (b < 0) ? 1 : -1;
      const w = sign * Math.exp(-0.5 * (((a + 0.5) / (half / 2)) ** 2 + ((b + 0.5) / (half / 2)) ** 2));
      kernel.push(w);
      kernelSum += Math.abs(w);
    }
  }
  const novelty = new Float64Array(nb);
  for (let j = half; j < nb - half; j++) {
    let s = 0;
    let k = 0;
    for (let a = -half; a < half; a++) for (let b = -half; b < half; b++) s += kernel[k++] * sim(j + a, j + b);
    novelty[j] = Math.max(0, s / kernelSum);
  }
  const inner = novelty.slice(half, nb - half);
  // 相対的なしきい値だけだと、変化の無い曲でも必ず区切りが出るので、絶対的な下限も設ける
  const threshold = Math.max(SECTION_MIN_NOVELTY, mean(inner) + 0.5 * std(inner));
  const peaks: number[] = [];
  for (let j = half; j < nb - half; j++) {
    const v = novelty[j];
    if (v <= threshold) continue;
    let isMax = true;
    for (let k = Math.max(0, j - 8); k <= Math.min(nb - 1, j + 8); k++) {
      if (novelty[k] > v || (novelty[k] === v && k < j)) {
        isMax = false;
        break;
      }
    }
    if (isMax) peaks.push(j);
  }
  // 強い順に、4小節（16拍）以上離れたものだけ残す
  const chosen: number[] = [];
  for (const j of [...peaks].sort((a, b) => novelty[b] - novelty[a])) {
    if (chosen.every((c) => Math.abs(c - j) >= 16)) chosen.push(j);
  }
  // 小節の頭にそろえる（±2拍以内にあれば）
  return chosen
    .map((j) => {
      for (let d = 0; d <= 2; d++) {
        if (downbeatSet.has(j - d)) return j - d;
        if (downbeatSet.has(j + d)) return j + d;
      }
      return j;
    })
    .sort((a, b) => a - b);
}

/** 周期性（TempoEstimate.periodicity）がこれ以下なら拍が無いものとし、これ以上で確からしさ 1 とする（合成音での実測をもとにした経験的な値） */
const PERIODICITY_NONE = 0.1;
const PERIODICITY_FULL = 0.5;

/**
 * 拍の検出の確からしさ（0..1、推測に基づく目安）。立ち上がりの強さの周期性から決める。
 * ノイズや持続音だけの音では 0 に近く、はっきりした拍のある曲では 1 に近い。テンポが揺れる曲は低めに出る
 */
export function beatConfidence(periodicity: number): number {
  return round3(Math.min(1, Math.max(0, (periodicity - PERIODICITY_NONE) / (PERIODICITY_FULL - PERIODICITY_NONE))));
}

/** フレームの特徴量から、リズムの解析結果を作る */
export function analyzeFrames(f: FrameFeatures): Rhythm {
  const env = onsetEnvelope(f.flux, f.frameRate);
  const lowEnv = onsetEnvelope(f.lowFlux, f.frameRate);
  const tempo = estimateTempo(env, f.frameRate);
  const confidence = tempo ? beatConfidence(tempo.periodicity) : 0;
  // 周期性がほとんど無い（ノイズ・持続音だけ等）なら、拍は求めない
  const beatFrames = tempo && confidence > 0 ? trackBeats(env, tempo.period) : [];
  const phase = downbeatPhase(beatFrames, lowEnv, env);
  const downbeatIdx = beatFrames.map((_, k) => k).filter((k) => k % 4 === phase);
  const sectionIdx = findSections(beatFrames, f.groups, new Set(downbeatIdx));
  // 拍・立ち上がり・区切りは、検出が早く出る分を補正した時刻にする
  const time = (i: number) => round3(f.frameTime(i) + f.onsetLead);
  return {
    version: RHYTHM_VERSION,
    duration: round3(f.duration),
    bpm: tempo && beatFrames.length >= 2 ? Math.round(tempo.bpm * 10) / 10 : 0,
    confidence: beatFrames.length ? confidence : 0,
    beats: beatFrames.map(time),
    downbeats: downbeatIdx.map((k) => time(beatFrames[k])),
    onsets: pickOnsets(env, (i) => f.frameTime(i) + f.onsetLead, f.frameRate),
    energy: { rate: ENERGY_RATE, values: energyCurve(f.rms, f.frameRate, f.duration) },
    sections: sectionIdx.map((k) => time(beatFrames[k])),
  };
}
