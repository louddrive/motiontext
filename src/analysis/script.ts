// 歌詞の文字から言語（書体の選び分けに使う文字体系）を推定する。
// 簡易的な判定なので誤ることがある（誤っても利用者が書体を選び直せる前提）。

import type { FontScript } from '../fonts/catalog';
import type { Lang } from '../i18n';

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;
const HAN = /\p{Script=Han}/u;

// 簡体字と繁体字で字形が異なる頻出字の組（簡体, 繁体）。歌詞によく出る字を中心に選んだ
const PAIRS = [
  '们們', '这這', '说說', '时時', '为為', '会會', '没沒', '对對', '来來', '过過',
  '还還', '爱愛', '梦夢', '让讓', '从從', '边邊', '远遠', '开開', '关關', '见見',
  '听聽', '话話', '声聲', '飞飛', '风風', '泪淚', '忆憶', '难難', '离離', '记記',
  '归歸', '恋戀', '无無', '与與', '样樣', '么麼', '个個', '东東', '头頭', '点點',
  '发發', '经經', '实實', '现現', '间間', '长長', '问問', '应應', '觉覺', '电電',
  '场場', '阳陽', '气氣', '给給', '红紅', '终終', '结結', '缘緣', '颜顏', '灵靈',
];
// 日本語でも同じ字形で使う字（風・時・会・声など）は、かなの無い日本語を中国語と誤らないよう判定に使わない
const SHARED_WITH_JAPANESE = new Set('時為過還愛夢遠開見話飛風憶難離記無個東頭現間長問電場陽給紅終結会没来声泪恋与点');
const SIMPLIFIED = new Set(PAIRS.map((p) => p[0]).filter((c) => !SHARED_WITH_JAPANESE.has(c)));
const TRADITIONAL = new Set(PAIRS.map((p) => p[1]).filter((c) => !SHARED_WITH_JAPANESE.has(c)));

/**
 * 歌詞の文字体系を推定する。
 * - ハングルが主体なら ko、かながあれば ja
 * - 漢字が主体なら、簡体字・繁体字に特有の字の数で zh-Hans / zh-Hant を分ける
 * - 決め手がないときは、UI が中国語ならその字体、それ以外は ja（既定の書体のまま）
 */
export function detectScript(text: string, uiLang: Lang): FontScript {
  let kana = 0;
  let hangul = 0;
  let han = 0;
  let hans = 0;
  let hant = 0;
  for (const ch of text) {
    if (KANA.test(ch)) kana++;
    else if (HANGUL.test(ch)) hangul++;
    else if (HAN.test(ch)) {
      han++;
      if (SIMPLIFIED.has(ch)) hans++;
      if (TRADITIONAL.has(ch)) hant++;
    }
  }
  const cjk = kana + hangul + han;
  if (hangul > kana && hangul >= Math.max(3, cjk * 0.3)) return 'ko';
  if (kana >= 3 || (kana > 0 && kana >= cjk * 0.05)) return 'ja';
  if (han > 0) {
    if (hans > hant) return 'zh-Hans';
    if (hant > hans) return 'zh-Hant';
    if (uiLang === 'zh-Hans' || uiLang === 'zh-Hant') return uiLang;
  }
  return 'ja';
}
