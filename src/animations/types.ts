import type { TimelineItem } from '../director/types';
import type { BackgroundMode } from '../themes/types';
import type { GlyphStyle } from './draw';
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
  'glitch',
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
  /** 文字の描画設定（疑似3Dカメラ・縁取り・影・シャイン） */
  gs: GlyphStyle;
  /** 出力の背景（グリッチの色選びに使う） */
  bg: BackgroundMode;
}

export type AnimationFn = (a: AnimContext) => void;
