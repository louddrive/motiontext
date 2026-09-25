// 文字種ごとのサイズ倍率。漢字を大きく、かなを小さくしてリリックビデオらしい強弱をつける。

export type CharClass = 'kanji' | 'katakana' | 'hiragana' | 'latin' | 'symbol';

const KANJI = /[\p{Script=Han}々〆〇ヶ]/u;
const KATAKANA = /[\p{Script=Katakana}ー]/u;
const HIRAGANA = /\p{Script=Hiragana}/u;
const LATIN = /[\p{Script=Latin}\p{Nd}]/u;

export function classifyChar(ch: string): CharClass {
  if (KANJI.test(ch)) return 'kanji';
  if (KATAKANA.test(ch)) return 'katakana';
  if (HIRAGANA.test(ch)) return 'hiragana';
  if (LATIN.test(ch)) return 'latin';
  return 'symbol';
}

export function hasKanji(text: string): boolean {
  return KANJI.test(text);
}

/**
 * 漢字サイズを 1 としたときの倍率。
 * kanaRatio = ひらがなの倍率（1 で強弱なし）。カタカナ・英数字はその中間。
 */
export function charScale(cls: CharClass, kanaRatio: number): number {
  switch (cls) {
    case 'kanji':
      return 1;
    case 'katakana':
    case 'latin':
      return 1 - (1 - kanaRatio) * 0.5;
    case 'hiragana':
    case 'symbol':
      return kanaRatio;
  }
}

/** 強弱をつけても全体の見た目の大きさが極端に変わらないよう、漢字側を少し拡大する係数 */
export function kanjiBoost(kanaRatio: number): number {
  return 1 + (1 - kanaRatio) * 0.5;
}

export const SIZE_CONTRAST_LEVELS = {
  none: { label: 'なし', kanaRatio: 1 },
  soft: { label: '控えめ', kanaRatio: 0.82 },
  normal: { label: '標準', kanaRatio: 0.7 },
  strong: { label: '強め', kanaRatio: 0.56 },
} as const;

export type SizeContrast = keyof typeof SIZE_CONTRAST_LEVELS;
