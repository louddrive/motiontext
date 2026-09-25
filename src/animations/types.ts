import type { TimelineItem } from '../director/types';
import type { Camera } from '../render/camera';
import type { Ctx2D, ItemLayout } from '../render/layout';

export const ANIMATION_IDS = [
  'fadeUp',
  'slideMask',
  'phraseStack',
  'scatter',
  'charPop',
  'typewriter',
  'scaleBurst',
  'wave',
  'fade',
  'echo',
] as const;

export type AnimationId = (typeof ANIMATION_IDS)[number];

export interface AnimContext {
  ctx: Ctx2D;
  item: TimelineItem;
  layout: ItemLayout;
  /** アイテム開始からの経過秒 */
  t: number;
  /** アイテムの表示秒数 */
  dur: number;
  /** 登場に使う秒数 */
  inDur: number;
  /** 退場に使う秒数（dur の末尾） */
  outDur: number;
  /** 退場の進行度 0..1 */
  outP: number;
  /** 疑似3Dカメラ（null なら平面のまま） */
  cam: Camera | null;
}

export type AnimationFn = (a: AnimContext) => void;
