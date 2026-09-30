import { describe, expect, it } from 'vitest';
import { compositeBitrate, compositeFileName, compositeFps, compositeTimeline, estimateComposite } from '../src/export/compositeParams';
import { NO_BACKDROP, type Timeline } from '../src/director/types';
import { blurSampleTimes } from '../src/render/fx';

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

describe('compositeTimeline', () => {
  const tl: Timeline = {
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 10,
    background: 'black',
    glow: 0,
    backdrop: NO_BACKDROP,
    motionBlur: { shutter: 0.5, samples: 4 },
    outline: false,
    shadow: false,
    shakes: [],
    interludes: [],
    items: [],
  };

  it('出力の fps に合わせ、モーションブラーのシャッター幅をフレーム間隔に対して一定に保つ', () => {
    const at60 = compositeTimeline(tl, 60);
    expect(at60.fps).toBe(60);
    const span = (t: Timeline) => {
      const times = blurSampleTimes(1, t.fps, t.motionBlur.shutter, t.motionBlur.samples);
      return times[0] - times[times.length - 1];
    };
    // シャッター 0.5 = フレーム間隔の半分
    expect(span(at60)).toBeCloseTo(0.5 / 60);
    expect(span(compositeTimeline(tl, 24))).toBeCloseTo(0.5 / 24);
  });

  it('fps が同じならそのまま返す（描画のキャッシュを使い回す）', () => {
    expect(compositeTimeline(tl, 30)).toBe(tl);
  });
});
