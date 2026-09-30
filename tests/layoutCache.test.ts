import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { direct } from '../src/director/director';
import type { TimelineItem } from '../src/director/types';
import type { Cue } from '../src/parsers/types';
import { buildLayouts, layoutKey, layoutsFromCache, type LayoutCache } from '../src/render/renderer';
import { defaultTheme } from '../src/themes/default';
import { recordingCtx } from './helpers/recordingCtx';

const W = 1920;
const H = 1080;
const cues: Cue[] = [
  { index: 0, start: 0, end: 3, text: '規格に合わせて　比較を消し去り' },
  { index: 1, start: 3, end: 6, text: '遠く滲んだ信号が\n青に変わるまで' },
];
const feats = analyze(cues);
const make = (verticalMode: 'off' | 'always') => direct(feats, { theme: defaultTheme, seed: 3, fontIds: ['noto-sans-jp'], background: 'black', verticalMode });
const horizontal = make('off');
const withVertical = make('always');

/** レイアウトの計算に使う項目（layoutKey に含めるもの） */
const KEY_FIELDS = ['lines', 'fontId', 'weight', 'fontSize', 'fit', 'vertical', 'side', 'mixed', 'kanaRatio', 'emphasisRanges', 'emphasisScale', 'anchor', 'align'];

/** 項目の値を、型を保ったまま別の値にする */
function perturb(value: unknown): unknown {
  if (typeof value === 'number') return value + 7;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'string') return value === '#123456' ? '#654321' : '#123456';
  if (value === null) return { type: 'orbit', dir: 1, intensity: 1 };
  return null;
}

const layoutOf = (item: TimelineItem) => {
  const tl = { ...horizontal, items: [item] };
  return JSON.stringify([...buildLayouts(recordingCtx(W, H).ctx, tl).values()]);
};

describe('layoutKey', () => {
  const items = [...horizontal.items, ...withVertical.items];
  it('キーに含めない項目を変えても、レイアウトは変わらない（キャッシュを使い回して安全）', () => {
    for (const item of items) {
      const base = layoutOf(item);
      for (const field of Object.keys(item).filter((k) => !KEY_FIELDS.includes(k) && k !== 'id')) {
        const changed = { ...item, [field]: perturb(item[field as keyof TimelineItem]) } as TimelineItem;
        expect(layoutOf(changed), `${field} を変えるとレイアウトが変わる → layoutKey に加えること`).toBe(base);
      }
    }
  });

  it('キーに含める項目を変えると、キーも変わる', () => {
    const item = horizontal.items[0];
    const base = layoutKey(item, W, H);
    for (const field of KEY_FIELDS) {
      const v = item[field as keyof TimelineItem];
      const changed = { ...item, [field]: Array.isArray(v) ? [...v, null] : perturb(v) } as TimelineItem;
      expect(layoutKey(changed, W, H), field).not.toBe(base);
    }
    expect(layoutKey(item, H, W)).not.toBe(base);
  });
});

describe('レイアウトのキャッシュ', () => {
  it('色だけ変えたタイムラインは、キャッシュからそのまま組める（計算結果も同じ）', () => {
    const cache: LayoutCache = new Map();
    const { ctx } = recordingCtx(W, H);
    const first = buildLayouts(ctx, horizontal, cache);
    const recolored = { ...horizontal, items: horizontal.items.map((it) => ({ ...it, color: '#FF0000', animation: 'glitch' as const })) };
    const hit = layoutsFromCache(recolored, cache);
    expect(hit).not.toBeNull();
    for (const [id, layout] of first) expect(hit!.get(id)).toBe(layout);
    expect(JSON.stringify([...buildLayouts(ctx, recolored).values()])).toBe(JSON.stringify([...first.values()]));
  });

  it('キャッシュに無いアイテムがあれば null', () => {
    const cache: LayoutCache = new Map();
    buildLayouts(recordingCtx(W, H).ctx, horizontal, cache);
    expect(layoutsFromCache(withVertical, cache)).toBeNull();
  });
});
