// Playwright のテストから実描画用のページ（harness.html）を操作する
import type { Page } from '@playwright/test';

/** ゴールデン用の設定の名前（tests/helpers/goldenPresets.ts と同じ。一致するかはテストで検査する） */
export const PRESETS = [
  'standard-landscape',
  'none-landscape',
  'ultra-portrait',
  'emo-vertical-always',
  'subtle-outline-shadow-xl',
  'standard-backdrop-transparent',
  'standard-green',
  'standard-sync',
  'emo-sync',
  'ultra-sync-portrait',
];

export async function openHarness(page: Page) {
  await page.goto('/tests/e2e/harness.html');
  await page.waitForFunction(() => document.title === 'harness ready');
}

/** 設定 name の曲全体のコンタクトシートを描いてページに表示し、その要素を返す */
export async function showSheet(page: Page, name: string, cellW: number) {
  const times = await page.evaluate((n) => window.mt.times(n), name);
  const url = await page.evaluate(([n, t, w]) => window.mt.sheet(n, t, 6, w), [name, times, cellW] as const);
  const size = await page.evaluate((u) => window.mt.show(u), url);
  await page.setViewportSize(size);
  return page.locator('#out');
}
