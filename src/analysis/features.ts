import type { Cue } from '../parsers/types';
import { splitPhrases, visibleLength } from './segment';

export type Tempo = 'fast' | 'normal' | 'slow';

export interface CueFeature {
  cue: Cue;
  duration: number;
  charCount: number;
  /** 1秒あたりの文字数 */
  density: number;
  gapBefore: number;
  gapAfter: number;
  /** 同じ歌詞（正規化後）が出現する回数 */
  repeatCount: number;
  /** 繰り返し出現する歌詞の塊に属する＝サビ候補 */
  isChorus: boolean;
  /** 前の字幕から間が空いている（間奏明け等） */
  isSectionStart: boolean;
  /** 所属セクション番号（isSectionStart で増える） */
  section: number;
  tempo: Tempo;
  /** 行ごとのフレーズ */
  lines: string[][];
  /** 直前の字幕と表示時間が重なっている */
  overlapsPrev: boolean;
}

export const SECTION_GAP_SEC = 2.5;

function normalizeLyric(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s、。,.!！?？…「」『』()（）"'〜~ー-]/g, '');
}

export function analyze(cues: Cue[]): CueFeature[] {
  const counts = new Map<string, number>();
  for (const c of cues) {
    const k = normalizeLyric(c.text);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  let section = 0;
  const feats = cues.map((cue, i): CueFeature => {
    const prev = cues[i - 1];
    const next = cues[i + 1];
    const duration = cue.end - cue.start;
    const charCount = visibleLength(cue.text);
    const density = charCount / Math.max(duration, 0.1);
    const gapBefore = prev ? cue.start - prev.end : cue.start;
    const gapAfter = next ? next.start - cue.end : Infinity;
    const isSectionStart = i === 0 || gapBefore >= SECTION_GAP_SEC;
    if (isSectionStart && i > 0) section++;
    const repeatCount = counts.get(normalizeLyric(cue.text)) ?? 1;
    const tempo: Tempo = duration < 1.2 || density > 9 ? 'fast' : duration > 4 && density < 4 ? 'slow' : 'normal';
    return {
      cue,
      duration,
      charCount,
      density,
      gapBefore,
      gapAfter,
      repeatCount,
      isChorus: false,
      isSectionStart,
      section,
      tempo,
      lines: cue.text.split('\n').map(splitPhrases),
      overlapsPrev: !!prev && cue.start < prev.end,
    };
  });

  // サビ推定: 繰り返される歌詞を2行以上含むセクションはサビとみなす。
  // 単発の繰り返し（「Oh」「Yeah」等）だけで判定しないよう、セクション単位で見る。
  const bySection = new Map<number, CueFeature[]>();
  for (const f of feats) {
    const arr = bySection.get(f.section) ?? [];
    arr.push(f);
    bySection.set(f.section, arr);
  }
  for (const arr of bySection.values()) {
    const repeated = arr.filter((f) => f.repeatCount >= 2 && f.charCount >= 3).length;
    const chorus = repeated >= 2 && repeated / arr.length >= 0.4;
    for (const f of arr) f.isChorus = chorus || (f.repeatCount >= 3 && f.charCount >= 3);
  }

  return feats;
}
