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
