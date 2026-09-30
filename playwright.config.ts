// ブラウザでの実描画・動作確認のテスト（Playwright）。単体テスト（Vitest）とは別に `npm run test:e2e` で実行する。
// 実描画の見た目の比較（visual）は OS ごとに文字の描き方が違うため、画像は OS 別に保存する。
import { defineConfig } from '@playwright/test';

const PORT = 5179;
// CI などで付属の Chromium に H.264 が無い場合は PW_CHANNEL=chrome で Google Chrome を使う
const channel = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PW_CHANNEL;
const isCI = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  // CI では失敗の内容を GitHub の注記（annotation）にも出す（サインインせずに API から読めるように）
  reporter: isCI ? [['github'], ['list']] : [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  expect: {
    toMatchSnapshot: { threshold: 0.2, maxDiffPixelRatio: 0.002 },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel,
    viewport: { width: 1400, height: 900 },
  },
  projects: [
    { name: 'visual', testMatch: 'visual.spec.ts' },
    { name: 'app', testMatch: 'app.spec.ts' },
    { name: 'sheet', testMatch: 'sheet.spec.ts' },
    { name: 'bench', testMatch: 'bench.spec.ts' },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/tests/e2e/harness.html`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
