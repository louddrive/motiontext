import { drawDeco } from '../animations/deco';
import { ANIMATIONS } from '../animations/registry';
import type { Timeline } from '../director/types';
import { cameraAt } from './camera';
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

export interface RenderOptions {
  /** 背景を塗らず透明にする（プレビューで MV に重ねる場合・PNG 連番） */
  transparent?: boolean;
  /** 既に描いてある内容（合成時の MV フレーム）を消さずに、その上へ歌詞だけを重ねる */
  overlay?: boolean;
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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

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
    drawDeco(ctx, item, layout, lt, outP, cam);
    ANIMATIONS[item.animation]({ ctx, item, layout, t: lt, dur, inDur, outDur, outP, cam });
    ctx.restore();
  }
  ctx.restore();
}
