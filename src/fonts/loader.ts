// 同梱フォントを FontFace として登録し、必要な文字を含むチャンクだけをロードする。
// メインスレッド（document.fonts）と Worker（self.fonts）の両方で同じコードを使う。
// フォントファイルは同一オリジンの静的アセットで、外部サービスへの通信は発生しない。

import { fallbackIds, familyName, getFont } from './catalog';

// fontsource の CSS（unicode-range 付き @font-face 定義）。選択されたものだけ遅延取得する
const cssModules = import.meta.glob(
  [
    '/node_modules/@fontsource/noto-sans-jp/{400,700}.css',
    '/node_modules/@fontsource/zen-kaku-gothic-new/{400,700}.css',
    '/node_modules/@fontsource/noto-serif-jp/{400,700}.css',
    '/node_modules/@fontsource/m-plus-rounded-1c/{400,700}.css',
    '/node_modules/@fontsource/zen-maru-gothic/{400,700}.css',
    '/node_modules/@fontsource/klee-one/{400,600}.css',
    '/node_modules/@fontsource/biz-udpgothic/{400,700}.css',
    '/node_modules/@fontsource/biz-udpmincho/{400,700}.css',
    '/node_modules/@fontsource/shippori-mincho/{400,800}.css',
    '/node_modules/@fontsource/dela-gothic-one/400.css',
    '/node_modules/@fontsource/rocknroll-one/400.css',
    '/node_modules/@fontsource/reggae-one/400.css',
    '/node_modules/@fontsource/dotgothic16/400.css',
    '/node_modules/@fontsource/noto-sans-kr/{400,900}.css',
    '/node_modules/@fontsource/noto-serif-kr/{400,700}.css',
    '/node_modules/@fontsource/noto-sans-sc/{400,900}.css',
    '/node_modules/@fontsource/noto-serif-sc/{400,700}.css',
    '/node_modules/@fontsource/noto-sans-tc/{400,900}.css',
    '/node_modules/@fontsource/noto-serif-tc/{400,700}.css',
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
    '/node_modules/@fontsource/biz-udpgothic/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/biz-udpmincho/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/shippori-mincho/files/*-{400,800}-normal.woff2',
    '/node_modules/@fontsource/dela-gothic-one/files/*-400-normal.woff2',
    '/node_modules/@fontsource/rocknroll-one/files/*-400-normal.woff2',
    '/node_modules/@fontsource/reggae-one/files/*-400-normal.woff2',
    '/node_modules/@fontsource/dotgothic16/files/*-400-normal.woff2',
    '/node_modules/@fontsource/noto-sans-kr/files/*-{400,900}-normal.woff2',
    '/node_modules/@fontsource/noto-serif-kr/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/noto-sans-sc/files/*-{400,900}-normal.woff2',
    '/node_modules/@fontsource/noto-serif-sc/files/*-{400,700}-normal.woff2',
    '/node_modules/@fontsource/noto-sans-tc/files/*-{400,900}-normal.woff2',
    '/node_modules/@fontsource/noto-serif-tc/files/*-{400,700}-normal.woff2',
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

/** その書体・ウェイトの CSS がバンドルに含まれているか（カタログと glob の食い違いの検出用） */
export function isBundled(pkg: string, weight: number): boolean {
  return `/node_modules/@fontsource/${pkg}/${weight}.css` in cssModules;
}

/** unicode-range（"U+4e00-9fff,U+3042" 形式）を [開始, 終了] の組にする */
export function parseUnicodeRange(range: string): [number, number][] {
  const out: [number, number][] = [];
  for (const part of range.split(',')) {
    const m = /^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i.exec(part.trim());
    if (!m) continue;
    // ワイルドカード（U+4??）は範囲に展開する
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = parseInt(m[2] ?? m[1].replace(/\?/g, 'f'), 16);
    out.push([lo, hi]);
  }
  return out;
}

/** 範囲を開始順に並べ、重なり・隣接するものをまとめる（uncovered の二分探索用） */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

function inRanges(cp: number, merged: [number, number][]): boolean {
  let lo = 0;
  let hi = merged.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < merged[mid][0]) hi = mid - 1;
    else if (cp > merged[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** text のうち merged（mergeRanges 済み）に含まれない文字（重複と空白を除く） */
export function uncovered(text: string, merged: [number, number][]): string {
  let out = '';
  for (const ch of new Set(text)) {
    if (/\s/.test(ch)) continue;
    if (!inRanges(ch.codePointAt(0)!, merged)) out += ch;
  }
  return out;
}

// CSS の解析結果は書体ごとに使い回す（メインスレッドと Worker では別々に持つ）
const faceCache = new Map<string, Promise<FaceSpec[]>>();

function facesFor(id: string): Promise<FaceSpec[]> {
  let p = faceCache.get(id);
  if (!p) {
    p = (async () => {
      const def = getFont(id);
      const specs: FaceSpec[] = [];
      for (const w of def.weights) {
        const loader = cssModules[`/node_modules/@fontsource/${def.pkg}/${w}.css`];
        if (!loader) throw new Error(`font css not bundled: ${def.pkg} ${w}`);
        specs.push(...parseFontsourceCss(await loader(), def.pkg, familyName(id)));
      }
      return specs;
    })();
    // 取得に失敗したときは次回に取り直す
    p.catch(() => faceCache.delete(id));
    faceCache.set(id, p);
  }
  return p;
}

const rangeCache = new Map<string, [number, number][]>();

/** 書体が収録している文字の範囲（全ウェイトの unicode-range の和。mergeRanges 済み） */
async function rangesFor(id: string): Promise<[number, number][]> {
  const cached = rangeCache.get(id);
  if (cached) return cached;
  const merged = mergeRanges((await facesFor(id)).flatMap((s) => parseUnicodeRange(s.unicodeRange)));
  rangeCache.set(id, merged);
  return merged;
}

const registered = new WeakMap<FontFaceSet, Set<string>>();

/** フォントとそのフォールバックを FontFaceSet に登録する（同じ set への二重登録はしない） */
export async function registerFonts(fontSet: FontFaceSet, ids: string[]): Promise<void> {
  let done = registered.get(fontSet);
  if (!done) registered.set(fontSet, (done = new Set()));
  const all = Array.from(new Set(ids.flatMap((id) => [id, ...fallbackIds(id)])));
  for (const id of all) {
    if (done.has(id)) continue;
    for (const s of await facesFor(id)) {
      fontSet.add(new FontFace(s.family, `url(${s.url}) format('woff2')`, { weight: String(s.weight), unicodeRange: s.unicodeRange }));
    }
    done.add(id);
  }
}

/**
 * text の描画に必要なチャンクをロードし終えるまで待つ。
 * フォールバックには、先に試す書体に無い文字だけを渡す（日本語の歌詞で中国語・韓国語の書体まで取得しないように）。
 */
export async function ensureGlyphs(fontSet: FontFaceSet, ids: string[], text: string): Promise<void> {
  await registerFonts(fontSet, ids);
  const sample = text || 'あ';
  const loads: Promise<unknown>[] = [];
  for (const id of new Set(ids)) {
    let rest = sample;
    for (const fid of [id, ...fallbackIds(id)]) {
      if (!rest) break;
      for (const w of getFont(fid).weights) loads.push(fontSet.load(`${w} 64px "${familyName(fid)}"`, rest));
      rest = uncovered(rest, await rangesFor(fid));
    }
  }
  await Promise.all(loads);
}
