import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { direct } from '../src/director/director';
import type { Cue } from '../src/parsers/types';
import { defaultTheme } from '../src/themes/default';
import { EFFECT_LEVELS, applyEffectLevel, type EffectLevel } from '../src/themes/effectLevel';

// サビ（繰り返し）を含む 40 行の字幕
const cues: Cue[] = Array.from({ length: 40 }, (_, i) => ({
  index: i,
  start: i * 3 + (i % 8 === 0 ? 3 : 0),
  end: i * 3 + 2.6,
  text: i % 4 < 2 ? `光を掴め${i % 2}` : `歌詞の行${i}`,
}));
const features = analyze(cues);
const run = (level: EffectLevel, seed = 3) =>
  direct(features, {
    theme: applyEffectLevel(defaultTheme, level),
    seed,
    fontIds: ['noto-sans-jp', 'dela-gothic-one'],
    background: 'black',
  });

describe('演出レベル', () => {
  it('演出なし: 動きのないフェードのみ、カメラ・装飾・グローなし', () => {
    const t = run('none');
    expect(t.items.every((i) => i.animation === 'fade')).toBe(true);
    expect(t.items.every((i) => i.camera === null && i.deco === 'none')).toBe(true);
    expect(t.glow).toBe(0);
  });

  it('標準はテーマそのまま', () => {
    expect(applyEffectLevel(defaultTheme, 'standard')).toBe(defaultTheme);
  });

  it('レベルが上がるほどカメラワークと装飾が増え、グローが強くなる（単調増加）', () => {
    const levels = Object.keys(EFFECT_LEVELS) as EffectLevel[];
    const stats = levels.map((l) => {
      const t = run(l);
      return {
        camera: t.items.filter((i) => i.camera).length,
        deco: t.items.filter((i) => i.deco !== 'none').length,
        glow: t.glow,
      };
    });
    for (let i = 1; i < stats.length; i++) {
      expect(stats[i].camera).toBeGreaterThanOrEqual(stats[i - 1].camera);
      expect(stats[i].deco).toBeGreaterThanOrEqual(stats[i - 1].deco);
      expect(stats[i].glow).toBeGreaterThan(stats[i - 1].glow);
    }
    expect(stats[4].camera).toBeGreaterThan(stats[1].camera);
  });

  it('エモ系レベルでは残響(echo)演出が使われる', () => {
    expect(run('emo').items.some((i) => i.animation === 'echo')).toBe(true);
    expect(run('ultra').items.some((i) => i.animation === 'echo')).toBe(true);
    expect(run('subtle').items.some((i) => i.animation === 'echo')).toBe(false);
  });

  it('どのレベルでも決定的', () => {
    for (const l of Object.keys(EFFECT_LEVELS) as EffectLevel[]) expect(run(l, 8)).toEqual(run(l, 8));
  });
});
