// 利用者データ（字幕・MV・生成物）は React の state と、ここで管理する Blob URL のみに保持する。
// localStorage / IndexedDB / Cookie / Service Worker は使わない。
// ※ ダウンロード済みファイルとブラウザのダウンロード履歴はアプリから削除できない。

const urls = new Set<string>();

export function createObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  return url;
}

export function revokeObjectUrl(url: string | null | undefined): void {
  if (!url) return;
  URL.revokeObjectURL(url);
  urls.delete(url);
}

export function revokeAll(): void {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

/** Blob をファイルとして保存させ、直後に URL を破棄する */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = createObjectUrl(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // click 直後に revoke するとダウンロードが開始されないブラウザがあるため少し待つ
  setTimeout(() => revokeObjectUrl(url), 3000);
}
