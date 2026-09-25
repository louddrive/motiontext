// 同梱フォント一覧（すべて @fontsource 経由のセルフホスト。ライセンスは各パッケージの package.json で OFL-1.1 を確認済み）
// role: body = 通常行向けの読みやすい書体 / display = サビ・強調向けの個性的な書体

export type FontRole = 'body' | 'display';

export interface FontDef {
  id: string;
  label: string;
  /** @fontsource パッケージ名（node_modules/@fontsource/<pkg>） */
  pkg: string;
  role: FontRole;
  /** 利用するウェイト。先頭が通常、末尾が強調 */
  weights: number[];
  mood: string[];
  license: 'OFL-1.1';
}

export const FONT_CATALOG: FontDef[] = [
  { id: 'noto-sans-jp', label: 'Noto Sans JP', pkg: 'noto-sans-jp', role: 'body', weights: [400, 700], mood: ['clean', 'neutral'], license: 'OFL-1.1' },
  { id: 'zen-kaku-gothic-new', label: 'Zen Kaku Gothic New', pkg: 'zen-kaku-gothic-new', role: 'body', weights: [400, 700], mood: ['clean', 'modern'], license: 'OFL-1.1' },
  { id: 'noto-serif-jp', label: 'Noto Serif JP', pkg: 'noto-serif-jp', role: 'body', weights: [400, 700], mood: ['elegant', 'calm'], license: 'OFL-1.1' },
  { id: 'm-plus-rounded-1c', label: 'M PLUS Rounded 1c', pkg: 'm-plus-rounded-1c', role: 'body', weights: [400, 700], mood: ['soft', 'pop'], license: 'OFL-1.1' },
  { id: 'zen-maru-gothic', label: 'Zen Maru Gothic', pkg: 'zen-maru-gothic', role: 'body', weights: [400, 700], mood: ['soft', 'calm'], license: 'OFL-1.1' },
  { id: 'klee-one', label: 'Klee One', pkg: 'klee-one', role: 'body', weights: [400, 600], mood: ['handwritten', 'warm'], license: 'OFL-1.1' },
  { id: 'dela-gothic-one', label: 'Dela Gothic One', pkg: 'dela-gothic-one', role: 'display', weights: [400], mood: ['bold', 'impact'], license: 'OFL-1.1' },
  { id: 'rocknroll-one', label: 'RocknRoll One', pkg: 'rocknroll-one', role: 'display', weights: [400], mood: ['pop', 'energetic'], license: 'OFL-1.1' },
  { id: 'reggae-one', label: 'Reggae One', pkg: 'reggae-one', role: 'display', weights: [400], mood: ['bold', 'rough'], license: 'OFL-1.1' },
  { id: 'dotgothic16', label: 'DotGothic16', pkg: 'dotgothic16', role: 'display', weights: [400], mood: ['retro', 'digital'], license: 'OFL-1.1' },
];

export const DEFAULT_FONT_IDS = ['noto-sans-jp', 'dela-gothic-one'];

/** 収録外の文字を描くためのフォールバック（常にロードする） */
export const FALLBACK_FONT_ID = 'noto-sans-jp';

export function getFont(id: string): FontDef {
  const f = FONT_CATALOG.find((x) => x.id === id);
  if (!f) throw new Error(`unknown font: ${id}`);
  return f;
}

/** Canvas で使うファミリー名（ページ内の他フォントと衝突しないよう接頭辞を付ける） */
export function familyName(id: string): string {
  return `mt-${id}`;
}

/** Canvas の ctx.font 用文字列。フォールバックを連結する */
export function cssFont(id: string, weight: number, sizePx: number): string {
  const fb = id === FALLBACK_FONT_ID ? '' : `, "${familyName(FALLBACK_FONT_ID)}"`;
  return `${weight} ${sizePx}px "${familyName(id)}"${fb}, sans-serif`;
}
