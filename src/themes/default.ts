import type { Theme } from './types';

export const defaultTheme: Theme = {
  id: 'default',
  name: 'Standard',
  energy: 0.6,
  palette: {
    text: ['#FFFFFF', '#F4F1EA', '#EAF2FF'],
    accent: ['#FFD166', '#FF6FA8', '#8EC5FF', '#FFFFFF', '#FF9F5A'],
  },
  animations: {
    normal: { fadeUp: 3, slideMask: 3, phraseStack: 2, scatter: 2, charPop: 1, bandWipe: 3, slot: 1, split: 1 },
    fast: { scaleBurst: 3, fadeUp: 2, slideMask: 2, slot: 2, bandWipe: 1 },
    slow: { typewriter: 3, phraseStack: 2, scatter: 2 },
    chorus: { scaleBurst: 3, charPop: 3, wave: 2, phraseStack: 1, split: 2, bandWipe: 2 },
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
    moves: { pushIn: 3, orbit: 3, drift: 2, pullOut: 1, swing: 1 },
  },
  glow: 18,
  motionBlur: { shutter: 0.5, samples: 4 },
  fx: { shake: 0.4, shineRate: 0.5, particleRate: 0.3, interludeRate: 0.5, underlineRate: 0.25, pulse: 0.02 },
};
