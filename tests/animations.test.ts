import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { ANIMATIONS, bandDuration, bandSpan, outlineEchoSpread, slotReel, splitOffset, SLOT_DECOYS } from '../src/animations/registry';
import { ANIMATION_IDS } from '../src/animations/types';
import { direct, SHORT_CUE_SEC, SLOW_ANIMATIONS } from '../src/director/director';
import type { TimelineItem } from '../src/director/types';
import type { Cue } from '../src/parsers/types';
import { cameraAt } from '../src/render/camera';
import { computeLayout, type Ctx2D, type ItemLayout } from '../src/render/layout';
import { computeMixedLayout } from '../src/render/mixedLayout';
import { computeVerticalLayout } from '../src/render/verticalLayout';
import { defaultTheme } from '../src/themes/default';
import { EFFECT_LEVELS, applyEffectLevel } from '../src/themes/effectLevel';

const W = 1920;
const H = 1080;

/** 描画命令を受け流すだけの偽の ctx（文字幅は font の px 値で近似する） */
function fakeCtx(): Ctx2D {
  const state: Record<string | symbol, unknown> = { font: '16px x', canvas: { width: W, height: H } };
  const noop = () => undefined;
  return new Proxy(state, {
    get(target, key) {
      if (key === 'measureText') {
        return (text: string) => ({ width: [...text].length * Number(/(\d+)px/.exec(String(target.font))?.[1] ?? 16) });
      }
      if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (key === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (key in target) return target[key];
      return noop;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as Ctx2D;
}

const cues: Cue[] = [{ index: 0, start: 0, end: 3, text: '規格に合わせて　比較を消し去り' }];
const features = analyze(cues);
const itemFor = (verticalMode: 'off' | 'always'): TimelineItem =>
  direct(features, { theme: defaultTheme, seed: 1, fontIds: ['noto-sans-jp'], background: 'black', verticalMode }).items[0];

const horizontal = itemFor('off');
const mixedItem = itemFor('always');
const verticalItem: TimelineItem = { ...horizontal, vertical: true, lines: [horizontal.lines[0].slice(0, 3)], emphasisRanges: [null] };
const layouts: [string, TimelineItem, ItemLayout][] = [
  ['横書き', horizontal, computeLayout(fakeCtx(), horizontal, W, H)],
  ['縦書き', verticalItem, computeVerticalLayout(verticalItem, W, H)],
  ['縦横混在', mixedItem, computeMixedLayout(fakeCtx(), mixedItem, W, H)],
];

describe('全ての演出', () => {
  it('横書き・縦書き・縦横混在 × カメラの有無 × 登場中・表示中・退場中で例外なく描ける', () => {
    expect(mixedItem.mixed).not.toBeNull();
    const dur = 3;
    const inDur = 0.5;
    const outDur = 0.3;
    for (const [, item, layout] of layouts) {
      for (const withCam of [false, true]) {
        for (const t of [0, 0.1, 0.3, 0.6, 1.5, 2.8, 2.95]) {
          const cam = withCam ? cameraAt({ type: 'orbit', dir: 1, intensity: 1 }, t, dur, W, H) : null;
          const outP = Math.max(0, (t - (dur - outDur)) / outDur);
          for (const id of ANIMATION_IDS) {
            const ctx = fakeCtx();
            const gs = { cam, outline: '#000000', shadow: true, shine: null };
            expect(() => ANIMATIONS[id]({ ctx, item, layout, t, dur, inDur, outDur, outP, gs, bg: 'black' }), id).not.toThrow();
          }
        }
      }
    }
  });
});

describe('帯ワイプ', () => {
  it('帯が先に伸び、後端が追いかけ、終わりには帯が消えて文字が全部見える', () => {
    expect(bandSpan(0, 0, 1)).toEqual({ head: 0, tail: 0 });
    const mid = bandSpan(0.3, 0, 1);
    expect(mid.head).toBeGreaterThan(mid.tail);
    expect(bandSpan(1, 0, 1)).toEqual({ head: 1, tail: 1 });
  });

  it('帯の秒数は字幕の長さから決まり、0.45〜1.1秒に収まる', () => {
    expect(bandDuration(0.5)).toBe(0.45);
    expect(bandDuration(2)).toBeCloseTo(0.9);
    expect(bandDuration(10)).toBe(1.1);
  });

  it('3秒の字幕では、帯が 0.5 秒以上見えている（一瞬で消えない）', () => {
    const dur = bandDuration(3);
    let visible = 0;
    const step = 1 / 120;
    for (let t = 0; t <= dur; t += step) {
      const { head, tail } = bandSpan(t, 0, dur);
      if (head - tail > 0.05) visible += step;
    }
    expect(visible).toBeGreaterThan(0.5);
  });

  it('サビと非サビが混ざった曲で、標準・エモい・超エモのどれでも選ばれる', () => {
    // 8 行のセクションを繰り返し、サビ（同じ歌詞の繰り返し）と非サビを交互に置く
    const song: Cue[] = [];
    for (let s = 0; s < 6; s++) {
      for (let k = 0; k < 8; k++) {
        const i = song.length;
        const start = s * 30 + k * 3;
        song.push({ index: i, start, end: start + 2.6, text: s % 2 ? ['光を掴め', '夢を追え'][k % 2] : `歌詞の行${s}${'一二三四五六七八'[k]}` });
      }
    }
    const songFeatures = analyze(song);
    expect(songFeatures.some((f) => f.isChorus) && songFeatures.some((f) => !f.isChorus)).toBe(true);
    for (const level of EFFECT_LEVELS.filter((l) => l === 'standard' || l === 'emo' || l === 'ultra')) {
      const found = [1, 2, 3, 4, 5].some((seed) =>
        direct(songFeatures, { theme: applyEffectLevel(defaultTheme, level), seed, fontIds: ['noto-sans-jp'], background: 'black' }).items.some(
          (i) => i.animation === 'bandWipe',
        ),
      );
      expect(found, level).toBe(true);
    }
  });
});

describe('スロット', () => {
  const layout = layouts[0][2];
  it('流れる文字は同じ字幕の文字だけで、最後は本来の文字。同じ seed なら同じ', () => {
    const chars = new Set(layout.glyphs.map((g) => g.ch));
    for (const g of layout.glyphs) {
      const reel = slotReel(layout, 42, g.index);
      expect(reel).toHaveLength(SLOT_DECOYS + 1);
      expect(reel[reel.length - 1]).toBe(g.ch);
      for (const ch of reel) expect(chars.has(ch)).toBe(true);
      expect(reel.slice(0, -1)).not.toContain(g.ch);
      expect(slotReel(layout, 42, g.index)).toEqual(reel);
    }
  });
});

describe('スプリット・アウトラインの反復', () => {
  it('登場の終わりでずれが0になり、複製は本体に収束する。退場で再び広がる', () => {
    expect(splitOffset(0, 100, 0.6)).toBeGreaterThan(100);
    expect(splitOffset(1, 100, 0.6)).toBe(0);
    expect(outlineEchoSpread(0, 0)).toBe(1);
    expect(outlineEchoSpread(1, 0)).toBe(0);
    expect(outlineEchoSpread(1, 0.5)).toBe(0.5);
  });
});

describe('短い字幕', () => {
  it(`表示時間が ${SHORT_CUE_SEC} 秒未満の字幕には、帯ワイプ・スロットを選ばない`, () => {
    const short: Cue[] = Array.from({ length: 60 }, (_, i) => ({ index: i, start: i, end: i + 0.6, text: `短い歌詞${i}` }));
    const theme = applyEffectLevel(defaultTheme, 'standard');
    const all = { ...theme, animations: { normal: { bandWipe: 1, slot: 1 }, fast: { bandWipe: 1, slot: 1 }, slow: { bandWipe: 1, slot: 1 }, chorus: { bandWipe: 1, slot: 1 } } };
    const t = direct(analyze(short), { theme: all, seed: 1, fontIds: ['noto-sans-jp'], background: 'black' });
    expect(t.items.every((i) => !SLOW_ANIMATIONS.has(i.animation))).toBe(true);
  });
});
