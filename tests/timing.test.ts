import { describe, expect, it } from 'vitest';
import { clampOffset, shiftCues } from '../src/analysis/timing';
import type { Cue } from '../src/parsers/types';

const cues: Cue[] = [
  { index: 0, start: 0.5, end: 2, text: 'a' },
  { index: 1, start: 3, end: 5, text: 'b' },
  { index: 2, start: 6, end: 8, text: 'c' },
];

describe('shiftCues', () => {
  it('0 ならそのまま返す', () => {
    expect(shiftCues(cues, 0)).toBe(cues);
  });

  it('正の値で全体を遅らせる', () => {
    expect(shiftCues(cues, 1.5).map((c) => [c.start, c.end])).toEqual([
      [2, 3.5],
      [4.5, 6.5],
      [7.5, 9.5],
    ]);
  });

  it('負の値で早め、0秒より前は切り、消えた字幕は除いて index を振り直す', () => {
    const r = shiftCues(cues, -3.5);
    expect(r.map((c) => [c.index, c.start, c.end, c.text])).toEqual([
      [0, 0, 1.5, 'b'],
      [1, 2.5, 4.5, 'c'],
    ]);
  });

  it('元の配列は変更しない', () => {
    shiftCues(cues, 2);
    expect(cues[0].start).toBe(0.5);
  });
});

describe('clampOffset', () => {
  it('±30秒に丸め、0.01秒単位にそろえる', () => {
    expect(clampOffset(45)).toBe(30);
    expect(clampOffset(-99)).toBe(-30);
    expect(clampOffset(0.123)).toBe(0.12);
    expect(clampOffset(NaN)).toBe(0);
  });
});
