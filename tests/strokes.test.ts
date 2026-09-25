import { describe, expect, it } from 'vitest';
import { findStrokeEmphasis, strokeCount } from '../src/analysis/strokes';

describe('strokeCount', () => {
  it('Unihan の総画数を返す', () => {
    expect(strokeCount('一')).toBe(1);
    expect(strokeCount('鳥')).toBe(11);
    expect(strokeCount('憂')).toBe(15);
    expect(strokeCount('鬱')).toBe(29);
    expect(strokeCount('あ')).toBeUndefined();
  });
});

describe('findStrokeEmphasis', () => {
  it('最も画数の多い漢字を含む漢字語を選ぶ', () => {
    // 夜(8) 明(8) 街(12) 歩(8) → 「街」
    expect(findStrokeEmphasis('夜明けの街を歩いていく')).toEqual({ start: 4, end: 5 });
    // 笑顔: 顔(18) → 「笑顔」全体
    expect(findStrokeEmphasis('君の笑顔を忘れないように')).toEqual({ start: 2, end: 4 });
  });

  it('画数が少ない漢字しかない行は強調しない', () => {
    expect(findStrokeEmphasis('今日も歌う')).toEqual({ start: 3, end: 4 }); // 歌(14)
    expect(findStrokeEmphasis('大きな木の下')).toBeNull(); // 最大でも 3〜4画
  });

  it('行全体が漢字語だけなら強調しない', () => {
    expect(findStrokeEmphasis('憂鬱')).toBeNull();
    expect(findStrokeEmphasis('ありがとう')).toBeNull();
  });

  it('空白で区切られた英語混じりでも位置は書記素単位', () => {
    expect(findStrokeEmphasis('Hi 憂鬱な朝')).toEqual({ start: 3, end: 5 });
  });
});
