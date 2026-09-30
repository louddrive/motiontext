// ゴールデンテスト用の演出の設定（描画命令のテストと、ブラウザでの実描画テストで共通）
import { analyze } from '../../src/analysis/features';
import { direct, type DirectOptions } from '../../src/director/director';
import { ASPECTS, type Timeline } from '../../src/director/types';
import { parseSubtitle } from '../../src/parsers/detect';
import type { RenderOptions } from '../../src/render/renderer';
import { defaultTheme } from '../../src/themes/default';
import { applyEffectLevel, type EffectLevel } from '../../src/themes/effectLevel';
import src from '../fixtures/golden.srt?raw';
import { makeRhythm } from './rhythmFixture';

export const GOLDEN_FONT = { fontIds: ['noto-sans-jp'], fontRoles: { body: 'noto-sans-jp', display: null } };
/** フォントを読み込む文字（歌詞 + 間奏のパーセンテージ） */
export const GOLDEN_TEXT = `${src}\n0123456789%`;

const features = analyze(parseSubtitle('golden.srt', src).cues);

/** ゴールデン用の曲のリズム（仮の解析結果） */
export const GOLDEN_RHYTHM = makeRhythm({ bpm: 124, start: 0.4, duration: 56, sections: [14.5, 36] });

function build(level: EffectLevel, aspect: 'landscape' | 'portrait', extra: Partial<DirectOptions> = {}): Timeline {
  return direct(features, {
    theme: applyEffectLevel(defaultTheme, level),
    seed: 1,
    ...GOLDEN_FONT,
    background: 'black',
    width: ASPECTS[aspect].width,
    height: ASPECTS[aspect].height,
    ...extra,
  });
}

export interface GoldenPreset {
  timeline: Timeline;
  opts: RenderOptions;
}

export const GOLDEN_PRESETS: Record<string, () => GoldenPreset> = {
  'standard-landscape': () => ({ timeline: build('standard', 'landscape'), opts: {} }),
  'none-landscape': () => ({ timeline: build('none', 'landscape'), opts: {} }),
  'ultra-portrait': () => ({ timeline: build('ultra', 'portrait'), opts: {} }),
  'emo-vertical-always': () => ({ timeline: build('emo', 'landscape', { verticalMode: 'always' }), opts: {} }),
  'subtle-outline-shadow-xl': () => ({
    timeline: build('subtle', 'landscape', { outline: true, shadow: true, sizeLevel: 'xl', color: '#FFD166' }),
    opts: {},
  }),
  'standard-backdrop-transparent': () => ({
    timeline: build('standard', 'landscape', { backdrop: { opacity: 0.4, mode: 'lyrics', color: '#101830' } }),
    opts: { transparent: true, backdrop: true },
  }),
  'standard-green': () => ({ timeline: build('standard', 'landscape', { background: 'green' }), opts: {} }),
  // 曲の拍に合わせる（124 BPM の仮の解析結果。区切りは 14.5 秒と 36 秒）
  'standard-sync': () => ({ timeline: build('standard', 'landscape', { rhythm: GOLDEN_RHYTHM }), opts: {} }),
  // 「エモい」以上は、間奏に曲の音量の波形も出る
  'emo-sync': () => ({ timeline: build('emo', 'landscape', { rhythm: GOLDEN_RHYTHM }), opts: {} }),
  'ultra-sync-portrait': () => ({ timeline: build('ultra', 'portrait', { rhythm: GOLDEN_RHYTHM }), opts: {} }),
};

/** 各字幕の登場中・表示中と、間奏の途中の時刻 */
export function goldenTimes(tl: Timeline): number[] {
  return [...tl.items.flatMap((it) => [it.start + 0.2, (it.start + it.end) / 2]), 32].map((t) => Math.round(t * 1000) / 1000);
}
