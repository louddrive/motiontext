import type { EmphasisRange } from '../analysis/strokes';
import type { AnimationId } from '../animations/types';
import type { CameraMove } from '../render/camera';
import type { BackgroundMode } from '../themes/types';

export type Anchor = 'center' | 'lower' | 'upper';
/** 装飾: ring = セクション頭の波紋 / lines = 画面いっぱいの斜めライン */
export type Deco = 'none' | 'ring' | 'lines';
export type Side = 'center' | 'left' | 'right';

export interface TimelineItem {
  id: number;
  start: number;
  end: number;
  /** 行ごとのフレーズ */
  lines: string[][];
  animation: AnimationId;
  fontId: string;
  weight: number;
  fontSize: number;
  /** ひらがなのサイズ倍率（漢字 = 1）。1 で文字種による強弱なし */
  kanaRatio: number;
  /** 行ごとの強調範囲（画数の多い漢字語）。null は強調なし */
  emphasisRanges: (EmphasisRange | null)[];
  /** 強調範囲の文字の追加倍率 */
  emphasisScale: number;
  /** true: fontSize を上限に、画面いっぱいに収まる最大サイズで組む */
  fit: boolean;
  /** 疑似3Dカメラの動き（null は平面のまま） */
  camera: CameraMove | null;
  /** 縦書き（日本語の行のみ） */
  vertical: boolean;
  /** 縦書きの横方向の配置（横書きは常に center） */
  side: Side;
  color: string;
  anchor: Anchor;
  align: 'center' | 'left';
  emphasis: boolean;
  deco: Deco;
  seed: number;
  energy: number;
}

/**
 * 基本の文字サイズ（5段階）。scale は M を 1 とした倍率、xl は歌詞を画面いっぱいに表示する。
 * camera は疑似3Dカメラの動きの倍率（文字が大きいほど画面からはみ出しやすいので控えめにする）
 */
export const SIZE_LEVELS = {
  xs: { scale: 0.55, fit: false, camera: 1 },
  s: { scale: 0.72, fit: false, camera: 1 },
  m: { scale: 1, fit: false, camera: 1 },
  l: { scale: 1.5, fit: false, camera: 0.75 },
  xl: { scale: 1, fit: true, camera: 0.5 },
} as const;

export type SizeLevel = keyof typeof SIZE_LEVELS;

/** 縦書きの使い方（表示名は画面側で翻訳キー vertical.<値> から引く） */
export const VERTICAL_MODES = ['auto', 'off', 'always'] as const;

export type VerticalMode = (typeof VERTICAL_MODES)[number];

/** 出力の画面比率 */
export const ASPECTS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;

export type Aspect = keyof typeof ASPECTS;

/** fit モードで組むときの開始サイズ（ここから画面に収まるまで縮める） */
export const FIT_MAX_FONT_SIZE = 420;

/** 背景（MV）の上・歌詞の下に重ねる半透明の色レイヤー。合成と PNG 連番で使う */
export interface Backdrop {
  /** 不透明度 0..0.8。0 なら無効 */
  opacity: number;
  /** always: 常に / lyrics: 歌詞の表示中だけ（前後はふわっと切り替え） */
  mode: 'always' | 'lyrics';
  /** #RRGGBB */
  color: string;
}

export const NO_BACKDROP: Backdrop = { opacity: 0, mode: 'lyrics', color: '#000000' };

export interface Timeline {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: BackgroundMode;
  glow: number;
  backdrop: Backdrop;
  items: TimelineItem[];
}
