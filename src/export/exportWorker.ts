// 書き出し専用 Worker（すべてメモリ上で処理し、外部送信なし）
// - mp4: OffscreenCanvas に描画 → WebCodecs(H.264) → MP4
// - png: 背景透過で描画 → PNG にエンコードし、1枚ずつメインスレッドへ送る（保存はメイン側）
// - composite: MV／曲と歌詞を合成して MP4（保存先ファイルへ直接書き込み）
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from 'mediabunny';
import type { Timeline } from '../director/types';
import { LocalizedError } from '../i18n/errors';
import { ensureGlyphs } from '../fonts/loader';
import { backdropAlphaAt, buildLayouts, lyricsVisibleAt, renderFrame } from '../render/renderer';
import { CompositeCanceled, runComposite } from './composite';
import type { FromWorker, ToWorker } from './protocol';

// DOM と WebWorker の lib は同時に読み込めないため、必要な分だけ型を定義する
const scope = self as unknown as {
  fonts: FontFaceSet;
  postMessage(msg: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
let canceled = false;

/** PNG 連番: メインスレッドで未保存のフレーム数の上限（メモリを溜めないための流量制御） */
const MAX_IN_FLIGHT = 8;
let inFlight = 0;
let slotWaiter: (() => void) | null = null;

/** エラーを画面へ送る形にする（LocalizedError はキーと値も送り、画面側で翻訳する） */
function errorMessage(err: unknown): FromWorker {
  if (err instanceof LocalizedError) return { type: 'error', message: err.message, key: err.key, params: err.params };
  return { type: 'error', message: err instanceof Error ? err.message : String(err) };
}

function post(msg: FromWorker, transfer: Transferable[] = []) {
  scope.postMessage(msg, transfer);
}

scope.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    canceled = true;
    slotWaiter?.();
    return;
  }
  if (msg.type === 'ack') {
    inFlight--;
    slotWaiter?.();
    return;
  }
  canceled = false;
  if (msg.format === 'png') await exportPng(msg.timeline, msg.fontIds, msg.text);
  else if (msg.format === 'composite') await exportComposite(msg.timeline, msg.fontIds, msg.text, msg.media, msg.writable);
  else await exportMp4(msg.timeline, msg.fontIds, msg.text, msg.bitrate);
};

async function exportMp4(timeline: Timeline, fontIds: string[], text: string, bitrate: number) {
  let output: Output | null = null;
  try {
    const { width, height, fps } = timeline;
    if (!(await canEncodeVideo('avc', { width, height, bitrate }))) {
      throw new LocalizedError('err.h264Unsupported');
    }
    // Worker では document.fonts が使えないため、Worker 側の FontFaceSet に登録してロードを待つ
    await ensureGlyphs(scope.fonts, fontIds, text);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new LocalizedError('err.canvasUnavailable');
    const layouts = buildLayouts(ctx, timeline);

    const target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const source = new CanvasSource(canvas, { codec: 'avc', bitrate, keyFrameInterval: 1 });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();

    const total = Math.ceil(timeline.duration * fps);
    for (let i = 0; i < total; i++) {
      if (canceled) {
        await output.cancel();
        post({ type: 'canceled' });
        return;
      }
      renderFrame(ctx, timeline, layouts, i / fps);
      await source.add(i / fps, 1 / fps);
      if (i % 10 === 0) post({ type: 'progress', done: i, total });
    }
    await output.finalize();
    const buffer = target.buffer;
    if (!buffer) throw new LocalizedError('err.emptyBuffer');
    post({ type: 'done', buffer, mimeType: await output.getMimeType() }, [buffer]);
  } catch (err) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
    post(errorMessage(err));
  }
}

async function exportPng(timeline: Timeline, fontIds: string[], text: string) {
  try {
    const { width, height, fps } = timeline;
    await ensureGlyphs(scope.fonts, fontIds, text);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new LocalizedError('err.canvasUnavailable');
    const layouts = buildLayouts(ctx, timeline);

    inFlight = 0;
    // 字幕のないフレームは、色レイヤーの濃さごとに PNG を使い回す（濃さ0＝完全に透明な空フレーム）
    const idleFrames = new Map<string, ArrayBuffer>();
    const total = Math.ceil(timeline.duration * fps);
    for (let i = 0; i < total; i++) {
      // 未保存フレームが上限に達したら、メイン側の保存完了（ack）を待つ
      while (inFlight >= MAX_IN_FLIGHT && !canceled) await new Promise<void>((r) => (slotWaiter = r));
      slotWaiter = null;
      if (canceled) {
        post({ type: 'canceled' });
        return;
      }
      const t = i / fps;
      let buffer: ArrayBuffer;
      if (lyricsVisibleAt(timeline, t)) {
        renderFrame(ctx, timeline, layouts, t, { transparent: true, backdrop: true });
        buffer = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
      } else {
        // 字幕のない区間（間奏など）は、同じ濃さの PNG を使い回してエンコードを省く
        const key = backdropAlphaAt(timeline, t).toFixed(3);
        let idle = idleFrames.get(key);
        if (!idle) {
          renderFrame(ctx, timeline, layouts, t, { transparent: true, backdrop: true });
          idle = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
          idleFrames.set(key, idle);
        }
        buffer = idle.slice(0);
      }
      inFlight++;
      post({ type: 'frame', index: i, buffer }, [buffer]);
      if (i % 10 === 0) post({ type: 'progress', done: i, total });
    }
    post({ type: 'framesDone', total });
  } catch (err) {
    post(errorMessage(err));
  }
}

async function exportComposite(timeline: Timeline, fontIds: string[], text: string, media: File, writable: WritableStream) {
  try {
    await ensureGlyphs(scope.fonts, fontIds, text);
    const result = await runComposite({
      media,
      timeline,
      writable,
      isCanceled: () => canceled,
      onProgress: (done, total) => post({ type: 'progress', done, total }),
    });
    post({ type: 'compositeDone', result });
  } catch (err) {
    if (err instanceof CompositeCanceled) post({ type: 'canceled' });
    else post(errorMessage(err));
  }
}
