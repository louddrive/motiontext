import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LocalizedError, detectLanguage, translate, type Lang, type Localized, type MessageKey, type MessageParams } from '.';

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Localized（キー＋値）を文字列にする */
  tl: (m: Localized) => string;
  /** エラーを表示用の文字列にする（LocalizedError は翻訳、それ以外は原文） */
  te: (e: unknown) => string;
  /** {name} に React の要素（太字など）を差し込む */
  tn: (key: MessageKey, nodes: Record<string, ReactNode>) => ReactNode;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * 言語は URL の ?lang= で持つ（ブラウザのストレージには保存しない）。
 * 初期値は ?lang=、無ければブラウザの言語設定から決める（該当しなければ英語）。
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    detectLanguage(new URLSearchParams(window.location.search).get('lang'), navigator.languages ?? [navigator.language]),
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    window.history.replaceState(null, '', url);
  }, []);

  const value = useMemo<I18n>(() => {
    const t = (key: MessageKey, params?: MessageParams) => translate(lang, key, params);
    return {
      lang,
      setLang,
      t,
      tl: (m) => t(m.key, m.params),
      te: (e) => (e instanceof LocalizedError ? t(e.key, e.params) : e instanceof Error ? e.message : String(e)),
      tn: (key, nodes) =>
        t(key)
          .split(/(\{\w+\})/)
          .map((part, i) => {
            const name = /^\{(\w+)\}$/.exec(part)?.[1];
            return <Fragment key={i}>{name && name in nodes ? nodes[name] : part}</Fragment>;
          }),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n must be used inside I18nProvider');
  return v;
}
