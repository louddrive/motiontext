import { describe, expect, it } from 'vitest';
import type { Backdrop } from '../src/director/types';
import { BACKDROP_FADE_SEC, backdropAlpha, backdropFill, backdropIntervals } from '../src/render/backdrop';

const items = [
  { start: 5, end: 8 },
  { start: 8.5, end: 10 }, // 前の字幕との間が 0.5 秒 → つながる
  { start: 20, end: 22 }, // 間が 10 秒 → 別の区間
];
const iv = backdropIntervals(items);
const lyrics: Backdrop = { opacity: 0.5, mode: 'lyrics', color: '#000000' };
const always: Backdrop = { opacity: 0.5, mode: 'always', color: '#000000' };

describe('backdropIntervals', () => {
  it('1秒未満の間はつなげ、それ以上は分ける', () => {
    expect(iv).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 22 },
    ]);
  });

  it('重なった字幕もまとめる', () => {
    expect(backdropIntervals([{ start: 0, end: 3 }, { start: 1, end: 2 }, { start: 2.5, end: 4 }])).toEqual([{ start: 0, end: 4 }]);
  });
});

describe('backdropAlpha', () => {
  it('常に: いつでも指定の濃さ。濃さ0なら常に0', () => {
    for (const t of [0, 5, 15, 30]) expect(backdropAlpha(always, iv, t)).toBe(0.5);
    expect(backdropAlpha({ ...always, opacity: 0 }, iv, 6)).toBe(0);
    expect(backdropAlpha({ ...lyrics, opacity: 0 }, iv, 6)).toBe(0);
  });

  it('濃さは上限 0.8 に丸める', () => {
    expect(backdropAlpha({ ...always, opacity: 1 }, iv, 1)).toBe(0.8);
  });

  it('歌詞の表示中だけ: 区間外は0、区間内は指定の濃さ', () => {
    expect(backdropAlpha(lyrics, iv, 0)).toBe(0);
    expect(backdropAlpha(lyrics, iv, 15)).toBe(0);
    expect(backdropAlpha(lyrics, iv, 30)).toBe(0);
    expect(backdropAlpha(lyrics, iv, 6)).toBe(0.5);
    expect(backdropAlpha(lyrics, iv, 8.2)).toBe(0.5); // つながった区間の間も暗いまま
    expect(backdropAlpha(lyrics, iv, 21)).toBe(0.5);
  });

  it('表示の前後 0.4 秒で滑らかに切り替わる', () => {
    const before = 5 - BACKDROP_FADE_SEC;
    expect(backdropAlpha(lyrics, iv, before)).toBe(0);
    const mid = backdropAlpha(lyrics, iv, before + BACKDROP_FADE_SEC / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.5);
    expect(backdropAlpha(lyrics, iv, 5)).toBe(0.5);
    const out = backdropAlpha(lyrics, iv, 10 + BACKDROP_FADE_SEC / 2);
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(0.5);
    expect(backdropAlpha(lyrics, iv, 10 + BACKDROP_FADE_SEC)).toBe(0);
    // 単調に増える
    let prev = -1;
    for (let k = 0; k <= 10; k++) {
      const a = backdropAlpha(lyrics, iv, before + (BACKDROP_FADE_SEC * k) / 10);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe('backdropFill', () => {
  it('色コードと濃さから rgba を作る', () => {
    expect(backdropFill('#000000', 0.5)).toBe('rgba(0,0,0,0.5)');
    expect(backdropFill('#FFFFFF', 0.25)).toBe('rgba(255,255,255,0.25)');
    expect(backdropFill('#1A2A6C', 0.123456)).toBe('rgba(26,42,108,0.123)');
  });
});
