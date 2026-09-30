// 描画の速さを測る（1920x1080 等の実寸で renderFrame 1回あたりの ms）。`npm run bench`
// 結果は環境で大きく変わるので合否は付けず、一覧を出力する。
import { test } from '@playwright/test';
import { openHarness } from './harness.helpers';

type Case = [name: string, label: string, opts: { blurSamples?: number }, patch: Record<string, unknown>];
const NO_BLUR = { motionBlur: { shutter: 0, samples: 1 } };
const CASES: Case[] = [
  ['none-landscape', 'full', {}, {}],
  ['standard-landscape', 'full', {}, {}],
  // 負荷の内訳: グローなし / ブラーなし / 両方なし
  ['standard-landscape', 'no-glow', {}, { glow: 0 }],
  ['standard-landscape', 'no-blur', {}, NO_BLUR],
  ['standard-landscape', 'no-glow-blur', {}, { glow: 0, ...NO_BLUR }],
  ['emo-vertical-always', 'full', {}, {}],
  ['ultra-portrait', 'full', {}, {}],
  // プレビューの再生中はブラーの描き重ねを3回に抑える（src/ui/Preview.tsx）
  ['ultra-portrait', 'preview', { blurSamples: 3 }, {}],
  ['subtle-outline-shadow-xl', 'full', {}, {}],
];

test('renderFrame の速さ', async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const rows = [];
  for (const [name, label, opts, patch] of CASES) {
    const r = await page.evaluate(([n, o, pt]) => window.mt.bench(n, 150, o, pt), [name, opts, patch] as const);
    rows.push({ ...r, label });
  }
  const fmt = (v: number) => v.toFixed(1).padStart(6);
  const table = rows.map((r) => `${r.preset.padEnd(28)} ${r.label.padEnd(13)} mean=${fmt(r.mean)} p50=${fmt(r.p50)} p95=${fmt(r.p95)} max=${fmt(r.max)} ms`);
  console.log(['', ...table].join('\n'));
  await test.info().attach('bench.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
});

test('リズム解析の速さ', async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const rows = [];
  for (const seconds of [60, 300]) rows.push(await page.evaluate((s) => window.mt.analyzeBench(s), seconds));
  const lines = rows.map((r) => `analyze ${String(r.seconds).padStart(4)} s audio: ${r.ms.toFixed(0).padStart(6)} ms (bpm ${r.bpm}, ${r.beats} beats)`);
  console.log(['', ...lines].join('\n'));
  await test.info().attach('analyze.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
});
