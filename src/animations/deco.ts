import type { TimelineItem } from '../director/types';
import { applyCameraAt, type Camera } from '../render/camera';
import { easeInCubic, easeOutExpo, progress } from '../render/easing';
import type { Ctx2D, ItemLayout } from '../render/layout';
import { glyphRand } from './draw';

/** 斜めラインの乱数に使うキー（グリフ番号と衝突しない値） */
const LINES_RAND_KEY = -1;

/** セクション頭の波紋、サビの斜めラインの装飾（文字より背面に描く） */
export function drawDeco(
  ctx: Ctx2D,
  item: TimelineItem,
  layout: ItemLayout,
  t: number,
  outP: number,
  cam: Camera | null,
): void {
  if (item.deco === 'none') return;
  ctx.save();
  ctx.strokeStyle = item.color;

  if (item.deco === 'ring') {
    const { bbox } = layout;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    // 装飾は文字ブロック中心での遠近変形で近似する
    if (cam) applyCameraAt(ctx, cam, cx, cy);
    const p = progress(t, 0, 0.9);
    if (p < 1) {
      const e = easeOutExpo(p);
      ctx.lineCap = 'round';
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(bbox.w, bbox.h) * 0.25 + bbox.w * 0.45 * e, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (item.deco === 'lines') {
    drawDiagonalLines(ctx, item, t, outP, cam);
  }
  ctx.restore();
}

/**
 * 画面いっぱいの斜めライン（1〜3本、平行）。端から端へ時間差で引かれ、退場時は後ろから消える。
 * 本数・角度・位置・太さは item.seed から決定的に決める。
 */
function drawDiagonalLines(ctx: Ctx2D, item: TimelineItem, t: number, outP: number, cam: Camera | null): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  if (cam) applyCameraAt(ctx, cam, cx, cy);

  const rand = glyphRand(item.seed, LINES_RAND_KEY);
  const count = 1 + Math.floor(rand() * 3);
  const angle = ((15 + rand() * 20) * Math.PI) / 180 * (rand() < 0.5 ? 1 : -1);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // カメラで拡大・回転しても画面端まで届くよう、対角線の長さの倍で引く
  const reach = Math.hypot(W, H);
  const o = easeInCubic(outP);
  ctx.lineCap = 'butt';

  for (let i = 0; i < count; i++) {
    const offset = (rand() - 0.5) * H * 0.9; // 画面中心からの垂直方向のずれ
    const delay = i * 0.08 + rand() * 0.1;
    const width = 2 + rand() * 6 * (0.5 + item.energy);
    const alpha = 0.45 + rand() * 0.4;
    const reverse = rand() < 0.5; // 引く向き
    const p = easeOutExpo(progress(t, delay, 0.5));
    if (p <= 0 || o >= 1) continue;
    // 線の始点と終点（線分全体）
    const bx = cx - dy * offset;
    const by = cy + dx * offset;
    const sx = bx - dx * reach * (reverse ? -1 : 1);
    const sy = by - dy * reach * (reverse ? -1 : 1);
    const ex = bx + dx * reach * (reverse ? -1 : 1);
    const ey = by + dy * reach * (reverse ? -1 : 1);
    // 登場: 始点から伸びる / 退場: 始点側から縮む
    const head = p;
    const tail = o;
    if (tail >= head) continue;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sx + (ex - sx) * tail, sy + (ey - sy) * tail);
    ctx.lineTo(sx + (ex - sx) * head, sy + (ey - sy) * head);
    ctx.stroke();
  }
}
