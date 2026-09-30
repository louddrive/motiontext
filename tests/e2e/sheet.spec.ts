// 確認用のコンタクトシートを test-results/contact/ に書き出す（比較はしない）。`npm run sheet`
import { test } from '@playwright/test';
import { openHarness, PRESETS, showSheet } from './harness.helpers';

for (const name of PRESETS) {
  test(name, async ({ page }) => {
    await openHarness(page);
    const sheet = await showSheet(page, name, 480);
    await sheet.screenshot({ path: `test-results/contact/${name}.png` });
  });
}

// 間奏の表示（拍に合わせるときの音量の波形を含む）を、横型・円形それぞれで細かく並べる（「エモい」「超エモ」）
for (const preset of ['emo-sync', 'ultra-sync-portrait'] as const) {
  for (const style of ['bar', 'ring'] as const) {
    test(`間奏 ${preset} ${style}`, async ({ page }) => {
      await openHarness(page);
      const times = Array.from({ length: 12 }, (_, i) => Math.round((29 + i * 0.29) * 1000) / 1000);
      const url = await page.evaluate(([n, t, s]) => window.mt.sheet(n, t, 3, 640, s), [preset, times, style] as const);
      const size = await page.evaluate((u) => window.mt.show(u), url);
      await page.setViewportSize(size);
      await page.locator('#out').screenshot({ path: `test-results/contact/interlude-${preset}-${style}.png` });
    });
  }
}
