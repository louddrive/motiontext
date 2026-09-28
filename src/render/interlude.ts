// 長い間奏の進み具合の表示（画面下部の横線／画面中央の円と、カウントアップするパーセンテージ）。
// 次の歌詞の開始でちょうど 100% になる
import type { Interlude, Timeline } from '../director/types';
import { cssFont } from '../fonts/catalog';
import type { Ctx2D } from './layout';
import { easeOutCubic, progress } from './easing';

/** 表示を始めるときのフェードインの秒数 */
export const INTERLUDE_FADE_SEC = 0.3;
/** 進み具合を塗る前の下地の濃さ */
const TRACK_ALPHA = 0.2;
/** パーセンテージの表示に使う文字（歌詞に含まれなくてもフォントを読み込んでおく） */
export const INTERLUDE_GLYPHS = '0123456789%';

export interface InterludeState {
  interlude: Interlude;
  /** 進み具合 0..1 */
  p: number;
  alpha: number;
}

/** 時刻 t に表示中の間奏と、その進み具合。100% に達した時刻（end）以降は表示しない */
export function interludeAt(interludes: Interlude[], t: number): InterludeState | null {
  for (const iv of interludes) {
    if (t < iv.start) break; // 以降の区間はもっと後
    if (t >= iv.end) continue;
    return {
      interlude: iv,
      p: progress(t, iv.start, iv.end - iv.start),
      alpha: easeOutCubic(progress(t, iv.start, INTERLUDE_FADE_SEC)),
    };
  }
  return null;
}

/** 表示するパーセンテージ。最後の 1% の区間で 100 になり、その直後に次の歌詞が始まる */
export const percentLabel = (p: number): number => Math.min(100, Math.max(0, Math.ceil(p * 100)));

/**
 * パーセンテージを描く。数字は1桁ずつ「0」の幅の枠に置き、カウントアップ中に左右に揺れないようにする。
 * align = left: x から右へ / center: x を中心に
 */
function drawPercent(ctx: Ctx2D, iv: Interlude, value: number, size: number, x: number, cy: number, align: 'left' | 'center'): void {
  ctx.font = cssFont(iv.fontId, iv.weight, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const digitW = ctx.measureText('0').width;
  const percentW = ctx.measureText('%').width;
  const digits = String(value);
  const total = digits.length * digitW + percentW;
  let cx = align === 'left' ? x : x - total / 2;
  for (const d of digits) {
    ctx.fillText(d, cx + digitW / 2, cy);
    cx += digitW;
  }
  ctx.fillText('%', cx + percentW / 2, cy);
}

/** 時刻 t の間奏の進み具合を描く */
export function drawInterlude(ctx: Ctx2D, timeline: Timeline, t: number): void {
  const state = interludeAt(timeline.interludes, t);
  if (!state || state.alpha <= 0) return;
  const { interlude, p, alpha } = state;
  const { width, height } = timeline;
  const res = Math.min(width, height) / 1080;

  const label = percentLabel(p);

  ctx.save();
  ctx.strokeStyle = interlude.color;
  ctx.fillStyle = interlude.color;
  ctx.lineCap = 'round';
  if (timeline.glow > 0) {
    ctx.shadowColor = interlude.color;
    ctx.shadowBlur = timeline.glow;
  }

  if (interlude.style === 'bar') {
    // 縦型は Shorts / Reels の下部 UI を避けて少し上に置く
    const y = height * (height > width ? 0.76 : 0.88);
    const w = width * 0.6;
    const lw = 28 * res;
    const labelSize = Math.round(lw * 2);
    const gap = lw;
    // 「バー＋間隔＋パーセンテージ（最大の 100%）」のまとまりを画面中央に置く
    ctx.font = cssFont(interlude.fontId, interlude.weight, labelSize);
    const labelW = ctx.measureText('0').width * 3 + ctx.measureText('%').width;
    const x0 = (width - (w + lw + gap + labelW)) / 2 + lw / 2;
    ctx.lineWidth = lw;
    ctx.globalAlpha = alpha * TRACK_ALPHA;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
    if (p > 0) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w * p, y);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    drawPercent(ctx, interlude, label, labelSize, x0 + w + lw / 2 + gap, y, 'left');
  } else {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.12;
    const top = -Math.PI / 2;
    ctx.lineWidth = 8 * res;
    ctx.globalAlpha = alpha * TRACK_ALPHA;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (p > 0) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(cx, cy, r, top, top + Math.PI * 2 * p);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    drawPercent(ctx, interlude, label, Math.round(r * 0.45), cx, cy, 'center');
  }
  ctx.restore();
}
