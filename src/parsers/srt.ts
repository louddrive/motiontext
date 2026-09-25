import { finalizeCues, normalizeText, stripTags, toSeconds } from './common';
import type { ParseResult } from './types';

// 00:00:01,000 --> 00:00:03,500  (区切りは , と . の両方を許容。後続の位置指定 X1: 等は無視)
const TIME_RE =
  /^\s*(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?\s*-->\s*(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/;

export function parseSrt(src: string): ParseResult {
  const warnings: string[] = [];
  const lines = normalizeText(src).split('\n');
  const raw: { start: number; end: number; text: string }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = TIME_RE.exec(line);
    if (!m) {
      // 番号行・空行はスキップ。それ以外の孤立行は警告
      if (line.trim() && !/^\d+$/.test(line.trim())) {
        warnings.push(`${i + 1}行目: 解釈できない行をスキップしました`);
      }
      i++;
      continue;
    }
    const start = toSeconds(m[1], m[2], m[3], m[4] ?? '');
    const end = toSeconds(m[5], m[6], m[7], m[8] ?? '');
    i++;
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      // 空行なしで次のブロックが始まる壊れたファイルに備え、「番号行+時刻行」を検出したら打ち切る
      if (/^\d+$/.test(lines[i].trim()) && TIME_RE.test(lines[i + 1] ?? '')) break;
      if (TIME_RE.test(lines[i])) break;
      const t = stripTags(lines[i]);
      if (t) body.push(t);
      i++;
    }
    raw.push({ start, end, text: body.join('\n') });
  }

  return { format: 'srt', cues: finalizeCues(raw, warnings), warnings };
}
