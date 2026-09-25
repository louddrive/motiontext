import type { Localized } from '../i18n/errors';

/** BOM除去・改行統一 */
export function normalizeText(src: string): string {
  return src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** SRT/SBV 本文中の装飾タグ（<i>, <font ...>, {\an8} 等）を除去する */
export function stripTags(line: string): string {
  return line
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .trim();
}

/** 時・分・秒・ミリ秒から秒へ。ミリ秒部は桁数に応じて解釈する（"5" → 0.5 秒） */
export function toSeconds(h: string, m: string, s: string, frac: string): number {
  const ms = frac ? Number(`0.${frac}`) : 0;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + ms;
}

/** 開始時刻でソートし、index を振り直す。end <= start のものは除外して警告する */
export function finalizeCues<T extends { start: number; end: number; text: string }>(
  cues: T[],
  warnings: Localized[],
): { index: number; start: number; end: number; text: string }[] {
  return cues
    .filter((c) => {
      if (c.end <= c.start) {
        warnings.push({ key: 'parse.droppedCue', params: { text: c.text.slice(0, 20) } });
        return false;
      }
      if (!c.text.trim()) return false;
      return true;
    })
    .sort((a, b) => a.start - b.start)
    .map((c, i) => ({ index: i, start: c.start, end: c.end, text: c.text }));
}
