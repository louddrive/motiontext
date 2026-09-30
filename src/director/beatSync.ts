// 演出を曲の拍に合わせるための計算（純粋関数）。director から、リズムの解析結果（src/audio）があるときだけ使う。
// ここで決めた値は Timeline に焼き込み、描画は Timeline と時刻だけで決まるようにする。

import type { CueFeature } from '../analysis/features';
import type { Rhythm } from '../audio/types';

/** この確からしさより低い解析結果は使わない（拍がはっきりしない曲では、字幕だけの演出にする） */
export const SYNC_MIN_CONFIDENCE = 0.3;
/** 字幕の開始・終了を拍の格子へ寄せる最大の幅（秒）。これより離れていれば寄せない */
export const SNAP_MAX_SEC = 0.1;
/** 登場を拍で着地させるときの、登場の秒数の範囲 */
export const HIT_MIN_SEC = 0.2;
export const HIT_MAX_SEC = 0.9;
/** 字幕の音量による演出の強さの幅（テーマの強さ × (1 ± この値)） */
export const ENERGY_SWING = 0.2;

/** 演出に使ってよい解析結果か（確からしさが十分で、拍が十分にある） */
export function usableRhythm(r: Rhythm | null | undefined): Rhythm | null {
  return r && r.confidence >= SYNC_MIN_CONFIDENCE && r.beats.length >= 8 ? r : null;
}

/** 昇順の配列で、t 以下の最後の要素の番号（無ければ -1） */
export function lastIndexAtOrBefore(sorted: number[], t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 8分音符の格子（拍と、拍と拍の中間） */
export function eighthGrid(beats: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    out.push(beats[i]);
    if (i + 1 < beats.length) out.push((beats[i] + beats[i + 1]) / 2);
  }
  return out;
}

/** t に最も近い格子の点。maxShift より離れていれば t のまま */
export function snapTime(t: number, grid: number[], maxShift: number): number {
  const i = lastIndexAtOrBefore(grid, t);
  let best = t;
  let bestD = maxShift;
  for (const j of [i, i + 1]) {
    if (j < 0 || j >= grid.length) continue;
    const d = Math.abs(grid[j] - t);
    if (d <= bestD) {
      bestD = d;
      best = grid[j];
    }
  }
  return Math.round(best * 1000) / 1000;
}

/** 時刻 t 付近の拍の間隔（前後の拍の間隔。拍の範囲外なら端の間隔） */
export function beatPeriodAt(beats: number[], t: number): number {
  const i = Math.min(Math.max(lastIndexAtOrBefore(beats, t), 0), beats.length - 2);
  return beats[i + 1] - beats[i];
}

/** 時刻 from より後で、最初の拍（無ければ null） */
export function firstBeatAfter(beats: number[], from: number): number | null {
  const i = lastIndexAtOrBefore(beats, from);
  return i + 1 < beats.length ? beats[i + 1] : null;
}

/** 登場を拍で着地させる秒数（字幕の開始から、HIT_MIN_SEC 以上後の最初の拍まで）。範囲外なら null */
export function hitDuration(beats: number[], start: number, dur: number): number | null {
  const b = firstBeatAfter(beats, start + HIT_MIN_SEC - 1e-9);
  if (b === null) return null;
  const hit = Math.round((b - start) * 1000) / 1000;
  return hit <= HIT_MAX_SEC && hit <= dur * 0.6 ? hit : null;
}

/** t に最も近い小節の頭（within 秒以内に無ければ t のまま） */
export function nearestDownbeat(downbeats: number[], t: number, within: number): number {
  return snapTime(t, downbeats, within);
}

/** from〜to 秒の音量の平均（0..1） */
export function loudness(r: Rhythm, from: number, to: number): number {
  const { rate, values } = r.energy;
  const a = Math.max(0, Math.floor(from * rate));
  const b = Math.min(values.length, Math.max(a + 1, Math.ceil(to * rate)));
  let s = 0;
  for (let i = a; i < b; i++) s += values[i];
  return b > a ? s / (b - a) : 0;
}

/** 各字幕の音量が、曲の中の字幕全体で何番目くらいか（0 = 最も静か、1 = 最も大きい） */
export function loudnessRanks(features: CueFeature[], r: Rhythm): number[] {
  const loud = features.map((f) => loudness(r, f.cue.start, f.cue.end));
  const sorted = [...loud].sort((a, b) => a - b);
  const n = sorted.length;
  return loud.map((v) => (n > 1 ? lastIndexAtOrBefore(sorted, v) / (n - 1) : 0.5));
}

/** 字幕の音量に応じた演出の強さ（テーマの強さを ±ENERGY_SWING の範囲で変える） */
export function energyFor(themeEnergy: number, rank: number): number {
  return Math.round(Math.min(1, Math.max(0, themeEnergy * (1 - ENERGY_SWING + 2 * ENERGY_SWING * rank))) * 1000) / 1000;
}

/** サビとみなしていても静かすぎるセクション（字幕の音量の順位の平均がこれ未満）はサビから外す */
const CHORUS_MIN_RANK = 0.35;
/** 歌詞の繰り返しからサビが1つも見つからない曲では、音量の順位の平均がこれ以上のセクションをサビにする */
const CHORUS_LOUD_RANK = 0.75;

/**
 * サビの推定に、曲の音量を加える（歌詞の繰り返しだけでは誤りやすいため）。
 * - 歌詞の繰り返しでサビとしたセクションでも、曲の中で静かな方ならサビから外す（静かなイントロ・アウトロの繰り返し等）
 * - 歌詞の繰り返しでサビが1つも見つからなければ、曲の中で特に大きいセクションをサビにする
 * 判定はセクション（字幕の間の空き）単位で行う。返り値は字幕ごとのサビかどうか
 */
export function fuseChorus(features: CueFeature[], ranks: number[]): boolean[] {
  const bySection = new Map<number, number[]>();
  features.forEach((f, i) => {
    const arr = bySection.get(f.section) ?? [];
    arr.push(i);
    bySection.set(f.section, arr);
  });
  const sectionRank = new Map<number, number>();
  for (const [s, idx] of bySection) sectionRank.set(s, idx.reduce((sum, i) => sum + ranks[i], 0) / idx.length);
  const anyChorus = features.some((f) => f.isChorus);
  return features.map((f) => {
    const rank = sectionRank.get(f.section) ?? 0.5;
    if (anyChorus) return f.isChorus && rank >= CHORUS_MIN_RANK;
    return rank >= CHORUS_LOUD_RANK;
  });
}
