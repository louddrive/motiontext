import { describe, expect, it } from 'vitest';
import { APP_VERSION_LABEL, formatVersion } from '../src/version';

describe('formatVersion', () => {
  it('パッチ番号が 0 なら省く', () => {
    expect(formatVersion('0.1.0', '20260929')).toBe('v0.1(20260929)');
    expect(formatVersion('1.0.0', '20270101')).toBe('v1.0(20270101)');
  });

  it('パッチ番号が 0 以外なら出す', () => {
    expect(formatVersion('0.1.2', '20261003')).toBe('v0.1.2(20261003)');
  });

  it('ビルド時に埋め込んだ値で表示する', () => {
    expect(APP_VERSION_LABEL).toMatch(/^v\d+\.\d+(\.\d+)?\(\d{8}\)$/);
  });
});
