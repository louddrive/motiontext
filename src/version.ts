/** バージョン表示（例: v0.1(20260929)）。パッチ番号が 0 なら省く */
export function formatVersion(version: string, date: string): string {
  const [major = '0', minor = '0', patch = '0'] = version.split('.');
  const v = patch === '0' ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
  return `v${v}(${date})`;
}

/** フッターに出すバージョンと更新日（package.json の version と、最新コミットの日付） */
export const APP_VERSION_LABEL = formatVersion(__APP_VERSION__, __APP_DATE__);
