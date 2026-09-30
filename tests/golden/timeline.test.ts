// Timeline のゴールデンテスト: 固定の字幕・シード・設定から作る演出計画を、ファイルに固定して比べる。
// 意図しない変更（パターン番号で同じ演出が再現しなくなる変更）を検出する。
// 演出を意図して変えたときは `npx vitest run tests/golden -u` で更新し、差分を確認してからコミットする。
import { describe, expect, it } from 'vitest';
// @types/node を入れずに読むため Vite の ?raw を使う（tests/fonts.test.ts と同じ）
import src from '../fixtures/golden.srt?raw';
import { analyze } from '../../src/analysis/features';
import { direct, type DirectOptions } from '../../src/director/director';
import { ASPECTS, type Aspect, type Timeline } from '../../src/director/types';
import { parseSubtitle } from '../../src/parsers/detect';
import { defaultTheme } from '../../src/themes/default';
import { EFFECT_LEVELS, applyEffectLevel, type EffectLevel } from '../../src/themes/effectLevel';
import { GOLDEN_RHYTHM } from '../helpers/goldenPresets';

const SEEDS = [1, 20260930];
const features = analyze(parseSubtitle('golden.srt', src).cues);

function build(level: EffectLevel, aspect: Aspect, seed: number, extra: Partial<DirectOptions> = {}): Timeline {
  return direct(features, {
    theme: applyEffectLevel(defaultTheme, level),
    seed,
    fontIds: ['noto-sans-jp'],
    fontRoles: { body: 'noto-sans-jp', display: null },
    background: 'black',
    width: ASPECTS[aspect].width,
    height: ASPECTS[aspect].height,
    ...extra,
  });
}

/** 差分が読みやすいよう、アイテムは1行1件の JSON にする */
function serialize(tl: Timeline): string {
  const { items, ...rest } = tl;
  return [JSON.stringify(rest), ...items.map((it) => JSON.stringify(it))].join('\n') + '\n';
}

describe('Timeline のゴールデン', () => {
  for (const level of EFFECT_LEVELS) {
    for (const aspect of ['landscape', 'portrait'] as const) {
      it(`${level} / ${aspect}`, async () => {
        const out = SEEDS.map((seed) => `# seed ${seed}\n${serialize(build(level, aspect, seed))}`).join('');
        await expect(out).toMatchFileSnapshot(`./__golden__/timeline/${level}-${aspect}.jsonl`);
      });
    }
  }

  // スタイル設定の組み合わせ（標準・横向き）
  const variants: Record<string, Partial<DirectOptions>> = {
    'display-font': { fontIds: ['noto-sans-jp', 'dela-gothic-one'], fontRoles: { body: 'noto-sans-jp', display: 'dela-gothic-one' } },
    'size-xl': { sizeLevel: 'xl' },
    'size-xs': { sizeLevel: 'xs' },
    'vertical-always': { verticalMode: 'always' },
    'vertical-off': { verticalMode: 'off' },
    'single-color-outline-shadow': { color: '#FFD166', outline: true, shadow: true },
    'green-backdrop': { background: 'green', backdrop: { opacity: 0.4, mode: 'lyrics', color: '#101830' } },
    'kana-strong-no-stroke': { kanaRatio: 0.56, strokeEmphasis: false },
    'mv-longer': { minDuration: 70 },
    // 曲の拍に合わせる（仮の解析結果）
    'beat-sync': { rhythm: GOLDEN_RHYTHM },
  };
  for (const [name, extra] of Object.entries(variants)) {
    it(`standard / ${name}`, async () => {
      const out = `# seed ${SEEDS[0]}\n${serialize(build('standard', 'landscape', SEEDS[0], extra))}`;
      await expect(out).toMatchFileSnapshot(`./__golden__/timeline/variant-${name}.jsonl`);
    });
  }
});
