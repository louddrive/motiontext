/** 1つの字幕（秒単位）。text は行区切り "\n" を保持する。 */
export interface Cue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export type SubtitleFormat = 'srt' | 'sbv';

export interface ParseResult {
  format: SubtitleFormat;
  cues: Cue[];
  warnings: string[];
}
