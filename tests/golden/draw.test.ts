// 描画命令のゴールデンテスト: renderFrame が「どこへ・どの見た目で」描いたかを記録してファイルに固定する。
// 実フォントを使わない（文字幅は近似）ので、見た目の最終確認は Playwright の実描画テストで行う。
// 演出を意図して変えたときは `npx vitest run tests/golden -u` で更新し、差分を確認してからコミットする。
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analysis/features';
import { ANIMATION_IDS } from '../../src/animations/types';
import { direct } from '../../src/director/director';
import { NO_BACKDROP, NO_MOTION_BLUR, type Timeline, type TimelineItem } from '../../src/director/types';
import type { Cue } from '../../src/parsers/types';
import { buildLayouts, renderFrame, type RenderOptions } from '../../src/render/renderer';
import { defaultTheme } from '../../src/themes/default';
import { GOLDEN_FONT as FONT, GOLDEN_PRESETS, goldenTimes } from '../helpers/goldenPresets';
import { installOffscreenCanvas, recordingCtx } from '../helpers/recordingCtx';

/** タイムラインの指定時刻を順に描き、記録を1つの文字列にする */
function record(timeline: Timeline, times: number[], opts: RenderOptions = {}): string {
  const log: string[] = [];
  const restore = installOffscreenCanvas(log);
  try {
    const { ctx } = recordingCtx(timeline.width, timeline.height, log);
    const layouts = buildLayouts(ctx, timeline);
    for (const t of times) {
      log.push(`## t=${t}`);
      renderFrame(ctx, timeline, layouts, t, opts);
    }
  } finally {
    restore();
  }
  return log.join('\n') + '\n';
}

describe('演出ごとの描画命令', () => {
  const W = 1920;
  const H = 1080;
  const cues: Cue[] = [
    { index: 0, start: 0, end: 3, text: '規格に合わせて　比較を消し去り' },
    { index: 1, start: 0, end: 3, text: '遠く滲んだ信号が\n青に変わるまで' },
  ];
  const feats = analyze(cues);
  const itemsFor = (verticalMode: 'off' | 'always') =>
    direct(feats, { theme: defaultTheme, seed: 1, ...FONT, background: 'black', verticalMode }).items;
  const [horizontal, twoLines] = itemsFor('off');
  const [mixed] = itemsFor('always');
  const vertical: TimelineItem = { ...horizontal, vertical: true, mixed: null, lines: [horizontal.lines[0].slice(0, 3)], emphasisRanges: [null] };
  const flat = (item: TimelineItem): TimelineItem => ({ ...item, camera: null, deco: 'none', shine: false, particles: false, underline: false });
  const layouts: Record<string, TimelineItem> = {
    horizontal: flat(horizontal),
    twoLines: flat(twoLines),
    vertical: flat(vertical),
    mixed: flat(mixed),
  };
  const timelineOf = (item: TimelineItem, over: Partial<Timeline> = {}): Timeline => ({
    width: W,
    height: H,
    fps: 30,
    duration: 3.5,
    background: 'black',
    glow: 0,
    backdrop: NO_BACKDROP,
    motionBlur: NO_MOTION_BLUR,
    outline: false,
    shadow: false,
    shakes: [],
    interludes: [],
    items: [item],
    ...over,
  });
  // 登場の途中・登場の終わり際・表示中・退場の途中
  const TIMES = [0.15, 0.4, 1.5, 2.85];

  for (const id of ANIMATION_IDS) {
    it(id, async () => {
      const out = Object.entries(layouts)
        .map(([name, item]) => `# ${name}\n${record(timelineOf({ ...item, animation: id }), TIMES)}`)
        .join('');
      await expect(out).toMatchFileSnapshot(`./__golden__/draw/anim-${id}.log`);
    });
  }

  it('カメラ・縁取り・影・シャイン・装飾・グロー', async () => {
    const item: TimelineItem = {
      ...layouts.horizontal,
      animation: 'fadeUp',
      camera: { type: 'orbit', dir: 1, intensity: 1 },
      shine: true,
      particles: true,
      underline: true,
      deco: 'ring',
      emphasis: true,
    };
    const tl = timelineOf(item, { outline: true, shadow: true, glow: 18, shakes: [{ time: 0, strength: 1 }] });
    const verticalTl = timelineOf({ ...item, ...layouts.vertical, animation: 'fadeUp', underline: true, deco: 'lines' }, { outline: true });
    const out = `# horizontal\n${record(tl, [0.1, 0.5, 1.2, 1.6, 2.9])}# vertical\n${record(verticalTl, [0.5, 1.6])}`;
    await expect(out).toMatchFileSnapshot('./__golden__/draw/styles.log');
  });
});

describe('間奏の表示の描画命令（曲の拍に合わせる）', () => {
  for (const style of ['bar', 'ring'] as const) {
    it(style, async () => {
      const { timeline } = GOLDEN_PRESETS['standard-sync']();
      const patched = { ...timeline, interludes: timeline.interludes.map((iv) => ({ ...iv, style })) };
      await expect(record(patched, [29, 30.2, 31.53, 34.9])).toMatchFileSnapshot(`./__golden__/draw/interlude-sync-${style}.log`);
    });
  }
});

describe('曲全体のフレームの描画命令', () => {
  for (const [name, preset] of Object.entries(GOLDEN_PRESETS)) {
    it(name, async () => {
      const { timeline, opts } = preset();
      // モーションブラーの描き重ねは2回に抑える（記録の量を減らす。処理の経路は同じで、回数の計算は単体テストで確認している）
      await expect(record(timeline, goldenTimes(timeline), { blurSamples: 2, ...opts })).toMatchFileSnapshot(`./__golden__/draw/frames-${name}.log`);
    });
  }
});
