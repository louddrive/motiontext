/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// フッターに出すバージョン（package.json）と更新日（最新コミットの日付・日本時間）
const APP_VERSION: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

function appDate(): string {
  try {
    const out = execSync('git log -1 --format=%cd --date=format-local:%Y%m%d', {
      env: { ...process.env, TZ: 'Asia/Tokyo' },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (/^\d{8}$/.test(out)) return out;
  } catch {
    // git が無い・リポジトリでない（ZIP から展開した等）場合はビルドした日を使う
  }
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()).replaceAll('-', '');
}

// 本番ビルドのみ CSP を埋め込み、外部への通信・読み込みを禁止する。
// （dev サーバーは HMR 用のインラインスクリプトを使うため対象外）
// ホスティング側でも同等の Content-Security-Policy ヘッダーを付けることを推奨。
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  // GitHub Pages（https://<アカウント>.github.io/motiontext/）では BASE_PATH=/motiontext/ でビルドする
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_DATE__: JSON.stringify(appDate()),
  },
  worker: { format: 'es' },
  build: {
    // 小さな woff2 が data: URI 化されると CSP(font-src 'self') に弾かれるため、フォントはインライン化しない
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // vitest は既定で CSS を空にするため、フォントの CSS（unicode-range の解析をテストする）だけは中身を読む
    css: { include: [/@fontsource\//] },
  },
});
