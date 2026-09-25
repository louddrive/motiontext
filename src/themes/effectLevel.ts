import type { Theme } from './types';

// 演出レベル: テーマの「動きに関するパラメータ」をまとめて上書きするプリセット。
// 英語圏向け（演出控えめ・可読性重視）〜日本向け（エモい演出）を1つの軸で切り替える。
// 文字サイズ・漢字とかなの強弱・色・フォントはスタイル側の設定で、ここでは変えない。

export const EFFECT_LEVELS = {
  none: { label: '演出なし（可読性重視）' },
  subtle: { label: '控えめ' },
  standard: { label: '標準' },
  emo: { label: 'エモい' },
  ultra: { label: '超エモ' },
} as const;

export type EffectLevel = keyof typeof EFFECT_LEVELS;

export function applyEffectLevel(theme: Theme, level: EffectLevel): Theme {
  switch (level) {
    case 'none':
      return {
        ...theme,
        energy: 0,
        animations: { normal: { fade: 1 }, fast: { fade: 1 }, slow: { fade: 1 }, chorus: { fade: 1 } },
        camera: { ...theme.camera, probability: 0 },
        glow: 0,
        chorusScale: 1.1,
        verticalRate: 0,
      };
    case 'subtle':
      return {
        ...theme,
        energy: 0.3,
        animations: {
          normal: { fade: 2, fadeUp: 3, slideMask: 2 },
          fast: { fade: 3, fadeUp: 1 },
          slow: { fadeUp: 2, slideMask: 2, typewriter: 1 },
          chorus: { fadeUp: 2, slideMask: 2, charPop: 1 },
        },
        camera: { probability: 0.25, intensity: 0.5, moves: { pushIn: 3, drift: 2 } },
        glow: 8,
        chorusScale: 1.15,
        verticalRate: 0.15,
      };
    case 'standard':
      return theme;
    case 'emo':
      return {
        ...theme,
        energy: 0.8,
        animations: {
          normal: { scatter: 3, phraseStack: 3, echo: 2, slideMask: 2, fadeUp: 1, typewriter: 1 },
          fast: { scaleBurst: 3, echo: 1, fadeUp: 1 },
          slow: { typewriter: 3, echo: 2, scatter: 2 },
          chorus: { echo: 3, charPop: 2, wave: 2, scaleBurst: 2 },
        },
        camera: { probability: 0.9, intensity: 1.15, moves: { orbit: 3, pushIn: 3, tiltUp: 2, drift: 2, pullOut: 1, swing: 1 } },
        glow: 26,
        chorusScale: 1.3,
        verticalRate: 0.45,
      };
    case 'ultra':
      return {
        ...theme,
        energy: 1,
        animations: {
          normal: { echo: 3, scatter: 3, phraseStack: 2, typewriter: 1, slideMask: 1 },
          fast: { scaleBurst: 3, echo: 2 },
          slow: { echo: 3, typewriter: 2, scatter: 2 },
          chorus: { echo: 3, scaleBurst: 2, wave: 2, charPop: 2 },
        },
        camera: { probability: 1, intensity: 1.4, moves: { orbit: 4, tiltUp: 3, pushIn: 2, swing: 2, drift: 1, pullOut: 1 } },
        glow: 34,
        chorusScale: 1.4,
        verticalRate: 0.55,
      };
  }
}
