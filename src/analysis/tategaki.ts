import { visibleLength } from './segment';

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
/** 縦書きで扱いにくい英数字（全角含む）。含む行は横書きのまま */
const ALNUM = /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/;

export const TATEGAKI_MAX_CHARS_PER_LINE = 20;
export const TATEGAKI_MAX_LINES = 3;

/** 縦書きにできる字幕か（日本語を含み、英数字を含まず、行数・文字数が収まる） */
export function canTategaki(lines: string[]): boolean {
  if (lines.length === 0 || lines.length > TATEGAKI_MAX_LINES) return false;
  const text = lines.join('');
  if (!JAPANESE.test(text) || ALNUM.test(text)) return false;
  return lines.every((l) => visibleLength(l) <= TATEGAKI_MAX_CHARS_PER_LINE);
}

/** 縦横混在にする塊の最小文字数（1文字だけの縦書きは縦に見えないため） */
export const MIXED_MIN_CHARS = 2;

/**
 * 縦横混在にできる字幕なら、最初の空白（全角・半角）の前後の2つの塊を返す。
 * 対象は1行の字幕だけ。どちらかの塊が短すぎる場合は null。
 */
export function splitMixed(lines: string[]): [string, string] | null {
  if (lines.length !== 1) return null;
  const m = /^(\S+)\s+(\S[\s\S]*)$/u.exec(lines[0].trim());
  if (!m) return null;
  const [, a, b] = m;
  return visibleLength(a) >= MIXED_MIN_CHARS && visibleLength(b) >= MIXED_MIN_CHARS ? [a, b] : null;
}
