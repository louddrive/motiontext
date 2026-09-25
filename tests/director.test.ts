import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { assignFontRoles, direct } from '../src/director/director';
import { getFont } from '../src/fonts/catalog';
import type { Cue } from '../src/parsers/types';
import { isKeyUnsafe } from '../src/themes/color';
import { defaultTheme } from '../src/themes/default';

const cues: Cue[] = [
  { index: 0, start: 0.5, end: 2.5, text: '夜明けの街を' },
  { index: 1, start: 2.6, end: 4.5, text: '歩いていく' },
  { index: 2, start: 8, end: 10, text: '光を掴め' },
  { index: 3, start: 10, end: 12, text: 'どこまでも行け' },
  { index: 4, start: 16, end: 18, text: '光を掴め' },
  { index: 5, start: 18, end: 20, text: 'どこまでも行け' },
];
const features = analyze(cues);
const base = { theme: defaultTheme, fontIds: ['noto-sans-jp', 'dela-gothic-one'], background: 'black' as const };

describe('direct', () => {
  it('同じシードなら同じタイムライン（決定的）', () => {
    expect(direct(features, { ...base, seed: 42 })).toEqual(direct(features, { ...base, seed: 42 }));
  });

  it('シードを変えると演出が変わる', () => {
    const a = direct(features, { ...base, seed: 1 }).items.map((i) => i.animation + i.color);
    const variants = new Set([2, 3, 4, 5, 6].map((s) => direct(features, { ...base, seed: s }).items.map((i) => i.animation + i.color).join()));
    variants.add(a.join());
    expect(variants.size).toBeGreaterThan(1);
  });

  it('字幕のタイミングをそのまま保持する', () => {
    const t = direct(features, { ...base, seed: 7 });
    expect(t.items.map((i) => [i.start, i.end])).toEqual(cues.map((c) => [c.start, c.end]));
  });

  it('サビは強調用フォント、通常行は通常用フォント', () => {
    const t = direct(features, { ...base, seed: 3 });
    for (const [i, item] of t.items.entries()) {
      expect(item.emphasis).toBe(features[i].isChorus);
      expect(getFont(item.fontId).role).toBe(item.emphasis ? 'display' : 'body');
    }
  });

  it('漢字とかなのサイズ差はテーマ値を既定とし、オプションで上書きできる', () => {
    expect(direct(features, { ...base, seed: 1 }).items.every((i) => i.kanaRatio === defaultTheme.kanaRatio)).toBe(true);
    expect(direct(features, { ...base, seed: 1, kanaRatio: 1 }).items.every((i) => i.kanaRatio === 1)).toBe(true);
  });

  it('単色指定は全行に適用され、演出（アニメーション・フォント）は変わらない', () => {
    const auto = direct(features, { ...base, seed: 9 });
    const mono = direct(features, { ...base, seed: 9, color: '#FF0000' });
    expect(mono.items.every((i) => i.color === '#FF0000')).toBe(true);
    expect(mono.items.map((i) => [i.animation, i.fontId, i.deco])).toEqual(auto.items.map((i) => [i.animation, i.fontId, i.deco]));
  });

  it('文字サイズ: 小 < 中、大は画面いっぱいモード（中央固定）', () => {
    const s = direct(features, { ...base, seed: 1, sizeLevel: 'small' }).items;
    const m = direct(features, { ...base, seed: 1, sizeLevel: 'medium' }).items;
    const l = direct(features, { ...base, seed: 1, sizeLevel: 'large' }).items;
    s.forEach((it, i) => expect(it.fontSize).toBeLessThan(m[i].fontSize));
    expect(m.every((i) => !i.fit)).toBe(true);
    expect(l.every((i) => i.fit && i.anchor === 'center')).toBe(true);
  });

  it('画数強調は行ごとに範囲を持ち、無効化できる', () => {
    const t = direct(features, { ...base, seed: 1 });
    // 夜明けの街を → 「街」(12画)
    expect(t.items[0].emphasisRanges).toEqual([{ start: 4, end: 5 }]);
    const off = direct(features, { ...base, seed: 1, strokeEmphasis: false });
    expect(off.items.every((i) => i.emphasisRanges.every((r) => r === null))).toBe(true);
  });

  it('カメラワークを自動で混ぜ、短い字幕には付けず、他の演出選択は変えない', () => {
    const many: Cue[] = Array.from({ length: 40 }, (_, i) => ({ index: i, start: i * 3, end: i * 3 + (i % 5 === 0 ? 0.8 : 2.5), text: `歌詞${i}の行` }));
    const feats = analyze(many);
    const t = direct(feats, { ...base, seed: 5 });
    const withCam = t.items.filter((i) => i.camera);
    expect(withCam.length).toBeGreaterThan(0);
    expect(withCam.length).toBeLessThan(t.items.length);
    for (const item of t.items) if (item.end - item.start < 1.2) expect(item.camera).toBeNull();
    // 同じ字幕・シードなら毎回同じ
    expect(direct(feats, { ...base, seed: 5 }).items.map((i) => i.camera)).toEqual(t.items.map((i) => i.camera));
  });

  it('画面いっぱいモードではカメラの動きを控えめにする', () => {
    const m = direct(features, { ...base, seed: 11 }).items;
    const l = direct(features, { ...base, seed: 11, sizeLevel: 'large' }).items;
    m.forEach((it, i) => {
      if (it.camera) expect(l[i].camera!.intensity).toBeCloseTo(it.camera.intensity * 0.5);
    });
  });

  it('縦型（9:16）の解像度を指定でき、演出の選択は横型と同じ', () => {
    const land = direct(features, { ...base, seed: 4 });
    const port = direct(features, { ...base, seed: 4, width: 1080, height: 1920 });
    expect([port.width, port.height]).toEqual([1080, 1920]);
    expect(port.items.map((i) => [i.animation, i.fontId, i.camera])).toEqual(land.items.map((i) => [i.animation, i.fontId, i.camera]));
  });

  it('装飾はセクション頭の波紋とサビの斜めラインのみ（ラインはサビ行だけ）', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      for (const [i, item] of direct(features, { ...base, seed }).items.entries()) {
        seen.add(item.deco);
        if (item.deco === 'lines') expect(features[i].isChorus).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(['lines', 'none', 'ring']);
  });

  it('長さは字幕末尾+0.5秒か MV 長の長い方', () => {
    expect(direct(features, { ...base, seed: 1 }).duration).toBe(20.5);
    expect(direct(features, { ...base, seed: 1, minDuration: 200 }).duration).toBe(200);
  });

  it('グリーン出力ではクロマキーで抜ける色を使わず、グローも切る', () => {
    const theme = { ...defaultTheme, palette: { text: ['#FFFFFF', '#33FF66'], accent: ['#00FFCC', '#FFD166'] } };
    for (let seed = 0; seed < 20; seed++) {
      const t = direct(features, { ...base, theme, seed, background: 'green' });
      expect(t.glow).toBe(0);
      for (const item of t.items) expect(isKeyUnsafe(item.color)).toBe(false);
    }
  });
});

describe('assignFontRoles', () => {
  it('役割ごとに振り分ける', () => {
    expect(assignFontRoles(['noto-sans-jp', 'dela-gothic-one', 'klee-one'])).toEqual({
      body: ['noto-sans-jp', 'klee-one'],
      display: ['dela-gothic-one'],
    });
  });

  it('片方の役割しか選ばれていない場合はもう片方で補う', () => {
    expect(assignFontRoles(['dotgothic16'])).toEqual({ body: ['dotgothic16'], display: ['dotgothic16'] });
    expect(assignFontRoles(['noto-serif-jp'])).toEqual({ body: ['noto-serif-jp'], display: ['noto-serif-jp'] });
  });

  it('未選択はエラー', () => {
    expect(() => assignFontRoles([])).toThrow();
  });

  it('1書体のみの場合、サビは太いウェイトになる', () => {
    const t = direct(features, { ...base, fontIds: ['noto-sans-jp'], seed: 1 });
    const chorus = t.items.find((i) => i.emphasis)!;
    expect(chorus.weight).toBe(700);
  });
});

describe('isKeyUnsafe', () => {
  it('緑〜シアンを検出し、白やピンクは許可する', () => {
    expect(isKeyUnsafe('#00FF00')).toBe(true);
    expect(isKeyUnsafe('#8EC5FF')).toBe(false);
    expect(isKeyUnsafe('#FFFFFF')).toBe(false);
    expect(isKeyUnsafe('#FF6FA8')).toBe(false);
  });
});
