import raw from '../../effects.config.json';

// 開発側だけが使うエフェクトの有効・無効（利用者の画面には出さない）。
// リポジトリ直下の effects.config.json をビルド時に組み込む。キーが無い場合は有効扱い。

export const EFFECT_FLAG_KEYS = [
  'motionBlur',
  'outline',
  'dropShadow',
  'cameraShake',
  'glitch',
  'shine',
  'particles',
  'cameraWork',
  'diagonalLines',
  'sectionRing',
  'echo',
  'verticalText',
] as const;

export type EffectFlag = (typeof EFFECT_FLAG_KEYS)[number];
export type EffectFlags = Record<EffectFlag, boolean>;

export const ALL_EFFECTS: EffectFlags = Object.fromEntries(EFFECT_FLAG_KEYS.map((k) => [k, true])) as EffectFlags;

/** 設定の値を既定値（すべて有効）とマージする。未知のキーや真偽値以外はエラー */
export function parseEffectFlags(input: unknown): EffectFlags {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('effects.config.json: must be an object');
  }
  const flags = { ...ALL_EFFECTS };
  for (const [key, value] of Object.entries(input)) {
    if (!(EFFECT_FLAG_KEYS as readonly string[]).includes(key)) throw new Error(`effects.config.json: unknown key "${key}"`);
    if (typeof value !== 'boolean') throw new Error(`effects.config.json: "${key}" must be true or false`);
    flags[key as EffectFlag] = value;
  }
  return flags;
}

export const EFFECTS: EffectFlags = parseEffectFlags(raw);
