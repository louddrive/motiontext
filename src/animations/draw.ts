import { hashString, mulberry32 } from '../director/rng';
import { applyCameraAt, type Camera } from '../render/camera';
import type { Ctx2D, GlyphBox } from '../render/layout';

export interface GlyphXf {
  dx?: number;
  dy?: number;
  scale?: number;
  rot?: number;
  alpha?: number;
}

/**
 * 1文字を変形付きで描く（中心を基準に変形し、ベースラインに下揃えで描画）。
 * cam があれば、その位置での遠近変形を合成する。fillStyle / 影は呼び出し側で設定済みの前提。
 */
export function drawGlyph(ctx: Ctx2D, g: GlyphBox, cam: Camera | null, xf: GlyphXf = {}): void {
  const alpha = xf.alpha ?? 1;
  if (alpha <= 0.001) return;
  const scale = xf.scale ?? 1;
  if (scale <= 0.001) return;
  const x = g.cx + (xf.dx ?? 0);
  const y = g.y + (xf.dy ?? 0);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  if (cam) applyCameraAt(ctx, cam, x, y);
  ctx.translate(x, y);
  const rot = (xf.rot ?? 0) + (g.rot ?? 0);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.font = g.font;
  ctx.fillText(g.ch, 0, g.baseOff);
  ctx.restore();
}

/** アイテムの seed とグリフ番号から決定的な乱数を得る */
export function glyphRand(seed: number, index: number): () => number {
  return mulberry32(hashString(`${seed}#${index}`));
}
