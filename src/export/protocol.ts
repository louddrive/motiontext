import type { Timeline } from '../director/types';
import type { CompositeResult } from './composite';

/** mp4: 黒／グリーン背景の H.264 / png: 背景透過の PNG 連番 / composite: MV／曲と合成した MP4（音声付き） */
export type ExportFormat = 'mp4' | 'png' | 'composite';

export type ToWorker =
  | { type: 'start'; format: 'mp4' | 'png'; timeline: Timeline; fontIds: string[]; text: string; bitrate: number }
  /** 合成: media は読み込んだ MV／曲、writable は保存先ファイルへの中継ストリーム（Worker へ転送する） */
  | { type: 'start'; format: 'composite'; timeline: Timeline; fontIds: string[]; text: string; media: File; writable: WritableStream }
  | { type: 'cancel' }
  /** PNG 連番: メインスレッドが1枚書き終えた通知（流量制御用） */
  | { type: 'ack' };

export type FromWorker =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; buffer: ArrayBuffer; mimeType: string }
  /** PNG 連番の1フレーム */
  | { type: 'frame'; index: number; buffer: ArrayBuffer }
  /** PNG 連番の全フレーム送信完了 */
  | { type: 'framesDone'; total: number }
  /** 合成の完了 */
  | { type: 'compositeDone'; result: CompositeResult }
  | { type: 'error'; message: string }
  | { type: 'canceled' };
