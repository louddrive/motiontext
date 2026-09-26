// 背景に重ねる色レイヤー（MV の上・歌詞の下）の濃さを時刻ごとに求める（純関数）
import type { Backdrop } from '../director/types';
import { hexToRgb } from '../themes/color';
import { clamp01, easeInOutCubic } from './easing';

/** 「歌詞の表示中だけ」で、表示の前後に明暗を切り替える秒数 */
export const BACKDROP_FADE_SEC = 0.4;
/** 字幕の間がこれ未満ならつなげて暗いままにする（ちらつき防止） */
export const BACKDROP_MERGE_GAP_SEC = 1.0;
/** 濃さの上限 */
export const MAX_BACKDROP_OPACITY = 0.8;

export interface Interval {
  start: number;
  end: number;
}

/** 字幕の表示区間をまとめる（重なり・短い間はつなげる） */
export function backdropIntervals(items: { start: number; end: number }[], mergeGap = BACKDROP_MERGE_GAP_SEC): Interval[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.start - last.end < mergeGap) last.end = Math.max(last.end, it.end);
    else out.push({ start: it.start, end: it.end });
  }
  return out;
}

/** 時刻 t の色レイヤーの不透明度（0..opacity） */
export function backdropAlpha(backdrop: Backdrop, intervals: Interval[], t: number): number {
  const opacity = Math.min(MAX_BACKDROP_OPACITY, Math.max(0, backdrop.opacity));
  if (opacity === 0) return 0;
  if (backdrop.mode === 'always') return opacity;
  let level = 0;
  for (const iv of intervals) {
    if (t < iv.start - BACKDROP_FADE_SEC) break; // 以降の区間はもっと後
    if (t > iv.end + BACKDROP_FADE_SEC) continue;
    const fadeIn = clamp01((t - (iv.start - BACKDROP_FADE_SEC)) / BACKDROP_FADE_SEC);
    const fadeOut = clamp01((iv.end + BACKDROP_FADE_SEC - t) / BACKDROP_FADE_SEC);
    level = Math.max(level, easeInOutCubic(Math.min(fadeIn, fadeOut)));
  }
  return opacity * level;
}

/** #RRGGBB と不透明度から Canvas の fillStyle を作る */
export function backdropFill(color: string, alpha: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r},${g},${b},${Math.round(alpha * 1000) / 1000})`;
}
