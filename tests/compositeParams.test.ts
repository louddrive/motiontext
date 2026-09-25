import { describe, expect, it } from 'vitest';
import { compositeBitrate, compositeFileName, compositeFps, estimateComposite } from '../src/export/compositeParams';

describe('compositeFps', () => {
  it('MV のフレームレートに合わせ、よく使う値に丸める', () => {
    expect(compositeFps(29.97, true)).toBe(29.97);
    expect(compositeFps(30.02, true)).toBe(30);
    expect(compositeFps(23.98, true)).toBe(23.976);
    expect(compositeFps(59.9, true)).toBe(59.94);
  });

  it('60fps を上限にする', () => {
    expect(compositeFps(120, true)).toBe(60);
    expect(compositeFps(240, true)).toBe(60);
  });

  it('曲だけ・不明な場合は 30fps', () => {
    expect(compositeFps(null, false)).toBe(30);
    expect(compositeFps(44.1, false)).toBe(30);
    expect(compositeFps(NaN, true)).toBe(30);
    expect(compositeFps(0, true)).toBe(30);
  });

  it('標準から外れた値はそのまま（小数3桁）', () => {
    expect(compositeFps(15.0, true)).toBe(15);
    expect(compositeFps(12.3456, true)).toBe(12.346);
  });
});

describe('compositeBitrate / 目安 / ファイル名', () => {
  it('1080p30 で 12Mbps、60fps で 18Mbps、縦型も同じ画素数なら同じ', () => {
    expect(compositeBitrate(1920, 1080, 30)).toBe(12_000_000);
    expect(compositeBitrate(1920, 1080, 60)).toBe(18_000_000);
    expect(compositeBitrate(1080, 1920, 30)).toBe(12_000_000);
  });

  it('サイズと時間の目安は長さと fps に比例して増える', () => {
    const a = estimateComposite(60, 1920, 1080, 30);
    const b = estimateComposite(120, 1920, 1080, 30);
    const c = estimateComposite(60, 1920, 1080, 60);
    expect(b.mb).toBeCloseTo(a.mb * 2);
    expect(c.sec).toBeCloseTo(a.sec * 2);
    expect(a.mb).toBeCloseTo((12_256_000 * 60) / 8 / 1024 / 1024);
  });

  it('出力ファイル名', () => {
    expect(compositeFileName('song', 1920, 1080)).toBe('song_with_mv_1920x1080.mp4');
    expect(compositeFileName('a/b', 1080, 1920)).toBe('a_b_with_mv_1080x1920.mp4');
  });
});
