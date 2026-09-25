import type { AnimationId } from '../animations/types';
import type { CameraMoveType } from '../render/camera';

export type BackgroundMode = 'black' | 'green';

export type WeightedList<T extends string> = Partial<Record<T, number>>;

/**
 * テーマ = 演出ルールのパラメータ集合。
 * 将来的に UI から energy / palette / アニメーション重み等を差し替えることで方向性を指定できるようにする。
 */
export interface Theme {
  id: string;
  name: string;
  /** 0..1 演出の激しさ（動きの量・速さ・装飾頻度に効く） */
  energy: number;
  palette: {
    /** 通常行の文字色候補 */
    text: string[];
    /** サビ・強調行の色候補 */
    accent: string[];
  };
  animations: {
    normal: WeightedList<AnimationId>;
    fast: WeightedList<AnimationId>;
    slow: WeightedList<AnimationId>;
    chorus: WeightedList<AnimationId>;
  };
  /** 基準文字サイズ(px, 1080p時) */
  baseFontSize: number;
  chorusScale: number;
  /** ひらがなのサイズ倍率（漢字 = 1）。小さいほど漢字とかなの強弱が強い */
  kanaRatio: number;
  /** 画数の多い漢字語を強調するか */
  strokeEmphasis: boolean;
  /** 強調する漢字語の追加倍率 */
  emphasisScale: number;
  /** 縦書きにするセクションの割合（日本語の行のみ対象） */
  verticalRate: number;
  /** 疑似3Dカメラワーク */
  camera: {
    /** 字幕ごとにカメラワークを付ける確率の基準（energy と合わせて使う） */
    probability: number;
    /** 動きの大きさの基準 */
    intensity: number;
    moves: WeightedList<CameraMoveType>;
  };
  /** 文字のグロー（黒背景モードのみ有効） */
  glow: number;
}
