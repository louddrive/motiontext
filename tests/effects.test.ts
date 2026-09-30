import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { glitchColors, GLITCH_CYAN } from '../src/animations/registry';
import { ALL_EFFECTS, EFFECT_FLAG_KEYS, EFFECTS, parseEffectFlags, type EffectFlag } from '../src/config/effects';
import { direct, findInterludes } from '../src/director/director';
import { INTERLUDE_MIN_GAP_SEC, type Timeline, type TimelineItem } from '../src/director/types';
import type { Cue } from '../src/parsers/types';
import { blurSampleTimes, SHAKE_SEC, shakeOffset, shineBand } from '../src/render/fx';
import { INTERLUDE_FADE_SEC, INTERLUDE_HOLD_SEC, INTERLUDE_RUSH_SEC, INTERLUDE_SLOW_SHARE, interludeAt, interludeProgress, percentLabel } from '../src/render/interlude';
import { lyricsVisibleAt } from '../src/render/renderer';
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
// 最後に 6 秒の間奏を挟んだ 1 行（間奏の進み具合の表示用）
cues.push({ index: 40, start: 39 * 3 + 2.6 + 6, end: 39 * 3 + 2.6 + 8, text: '最後の一行' });
const features = analyze(cues);
const run = (level: EffectLevel, extra: Partial<Parameters<typeof direct>[1]> = {}, seed = 3): Timeline =>
  direct(features, {
    theme: applyEffectLevel(defaultTheme, level),
    seed,
    fontIds: ['noto-sans-jp', 'dela-gothic-one'],
    background: 'black',
    ...extra,
  });
// 間奏の進み具合を必ず表示するテーマ（表示の抽選に左右されずに確かめるため）
const alwaysInterlude = (level: EffectLevel) => {
  const theme = applyEffectLevel(defaultTheme, level);
  return { ...theme, fx: { ...theme.fx, interludeRate: 1 } };
};
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
      expect(themes[k].fx.interludeRate).toBeGreaterThan(themes[k - 1].fx.interludeRate);
      expect(themes[k].fx.underlineRate).toBeGreaterThan(themes[k - 1].fx.underlineRate);
    }
    expect(blurAmount(run('ultra'))).toBeGreaterThan(blurAmount(run('subtle')));
  });

  it('演出なしでは追加エフェクトがすべてオフ', () => {
    const t = run('none');
    expect(t.motionBlur.samples).toBe(1);
    expect(t.shakes).toEqual([]);
    expect(t.interludes).toEqual([]);
    expect(t.items.some((i) => i.shine || i.particles || i.underline || i.animation === 'glitch')).toBe(false);
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
    const off = run('standard', { effects: without('shine', 'particles', 'underline', 'cameraShake', 'motionBlur') });
    expect(t.items.map((i) => [i.animation, i.fontId, i.color, i.camera, i.deco, i.vertical])).toEqual(
      off.items.map((i) => [i.animation, i.fontId, i.color, i.camera, i.deco, i.vertical]),
    );
  });
});

describe('エフェクトの有効・無効（effects.config.json）', () => {
  // すべての演出が候補に入るテーマ（この字幕データは全行がサビと判定され、超エモのサビの表には slot がないため）
  const allTheme = () => {
    const theme = alwaysInterlude('ultra');
    return { ...theme, animations: { ...theme.animations, chorus: { ...theme.animations.chorus, slot: 1 } } };
  };
  const base = () => run('ultra', { outline: true, shadow: true, theme: allTheme() });
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
      ['verticalText', (t) => t.items.every((i) => !i.vertical && !i.mixed)],
      ['interludeProgress', (t) => t.interludes.length === 0],
      ['bandWipe', (t) => t.items.every((i) => i.animation !== 'bandWipe')],
      ['slot', (t) => t.items.every((i) => i.animation !== 'slot')],
      ['split', (t) => t.items.every((i) => i.animation !== 'split')],
      ['outlineEcho', (t) => t.items.every((i) => i.animation !== 'outlineEcho')],
      ['underline', (t) => t.items.every((i) => !i.underline)],
    ];
    // 曲の拍に合わせる演出のフラグは、曲の解析結果が要るので別のテストで確かめる
    const beatFlags: EffectFlag[] = ['beatSync', 'beatPulse', 'interludeMeter'];
    expect([...cases.map(([k]) => k), ...beatFlags].sort()).toEqual([...EFFECT_FLAG_KEYS].sort());
    for (const [key, gone] of cases) {
      const t = run('ultra', { outline: true, shadow: true, theme: allTheme(), effects: without(key) });
      expect(gone(on), key).toBe(false);
      expect(gone(t), key).toBe(true);
      // フォント・色・位置の選ばれ方は変わらない
      expect(keysOf(t), key).toEqual(keysOf(on));
    }
  });

  it('装飾を無効にしても、他の装飾・演出の選ばれ方は変わらない', () => {
    const on = base();
    const t = run('ultra', { outline: true, shadow: true, theme: allTheme(), effects: without('diagonalLines') });
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

describe('間奏の進み具合', () => {
  const item = (id: number, start: number, end: number, color = '#FFFFFF') =>
    ({ id, start, end, color, fontId: 'dela-gothic-one' }) as TimelineItem;

  it('字幕の間が INTERLUDE_MIN_GAP_SEC 以上の区間だけを間奏にする。曲の冒頭は対象外', () => {
    const iv = findInterludes([item(0, 10, 12), item(1, 12 + INTERLUDE_MIN_GAP_SEC - 0.01, 20), item(2, 25, 27, '#FFD166')], 1, 1);
    expect(iv).toHaveLength(1);
    expect(iv[0]).toMatchObject({ start: 20, end: 25, color: '#FFD166', fontId: 'dela-gothic-one', weight: 400 });
  });

  it('字幕が重なっている場合は、最も遅い終わりから数える', () => {
    const iv = findInterludes([item(0, 0, 10), item(1, 2, 3), item(2, 12, 14)], 1, 1);
    expect(iv).toEqual([]);
  });

  it('見た目は横線と円の両方が選ばれ、同じパターン番号なら同じ', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i, i * 10, i * 10 + 2));
    const styles = new Set(findInterludes(items, 7, 1).map((iv) => iv.style));
    expect(styles).toEqual(new Set(['bar', 'ring']));
    expect(findInterludes(items, 7, 1)).toEqual(findInterludes(items, 7, 1));
  });

  it('表示するかどうかは確率で選ぶ（同じパターン番号なら同じ）', () => {
    const items = Array.from({ length: 41 }, (_, i) => item(i, i * 10, i * 10 + 2));
    expect(findInterludes(items, 7, 1)).toHaveLength(40);
    expect(findInterludes(items, 7, 0)).toHaveLength(0);
    const half = findInterludes(items, 7, 0.5);
    expect(half.length).toBeGreaterThan(8);
    expect(half.length).toBeLessThan(32);
    expect(findInterludes(items, 7, 0.5)).toEqual(half);
  });

  it('direct: 長い間奏に区間ができ、追加しても既存の演出の選ばれ方は変わらない', () => {
    const on = run('standard', { theme: alwaysInterlude('standard') });
    const off = run('standard', { theme: alwaysInterlude('standard'), effects: without('interludeProgress') });
    expect(on.interludes).toHaveLength(1);
    expect(on.interludes[0].end).toBe(cues[40].start);
    expect(on.items).toEqual(off.items);
    expect(on.shakes).toEqual(off.shakes);
  });

  it('進み具合は開始で0、次の歌詞の直前で100%、次の歌詞の開始以降は表示しない', () => {
    const iv = [{ start: 20, end: 30, style: 'bar' as const, color: '#FFFFFF', fontId: 'noto-sans-jp', weight: 700 }];
    expect(interludeAt(iv, 19.99)).toBeNull();
    expect(interludeAt(iv, 20)).toMatchObject({ p: 0, alpha: 0 });
    expect(interludeAt(iv, 20 + INTERLUDE_FADE_SEC)!.alpha).toBe(1);
    expect(interludeAt(iv, 29.99)!.p).toBe(1);
    expect(interludeAt(iv, 30)).toBeNull();
  });

  it('最初はゆっくり進み、最後の約1秒で一気に100%に達し、次の歌詞の直前は100%のまま', () => {
    const len = 10;
    const slowEnd = len - INTERLUDE_RUSH_SEC;
    expect(interludeProgress(0, len)).toBe(0);
    expect(interludeProgress(slowEnd / 2, len)).toBeCloseTo(INTERLUDE_SLOW_SHARE / 2);
    expect(interludeProgress(slowEnd, len)).toBeCloseTo(INTERLUDE_SLOW_SHARE);
    // 100% に届いた後、次の歌詞まで INTERLUDE_HOLD_SEC 秒は 100%（30fps で数フレーム写る）
    expect(interludeProgress(len - INTERLUDE_HOLD_SEC, len)).toBe(1);
    expect(percentLabel(interludeProgress(len - INTERLUDE_HOLD_SEC + 1 / 30, len))).toBe(100);
    // 最短の間奏（5秒）でも、最後の1秒の平均の進みはゆっくりの区間より速い
    const minLen = INTERLUDE_MIN_GAP_SEC;
    const slowRate = interludeProgress(minLen - INTERLUDE_RUSH_SEC, minLen) / (minLen - INTERLUDE_RUSH_SEC);
    const rushRate = (1 - interludeProgress(minLen - INTERLUDE_RUSH_SEC, minLen)) / (INTERLUDE_RUSH_SEC - INTERLUDE_HOLD_SEC);
    expect(rushRate).toBeGreaterThan(slowRate);
    // 単調に増え、最後の1秒の方が進みが速い
    let prev = 0;
    for (let k = 0; k <= 1000; k++) {
      const v = interludeProgress((k / 1000) * len, len);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('間奏中のフレームは、書き出しで使い回さない（歌詞の層が写る扱い）', () => {
    const t = run('none', { theme: alwaysInterlude('none') });
    const { start, end } = t.interludes[0];
    expect(lyricsVisibleAt(t, (start + end) / 2)).toBe(true);
    expect(lyricsVisibleAt(run('none'), (start + end) / 2)).toBe(false);
  });

  it('パーセンテージは 0 から 100 まで単調に増え、最後の 1% で 100 になる', () => {
    expect([0, 0.5, 0.991, 1].map(percentLabel)).toEqual([0, 50, 100, 100]);
    expect(percentLabel(0.989)).toBe(99);
    let prev = 0;
    for (let k = 0; k <= 1000; k++) {
      const v = percentLabel(k / 1000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
