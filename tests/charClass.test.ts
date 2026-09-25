import { describe, expect, it } from 'vitest';
import { charScale, classifyChar, hasKanji, kanjiBoost } from '../src/render/charClass';

describe('classifyChar', () => {
  it('文字種を判定する', () => {
    expect(['君', '々', '〆', 'ヶ'].map(classifyChar)).toEqual(['kanji', 'kanji', 'kanji', 'kanji']);
    expect(['カ', 'ー'].map(classifyChar)).toEqual(['katakana', 'katakana']);
    expect(['の', 'ゃ'].map(classifyChar)).toEqual(['hiragana', 'hiragana']);
    expect(['A', 'z', '7'].map(classifyChar)).toEqual(['latin', 'latin', 'latin']);
    expect(['、', '！', '♪'].map(classifyChar)).toEqual(['symbol', 'symbol', 'symbol']);
  });

  it('漢字を含むか', () => {
    expect(hasKanji('ありがとう')).toBe(false);
    expect(hasKanji('Hello')).toBe(false);
    expect(hasKanji('君の笑顔')).toBe(true);
  });
});

describe('charScale', () => {
  it('漢字 > カタカナ・英数字 > ひらがな・記号 の順になる', () => {
    const r = 0.7;
    expect(charScale('kanji', r)).toBe(1);
    expect(charScale('katakana', r)).toBeCloseTo(0.85);
    expect(charScale('latin', r)).toBeCloseTo(0.85);
    expect(charScale('hiragana', r)).toBe(0.7);
    expect(charScale('symbol', r)).toBe(0.7);
  });

  it('kanaRatio = 1 なら強弱なし', () => {
    for (const c of ['kanji', 'katakana', 'hiragana', 'latin', 'symbol'] as const) expect(charScale(c, 1)).toBe(1);
    expect(kanjiBoost(1)).toBe(1);
  });
});
