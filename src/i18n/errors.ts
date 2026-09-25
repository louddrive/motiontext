// 翻訳できるエラーと、翻訳対象の型（辞書を読み込まないので Worker や純粋関数からも軽く使える）
import type { MessageKey } from './messages/en';

export type MessageParams = Record<string, string | number>;

/** 翻訳の対象（ロジック側はこれを返し、画面側で文字列にする） */
export interface Localized {
  key: MessageKey;
  params?: MessageParams;
}

/** 翻訳できるエラー。message にはキーが入る（表示は画面側で translate する）。Worker との受け渡しでは key / params を送る */
export class LocalizedError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly params?: MessageParams,
  ) {
    super(key);
    this.name = 'LocalizedError';
  }
}
