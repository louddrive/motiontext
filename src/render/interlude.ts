// 長い間奏の進み具合の表示（画面下部の細い横線／画面中央の円）。次の歌詞の開始でちょうど 100% になる
import type { Interlude, Timeline } from '../director/types';
import type { Ctx2D } from './layout';
import { easeOutCubic, progress } from './easing';

/** 表示を始めるときのフェードインの秒数 */
export const INTERLUDE_FADE_SEC = 0.3;
/** 進み具合を塗る前の下地の濃さ */
const TRACK_ALPHA = 0.2;

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

/** 時刻 t の間奏の進み具合を描く */
export function drawInterlude(ctx: Ctx2D, timeline: Timeline, t: number): void {
  const state = interludeAt(timeline.interludes, t);
  if (!state || state.alpha <= 0) return;
  const { interlude, p, alpha } = state;
  const { width, height } = timeline;
  const res = Math.min(width, height) / 1080;

  ctx.save();
  ctx.strokeStyle = interlude.color;
  ctx.lineCap = 'round';
  if (timeline.glow > 0) {
    ctx.shadowColor = interlude.color;
    ctx.shadowBlur = timeline.glow;
  }

  if (interlude.style === 'bar') {
    // 縦型は Shorts / Reels の下部 UI を避けて少し上に置く
    const y = height * (height > width ? 0.76 : 0.88);
    const w = width * 0.6;
    const x0 = (width - w) / 2;
    ctx.lineWidth = 6 * res;
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
  }
  ctx.restore();
}
