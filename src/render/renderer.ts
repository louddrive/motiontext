import { drawDeco, drawParticles } from '../animations/deco';
import type { GlyphStyle } from '../animations/draw';
import { ANIMATIONS } from '../animations/registry';
import type { Timeline } from '../director/types';
import { backdropAlpha, backdropFill, backdropIntervals, type Interval } from './backdrop';
import { outlineColor } from '../themes/color';
import { cameraAt } from './camera';
import { blurSampleTimes, shakeOffset, shineBand } from './fx';
import { computeVerticalLayout } from './verticalLayout';
import { computeLayout, type Ctx2D, type ItemLayout } from './layout';

export const BACKGROUND_COLORS = { black: '#000000', green: '#00FF00' } as const;

export type Layouts = Map<number, ItemLayout>;

/** 全アイテムのレイアウトを事前計算する。フォントのロード完了後に呼ぶこと */
export function buildLayouts(ctx: Ctx2D, timeline: Timeline): Layouts {
  const map: Layouts = new Map();
  for (const item of timeline.items) {
    const layout = item.vertical
      ? computeVerticalLayout(item, timeline.width, timeline.height)
      : computeLayout(ctx, item, timeline.width, timeline.height);
    map.set(item.id, layout);
  }
  return map;
}

// 色レイヤーの区間はタイムラインごとに1回だけ計算する
const intervalCache = new WeakMap<Timeline, Interval[]>();
function intervalsOf(timeline: Timeline): Interval[] {
  let iv = intervalCache.get(timeline);
  if (!iv) intervalCache.set(timeline, (iv = backdropIntervals(timeline.items)));
  return iv;
}

/** 時刻 t の色レイヤーの不透明度（書き出し側でフレームの使い回し判定にも使う） */
export function backdropAlphaAt(timeline: Timeline, t: number): number {
  return backdropAlpha(timeline.backdrop, intervalsOf(timeline), t);
}

export interface RenderOptions {
  /** 背景を塗らず透明にする（プレビューで MV に重ねる場合・PNG 連番） */
  transparent?: boolean;
  /** 既に描いてある内容（合成時の MV フレーム）を消さずに、その上へ歌詞だけを重ねる */
  overlay?: boolean;
  /** 背景の色レイヤーを歌詞の下に塗る（合成・PNG 連番・それらのプレビュー） */
  backdrop?: boolean;
  /** モーションブラーのサンプル数の上限（プレビューの再生中に軽くするため）。省略時はタイムラインの値 */
  blurSamples?: number;
}

interface BlurScratch {
  work: OffscreenCanvas;
  workCtx: OffscreenCanvasRenderingContext2D;
  acc: OffscreenCanvas;
  accCtx: OffscreenCanvasRenderingContext2D;
}

// モーションブラー用の作業キャンバス。描画先ごとに1組だけ作って使い回す
const blurScratch = new WeakMap<object, BlurScratch>();
function scratchFor(ctx: Ctx2D, width: number, height: number): BlurScratch {
  let s = blurScratch.get(ctx);
  if (!s || s.work.width !== width || s.work.height !== height) {
    const work = new OffscreenCanvas(width, height);
    const acc = new OffscreenCanvas(width, height);
    // 蓄積用は、対応ブラウザでは半精度浮動小数にする（1/n ずつ足したときに、薄いグローが段々に量子化されないように）
    s = { work, workCtx: work.getContext('2d')!, acc, accCtx: acc.getContext('2d', { colorType: 'float16' })! };
    blurScratch.set(ctx, s);
  }
  return s;
}

const hasActiveItem = (timeline: Timeline, from: number, to: number) =>
  timeline.items.some((item) => item.start <= to && item.end > from);

/** 時刻 t のフレームに歌詞の層が写るか（モーションブラーで残る直前の字幕も含む） */
export function lyricsVisibleAt(timeline: Timeline, t: number): boolean {
  const { shutter, samples } = timeline.motionBlur;
  return hasActiveItem(timeline, samples > 1 ? t - shutter / timeline.fps : t, t);
}

/** 時刻 t(秒) のフレームを描く純関数（同じ入力なら同じ出力） */
export function renderFrame(ctx: Ctx2D, timeline: Timeline, layouts: Layouts, t: number, opts: RenderOptions = {}): void {
  const { width, height } = timeline;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (opts.overlay) {
    // 背景はそのまま
  } else if (opts.transparent) ctx.clearRect(0, 0, width, height);
  else {
    ctx.fillStyle = BACKGROUND_COLORS[timeline.background];
    ctx.fillRect(0, 0, width, height);
  }
  if (opts.backdrop) {
    const alpha = backdropAlphaAt(timeline, t);
    if (alpha > 0) {
      ctx.fillStyle = backdropFill(timeline.backdrop.color, alpha);
      ctx.fillRect(0, 0, width, height);
    }
  }
  const blur = timeline.motionBlur;
  const samples = Math.min(blur.samples, opts.blurSamples ?? blur.samples);
  const times = blurSampleTimes(t, timeline.fps, blur.shutter, samples);
  if (times.length === 1) drawLyrics(ctx, timeline, layouts, t);
  else if (hasActiveItem(timeline, times[times.length - 1], t)) {
    // 歌詞の層だけを、シャッターが開いている間の複数時刻で描いて平均する（背景・色レイヤーはブレさせない）。
    // lighter で 1/n ずつ足すと、色もアルファも平均されるので PNG 連番の透過にも正しく効く
    const { work, workCtx, acc, accCtx } = scratchFor(ctx, width, height);
    accCtx.setTransform(1, 0, 0, 1, 0, 0);
    accCtx.clearRect(0, 0, width, height);
    accCtx.globalCompositeOperation = 'lighter';
    accCtx.globalAlpha = 1 / times.length;
    for (const st of times) {
      workCtx.setTransform(1, 0, 0, 1, 0, 0);
      workCtx.clearRect(0, 0, width, height);
      drawLyrics(workCtx, timeline, layouts, st);
      accCtx.drawImage(work, 0, 0);
    }
    accCtx.globalCompositeOperation = 'source-over';
    accCtx.globalAlpha = 1;
    ctx.drawImage(acc, 0, 0);
  }
  ctx.restore();
}

/** 時刻 t の歌詞の層（装飾・光の粒・文字）を描く */
function drawLyrics(ctx: Ctx2D, timeline: Timeline, layouts: Layouts, t: number): void {
  const { width, height } = timeline;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const shake = shakeOffset(timeline.shakes, t, width, height);
  if (shake.x || shake.y) ctx.translate(shake.x, shake.y);

  for (const item of timeline.items) {
    if (t < item.start || t >= item.end) continue;
    const layout = layouts.get(item.id);
    if (!layout) continue;
    const dur = item.end - item.start;
    const lt = t - item.start;
    const inDur = Math.min(dur * 0.45, 0.7 - 0.3 * item.energy);
    const outDur = Math.min(0.3, dur * 0.2);
    const outP = outDur > 0 ? Math.max(0, (lt - (dur - outDur)) / outDur) : 0;

    ctx.save();
    ctx.font = layout.font;
    ctx.fillStyle = item.color;
    if (timeline.glow > 0) {
      ctx.shadowColor = item.color;
      ctx.shadowBlur = timeline.glow * (item.emphasis ? 1.4 : 1);
    }
    const cam = item.camera ? cameraAt(item.camera, lt, dur, width, height) : null;
    const gs: GlyphStyle = {
      cam,
      outline: timeline.outline ? outlineColor(item.color) : null,
      shadow: timeline.shadow,
      shine: item.shine ? shineBand(layout.bbox, layout.vertical, lt, inDur, dur) : null,
    };
    drawParticles(ctx, item, layout, lt, outP, cam);
    drawDeco(ctx, item, layout, lt, outP, cam);
    ANIMATIONS[item.animation]({ ctx, item, layout, t: lt, dur, inDur, outDur, outP, gs, bg: timeline.background });
    ctx.restore();
  }
  ctx.restore();
}
