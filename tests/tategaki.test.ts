import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { canTategaki } from '../src/analysis/tategaki';
import { MAX_VERTICAL_RUN, direct } from '../src/director/director';
import type { Cue } from '../src/parsers/types';
import { defaultTheme } from '../src/themes/default';
import { applyEffectLevel } from '../src/themes/effectLevel';

describe('canTategaki', () => {
  it('日本語だけの行は縦書き可', () => {
    expect(canTategaki(['夜明けの街を', '歩いていく'])).toBe(true);
    expect(canTategaki(['「さよなら」なんて言わないで…'])).toBe(true);
  });

  it('英数字を含む行・日本語を含まない行・長すぎる行は不可', () => {
    expect(canTategaki(['Hello, my friend'])).toBe(false);
    expect(canTategaki(['遠い空の', 'Hello'])).toBe(false);
    expect(canTategaki(['2024年の夏'])).toBe(false);
    expect(canTategaki(['♪〜'])).toBe(false);
    expect(canTategaki(['あ'.repeat(21)])).toBe(false);
    expect(canTategaki(['一', '二', '三', '四'])).toBe(false);
  });
});

// 8 セクション × 4 行、1 セクションに英語の行を混ぜる
const cues: Cue[] = [];
for (let s = 0; s < 8; s++) {
  for (let k = 0; k < 4; k++) {
    const i = cues.length;
    const start = s * 20 + k * 3;
    cues.push({ index: i, start, end: start + 2.5, text: s === 3 && k === 1 ? 'Hello my friend' : `夜明けの街${i}を歩く`.replace(/\d+/, '') });
  }
}
const features = analyze(cues);
const run = (opts: Partial<Parameters<typeof direct>[1]> = {}) =>
  direct(features, { theme: defaultTheme, seed: 21, fontIds: ['noto-sans-jp'], background: 'black', ...opts });

describe('縦書きの割り当て', () => {
  it('auto: 縦書きと横書きが行ごとに混在し、縦書きは最大2行までしか続かない', () => {
    for (const seed of [1, 2, 3, 21, 99]) {
      const t = run({ seed, theme: applyEffectLevel(defaultTheme, 'ultra') });
      const v = t.items.map((i) => i.vertical);
      expect(v.some(Boolean)).toBe(true);
      expect(v.some((x) => !x)).toBe(true);
      let runLen = 0;
      for (const x of v) {
        runLen = x ? runLen + 1 : 0;
        expect(runLen).toBeLessThanOrEqual(MAX_VERTICAL_RUN);
      }
      // 同じセクション内でも縦横が混ざることがある
      const mixedSection = [...new Set(features.map((f) => f.section))].some((s) => {
        const vs = t.items.filter((_, i) => features[i].section === s).map((i) => i.vertical);
        return vs.includes(true) && vs.includes(false);
      });
      expect(mixedSection).toBe(true);
    }
  });

  it('縦書き行は中央・左・右に配置され、横書き行は中央', () => {
    const sides = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const it of run({ seed, verticalMode: 'always' }).items) {
        if (it.vertical) sides.add(it.side);
        else expect(it.side).toBe('center');
      }
    }
    expect(sides).toEqual(new Set(['center', 'left', 'right']));
  });

  it('縦書きが続くときは左右が反対側に振られやすい', () => {
    let flips = 0;
    let pairs = 0;
    for (let seed = 0; seed < 30; seed++) {
      const items = run({ seed, verticalMode: 'always' }).items;
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1].side;
        const b = items[i].side;
        if (items[i - 1].vertical && items[i].vertical && a !== 'center') {
          pairs++;
          if ((a === 'left' && b === 'right') || (a === 'right' && b === 'left')) flips++;
        }
      }
    }
    expect(flips / pairs).toBeGreaterThan(0.6);
  });

  it('画面いっぱいモードの縦書きは中央固定', () => {
    const t = run({ verticalMode: 'always', sizeLevel: 'xl' });
    expect(t.items.filter((i) => i.vertical).every((i) => i.side === 'center')).toBe(true);
  });

  it('英語の行は常に横書き', () => {
    for (const mode of ['auto', 'always'] as const) {
      const t = run({ verticalMode: mode });
      const english = t.items.find((_, i) => cues[i].text.startsWith('Hello'))!;
      expect(english.vertical).toBe(false);
    }
  });

  it('off は全て横書き、always は日本語の行を全て縦書き', () => {
    expect(run({ verticalMode: 'off' }).items.every((i) => !i.vertical)).toBe(true);
    const always = run({ verticalMode: 'always' });
    always.items.forEach((it, i) => expect(it.vertical).toBe(canTategaki(cues[i].text.split('\n'))));
  });

  it('演出なしレベルの auto では縦書きにしない', () => {
    expect(run({ theme: applyEffectLevel(defaultTheme, 'none') }).items.every((i) => !i.vertical)).toBe(true);
  });

  it('縦書きの有無で他の演出選択は変わらない', () => {
    const a = run({ verticalMode: 'off' }).items.map((i) => [i.animation, i.camera, i.color]);
    const b = run({ verticalMode: 'always' }).items.map((i) => [i.animation, i.camera, i.color]);
    expect(b).toEqual(a);
  });
});
