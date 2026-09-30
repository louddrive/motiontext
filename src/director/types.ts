import type { EmphasisRange } from '../analysis/strokes';
import type { AnimationId } from '../animations/types';
import type { CameraMove } from '../render/camera';
import type { BackgroundMode } from '../themes/types';

export type Anchor = 'center' | 'lower' | 'upper';
/** 装飾: ring = セクション頭の波紋 / lines = 画面いっぱいの斜めライン */
export type Deco = 'none' | 'ring' | 'lines';
export type Side = 'center' | 'left' | 'right';

export interface MixedLayout {
  /** 縦書きにする行（0 or 1） */
  verticalLine: 0 | 1;
  /** L = 縦の列を左に置き、その下端から横書きが右へ続く / reverseL = 縦の列を右に置き、横書きをその左下に置く */
  shape: 'L' | 'reverseL';
}

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
  /** 縦横混在（lines の2行のうち1行を縦書き、もう1行を横書きで組む）。null は混在なし */
  mixed: MixedLayout | null;
  color: string;
  anchor: Anchor;
  align: 'center' | 'left';
  emphasis: boolean;
  deco: Deco;
  /** シャイン（光のスイープ）を付けるか */
  shine: boolean;
  /** 光の粒を付けるか */
  particles: boolean;
  /** 行ごとの線（横書きは下線、縦書きは列の右側の線）を登場に合わせて引くか */
  underline: boolean;
  seed: number;
  energy: number;
  /** 曲の拍に合わせた演出（曲を読み込んで拍に合わせるときだけ。無ければ字幕だけの演出） */
  sync?: ItemSync;
}

/** 字幕ごとの、曲の拍に合わせた演出 */
export interface ItemSync {
  /** 登場を完了させる秒数（字幕の開始から次の拍まで）。null なら通常の登場の秒数 */
  hit: number | null;
  /** 字幕の付近の拍の間隔（秒）。文字送りの間隔をこれの分割にそろえる */
  beat: number;
  /** 拍の脈動の強さ（拡大率。0 なら弾まない） */
  pulse: number;
  /** 何拍に1回弾ませるか（1 で毎拍、2 で小節の1・3拍目） */
  pulseEvery: number;
}

/** 描画で使う曲のリズム（拍の脈動・間奏の音量表示） */
export interface TimelineRhythm {
  beats: number[];
  downbeats: number[];
  /** 音量の変化（0..1、rate 回/秒）。間奏に音量の波形を出すときだけ */
  energy?: { rate: number; values: number[] };
  /** 間奏の音量の波形の山の高さの倍率（energy と一緒に持つ） */
  meter?: number;
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
  /** モーションブラー（samples が 1 なら無効） */
  motionBlur: MotionBlur;
  /** 文字の縁取り（色は字幕ごとの文字色から自動で決める） */
  outline: boolean;
  /** 文字のドロップシャドウ */
  shadow: boolean;
  /** カメラシェイクの開始時刻と強さ（時刻順） */
  shakes: Shake[];
  /** 歌詞のない長い間奏（時刻順）。次の歌詞までの進み具合を表示する */
  interludes: Interlude[];
  items: TimelineItem[];
  /** 曲のリズム（拍に合わせるときだけ） */
  rhythm?: TimelineRhythm;
}

export interface MotionBlur {
  /** フレーム間隔に対するシャッターの開き 0..1 */
  shutter: number;
  /** 1フレームの描き重ね数 */
  samples: number;
}

export const NO_MOTION_BLUR: MotionBlur = { shutter: 0, samples: 1 };

export interface Shake {
  time: number;
  strength: number;
}

/** 字幕の間がこの秒数以上あれば、間奏として進み具合を表示する */
export const INTERLUDE_MIN_GAP_SEC = 5;

export interface Interlude {
  start: number;
  /** 次の歌詞の開始時刻（ここで進み具合がちょうど 100% になる） */
  end: number;
  /** bar = 画面下部の細い横線 / ring = 画面中央の円 */
  style: 'bar' | 'ring';
  /** 次の歌詞の文字色 */
  color: string;
  /** パーセンテージの書体（次の歌詞の書体の最も太いウェイト） */
  fontId: string;
  weight: number;
}
