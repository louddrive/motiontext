// アプリ本体の動作確認: 字幕の読み込み（キーボード操作を含む）→ プレビュー → MP4 の書き出し
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = 'tests/fixtures/sample.srt';

/** Tab キーを押し続けて、selector の要素にフォーカスが届くか（届けば true） */
async function tabTo(page: Page, selector: string, max = 25): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return true;
  }
  return false;
}

/** プレビューのキャンバスに描かれている明るい画素の数 */
const litPixels = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.stage canvas')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 200) n++;
    return n;
  });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
  await page.goto('/?lang=ja');
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test('字幕と MV のファイル選択にキーボードで届く', async ({ page }) => {
  expect(await tabTo(page, '.dropzone input[type=file]')).toBe(true);
  expect(await tabTo(page, '.file-btn input[type=file]')).toBe(true);
});

test('字幕を読み込むとプレビューに歌詞が描かれる', async ({ page }) => {
  await page.locator('.dropzone input[type=file]').setInputFiles(SAMPLE);
  await expect(page.locator('.stage canvas')).toBeVisible();
  await expect(page.locator('.stage-msg')).toHaveCount(0, { timeout: 30_000 });
  // 1つ目の字幕（0.5〜2.8秒）が表示されている時刻へ移動する
  await page.locator('.transport input[type=range]').fill('2');
  await expect.poll(() => litPixels(page), { timeout: 10_000 }).toBeGreaterThan(50);
});

test('色を変えても「読み込み中」を出さずにレイアウトを使い回す', async ({ page }) => {
  await page.locator('.dropzone input[type=file]').setInputFiles(SAMPLE);
  await expect(page.locator('.stage-msg')).toHaveCount(0, { timeout: 30_000 });
  // 演出レベルを変える（レイアウトは同じ）
  const level = page.locator('select').filter({ has: page.locator('option[value="ultra"]') });
  await level.selectOption('ultra');
  await expect(page.locator('.stage-msg')).toHaveCount(0);
});

test('MP4 を書き出せる', async ({ page }) => {
  test.setTimeout(300_000);
  // 書き出した Blob を横取りして中身を確かめる（ダウンロードされたファイルを Node 側で読まずに済むように）
  await page.addInitScript(() => {
    const original = URL.createObjectURL.bind(URL);
    (window as unknown as { __blobs: Blob[] }).__blobs = [];
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob) (window as unknown as { __blobs: Blob[] }).__blobs.push(obj);
      return original(obj);
    };
  });
  await page.goto('/?lang=ja');
  // 動作確認なので短い字幕で書き出す（GPU の無い CI でも時間がかからないように）
  await page.locator('.dropzone input[type=file]').setInputFiles('tests/fixtures/short.srt');
  await expect(page.locator('.stage-msg')).toHaveCount(0, { timeout: 30_000 });
  const download = page.waitForEvent('download', { timeout: 180_000 });
  await page.getByRole('button', { name: 'MP4 を書き出す' }).click();
  await expect(page.getByRole('progressbar', { name: '書き出しの進み具合' })).toBeVisible();
  // 書き出しがエラーで止まった場合は、待ち続けずにその文言で失敗させる
  const failed = page
    .locator('.export .error')
    .waitFor({ timeout: 180_000 })
    .then(async () => `書き出しのエラー: ${await page.locator('.export .error').innerText()}`);
  const outcome = await Promise.race([download, failed]);
  if (typeof outcome === 'string') throw new Error(outcome);
  expect(outcome.suggestedFilename()).toMatch(/^short_black_1920x1080_30fps\.mp4$/);
  const info = await page.evaluate(async () => {
    const blobs = (window as unknown as { __blobs: Blob[] }).__blobs;
    const mp4 = blobs.find((b) => b.type.startsWith('video/'))!;
    const head = new Uint8Array(await mp4.slice(0, 12).arrayBuffer());
    return { size: mp4.size, box: String.fromCharCode(...head.slice(4, 8)) };
  });
  expect(info.box).toBe('ftyp');
  expect(info.size).toBeGreaterThan(10_000);
  await expect(page.locator('.notice')).toBeVisible();
});
