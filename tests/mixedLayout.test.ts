import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { direct } from '../src/director/director';
import type { MixedLayout, TimelineItem } from '../src/director/types';
import type { Cue } from '../src/parsers/types';
import type { Ctx2D } from '../src/render/layout';
import { computeMixedLayout } from '../src/render/mixedLayout';
import { defaultTheme } from '../src/themes/default';

// 文字幅を font の px 値で近似する計測用の偽 ctx（フォントの実測は不要）
const fakeCtx = {
  font: '',
  measureText(this: { font: string }, text: string) {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16);
    return { width: [...text].length * px };
  },
} as unknown as Ctx2D;

const cues: Cue[] = [{ index: 0, start: 0, end: 4, text: '規格に合わせて　比較を消し去り' }];
const base = direct(analyze(cues), { theme: defaultTheme, seed: 1, fontIds: ['noto-sans-jp'], background: 'black', verticalMode: 'always' }).items[0];
const itemWith = (mixed: MixedLayout): TimelineItem => ({ ...base, mixed });

describe('computeMixedLayout', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920]]) {
    for (const verticalLine of [0, 1] as const) {
      for (const shape of ['L', 'reverseL'] as const) {
        it(`${width}x${height} 縦=${verticalLine} ${shape}`, () => {
          const layout = computeMixedLayout(fakeCtx, itemWith({ verticalLine, shape }), width, height);
          expect(layout.vertical).toBe(false);
          expect(layout.lines).toHaveLength(2);
          const vLine = layout.lines[verticalLine];
          const hLine = layout.lines[1 - verticalLine];
          expect(vLine.vertical).toBe(true);
          expect(hLine.vertical).toBe(false);

          // 通し番号が読む順（塊1 → 塊2）に振られ、行番号も合っている
          const text = layout.glyphs.map((g) => g.ch).join('');
          expect(text).toBe('規格に合わせて比較を消し去り');
          layout.glyphs.forEach((g, i) => expect(g.index).toBe(i));
          layout.phrases.forEach((p, i) => {
            expect(p.index).toBe(i);
            for (const g of p.glyphs) expect([g.phrase, g.line]).toEqual([i, p.line]);
          });

          // L字型は縦の列が左、逆L字型は右。横書きの行は縦の列の最後の文字と同じ高さ
          const vGlyphs = vLine.phrases.flatMap((p) => p.glyphs);
          const hGlyphs = hLine.phrases.flatMap((p) => p.glyphs);
          const vMaxX = Math.max(...vGlyphs.map((g) => g.cx));
          const vMinX = Math.min(...vGlyphs.map((g) => g.cx));
          if (shape === 'L') expect(Math.min(...hGlyphs.map((g) => g.cx))).toBeGreaterThan(vMaxX);
          else expect(Math.max(...hGlyphs.map((g) => g.cx))).toBeLessThan(vMinX);
          expect(hGlyphs[0].y).toBeCloseTo(vGlyphs[vGlyphs.length - 1].y, 0);

          // 画面からはみ出さず、中央に置かれる
          const { bbox } = layout;
          expect(bbox.x).toBeGreaterThanOrEqual(0);
          expect(bbox.y).toBeGreaterThanOrEqual(0);
          expect(bbox.x + bbox.w).toBeLessThanOrEqual(width);
          expect(bbox.y + bbox.h).toBeLessThanOrEqual(height);
          expect(bbox.x + bbox.w / 2).toBeCloseTo(width / 2, 0);
          for (const g of layout.glyphs) {
            expect(g.cx).toBeGreaterThan(bbox.x);
            expect(g.cx).toBeLessThan(bbox.x + bbox.w);
          }
        });
      }
    }
  }
});
