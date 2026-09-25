import { defaultTheme } from './default';
import type { Theme } from './types';

export const THEMES: Theme[] = [defaultTheme];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? defaultTheme;
}

export type { Theme, BackgroundMode } from './types';
