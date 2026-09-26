import type { ShineBand } from '../animations/draw';
import type { Shake } from '../director/types';

/** モーションブラーのサンプル時刻（現在の時刻から過去方向へ等間隔。先頭が現在） */
export function blurSampleTimes(t: number, fps: number, shutter: number, samples: number): number[] {
  const n = Math.max(1, Math.floor(samples));
  if (n === 1 || shutter <= 0) return [t];
  const span = shutter / fps;
  return Array.from({ length: n }, (_, k) => t - (span * k) / (n - 1));
}

/** カメラシェイクが続く秒数 */
export const SHAKE_SEC = 0.45;
/** 1080p でのシェイクの最大の揺れ幅(px) */
export const SHAKE_MAX_PX = 18;

/** 時刻 t の歌詞の層の揺れ（平行移動量）。直近のシェイクから SHAKE_SEC で減衰する */
export function shakeOffset(shakes: Shake[], t: number, width: number, height: number): { x: number; y: number } {
  let s: Shake | null = null;
  for (const k of shakes) {
    if (k.time > t) break;
    s = k;
  }
  if (!s || s.strength <= 0) return { x: 0, y: 0 };
  const age = t - s.time;
  if (age >= SHAKE_SEC) return { x: 0, y: 0 };
  const decay = (1 - age / SHAKE_SEC) ** 2;
  const amp = SHAKE_MAX_PX * s.strength * (Math.min(width, height) / 1080) * decay;
  // 決定的な三角関数の組み合わせ（開始直後から大きく揺れるよう、位相を cos で始める）
  return {
    x: amp * Math.cos(age * Math.PI * 2 * 11),
    y: amp * 0.7 * Math.cos(age * Math.PI * 2 * 13 + 0.6),
  };
}

/** シャインの開始（登場の終わりからの遅れ）と、帯が横切る秒数 */
export const SHINE_DELAY_SEC = 0.1;
export const SHINE_SEC = 0.7;

/**
 * 時刻 lt（字幕の開始からの秒）のシャインの帯。横書きは左から右、縦書きは上から下へ、斜めの帯が1回横切る。
 * 横切っていない時刻は null。
 */
export function shineBand(
  bbox: { x: number; y: number; w: number; h: number },
  vertical: boolean,
  lt: number,
  inDur: number,
  dur: number,
): ShineBand | null {
  const start = inDur + SHINE_DELAY_SEC;
  if (start + SHINE_SEC > dur) return null;
  const p = (lt - start) / SHINE_SEC;
  if (p <= 0 || p >= 1) return null;
  const tilt = (20 * Math.PI) / 180;
  if (vertical) {
    const halfWidth = Math.max(bbox.w * 0.35, 30);
    return { x: bbox.x + bbox.w / 2, y: bbox.y - halfWidth + (bbox.h + halfWidth * 2) * p, ux: Math.sin(tilt), uy: Math.cos(tilt), halfWidth };
  }
  const halfWidth = Math.max(bbox.h * 0.35, 30);
  return { x: bbox.x - halfWidth + (bbox.w + halfWidth * 2) * p, y: bbox.y + bbox.h / 2, ux: Math.cos(tilt), uy: Math.sin(tilt), halfWidth };
}
