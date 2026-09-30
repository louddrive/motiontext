// 実フォントでの描画の見た目を、保存済みの画像（tests/e2e/__screenshots__/<OS>/）と比べる。
// 演出を意図して変えたときは `npm run test:visual:update` で更新し、画像の差分を確認してからコミットする。
import { expect, test } from '@playwright/test';
import { openHarness, PRESETS, showSheet } from './harness.helpers';

test('設定の一覧が goldenPresets と一致する', async ({ page }) => {
  await openHarness(page);
  expect(await page.evaluate(() => window.mt.presets())).toEqual(PRESETS);
});

for (const name of PRESETS) {
  test(name, async ({ page }) => {
    await openHarness(page);
    const sheet = await showSheet(page, name, 256);
    expect(await sheet.screenshot()).toMatchSnapshot(`${name}.png`);
  });
}
