// ブラウザでの実描画テスト用。window.mt から、ゴールデン用の設定のフレームを実フォントで描いて PNG にする。
import type { Timeline } from '../../src/director/types';
import { ensureGlyphs } from '../../src/fonts/loader';
import { buildLayouts, renderFrame, type Layouts, type RenderOptions } from '../../src/render/renderer';
import { AudioSample, AudioSampleSource, BufferTarget, canEncodeAudio, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny';
import { analyzePcm } from '../../src/audio/analyzePcm';
import { startRhythmAnalysis } from '../../src/audio/rhythmJob';
import { beatFMeasure, medianOffset } from '../helpers/beatEval';
import { GOLDEN_FONT, GOLDEN_PRESETS, GOLDEN_TEXT, goldenTimes } from '../helpers/goldenPresets';
import { drumTrack, resample, SR } from '../helpers/synth';

interface Prepared {
  timeline: Timeline;
  opts: RenderOptions;
  layouts: Layouts;
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

const prepared = new Map<string, Prepared>();

async function prepare(name: string): Promise<Prepared> {
  let p = prepared.get(name);
  if (p) return p;
  const { timeline, opts } = GOLDEN_PRESETS[name]();
  await ensureGlyphs(document.fonts, GOLDEN_FONT.fontIds, GOLDEN_TEXT);
  const canvas = new OffscreenCanvas(timeline.width, timeline.height);
  const ctx = canvas.getContext('2d', { alpha: true })!;
  p = { timeline, opts, layouts: buildLayouts(ctx, timeline), canvas, ctx };
  prepared.set(name, p);
  return p;
}

async function toDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

/** 透過のフレームは、見やすいよう市松模様の上に置く */
function checker(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, cell = 16) {
  ctx.fillStyle = '#777';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#999';
  for (let y = 0; y < h; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
}

const api = {
  presets: () => Object.keys(GOLDEN_PRESETS),
  /** 画像をページに等倍で表示する（Playwright で要素のスクリーンショットを撮って比べるため） */
  async show(url: string): Promise<{ width: number; height: number }> {
    let img = document.getElementById('out') as HTMLImageElement | null;
    if (!img) {
      img = document.createElement('img');
      img.id = 'out';
      img.style.display = 'block';
      document.body.append(img);
    }
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  },
  times: async (name: string) => goldenTimes((await prepare(name)).timeline),
  /** 時刻 t のフレームを scale 倍に縮めた PNG（data URL） */
  async frame(name: string, t: number, scale = 0.5): Promise<string> {
    const p = await prepare(name);
    renderFrame(p.ctx, p.timeline, p.layouts, t, p.opts);
    const out = new OffscreenCanvas(Math.round(p.timeline.width * scale), Math.round(p.timeline.height * scale));
    const octx = out.getContext('2d')!;
    if (p.opts.transparent) checker(octx, out.width, out.height);
    octx.drawImage(p.canvas, 0, 0, out.width, out.height);
    return toDataUrl(out);
  },
  /** 複数の時刻を1枚に並べた一覧（コンタクトシート） */
  async sheet(name: string, times: number[], cols = 6, cellW = 320): Promise<string> {
    const p = await prepare(name);
    const cellH = Math.round((cellW * p.timeline.height) / p.timeline.width);
    const label = 18;
    const rows = Math.ceil(times.length / cols);
    const out = new OffscreenCanvas(cols * cellW, rows * (cellH + label));
    const octx = out.getContext('2d')!;
    octx.fillStyle = '#222';
    octx.fillRect(0, 0, out.width, out.height);
    times.forEach((t, i) => {
      renderFrame(p.ctx, p.timeline, p.layouts, t, p.opts);
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * (cellH + label);
      octx.save();
      octx.translate(x, y + label);
      if (p.opts.transparent) checker(octx, cellW, cellH, 8);
      octx.drawImage(p.canvas, 0, 0, cellW, cellH);
      octx.restore();
      octx.fillStyle = '#ccc';
      octx.font = '13px sans-serif';
      octx.fillText(`t=${t}`, x + 4, y + 14);
    });
    return toDataUrl(out);
  },
  /** seconds 秒の合成音（ドラム）のリズム解析にかかる時間（ms）。デコードは含まない */
  analyzeBench(seconds: number, bpm = 128) {
    const { pcm } = drumTrack({ bpm, seconds, bass: false });
    const t0 = performance.now();
    const r = analyzePcm(pcm, SR)!;
    return { seconds, ms: performance.now() - t0, bpm: r.bpm, beats: r.beats.length };
  },
  /**
   * 合成音（ドラム）を圧縮音声（AAC の MP4、使えなければ Opus の WebM）にエンコードしてから、アプリと同じ Worker で解析する。
   * どちらもエンコーダーの先頭の遅延があるので、デコード後の時刻の扱いが正しいか（拍が一律にずれないか）を確かめる。
   * どちらのエンコーダーも無い環境では { error: 'noEncoder' }（Linux の Chrome には AAC のエンコーダーが無い）
   */
  async codecRoundTrip(bpm = 124, seconds = 30, prefer: 'aac' | 'opus' = 'aac') {
    const s = drumTrack({ bpm, seconds });
    const aac = prefer === 'aac' && (await canEncodeAudio('aac', { numberOfChannels: 1, sampleRate: SR }));
    const opus = !aac && (await canEncodeAudio('opus', { numberOfChannels: 1, sampleRate: 48000 }));
    if (!aac && !opus) return { error: 'noEncoder' as const };
    // Opus は 48kHz で入れる
    const rate = aac ? SR : 48000;
    const pcm = aac ? s.pcm : resample(s.pcm, SR, rate);
    const target = new BufferTarget();
    const output = new Output({ format: aac ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target });
    const source = new AudioSampleSource({ codec: aac ? 'aac' : 'opus', bitrate: QUALITY_HIGH });
    output.addAudioTrack(source);
    await output.start();
    for (let i = 0; i < pcm.length; i += rate) {
      const data = pcm.slice(i, i + rate);
      const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: 1, sampleRate: rate, timestamp: i / rate });
      await source.add(sample);
      sample.close();
    }
    await output.finalize();
    const file = aac ? new File([target.buffer!], 'drums.mp4', { type: 'video/mp4' }) : new File([target.buffer!], 'drums.webm', { type: 'audio/webm' });
    const outcome = await startRhythmAnalysis(file, () => {}).promise;
    if (outcome.kind !== 'done') return { error: outcome.kind };
    const r = outcome.rhythm;
    return { codec: aac ? 'aac' : 'opus', bpm: r.bpm, f: beatFMeasure(r.beats, s.beats).f, offsetMs: medianOffset(r.beats, s.beats) * 1000, duration: r.duration };
  },
  /** 曲全体から frames 枚を等間隔に描き、1枚あたりの時間（ms）を測る。書き出しと同じく 1920x1080 等の実寸で描く */
  async bench(name: string, frames = 120, opts: RenderOptions = {}, patch: Partial<Timeline> = {}) {
    const p = await prepare(name);
    // patch: 負荷の内訳を調べるため、グロー・ブラー等を外したタイムラインでも測れるようにする
    const timeline = { ...p.timeline, ...patch };
    // 字幕の表示中の時刻だけを対象にする（何も描かないフレームで平均が下がらないように）
    const active = timeline.items.flatMap((it) => [it.start + 0.15, it.start + (it.end - it.start) * 0.5, it.end - 0.1]);
    const times = Array.from({ length: frames }, (_, i) => active[i % active.length]);
    // 1回目は JIT・キャッシュの準備を兼ねるので捨てる
    for (const t of times.slice(0, 10)) renderFrame(p.ctx, timeline, p.layouts, t, { ...p.opts, ...opts });
    const ms: number[] = [];
    for (const t of times) {
      const t0 = performance.now();
      renderFrame(p.ctx, timeline, p.layouts, t, { ...p.opts, ...opts });
      // GPU への描画命令の積み残しを含めて測るため、1ピクセル読み出して同期する
      p.ctx.getImageData(0, 0, 1, 1);
      ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    const q = (x: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * x))];
    return { preset: name, frames, mean: ms.reduce((s, v) => s + v, 0) / ms.length, p50: q(0.5), p95: q(0.95), max: ms[ms.length - 1] };
  },
};

declare global {
  interface Window {
    mt: typeof api;
  }
}
window.mt = api;
document.title = 'harness ready';
