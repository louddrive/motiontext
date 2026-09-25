// 多言語化の中核（React に依存しない部分。Worker や純粋関数からも使える）
import { en, type MessageKey } from './messages/en';
import { ja } from './messages/ja';
import { ko } from './messages/ko';
import { zhHans } from './messages/zh-Hans';
import { zhHant } from './messages/zh-Hant';

export type { MessageKey };

export const LANGUAGES = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko'] as const;
export type Lang = (typeof LANGUAGES)[number];

/** 言語の選択肢の表示名（各言語での自称） */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ko: '한국어',
};

export const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = {
  en,
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ko,
};

export { LocalizedError, type Localized, type MessageParams } from './errors';
import type { MessageParams } from './errors';

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

/** {name} を params の値で置き換える。辞書に無いキーは英語、それも無ければキーを返す */
export function translate(lang: Lang, key: MessageKey, params?: MessageParams): string {
  const template = DICTIONARIES[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/**
 * 表示する言語を決める。URL の ?lang= が有効ならそれを優先し、無ければブラウザの言語設定から選ぶ。
 * 日本語・中国語（簡体／繁体）・韓国語以外は英語。
 */
export function detectLanguage(urlParam: string | null | undefined, browserLanguages: readonly string[]): Lang {
  if (isLang(urlParam)) return urlParam;
  for (const raw of browserLanguages) {
    const tag = raw.toLowerCase();
    if (tag === 'ja' || tag.startsWith('ja-')) return 'ja';
    if (tag === 'ko' || tag.startsWith('ko-')) return 'ko';
    if (tag === 'zh' || tag.startsWith('zh-')) {
      // 繁体字: zh-Hant、台湾・香港・マカオ
      if (/^zh-(hant|tw|hk|mo)\b/.test(tag) || /-hant\b/.test(tag)) return 'zh-Hant';
      return 'zh-Hans';
    }
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}
