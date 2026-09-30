import type { MessageParams } from '../i18n/errors';
import type { MessageKey } from '../i18n/messages/en';
import type { Rhythm } from './types';

export type ToRhythmWorker = { type: 'start'; media: File };

export type FromRhythmWorker =
  /** 解析した音声の割合 0..1 */
  | { type: 'progress'; ratio: number }
  | { type: 'done'; rhythm: Rhythm }
  /** 音声トラックが無い（映像だけの MV） */
  | { type: 'noAudio' }
  /** key があれば画面側で翻訳する（想定外のエラーは message をそのまま表示） */
  | { type: 'error'; message: string; key?: MessageKey; params?: MessageParams };
