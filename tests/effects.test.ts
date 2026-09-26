import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { glitchColors, GLITCH_CYAN } from '../src/animations/registry';
import { ALL_EFFECTS, EFFECT_FLAG_KEYS, EFFECTS, parseEffectFlags, type EffectFlag } from '../src/config/effects';
import { direct } from '../src/director/director';
import type { Timeline } from '../src/director/types';
import type { Cue } from '../src/parsers/types';
import { blurSampleTimes, SHAKE_SEC, shakeOffset, shineBand } from '../src/render/fx';
import { isKeyUnsafe, outlineColor } from '../src/themes/color';
import { defaultTheme } from '../src/themes/default';
import { EFFECT_LEVELS, applyEffectLevel, type EffectLevel } from '../src/themes/effectLevel';
import rawConfig from '../effects.config.json';

// サビ（繰り返し）とセクションの切れ目を含む 40 行の字幕
const cues: Cue[] = Array.from({ length: 40 }, (_, i) => ({
  index: i,
  start: i * 3 + (i % 8 === 0 ? 3 : 0),
  end: i * 3 + 2.6,
  text: i % 4 < 2 ? ['光を掴め', '夢を追え'][i % 2] : `歌詞の行${'一二三四五六七八九十'[i % 10]}${'春夏秋冬'[Math.floor(i / 10)]}`,
}));
const features = analyze(cues);
const run = (level: EffectLevel, extra: Partial<Parameters<typeof direct>[1]> = {}, seed = 3): Timeline =>
  direct(features, {
    theme: applyEffectLevel(defaultTheme, level),
    seed,
    fontIds: ['noto-sans-jp', 'dela-gothic-one'],
    background: 'black',
    ...extra,
  });
const without = (...keys: EffectFlag[]) => ({ ...ALL_EFFECTS, ...Object.fromEntries(keys.map((k) => [k, false])) });

describe('outlineColor', () => {
  it('明るい文字には黒、暗い文字には白', () => {
    expect(outlineColor('#FFFFFF')).toBe('#000000');
    expect(outlineColor('#FFD166')).toBe('#000000');
    expect(outlineColor('#000000')).toBe('#FFFFFF');
    expect(outlineColor('#1A2A6C')).toBe('#FFFFFF');
    expect(outlineColor('#E0245E')).toBe('#FFFFFF');
  });
});

describe('blurSampleTimes', () => {
  it('現在から過去方向へ等間隔（シャッターの開きぶん）', () => {
    const ts = blurSampleTimes(1, 30, 0.5, 4);
    expect(ts).toHaveLength(4);
    expect(ts[0]).toBe(1);
    expect(ts[3]).toBeCloseTo(1 - 0.5 / 30);
    for (let k = 1; k < ts.length; k++) expect(ts[k - 1] - ts[k]).toBeCloseTo(0.5 / 30 / 3);
  });

  it('シャッター0・サンプル1なら現在の時刻だけ', () => {
    expect(blurSampleTimes(2, 30, 0, 8)).toEqual([2]);
    expect(blurSampleTimes(2, 30, 1, 1)).toEqual([2]);
  });
});

describe('shakeOffset', () => {
  const shakes = [{ time: 5, strength: 1 }];
  it('揺れの開始前と SHAKE_SEC 経過後は0', () => {
    expect(shakeOffset(shakes, 4.99, 1920, 1080)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(shakes, 5 + SHAKE_SEC, 1920, 1080)).toEqual({ x: 0, y: 0 });
  });

  it('開始直後が最も大きく、減衰する', () => {
    const mag = (t: number) => {
      const o = shakeOffset(shakes, t, 1920, 1080);
      return Math.hypot(o.x, o.y);
    };
    expect(mag(5)).toBeGreaterThan(15);
    const peak = (from: number) => Math.max(...Array.from({ length: 10 }, (_, k) => mag(from + k * 0.01)));
    expect(peak(5.3)).toBeLessThan(peak(5));
  });

  it('強さ0なら揺れない', () => {
    expect(shakeOffset([{ time: 5, strength: 0 }], 5.1, 1920, 1080)).toEqual({ x: 0, y: 0 });
  });
});

describe('shineBand', () => {
  const bbox = { x: 100, y: 400, w: 800, h: 100 };
  it('登場後に左から右へ1回横切る', () => {
    const inDur = 0.4;
    expect(shineBand(bbox, false, 0.3, inDur, 3)).toBeNull();
    const a = shineBand(bbox, false, 0.6, inDur, 3)!;
    const b = shineBand(bbox, false, 1.0, inDur, 3)!;
    expect(b.x).toBeGreaterThan(a.x);
    expect(shineBand(bbox, false, 1.3, inDur, 3)).toBeNull();
  });

  it('表示時間が足りない字幕には出さない', () => {
    expect(shineBand(bbox, false, 0.6, 0.4, 1)).toBeNull();
  });
});

describe('glitchColors', () => {
  it('グリーン背景では青緑を使わない（クロマキーで抜けない色）', () => {
    expect(glitchColors('black')).toContain(GLITCH_CYAN);
    for (const c of glitchColors('green')) expect(isKeyUnsafe(c)).toBe(false);
  });
});

describe('演出レベルとエフェクト', () => {
  const blurAmount = (t: Timeline) => t.motionBlur.shutter * t.motionBlur.samples;
  it('レベルが上がるほど、ブラー・シェイク・シャイン・光の粒が増える', () => {
    const themes = EFFECT_LEVELS.map((l) => applyEffectLevel(defaultTheme, l));
    for (let k = 1; k < themes.length; k++) {
      expect(themes[k].motionBlur.shutter).toBeGreaterThan(themes[k - 1].motionBlur.shutter);
      expect(themes[k].motionBlur.samples).toBeGreaterThan(themes[k - 1].motionBlur.samples);
      expect(themes[k].fx.shake).toBeGreaterThanOrEqual(themes[k - 1].fx.shake);
      expect(themes[k].fx.shineRate).toBeGreaterThan(themes[k - 1].fx.shineRate);
      expect(themes[k].fx.particleRate).toBeGreaterThanOrEqual(themes[k - 1].fx.particleRate);
    }
    expect(blurAmount(run('ultra'))).toBeGreaterThan(blurAmount(run('subtle')));
  });

  it('演出なしでは追加エフェクトがすべてオフ', () => {
    const t = run('none');
    expect(t.motionBlur.samples).toBe(1);
    expect(t.shakes).toEqual([]);
    expect(t.items.some((i) => i.shine || i.particles || i.animation === 'glitch')).toBe(false);
  });

  it('グリッチはエモい・超エモでだけ選ばれる', () => {
    const has = (l: EffectLevel) => [1, 2, 3, 4, 5, 6].some((s) => run(l, {}, s).items.some((i) => i.animation === 'glitch'));
    expect(has('emo')).toBe(true);
    expect(has('ultra')).toBe(true);
    expect(has('none') || has('subtle') || has('standard')).toBe(false);
  });

  it('シャイン・光の粒はサビ行にだけ付き、シェイクはサビ頭・セクション頭の時刻に入る', () => {
    const t = run('ultra');
    expect(t.items.some((i) => i.shine)).toBe(true);
    expect(t.items.some((i) => i.particles)).toBe(true);
    for (const i of t.items) if (i.shine || i.particles) expect(i.emphasis).toBe(true);
    expect(t.shakes.length).toBeGreaterThan(0);
    const starts = new Set(t.items.map((i) => i.start));
    for (const s of t.shakes) {
      expect(starts.has(s.time)).toBe(true);
      const item = t.items.find((i) => i.start === s.time)!;
      expect(item.emphasis || item.deco === 'ring').toBe(true);
    }
    expect(run('ultra')).toEqual(t); // 決定的
  });

  it('縁取り・影は指定したときだけ Timeline に入る', () => {
    expect([run('standard').outline, run('standard').shadow]).toEqual([false, false]);
    const t = run('standard', { outline: true, shadow: true });
    expect([t.outline, t.shadow]).toEqual([true, true]);
  });

  it('追加エフェクトを外しても、既存の演出の選ばれ方は変わらない', () => {
    const t = run('standard', { outline: true, shadow: true });
    const off = run('standard', { effects: without('shine', 'particles', 'cameraShake', 'motionBlur') });
    expect(t.items.map((i) => [i.animation, i.fontId, i.color, i.camera, i.deco, i.vertical])).toEqual(
      off.items.map((i) => [i.animation, i.fontId, i.color, i.camera, i.deco, i.vertical]),
    );
  });
});

describe('エフェクトの有効・無効（effects.config.json）', () => {
  const base = () => run('ultra', { outline: true, shadow: true });
  const keysOf = (t: Timeline) => t.items.map((i) => [i.fontId, i.color, i.anchor]);

  it('初期値ではすべて有効', () => {
    expect(EFFECTS).toEqual(ALL_EFFECTS);
    expect(Object.keys(rawConfig).sort()).toEqual([...EFFECT_FLAG_KEYS].sort());
  });

  it('各フラグを無効にすると、対応するエフェクトだけが消える', () => {
    const on = base();
    const cases: [EffectFlag, (t: Timeline) => boolean][] = [
      ['motionBlur', (t) => t.motionBlur.samples === 1],
      ['outline', (t) => !t.outline],
      ['dropShadow', (t) => !t.shadow],
      ['cameraShake', (t) => t.shakes.length === 0],
      ['glitch', (t) => t.items.every((i) => i.animation !== 'glitch')],
      ['echo', (t) => t.items.every((i) => i.animation !== 'echo')],
      ['shine', (t) => t.items.every((i) => !i.shine)],
      ['particles', (t) => t.items.every((i) => !i.particles)],
      ['cameraWork', (t) => t.items.every((i) => i.camera === null)],
      ['diagonalLines', (t) => t.items.every((i) => i.deco !== 'lines')],
      ['sectionRing', (t) => t.items.every((i) => i.deco !== 'ring')],
      ['verticalText', (t) => t.items.every((i) => !i.vertical)],
    ];
    expect(cases.map(([k]) => k).sort()).toEqual([...EFFECT_FLAG_KEYS].sort());
    for (const [key, gone] of cases) {
      const t = run('ultra', { outline: true, shadow: true, effects: without(key) });
      expect(gone(on), key).toBe(false);
      expect(gone(t), key).toBe(true);
      // フォント・色・位置の選ばれ方は変わらない
      expect(keysOf(t), key).toEqual(keysOf(on));
    }
  });

  it('装飾を無効にしても、他の装飾・演出の選ばれ方は変わらない', () => {
    const on = base();
    const t = run('ultra', { outline: true, shadow: true, effects: without('diagonalLines') });
    t.items.forEach((it, i) => {
      expect(it.animation).toBe(on.items[i].animation);
      expect(it.deco).toBe(on.items[i].deco === 'lines' ? 'none' : on.items[i].deco);
    });
  });

  it('すべての演出の候補が無効になった表は fadeUp にする', () => {
    const theme = { ...defaultTheme, animations: { normal: { echo: 1 }, fast: { glitch: 1 }, slow: { echo: 1 }, chorus: { glitch: 1 } } };
    const t = direct(features, { theme, seed: 1, fontIds: ['noto-sans-jp'], background: 'black', effects: without('echo', 'glitch') });
    expect(t.items.every((i) => i.animation === 'fadeUp')).toBe(true);
  });

  it('設定ファイル: キーの抜けは有効扱い、未知のキー・真偽値以外はエラー', () => {
    expect(parseEffectFlags({ glitch: false })).toEqual(without('glitch'));
    expect(parseEffectFlags({})).toEqual(ALL_EFFECTS);
    expect(() => parseEffectFlags({ glitch: 'no' })).toThrow();
    expect(() => parseEffectFlags({ sparkle: true })).toThrow();
    expect(() => parseEffectFlags([])).toThrow();
  });
});
