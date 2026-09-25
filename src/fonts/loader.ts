// 同梱フォントを FontFace として登録し、必要な文字を含むチャンクだけをロードする。
// メインスレッド（document.fonts）と Worker（self.fonts）の両方で同じコードを使う。
// フォントファイルは同一オリジンの静的アセットで、外部サービスへの通信は発生しない。

import { FALLBACK_FONT_ID, cssFont, familyName, getFont } from './catalog';

// fontsource の CSS（unicode-range 付き @font-face 定義）。選択されたものだけ遅延取得する
const cssModules = import.meta.glob(
  [
    '/node_modules/@fontsource/noto-sans-jp/{400,700}.css',
    '/node_modules/@fontsource/zen-kaku-gothic-new/{400,700}.css',
    '/node_modules/@fontsource/noto-serif-jp/{400,700}.css',
    '/node_modules/@fontsource/m-plus-rounded-1c/{400,700}.css',
    '/node_modules/@fontsource/zen-maru-gothic/{400,700}.css',
    '/node_modules/@fontsource/klee-one/{400,600}.css',
    '/node_modules/@fontsource/dela-gothic-one/400.css',
    '/node_modules/@fontsource/rocknroll-one/400.css',
    '/node_modules/@fontsource/reggae-one/400.css',
    '/node_modules/@fontsource/dotgothic16/400.css',
  ],
  { query: '?raw', import: 'default' },
) as Record<string, () => Promise<string>>;

// woff2 ファイルの URL（URL 文字列のみ。実ファイルは FontFace.load 時に取得される）
const fileUrls = import.meta.glob(
  [
    '/node_modules/@fontsource/noto-sans-jp/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/zen-kaku-gothic-new/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/noto-serif-jp/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/m-plus-rounded-1c/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/zen-maru-gothic/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/klee-one/files/*-{400,600}-normal.woff2',
    '/node_modules/@fontsource/dela-gothic-one/files/*-400-normal.woff2',
    '/node_modules/@fontsource/rocknroll-one/files/*-400-normal.woff2',
    '/node_modules/@fontsource/reggae-one/files/*-400-normal.woff2',
    '/node_modules/@fontsource/dotgothic16/files/*-400-normal.woff2',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;

export interface FaceSpec {
  family: string;
  weight: number;
  url: string;
  unicodeRange: string;
}

const FACE_RE = /@font-face\s*{([^}]*)}/g;

/** fontsource の CSS から FaceSpec を抽出する */
export function parseFontsourceCss(css: string, pkg: string, family: string): FaceSpec[] {
  const out: FaceSpec[] = [];
  for (const m of css.matchAll(FACE_RE)) {
    const body = m[1];
    const weight = Number(/font-weight:\s*(\d+)/.exec(body)?.[1] ?? 400);
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    if (!file) continue;
    const url = fileUrls[`/node_modules/@fontsource/${pkg}/files/${file}`];
    if (!url) continue;
    out.push({ family, weight, url, unicodeRange: range ?? 'U+0-10FFFF' });
  }
  return out;
}

async function facesFor(id: string): Promise<FaceSpec[]> {
  const def = getFont(id);
  const specs: FaceSpec[] = [];
  for (const w of def.weights) {
    const loader = cssModules[`/node_modules/@fontsource/${def.pkg}/${w}.css`];
    if (!loader) throw new Error(`font css not bundled: ${def.pkg} ${w}`);
    specs.push(...parseFontsourceCss(await loader(), def.pkg, familyName(id)));
  }
  return specs;
}

const registered = new WeakMap<FontFaceSet, Set<string>>();

/** フォントを FontFaceSet に登録する（同じ set への二重登録はしない） */
export async function registerFonts(fontSet: FontFaceSet, ids: string[]): Promise<void> {
  let done = registered.get(fontSet);
  if (!done) registered.set(fontSet, (done = new Set()));
  const all = Array.from(new Set([...ids, FALLBACK_FONT_ID]));
  for (const id of all) {
    if (done.has(id)) continue;
    for (const s of await facesFor(id)) {
      fontSet.add(new FontFace(s.family, `url(${s.url}) format('woff2')`, { weight: String(s.weight), unicodeRange: s.unicodeRange }));
    }
    done.add(id);
  }
}

/** text の描画に必要なチャンクをロードし終えるまで待つ */
export async function ensureGlyphs(fontSet: FontFaceSet, ids: string[], text: string): Promise<void> {
  await registerFonts(fontSet, ids);
  const sample = text || 'あ';
  const all = Array.from(new Set([...ids, FALLBACK_FONT_ID]));
  await Promise.all(
    all.flatMap((id) => getFont(id).weights.map((w) => fontSet.load(cssFont(id, w, 64).split(',')[0], sample))),
  );
}
