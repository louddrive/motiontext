import type { Cue } from '../parsers/types';

/** タイミング調整の上限（秒） */
export const MAX_TIMING_OFFSET_SEC = 30;

/**
 * 全字幕の表示時刻を offsetSec 秒ずらす（正で遅く、負で早く）。
 * 0秒より前にはみ出した部分は切り、終了が0秒以下になった字幕は除く。index は振り直す。
 */
export function shiftCues(cues: Cue[], offsetSec: number): Cue[] {
  if (offsetSec === 0) return cues;
  return cues
    .map((c) => ({ ...c, start: Math.max(0, c.start + offsetSec), end: c.end + offsetSec }))
    .filter((c) => c.end > c.start)
    .map((c, i) => ({ ...c, index: i }));
}

/** 入力値を ±上限に丸め、0.01秒単位にそろえる */
export function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const v = Math.min(MAX_TIMING_OFFSET_SEC, Math.max(-MAX_TIMING_OFFSET_SEC, value));
  return Math.round(v * 100) / 100;
}
