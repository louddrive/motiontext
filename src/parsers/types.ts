/** 1つの字幕（秒単位）。text は行区切り "\n" を保持する。 */
export interface Cue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export type SubtitleFormat = 'srt' | 'sbv';

import type { Localized } from '../i18n/errors';

export interface ParseResult {
  format: SubtitleFormat;
  cues: Cue[];
  /** 読み込み時の警告（画面側で翻訳する） */
  warnings: Localized[];
}
