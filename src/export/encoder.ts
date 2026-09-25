import type { Timeline } from '../director/types';
import { LocalizedError } from '../i18n/errors';
import type { CompositeResult } from './composite';
import type { FromWorker, ToWorker } from './protocol';
import { frameFileName, pickUniqueName, sequenceFolderName } from './sequence';

export const DEFAULT_BITRATE = 12_000_000;

export function isExportSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined';
}

// File System Access API（Chrome / Edge）。TypeScript の DOM 型に無い部分だけ定義する
type DirectoryPicker = (options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>;
type IterableDirectory = FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> };

/** PNG 連番書き出し（フォルダへ直接書き込み）に対応しているか */
export function isPngSequenceSupported(): boolean {
  return isExportSupported() && typeof (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker === 'function';
}

/** 保存先の親フォルダを選ばせる。ユーザー操作（クリック）の直後に呼ぶこと */
export function pickOutputDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  return picker({ mode: 'readwrite', id: 'motiontext-png' });
}

export interface ExportJob<T> {
  promise: Promise<T>;
  cancel: () => void;
}

function spawnWorker(): Worker {
  return new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });
}

/** Worker で MP4 を生成する。完了・失敗・キャンセルのいずれでも Worker は破棄する */
export function startExport(
  timeline: Timeline,
  fontIds: string[],
  text: string,
  onProgress: (ratio: number) => void,
): ExportJob<Blob> {
  const worker = spawnWorker();
  let settle: { resolve: (b: Blob) => void; reject: (e: Error) => void };
  const promise = new Promise<Blob>((resolve, reject) => (settle = { resolve, reject }));

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'progress') onProgress(m.done / m.total);
    else {
      worker.terminate();
      if (m.type === 'done') {
        onProgress(1);
        settle.resolve(new Blob([m.buffer], { type: m.mimeType }));
      } else if (m.type === 'canceled') settle.reject(new DOMException('canceled', 'AbortError'));
      else if (m.type === 'error') settle.reject(workerError(m));
    }
  };
  worker.onerror = (e) => {
    worker.terminate();
    settle.reject(workerCrash(e));
  };

  const start: ToWorker = { type: 'start', format: 'mp4', timeline, fontIds, text, bitrate: DEFAULT_BITRATE };
  worker.postMessage(start);
  return {
    promise,
    cancel: () => worker.postMessage({ type: 'cancel' } satisfies ToWorker),
  };
}

/**
 * 書き出しが途中で止まったときに、途中まで書いた出力（フォルダ／ファイル）を示す。
 * remove は利用者の確認後にだけ呼ぶこと（利用者のディスク上のデータを消すため）。
 */
export class PartialOutputError extends Error {
  constructor(
    /** 止まった理由（キャンセル時は null）。表示は画面側で翻訳する */
    readonly reason: unknown,
    /** 表示用の名前（フォルダ名・ファイル名） */
    readonly label: string,
    readonly kind: 'folder' | 'file',
    readonly remove: () => Promise<void>,
    readonly aborted: boolean,
  ) {
    super(reason instanceof Error ? reason.message : reason == null ? 'canceled' : String(reason));
  }
}

/** Worker からのエラー通知をエラーオブジェクトにする（キーがあれば翻訳できるエラー） */
function workerError(m: { message: string; key?: LocalizedError['key']; params?: LocalizedError['params'] }): Error {
  return m.key ? new LocalizedError(m.key, m.params) : new Error(m.message);
}

/** Worker 自体のエラー（読み込み失敗など） */
function workerCrash(e: ErrorEvent): Error {
  return e.message ? new Error(e.message) : new LocalizedError('err.worker');
}

export interface PngSequenceResult {
  folderName: string;
  frames: number;
  bytes: number;
}

/**
 * PNG 連番を parent 内の新しいサブフォルダへ1枚ずつ書き込む。メモリに溜めないので長尺でも容量の問題は起きない。
 * 失敗・キャンセル時は PartialOutputError で作成済みサブフォルダを返す（削除するかは呼び出し側で利用者に確認する）。
 */
export function startPngSequenceExport(
  parent: FileSystemDirectoryHandle,
  baseName: string,
  timeline: Timeline,
  fontIds: string[],
  text: string,
  onProgress: (ratio: number) => void,
): ExportJob<PngSequenceResult> {
  const worker = spawnWorker();
  let failed = false;
  let userCanceled = false;
  let folderName = '';

  const promise = (async (): Promise<PngSequenceResult> => {
    // 既存フォルダを上書きしないよう、重ならない名前でサブフォルダを作る
    const existing = new Set<string>();
    for await (const name of (parent as IterableDirectory).keys()) existing.add(name);
    folderName = pickUniqueName(sequenceFolderName(baseName, timeline.width, timeline.height, timeline.fps), existing);
    const dir = await parent.getDirectoryHandle(folderName, { create: true });

    return new Promise<PngSequenceResult>((resolve, reject) => {
      let bytes = 0;
      let written = 0;
      let expected = -1;
      // 書き込みは到着順に直列で行い、1枚終わるごとに Worker へ ack を返す
      let queue = Promise.resolve();

      const fail = (err: unknown, aborted: boolean) => {
        if (failed) return;
        failed = true;
        worker.terminate();
        reject(new PartialOutputError(aborted ? null : err, folderName, 'folder', () => removeFolder(parent, folderName), aborted));
      };
      const finishIfDone = () => {
        if (!failed && expected >= 0 && written === expected) {
          worker.terminate();
          onProgress(1);
          resolve({ folderName, frames: written, bytes });
        }
      };

      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'frame') {
          queue = queue.then(async () => {
            if (failed) return;
            try {
              const handle = await dir.getFileHandle(frameFileName(baseName, m.index), { create: true });
              const writable = await handle.createWritable();
              await writable.write(m.buffer);
              await writable.close();
              bytes += m.buffer.byteLength;
              written++;
              worker.postMessage({ type: 'ack' } satisfies ToWorker);
              finishIfDone();
            } catch (err) {
              // ディスクの空き不足・権限の取り消しなど
              fail(new LocalizedError('err.writeFailed', { error: err instanceof Error ? err.message : String(err) }), false);
            }
          });
        } else if (m.type === 'progress') onProgress(m.done / m.total);
        else if (m.type === 'framesDone') {
          expected = m.total;
          queue = queue.then(finishIfDone);
        } else if (m.type === 'canceled') fail(null, true);
        else if (m.type === 'error') fail(workerError(m), false);
      };
      worker.onerror = (e) => fail(workerCrash(e), false);

      const start: ToWorker = { type: 'start', format: 'png', timeline, fontIds, text, bitrate: 0 };
      worker.postMessage(start);
    });
  })().catch((err) => {
    worker.terminate();
    if (err instanceof PartialOutputError) throw err;
    // サブフォルダ作成前の失敗（フォルダの権限なし等）
    if (!folderName) throw err;
    throw new PartialOutputError(userCanceled ? null : err, folderName, 'folder', () => removeFolder(parent, folderName), userCanceled);
  });

  return {
    promise,
    cancel: () => {
      userCanceled = true;
      worker.postMessage({ type: 'cancel' } satisfies ToWorker);
    },
  };
}

/** 途中まで書き出したサブフォルダを削除する（自分が作ったサブフォルダのみ） */
async function removeFolder(parent: FileSystemDirectoryHandle, folderName: string): Promise<void> {
  await parent.removeEntry(folderName, { recursive: true });
}

// ---- MV／曲との合成書き出し ----

type SaveFilePicker = (options?: {
  suggestedName?: string;
  id?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/** 合成書き出し（保存先ファイルへ直接書き込み）に対応しているか */
export function isCompositeSupported(): boolean {
  return isExportSupported() && typeof (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker === 'function';
}

/** 保存先ファイルを選ばせる。ユーザー操作（クリック）の直後に呼ぶこと */
export function pickOutputFile(suggestedName: string, typeDescription: string): Promise<FileSystemFileHandle> {
  const picker = (window as unknown as { showSaveFilePicker: SaveFilePicker }).showSaveFilePicker;
  return picker({ suggestedName, id: 'motiontext-mp4', types: [{ description: typeDescription, accept: { 'video/mp4': ['.mp4'] } }] });
}

/** 途中まで書いたファイルを削除する。remove() が無いブラウザでは中身を空にする */
async function removeFile(handle: FileSystemFileHandle): Promise<void> {
  const removable = handle as FileSystemFileHandle & { remove?: () => Promise<void> };
  if (removable.remove) {
    await removable.remove();
    return;
  }
  const w = await handle.createWritable({ keepExistingData: false });
  await w.close();
}

/**
 * MV／曲と歌詞を合成した MP4 を、保存先ファイルへ直接書き込む。
 * 失敗・キャンセル時は PartialOutputError で途中まで書いたファイルを返す（削除するかは利用者に確認する）。
 */
export function startCompositeExport(
  handle: FileSystemFileHandle,
  media: File,
  timeline: Timeline,
  fontIds: string[],
  text: string,
  onProgress: (ratio: number) => void,
): ExportJob<CompositeResult> {
  const worker = spawnWorker();
  let userCanceled = false;

  const promise = (async (): Promise<CompositeResult> => {
    const file = await handle.createWritable({ keepExistingData: false });
    let closed = false;
    // FileSystemWritableFileStream は Worker へ転送できないため、書き込みを中継するだけの
    // 普通の WritableStream を作って転送する（書き込み自体はメインスレッドで行う。流量制御もそのまま効く）
    const relay = new WritableStream<unknown>({
      write: (chunk) => file.write(chunk as FileSystemWriteChunkType),
      close: async () => {
        closed = true;
        await file.close();
      },
      abort: async (reason) => {
        closed = true;
        await file.abort(reason);
      },
    });
    return new Promise<CompositeResult>((resolve, reject) => {
      const fail = (err: unknown, aborted: boolean) => {
        worker.terminate();
        // 書き込みを中断し、一時ファイル（.crswap）を残さない
        if (!closed) {
          closed = true;
          file.abort().catch(() => {});
        }
        reject(new PartialOutputError(aborted ? null : err, handle.name, 'file', () => removeFile(handle), aborted));
      };
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.done / m.total);
        else if (m.type === 'compositeDone') {
          worker.terminate();
          onProgress(1);
          resolve(m.result);
        } else if (m.type === 'canceled') fail(null, true);
        else if (m.type === 'error') fail(workerError(m), userCanceled);
      };
      worker.onerror = (e) => fail(workerCrash(e), false);
      const start: ToWorker = { type: 'start', format: 'composite', timeline, fontIds, text, media, writable: relay };
      worker.postMessage(start, [relay as unknown as Transferable]);
    });
  })();

  return {
    promise,
    cancel: () => {
      userCanceled = true;
      worker.postMessage({ type: 'cancel' } satisfies ToWorker);
    },
  };
}
