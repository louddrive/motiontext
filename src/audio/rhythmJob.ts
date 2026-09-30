// 画面側からリズム解析を Worker で行う（MV／曲を読み込んだときに裏で実行する）
import { LocalizedError } from '../i18n/errors';
import type { FromRhythmWorker, ToRhythmWorker } from './protocol';
import type { Rhythm } from './types';

/** done: 解析できた / noAudio: 音声トラックが無い */
export type RhythmOutcome = { kind: 'done'; rhythm: Rhythm } | { kind: 'noAudio' };

export interface RhythmJob {
  promise: Promise<RhythmOutcome>;
  /** 解析をやめる（promise は AbortError で失敗する） */
  cancel: () => void;
}

export function startRhythmAnalysis(media: File, onProgress: (ratio: number) => void): RhythmJob {
  const worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });
  let settle!: { resolve: (o: RhythmOutcome) => void; reject: (e: unknown) => void };
  const promise = new Promise<RhythmOutcome>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (e: MessageEvent<FromRhythmWorker>) => {
    const m = e.data;
    if (m.type === 'progress') {
      onProgress(m.ratio);
      return;
    }
    worker.terminate();
    if (m.type === 'done') settle.resolve({ kind: 'done', rhythm: m.rhythm });
    else if (m.type === 'noAudio') settle.resolve({ kind: 'noAudio' });
    else settle.reject(m.key ? new LocalizedError(m.key, m.params) : new Error(m.message));
  };
  worker.onerror = (e) => {
    worker.terminate();
    settle.reject(e.message ? new Error(e.message) : new LocalizedError('err.worker'));
  };
  worker.postMessage({ type: 'start', media } satisfies ToRhythmWorker);
  return {
    promise,
    cancel: () => {
      worker.terminate();
      settle.reject(new DOMException('canceled', 'AbortError'));
    },
  };
}
