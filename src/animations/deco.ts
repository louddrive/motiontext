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

/** 光の粒の乱数に使うキー（グリフ番号・斜めラインと衝突しない値） */
const PARTICLES_RAND_KEY = -2;

/**
 * 光の粒: 文字ブロックの周りから小さな光の粒が揺れながら舞い上がって消える（文字より背面に描く）。
 * 粒ごとに周期を持って繰り返し、位置・速さ・出現時刻は item.seed から決定的に決める。
 */
export function drawParticles(
  ctx: Ctx2D,
  item: TimelineItem,
  layout: ItemLayout,
  t: number,
  outP: number,
  cam: Camera | null,
): void {
  if (!item.particles) return;
  const { bbox } = layout;
  const res = ctx.canvas.height / 1080;
  const rand = glyphRand(item.seed, PARTICLES_RAND_KEY);
  const count = 10 + Math.floor(rand() * 15);
  const master = Math.min(1, t / 0.4) * (1 - easeInCubic(outP));
  if (master <= 0) return;
  ctx.save();
  if (cam) applyCameraAt(ctx, cam, bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  ctx.fillStyle = item.color;
  const padX = Math.max(40 * res, bbox.w * 0.1);
  for (let i = 0; i < count; i++) {
    const life = 1.2 + rand() * 1.0;
    const period = life + rand() * 0.6;
    const phase = rand() * period;
    const x0 = bbox.x - padX + rand() * (bbox.w + padX * 2);
    const y0 = bbox.y + bbox.h * (0.2 + rand() * 0.9);
    const speed = (40 + rand() * 70) * res;
    const sway = (4 + rand() * 8) * res;
    const swayPhase = rand() * Math.PI * 2;
    const radius = (2 + rand() * 3) * res;
    // 最初の周期は途中から始めず、字幕の開始後に順に出てくるようにする
    if (t < phase * 0.5) continue;
    const age = (t + phase) % period;
    if (age >= life) continue;
    const k = age / life;
    const a = Math.min(1, k / 0.15) * (k > 0.6 ? (1 - k) / 0.4 : 1);
    ctx.globalAlpha = master * a * 0.9;
    ctx.beginPath();
    ctx.arc(x0 + Math.sin(age * 2.2 + swayPhase) * sway, y0 - speed * age, radius * (1 - 0.4 * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
