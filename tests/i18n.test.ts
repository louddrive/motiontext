import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGUAGES, detectLanguage, isLang, translate } from '../src/i18n';
import { LocalizedError } from '../src/i18n/errors';
import { en } from '../src/i18n/messages/en';

describe('detectLanguage', () => {
  it('?lang= が有効ならそれを優先する', () => {
    expect(detectLanguage('ko', ['ja-JP'])).toBe('ko');
    expect(detectLanguage('zh-Hant', ['en-US'])).toBe('zh-Hant');
  });

  it('無効な ?lang= は無視してブラウザの言語を使う', () => {
    expect(detectLanguage('fr', ['ja-JP'])).toBe('ja');
    expect(detectLanguage('', ['ko-KR'])).toBe('ko');
  });

  it('ブラウザの言語設定から判定する', () => {
    expect(detectLanguage(null, ['ja-JP'])).toBe('ja');
    expect(detectLanguage(null, ['ja'])).toBe('ja');
    expect(detectLanguage(null, ['ko-KR'])).toBe('ko');
    expect(detectLanguage(null, ['en-GB'])).toBe('en');
  });

  it('中国語は地域・文字で簡体／繁体を分ける', () => {
    expect(detectLanguage(null, ['zh-CN'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh-SG'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh-Hans-CN'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh-TW'])).toBe('zh-Hant');
    expect(detectLanguage(null, ['zh-HK'])).toBe('zh-Hant');
    expect(detectLanguage(null, ['zh-MO'])).toBe('zh-Hant');
    expect(detectLanguage(null, ['zh-Hant'])).toBe('zh-Hant');
  });

  it('未対応の言語は、次に優先される対応言語を使い、無ければ英語', () => {
    expect(detectLanguage(null, ['fr-FR', 'ja-JP'])).toBe('ja');
    expect(detectLanguage(null, ['fr-FR', 'de-DE'])).toBe('en');
    expect(detectLanguage(null, [])).toBe('en');
  });
});

describe('translate', () => {
  it('{name} を差し込む', () => {
    expect(translate('en', 'subtitle.loaded', { name: 'a.srt', format: 'SRT', count: 8 })).toBe('a.srt (SRT / 8 cues)');
    expect(translate('ja', 'subtitle.loaded', { name: 'a.srt', format: 'SRT', count: 8 })).toBe('a.srt（SRT / 8 件）');
  });

  it('渡されなかった値の {name} はそのまま残す', () => {
    expect(translate('en', 'export.remaining')).toBe('about {time} left');
  });

  it('isLang', () => {
    expect(isLang('zh-Hans')).toBe(true);
    expect(isLang('zh')).toBe(false);
  });

  it('LocalizedError はキーと値を持つ', () => {
    const e = new LocalizedError('limits.tooManyCues', { count: 5000, max: 3000 });
    expect(e.key).toBe('limits.tooManyCues');
    expect(translate('ko', e.key, e.params)).toContain('5000');
  });
});

describe('辞書', () => {
  const keys = Object.keys(en).sort();

  it('全言語で英語と同じキーを持ち、空の訳が無い', () => {
    for (const lang of LANGUAGES) {
      const dict = DICTIONARIES[lang];
      expect(Object.keys(dict).sort(), lang).toEqual(keys);
      for (const k of keys) expect((dict as Record<string, string>)[k].trim().length, `${lang}:${k}`).toBeGreaterThan(0);
    }
  });

  it('差し込み用の {name} が全言語で英語と一致している', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const lang of LANGUAGES) {
      for (const k of keys) {
        expect(names((DICTIONARIES[lang] as Record<string, string>)[k]), `${lang}:${k}`).toEqual(names((en as Record<string, string>)[k]));
      }
    }
  });

  it('英語・中国語・韓国語の訳に日本語のかなが混ざっていない', () => {
    const kana = /[぀-ゟ゠-ヿ]/;
    for (const lang of ['en', 'zh-Hans', 'zh-Hant', 'ko'] as const) {
      for (const k of keys) {
        const v = (DICTIONARIES[lang] as Record<string, string>)[k];
        expect(kana.test(v), `${lang}:${k} = ${v}`).toBe(false);
      }
    }
  });
});
