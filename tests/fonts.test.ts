import { describe, expect, it } from 'vitest';
import { FONT_CATALOG, cssFont, fallbackIds } from '../src/fonts/catalog';
import { isBundled, mergeRanges, parseFontsourceCss, parseUnicodeRange, uncovered } from '../src/fonts/loader';

// 各書体の通常ウェイトの CSS（@types/node を入れずに読むため Vite の ?raw を使う）
const cssByPath = import.meta.glob('/node_modules/@fontsource/*/400.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const css400 = (pkg: string) => cssByPath[`/node_modules/@fontsource/${pkg}/400.css`];

describe('同梱フォント', () => {
  it('カタログの全書体・全ウェイトが読み込み処理に含まれている', () => {
    const missing = FONT_CATALOG.flatMap((f) => f.weights.filter((w) => !isBundled(f.pkg, w)).map((w) => `${f.pkg} ${w}`));
    expect(missing).toEqual([]);
  });

  it('全書体の CSS から woff2 の URL が取れる', () => {
    for (const f of FONT_CATALOG) {
      expect(parseFontsourceCss(css400(f.pkg), f.pkg, 'x').length, f.pkg).toBeGreaterThan(0);
    }
  });

  it('id は重複しない', () => {
    const ids = FONT_CATALOG.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fallbackIds', () => {
  it('同じ言語の Noto Sans を先頭にし、残りは JP → KR → SC → TC', () => {
    expect(fallbackIds('dela-gothic-one')).toEqual(['noto-sans-jp', 'noto-sans-kr', 'noto-sans-sc', 'noto-sans-tc']);
    expect(fallbackIds('noto-serif-sc')).toEqual(['noto-sans-sc', 'noto-sans-jp', 'noto-sans-kr', 'noto-sans-tc']);
    expect(fallbackIds('noto-serif-tc')).toEqual(['noto-sans-tc', 'noto-sans-jp', 'noto-sans-kr', 'noto-sans-sc']);
  });

  it('自分自身は含めない', () => {
    expect(fallbackIds('noto-sans-jp')).toEqual(['noto-sans-kr', 'noto-sans-sc', 'noto-sans-tc']);
    expect(fallbackIds('noto-sans-kr')).toEqual(['noto-sans-jp', 'noto-sans-sc', 'noto-sans-tc']);
  });

  it('cssFont はフォールバックを連結する', () => {
    expect(cssFont('noto-sans-kr', 900, 64)).toBe('900 64px "mt-noto-sans-kr", "mt-noto-sans-jp", "mt-noto-sans-sc", "mt-noto-sans-tc", sans-serif');
  });
});

describe('unicode-range', () => {
  it('範囲・単一の符号位置・ワイルドカードを解析する', () => {
    expect(parseUnicodeRange('U+4e00-9fff, U+3042,U+4??')).toEqual([
      [0x4e00, 0x9fff],
      [0x3042, 0x3042],
      [0x400, 0x4ff],
    ]);
  });

  it('mergeRanges は並べ替えて、重なり・隣接をまとめる', () => {
    expect(mergeRanges([[10, 20], [1, 3], [4, 5], [15, 30]])).toEqual([
      [1, 5],
      [10, 30],
    ]);
  });

  it('uncovered は範囲外の文字だけを重複・空白を除いて返す', () => {
    const r = mergeRanges(parseUnicodeRange('U+3040-309f,U+4e00-9fff'));
    expect(uncovered('あい 愛\n们한한', r)).toBe('한');
    expect(uncovered('ABC', r)).toBe('ABC');
    expect(uncovered('あい', r)).toBe('');
  });

  it('日本語の書体に無い簡体字・ハングルだけがフォールバックに回る（fontsource の範囲は収録文字に絞られている）', () => {
    const jp = mergeRanges(parseUnicodeRange(unionOf(css400('noto-sans-jp'))));
    expect(uncovered('夢を見た们한', jp)).toBe('们한');
  });
});

function unionOf(css: string): string {
  return [...css.matchAll(/unicode-range:\s*([^;]+);/g)].map((m) => m[1]).join(',');
}
