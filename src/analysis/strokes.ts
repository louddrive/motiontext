import { STROKES_BY_COUNT } from '../data/strokes';
import { classifyChar } from '../render/charClass';
import { graphemes } from './segment';

let table: Map<string, number> | null = null;

/** 漢字の総画数（Unihan kTotalStrokes）。表にない文字は undefined */
export function strokeCount(ch: string): number | undefined {
  if (!table) {
    table = new Map();
    for (const [n, chars] of Object.entries(STROKES_BY_COUNT)) for (const c of chars) table.set(c, Number(n));
  }
  return table.get(ch);
}

/** 行内の書記素インデックス範囲 [start, end) */
export interface EmphasisRange {
  start: number;
  end: number;
}

export const MIN_EMPHASIS_STROKES = 10;

/**
 * 行の中で最も画数の多い漢字を含む「漢字の連続（漢字語）」を1つ選ぶ。
 * - 最大画数が minStrokes 未満なら強調しない
 * - 行全体がその漢字語だけなら強調の意味がないので対象外
 * - 同点の場合は先に出てくる方
 */
export function findStrokeEmphasis(line: string, minStrokes = MIN_EMPHASIS_STROKES): EmphasisRange | null {
  const chars = graphemes(line);
  let best: (EmphasisRange & { score: number }) | null = null;
  let i = 0;
  while (i < chars.length) {
    if (classifyChar(chars[i]) !== 'kanji') {
      i++;
      continue;
    }
    let j = i;
    let score = 0;
    while (j < chars.length && classifyChar(chars[j]) === 'kanji') {
      score = Math.max(score, strokeCount(chars[j]) ?? 0);
      j++;
    }
    if (!best || score > best.score) best = { start: i, end: j, score };
    i = j;
  }
  if (!best || best.score < minStrokes) return null;
  const visible = chars.filter((c) => c.trim()).length;
  if (best.end - best.start >= visible) return null;
  return { start: best.start, end: best.end };
}
