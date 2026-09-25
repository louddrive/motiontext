import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  activeSeconds,
  checkSubtitleFileSize,
  estimatePngSequence,
  estimateSizeMB,
  formatTime,
  usableMvDuration,
  validateExport,
  validateSubtitles,
} from '../src/limits';
import type { Cue } from '../src/parsers/types';

const cue = (index: number, start: number, end: number): Cue => ({ index, start, end, text: 'x' });
const errors = (issues: { level: string }[]) => issues.filter((i) => i.level === 'error').length;
const warnings = (issues: { level: string }[]) => issues.filter((i) => i.level === 'warning').length;

describe('formatTime', () => {
  it('分:秒 / 時:分:秒', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(900)).toBe('15:00');
    expect(formatTime(36005)).toBe('10:00:05');
  });
});

describe('checkSubtitleFileSize', () => {
  it('1MB 以下は通し、超えたらエラー', () => {
    expect(checkSubtitleFileSize(LIMITS.maxSubtitleBytes)).toBeNull();
    expect(checkSubtitleFileSize(LIMITS.maxSubtitleBytes + 1)?.level).toBe('error');
  });
});

describe('validateSubtitles', () => {
  it('普通の曲は問題なし', () => {
    const cues = Array.from({ length: 80 }, (_, i) => cue(i, i * 3, i * 3 + 2.5));
    expect(validateSubtitles(cues)).toEqual([]);
  });

  it('件数上限を超えたらエラー', () => {
    const cues = Array.from({ length: LIMITS.maxCues + 1 }, (_, i) => cue(i, i * 0.2, i * 0.2 + 0.1));
    expect(errors(validateSubtitles(cues))).toBe(1);
  });

  it('時刻の打ち間違い（10時間後の字幕）はエラー＋警告', () => {
    const issues = validateSubtitles([cue(0, 1, 3), cue(1, 36000, 36002)]);
    expect(errors(issues)).toBe(1);
    expect(warnings(issues)).toBe(1);
  });

  it('極端に長い表示時間は警告', () => {
    expect(warnings(validateSubtitles([cue(0, 1, 3), cue(1, 4, 90)]))).toBe(1);
  });
});

describe('validateExport / usableMvDuration', () => {
  it('10分超は警告、15分超はエラー', () => {
    expect(validateExport(300, 290)).toEqual([]);
    expect(warnings(validateExport(700, 690))).toBe(1);
    expect(errors(validateExport(1000, 990))).toBe(1);
  });

  it('上限を超える MV は書き出し長に使わず、警告する', () => {
    expect(usableMvDuration(7200)).toBeUndefined();
    expect(usableMvDuration(240)).toBe(240);
    expect(warnings(validateExport(200, 199.5, 7200))).toBe(1);
  });

  it('字幕が MV より長ければ警告', () => {
    expect(warnings(validateExport(300.5, 300, 240))).toBe(1);
    expect(validateExport(240, 200, 240)).toEqual([]);
  });

  it('PNG 連番は 5 分超で警告（MP4 は 10 分超）', () => {
    expect(warnings(validateExport(360, 350, undefined, 'mp4'))).toBe(0);
    const png = validateExport(360, 350, undefined, 'png', 30);
    expect(warnings(png)).toBe(1);
    expect(png[0].message).toContain('10,800');
    expect(errors(validateExport(1000, 990, undefined, 'png'))).toBe(1);
  });

  it('合成書き出しも MP4 と同じく 10 分超で警告、15 分超はエラー', () => {
    expect(warnings(validateExport(360, 350, 360, 'composite'))).toBe(0);
    expect(warnings(validateExport(700, 690, 700, 'composite'))).toBe(1);
    expect(errors(validateExport(1000, 990, undefined, 'composite'))).toBe(1);
  });

  it('字幕の表示秒数（重なりは1回だけ数える）', () => {
    expect(activeSeconds([])).toBe(0);
    expect(activeSeconds([cue(0, 0, 2), cue(1, 5, 6)])).toBe(3);
    expect(activeSeconds([cue(0, 0, 2), cue(1, 1, 3), cue(2, 10, 11)])).toBe(4);
  });

  it('PNG 連番の目安は枚数・容量・時間を返し、表示中の区間が多いほど大きい', () => {
    const sparse = estimatePngSequence(60, 10, 30);
    const dense = estimatePngSequence(60, 55, 30);
    expect(sparse.frames).toBe(1800);
    expect(dense.frames).toBe(1800);
    expect(dense.highMB).toBeGreaterThan(sparse.highMB);
    expect(dense.sec).toBeGreaterThan(sparse.sec);
    expect(dense.lowMB).toBeLessThan(dense.highMB);
    // 縦型も画素数は同じなので同じ目安
    expect(estimatePngSequence(60, 55, 30, 1080 * 1920).highMB).toBeCloseTo(dense.highMB);
  });

  it('サイズの目安', () => {
    const e = estimateSizeMB(60, 12_000_000);
    expect(e.low).toBeCloseTo(7.5);
    expect(e.high).toBeCloseTo(90);
  });
});
