// PNG 連番の命名規則（純粋関数）

/** ファイル名に使えない文字を置き換える */
export function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'lyrics';
}

/** 連番ファイル名: <base>_000000.png */
export function frameFileName(base: string, index: number): string {
  return `${safeName(base)}_${String(index).padStart(6, '0')}.png`;
}

/** 出力サブフォルダ名: <base>_<幅>x<高さ>_<fps>fps_png */
export function sequenceFolderName(base: string, width: number, height: number, fps: number): string {
  return `${safeName(base)}_${width}x${height}_${fps}fps_png`;
}

/** 既存の名前と重ならない名前を返す（name, name_2, name_3, ...）。既存フォルダは上書きしない */
export function pickUniqueName(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name}_${n}`;
    if (!existing.has(candidate)) return candidate;
  }
}
