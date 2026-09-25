/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

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
  worker: { format: 'es' },
  build: {
    // 小さな woff2 が data: URI 化されると CSP(font-src 'self') に弾かれるため、フォントはインライン化しない
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
