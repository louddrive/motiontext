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
