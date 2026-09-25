import { LocalizedError } from '../i18n/errors';
import { parseSbv } from './sbv';
import { parseSrt } from './srt';
import type { ParseResult, SubtitleFormat } from './types';

export function detectFormat(fileName: string, content: string): SubtitleFormat | null {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'srt' || ext === 'sbv') return ext;
  if (/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(content)) return 'srt';
  if (/^\s*\d{1,2}:\d{2}:\d{2}(\.\d{1,3})?,\d{1,2}:\d{2}:\d{2}/m.test(content)) return 'sbv';
  return null;
}

export function parseSubtitle(fileName: string, content: string): ParseResult {
  const format = detectFormat(fileName, content);
  if (!format) throw new LocalizedError('parse.unknownFormat');
  const result = format === 'srt' ? parseSrt(content) : parseSbv(content);
  // 拡張子と中身が食い違う場合（.srt だが中身は SBV 等）はもう一方でも試す
  if (result.cues.length === 0) {
    const alt = format === 'srt' ? parseSbv(content) : parseSrt(content);
    if (alt.cues.length > 0) return alt;
  }
  return result;
}

/** UTF-8 で厳格にデコードし、失敗したら Shift_JIS で読む */
export function decodeBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}
