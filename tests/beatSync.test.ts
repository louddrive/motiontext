// 曲の拍に合わせる演出（src/director/beatSync.ts と director への組み込み）のテスト
import { describe, expect, it } from 'vitest';
import { analyze, type CueFeature } from '../src/analysis/features';
import { ALL_EFFECTS } from '../src/config/effects';
import {
  eighthGrid,
  energyFor,
  fuseChorus,
  hitDuration,
  HIT_MAX_SEC,
  HIT_MIN_SEC,
  loudness,
  loudnessRanks,
  snapTime,
  SNAP_MAX_SEC,
  SYNC_MIN_CONFIDENCE,
  usableRhythm,
} from '../src/director/beatSync';
import { direct, type DirectOptions } from '../src/director/director';
import { parseSubtitle } from '../src/parsers/detect';
import { defaultTheme } from '../src/themes/default';
import { applyEffectLevel, type EffectLevel } from '../src/themes/effectLevel';
import src from './fixtures/golden.srt?raw';
import { makeRhythm } from './helpers/rhythmFixture';

const features = analyze(parseSubtitle('golden.srt', src).cues);
const rhythm = makeRhythm({ bpm: 120, duration: 60, sections: [14.5, 36.5] });
const build = (extra: Partial<DirectOptions> = {}, level: EffectLevel = 'standard') =>
  direct(features, { theme: applyEffectLevel(defaultTheme, level), seed: 1, fontIds: ['noto-sans-jp'], fontRoles: { body: 'noto-sans-jp', display: null }, background: 'black', ...extra });

describe('beatSync の計算', () => {
  it('確からしさが低い・拍が少ない解析結果は使わない', () => {
    expect(usableRhythm(rhythm)).toBe(rhythm);
    expect(usableRhythm(makeRhythm({ confidence: SYNC_MIN_CONFIDENCE - 0.01 }))).toBeNull();
    expect(usableRhythm({ ...rhythm, beats: rhythm.beats.slice(0, 7) })).toBeNull();
    expect(usableRhythm(null)).toBeNull();
  });

  it('8分音符の格子は、拍と拍の中間を含む', () => {
    expect(eighthGrid([1, 2, 3])).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  it('近くの格子の点へ寄せ、離れていれば寄せない', () => {
    const grid = [1, 1.5, 2];
    expect(snapTime(1.45, grid, 0.1)).toBe(1.5);
    expect(snapTime(1.26, grid, 0.1)).toBe(1.26);
    expect(snapTime(0.95, grid, 0.1)).toBe(1);
    expect(snapTime(2.3, grid, 0.1)).toBe(2.3);
  });

  it('登場は、開始から HIT_MIN_SEC 以上後の最初の拍で着地する（遠すぎる・字幕が短すぎる場合は着地させない）', () => {
    const beats = [1, 1.5, 2, 2.5];
    expect(hitDuration(beats, 0.9, 2)).toBeCloseTo(0.6);
    expect(hitDuration(beats, 1, 2)).toBeCloseTo(0.5);
    expect(hitDuration([1, 3], 1, 3)).toBeNull();
    expect(hitDuration(beats, 1, 0.6)).toBeNull();
    expect(HIT_MIN_SEC).toBeLessThan(HIT_MAX_SEC);
  });

  it('音量の順位で演出の強さを ±20% 変える（強さ 0 は 0 のまま）', () => {
    expect(energyFor(0.6, 0)).toBeCloseTo(0.48);
    expect(energyFor(0.6, 1)).toBeCloseTo(0.72);
    expect(energyFor(1, 1)).toBe(1);
    expect(energyFor(0, 1)).toBe(0);
  });

  it('音量の平均と、字幕ごとの順位', () => {
    const r = { ...rhythm, energy: { rate: 10, values: [0, 0, 1, 1, 0.5, 0.5] } };
    expect(loudness(r, 0.2, 0.4)).toBe(1);
    expect(loudness(r, 0, 0.6)).toBeCloseTo(0.5);
    const cues = [
      { index: 0, start: 0, end: 0.2, text: 'a' },
      { index: 1, start: 0.2, end: 0.4, text: 'b' },
      { index: 2, start: 0.4, end: 0.6, text: 'c' },
    ];
    expect(loudnessRanks(analyze(cues), r)).toEqual([0, 1, 0.5]);
  });

  it('サビの推定: 静かなサビは外し、サビが見つからない曲では大きいセクションをサビにする', () => {
    const f = (section: number, isChorus: boolean) => ({ section, isChorus }) as CueFeature;
    expect(fuseChorus([f(0, true), f(0, true), f(1, true)], [0.1, 0.2, 0.9])).toEqual([false, false, true]);
    expect(fuseChorus([f(0, false), f(1, false), f(1, false)], [0.1, 0.9, 0.8])).toEqual([false, true, true]);
  });
});

describe('director に曲のリズムを渡したとき', () => {
  const plain = build();
  const synced = build({ rhythm });
  const grid = eighthGrid(rhythm.beats);

  it('渡さない・確からしさが低い・beatSync が無効のときは、従来と完全に同じ Timeline', () => {
    expect(plain.rhythm).toBeUndefined();
    expect(plain.items.every((it) => !('sync' in it))).toBe(true);
    expect(build({ rhythm: makeRhythm({ confidence: 0.1 }) })).toEqual(plain);
    expect(build({ rhythm, effects: { ...ALL_EFFECTS, beatSync: false } })).toEqual(plain);
  });

  it('字幕の開始・終了は、近くの8分音符の位置へ最大 0.1 秒だけ寄せる', () => {
    synced.items.forEach((it, i) => {
      const cue = features[i].cue;
      expect(Math.abs(it.start - cue.start)).toBeLessThanOrEqual(SNAP_MAX_SEC + 1e-9);
      if (it.start !== cue.start) expect(grid).toContain(it.start);
    });
    expect(synced.items.some((it, i) => it.start !== features[i].cue.start)).toBe(true);
  });

  it('登場は拍で着地し、文字送りの間隔の基準に拍の間隔を持つ', () => {
    for (const it of synced.items) {
      expect(it.sync).toBeDefined();
      expect(it.sync!.beat).toBeCloseTo(0.5);
      if (it.sync!.hit !== null) expect(rhythm.beats).toContain(Math.round((it.start + it.sync!.hit) * 1000) / 1000);
    }
    expect(synced.items.some((it) => it.sync!.hit !== null)).toBe(true);
  });

  it('拍の脈動はテーマの強さで決まり、サビは強め。演出なし・beatPulse 無効では 0', () => {
    for (const it of synced.items) expect(it.sync!.pulse).toBeCloseTo(it.emphasis ? 0.026 : 0.02);
    expect(build({ rhythm }, 'none').items.every((it) => it.sync!.pulse === 0)).toBe(true);
    expect(build({ rhythm, effects: { ...ALL_EFFECTS, beatPulse: false } }).items.every((it) => it.sync!.pulse === 0)).toBe(true);
  });

  it('カメラシェイクは小節の頭と曲の区切りに置く', () => {
    const allowed = new Set([...rhythm.downbeats, ...rhythm.sections]);
    const cueStarts = new Set(features.map((f) => f.cue.start));
    for (const s of synced.shakes) expect(allowed.has(s.time) || cueStarts.has(s.time)).toBe(true);
    for (const t of rhythm.sections) expect(synced.shakes.map((s) => s.time)).toContain(t);
  });

  it('字幕の音量で演出の強さが変わる（演出なしでは 0 のまま）', () => {
    const energies = new Set(synced.items.map((it) => it.energy));
    expect(energies.size).toBeGreaterThan(1);
    for (const e of energies) {
      expect(e).toBeGreaterThanOrEqual(0.6 * 0.8 - 1e-9);
      expect(e).toBeLessThanOrEqual(0.6 * 1.2 + 1e-9);
    }
    expect(build({ rhythm }, 'none').items.every((it) => it.energy === 0)).toBe(true);
  });

  it('描画用のリズム（拍・小節の頭・音量）を持つ。interludeMeter が無効なら音量は持たない', () => {
    expect(synced.rhythm?.beats).toEqual(rhythm.beats);
    expect(synced.rhythm?.downbeats).toEqual(rhythm.downbeats);
    expect(synced.rhythm?.energy).toEqual(rhythm.energy);
    expect(build({ rhythm, effects: { ...ALL_EFFECTS, interludeMeter: false } }).rhythm?.energy).toBeUndefined();
  });

  it('同じ入力なら同じ結果（決定的）', () => {
    expect(build({ rhythm })).toEqual(synced);
  });
});
