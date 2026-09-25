// Intl.Segmenter の単語分割を、歌詞表示向けの「文節っぽい単位」にまとめる。
// 例: 君|の|笑顔|を|忘れ|ない|よう|に → 君の|笑顔を|忘れないように
// 形態素解析ではないため完全ではない（推測ベースのヒューリスティック）。

const wordSeg = new Intl.Segmenter('ja', { granularity: 'word' });
const graphemeSeg = new Intl.Segmenter('ja', { granularity: 'grapheme' });

const HIRAGANA_ONLY = /^[ぁ-ゟー]+$/;
const CLOSING = /^[、。，．,.!！?？…‥」』）)】〉》〕\]}ー〜~♪☆★]+$/;
const OPENING = /^[「『（(【〈《〔[{]+$/;
const SPACE = /^\s+$/;

export function graphemes(text: string): string[] {
  return Array.from(graphemeSeg.segment(text), (s) => s.segment);
}

/** 1行を文節相当のフレーズ配列に分割する。連結すると元の行に戻る。 */
export function splitPhrases(line: string): string[] {
  const segs = Array.from(wordSeg.segment(line), (s) => s.segment);
  const phrases: string[] = [];
  let pendingOpen = '';

  for (const seg of segs) {
    const last = phrases.length - 1;
    if (OPENING.test(seg)) {
      pendingOpen += seg;
      continue;
    }
    if (pendingOpen) {
      phrases.push(pendingOpen + seg);
      pendingOpen = '';
      continue;
    }
    const attach =
      last >= 0 &&
      (SPACE.test(seg) ||
        CLOSING.test(seg) ||
        // 短いひらがな（助詞・助動詞・活用語尾）は直前へ。直前が空白で終わるなら単語境界なので付けない
        (HIRAGANA_ONLY.test(seg) && seg.length <= 3 && !/\s$/.test(phrases[last])));
    if (attach) phrases[last] += seg;
    else phrases.push(seg);
  }
  if (pendingOpen) phrases.push(pendingOpen);
  return phrases;
}

/** 空白を除いた表示文字数 */
export function visibleLength(text: string): number {
  return graphemes(text.replace(/\s+/g, '')).length;
}
