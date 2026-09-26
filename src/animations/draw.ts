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

/** シャインの光の帯（キャンバス座標）。(x, y) が帯の中心、(ux, uy) が帯を横切る向きの単位ベクトル */
export interface ShineBand {
  x: number;
  y: number;
  ux: number;
  uy: number;
  halfWidth: number;
}

/** 字幕ごとの文字の描画設定 */
export interface GlyphStyle {
  /** 疑似3Dカメラ（null なら平面のまま） */
  cam: Camera | null;
  /** 縁取りの色（null なら縁取りなし） */
  outline: string | null;
  /** ドロップシャドウ */
  shadow: boolean;
  /** シャインの光の帯（null なら無し） */
  shine: ShineBand | null;
}

export const PLAIN_STYLE: GlyphStyle = { cam: null, outline: null, shadow: false, shine: null };

/** 縁取りの線の太さ（塗りの下に描くので、見えるのはこの約半分） */
export const outlineWidth = (size: number) => Math.max(1.5, size * 0.035);

const SHADOW_FILL = 'rgba(0,0,0,0.5)';

/**
 * 1文字を変形付きで描く（中心を基準に変形し、ベースラインに下揃えで描画）。
 * 描く順番は 影 → 縁取り → 塗り → シャイン。fillStyle / グローの影は呼び出し側で設定済みの前提。
 */
export function drawGlyph(ctx: Ctx2D, g: GlyphBox, gs: GlyphStyle, xf: GlyphXf = {}): void {
  const alpha = xf.alpha ?? 1;
  if (alpha <= 0.001) return;
  const scale = xf.scale ?? 1;
  if (scale <= 0.001) return;
  const x = g.cx + (xf.dx ?? 0);
  const y = g.y + (xf.dy ?? 0);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  if (gs.cam) applyCameraAt(ctx, gs.cam, x, y);
  ctx.translate(x, y);
  const rot = (xf.rot ?? 0) + (g.rot ?? 0);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.font = g.font;

  if (gs.shadow || gs.outline || gs.shine) {
    const fill = ctx.fillStyle;
    const glowColor = ctx.shadowColor;
    const glowBlur = ctx.shadowBlur;
    if (gs.shadow) {
      ctx.fillStyle = SHADOW_FILL;
      ctx.shadowColor = SHADOW_FILL;
      ctx.shadowBlur = g.size * 0.08;
      ctx.fillText(g.ch, g.size * 0.04, g.baseOff + g.size * 0.06);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    if (gs.outline) {
      ctx.strokeStyle = gs.outline;
      ctx.lineWidth = outlineWidth(g.size) * 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(g.ch, 0, g.baseOff);
    }
    ctx.fillStyle = fill;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillText(g.ch, 0, g.baseOff);
    if (gs.shine) {
      // 帯はキャンバス座標で決まっているので、文字のローカル座標へ移して（回転は無視した近似）グラデーションを作る
      const b = gs.shine;
      const cx = (b.x - x) / scale;
      const cy = (b.y - y) / scale;
      const hw = b.halfWidth / scale;
      const grad = ctx.createLinearGradient(cx - b.ux * hw, cy - b.uy * hw, cx + b.ux * hw, cy + b.uy * hw);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillStyle = grad;
      ctx.fillText(g.ch, 0, g.baseOff);
    }
  } else {
    ctx.fillText(g.ch, 0, g.baseOff);
  }
  ctx.restore();
}

/** アイテムの seed とグリフ番号から決定的な乱数を得る */
export function glyphRand(seed: number, index: number): () => number {
  return mulberry32(hashString(`${seed}#${index}`));
}
