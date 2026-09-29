// 同梱フォント一覧（すべて @fontsource 経由のセルフホスト。ライセンスは各パッケージの package.json で OFL-1.1 を確認済み）
// role: body = 通常行向けの読みやすい書体 / display = サビ・強調向けの個性的な書体

export type FontRole = 'body' | 'display';

/** 書体が主に対象とする言語（字形の地域差があるため、漢字圏は言語ごとに分ける） */
export type FontScript = 'ja' | 'ko' | 'zh-Hans' | 'zh-Hant';

export interface FontDef {
  id: string;
  label: string;
  /** @fontsource パッケージ名（node_modules/@fontsource/<pkg>） */
  pkg: string;
  role: FontRole;
  script: FontScript;
  /** 利用するウェイト。先頭が通常、末尾が強調 */
  weights: number[];
  mood: string[];
  license: 'OFL-1.1';
}

export const FONT_CATALOG: FontDef[] = [
  { id: 'noto-sans-jp', label: 'Noto Sans JP', pkg: 'noto-sans-jp', role: 'body', script: 'ja', weights: [400, 700], mood: ['clean', 'neutral'], license: 'OFL-1.1' },
  { id: 'zen-kaku-gothic-new', label: 'Zen Kaku Gothic New', pkg: 'zen-kaku-gothic-new', role: 'body', script: 'ja', weights: [400, 700], mood: ['clean', 'modern'], license: 'OFL-1.1' },
  { id: 'noto-serif-jp', label: 'Noto Serif JP', pkg: 'noto-serif-jp', role: 'body', script: 'ja', weights: [400, 700], mood: ['elegant', 'calm'], license: 'OFL-1.1' },
  { id: 'm-plus-rounded-1c', label: 'M PLUS Rounded 1c', pkg: 'm-plus-rounded-1c', role: 'body', script: 'ja', weights: [400, 700], mood: ['soft', 'pop'], license: 'OFL-1.1' },
  { id: 'zen-maru-gothic', label: 'Zen Maru Gothic', pkg: 'zen-maru-gothic', role: 'body', script: 'ja', weights: [400, 700], mood: ['soft', 'calm'], license: 'OFL-1.1' },
  { id: 'klee-one', label: 'Klee One', pkg: 'klee-one', role: 'body', script: 'ja', weights: [400, 600], mood: ['handwritten', 'warm'], license: 'OFL-1.1' },
  { id: 'biz-udpgothic', label: 'BIZ UDPGothic', pkg: 'biz-udpgothic', role: 'body', script: 'ja', weights: [400, 700], mood: ['clean', 'neutral'], license: 'OFL-1.1' },
  { id: 'biz-udpmincho', label: 'BIZ UDPMincho', pkg: 'biz-udpmincho', role: 'body', script: 'ja', weights: [400, 700], mood: ['elegant', 'neutral'], license: 'OFL-1.1' },
  { id: 'shippori-mincho', label: 'Shippori Mincho', pkg: 'shippori-mincho', role: 'body', script: 'ja', weights: [400, 800], mood: ['elegant', 'calm'], license: 'OFL-1.1' },
  { id: 'dela-gothic-one', label: 'Dela Gothic One', pkg: 'dela-gothic-one', role: 'display', script: 'ja', weights: [400], mood: ['bold', 'impact'], license: 'OFL-1.1' },
  { id: 'rocknroll-one', label: 'RocknRoll One', pkg: 'rocknroll-one', role: 'display', script: 'ja', weights: [400], mood: ['pop', 'energetic'], license: 'OFL-1.1' },
  { id: 'reggae-one', label: 'Reggae One', pkg: 'reggae-one', role: 'display', script: 'ja', weights: [400], mood: ['bold', 'rough'], license: 'OFL-1.1' },
  { id: 'dotgothic16', label: 'DotGothic16', pkg: 'dotgothic16', role: 'display', script: 'ja', weights: [400], mood: ['retro', 'digital'], license: 'OFL-1.1' },
  // 韓国語・中国語。強調向けの書体がないので、Sans は 900 を強調のウェイトにして強弱を出す
  { id: 'noto-sans-kr', label: 'Noto Sans KR', pkg: 'noto-sans-kr', role: 'body', script: 'ko', weights: [400, 900], mood: ['clean', 'neutral'], license: 'OFL-1.1' },
  { id: 'noto-serif-kr', label: 'Noto Serif KR', pkg: 'noto-serif-kr', role: 'body', script: 'ko', weights: [400, 700], mood: ['elegant', 'calm'], license: 'OFL-1.1' },
  { id: 'noto-sans-sc', label: 'Noto Sans SC', pkg: 'noto-sans-sc', role: 'body', script: 'zh-Hans', weights: [400, 900], mood: ['clean', 'neutral'], license: 'OFL-1.1' },
  { id: 'noto-serif-sc', label: 'Noto Serif SC', pkg: 'noto-serif-sc', role: 'body', script: 'zh-Hans', weights: [400, 700], mood: ['elegant', 'calm'], license: 'OFL-1.1' },
  { id: 'noto-sans-tc', label: 'Noto Sans TC', pkg: 'noto-sans-tc', role: 'body', script: 'zh-Hant', weights: [400, 900], mood: ['clean', 'neutral'], license: 'OFL-1.1' },
  { id: 'noto-serif-tc', label: 'Noto Serif TC', pkg: 'noto-serif-tc', role: 'body', script: 'zh-Hant', weights: [400, 700], mood: ['elegant', 'calm'], license: 'OFL-1.1' },
];

/** 通常行・強調行に使う書体（同じ書体なら太さの差で強弱を付ける） */
export interface FontChoice {
  body: string;
  display: string;
}

/** 歌詞の言語ごとの既定の書体。韓国語・中国語は強調向けの書体がないので、同じ書体の太さの差で強弱を付ける */
export const DEFAULT_FONTS_BY_SCRIPT: Record<FontScript, FontChoice> = {
  ja: { body: 'noto-sans-jp', display: 'dela-gothic-one' },
  ko: { body: 'noto-sans-kr', display: 'noto-sans-kr' },
  'zh-Hans': { body: 'noto-sans-sc', display: 'noto-sans-sc' },
  'zh-Hant': { body: 'noto-sans-tc', display: 'noto-sans-tc' },
};

export const DEFAULT_FONTS: FontChoice = DEFAULT_FONTS_BY_SCRIPT.ja;

/**
 * 収録外の文字を描くためのフォールバック。言語ごとの Noto Sans を JP → KR → SC → TC の順に試す。
 * SC/TC はハングルも収録しているので、KR を先に置いてハングルが中国語向けの字形にならないようにする。
 */
const FALLBACK_BY_SCRIPT: Record<FontScript, string> = {
  ja: 'noto-sans-jp',
  ko: 'noto-sans-kr',
  'zh-Hans': 'noto-sans-sc',
  'zh-Hant': 'noto-sans-tc',
};
const FALLBACK_ORDER: FontScript[] = ['ja', 'ko', 'zh-Hans', 'zh-Hant'];

export function getFont(id: string): FontDef {
  const f = FONT_CATALOG.find((x) => x.id === id);
  if (!f) throw new Error(`unknown font: ${id}`);
  return f;
}

/** Canvas で使うファミリー名（ページ内の他フォントと衝突しないよう接頭辞を付ける） */
export function familyName(id: string): string {
  return `mt-${id}`;
}

/** id の書体に無い文字を描くフォールバックの書体（試す順）。同じ言語のものを先頭にし、自分自身は含めない */
export function fallbackIds(id: string): string[] {
  const own = getFont(id).script;
  const order = [own, ...FALLBACK_ORDER.filter((s) => s !== own)];
  return order.map((s) => FALLBACK_BY_SCRIPT[s]).filter((x) => x !== id);
}

// レイアウト計算で文字ごとに呼ばれるので、書体ごとのファミリー指定は作り置きする
const familyLists = new Map<string, string>();

/** Canvas の ctx.font 用文字列。フォールバックを連結する */
export function cssFont(id: string, weight: number, sizePx: number): string {
  let families = familyLists.get(id);
  if (!families) {
    families = [id, ...fallbackIds(id)].map((x) => `"${familyName(x)}"`).join(', ');
    familyLists.set(id, families);
  }
  return `${weight} ${sizePx}px ${families}, sans-serif`;
}
