import type { Theme } from './types';

export const defaultTheme: Theme = {
  id: 'default',
  name: 'スタンダード',
  energy: 0.6,
  palette: {
    text: ['#FFFFFF', '#F4F1EA', '#EAF2FF'],
    accent: ['#FFD166', '#FF6FA8', '#8EC5FF', '#FFFFFF', '#FF9F5A'],
  },
  animations: {
    normal: { fadeUp: 3, slideMask: 3, phraseStack: 2, scatter: 2, charPop: 1 },
    fast: { scaleBurst: 3, fadeUp: 2, slideMask: 2 },
    slow: { typewriter: 3, phraseStack: 2, scatter: 2 },
    chorus: { scaleBurst: 3, charPop: 3, wave: 2, phraseStack: 1 },
  },
  baseFontSize: 88,
  chorusScale: 1.25,
  kanaRatio: 0.7,
  strokeEmphasis: true,
  emphasisScale: 1.3,
  verticalRate: 0.3,
  camera: {
    probability: 0.7,
    intensity: 1,
    moves: { pushIn: 3, orbit: 3, drift: 2, tiltUp: 2, pullOut: 1, swing: 1 },
  },
  glow: 18,
};
