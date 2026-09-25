import { finalizeCues, normalizeText, stripTags, toSeconds } from './common';
import type { Localized } from '../i18n/errors';
import type { ParseResult } from './types';

// 0:00:01.000,0:00:03.500
const TIME_RE =
  /^\s*(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\s*,\s*(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\s*$/;

export function parseSbv(src: string): ParseResult {
  const warnings: Localized[] = [];
  const lines = normalizeText(src).split('\n');
  const raw: { start: number; end: number; text: string }[] = [];

  let i = 0;
  while (i < lines.length) {
    const m = TIME_RE.exec(lines[i]);
    if (!m) {
      if (lines[i].trim()) warnings.push({ key: 'parse.skipLine', params: { line: i + 1 } });
      i++;
      continue;
    }
    const start = toSeconds(m[1], m[2], m[3], m[4] ?? '');
    const end = toSeconds(m[5], m[6], m[7], m[8] ?? '');
    i++;
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !TIME_RE.test(lines[i])) {
      const t = stripTags(lines[i]);
      if (t) body.push(t);
      i++;
    }
    raw.push({ start, end, text: body.join('\n') });
  }

  return { format: 'sbv', cues: finalizeCues(raw, warnings), warnings };
}
