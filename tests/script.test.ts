import { describe, expect, it } from 'vitest';
import { detectScript } from '../src/analysis/script';

describe('detectScript', () => {
  it('かなを含む歌詞は日本語', () => {
    expect(detectScript('夜明けの街を歩いていく\n光を掴め', 'en')).toBe('ja');
  });

  it('ハングルが主体なら韓国語（英語が混ざっていても）', () => {
    expect(detectScript('너를 사랑해\nBaby I love you\n오늘 밤은', 'ja')).toBe('ko');
  });

  it('簡体字の歌詞', () => {
    expect(detectScript('我们一起走过这条路\n你说的话我还记得', 'ja')).toBe('zh-Hans');
  });

  it('繁体字の歌詞', () => {
    expect(detectScript('我們一起走過這條路\n你說的話我還記得', 'ja')).toBe('zh-Hant');
  });

  it('漢字だけで決め手がない短い行は、UI が中国語ならその字体、それ以外は日本語', () => {
    expect(detectScript('花鳥風月', 'ja')).toBe('ja');
    expect(detectScript('花鳥風月', 'en')).toBe('ja');
    expect(detectScript('花鳥風月', 'zh-Hant')).toBe('zh-Hant');
    expect(detectScript('花鳥風月', 'zh-Hans')).toBe('zh-Hans');
  });

  it('日本語と同じ字形の漢字（風・時・間など）だけでは繁体字と判定しない', () => {
    expect(detectScript('風の時間\n長い夢', 'ja')).toBe('ja');
  });

  it('英語だけの歌詞は日本語扱い（既定の書体のまま）', () => {
    expect(detectScript('Hello darkness my old friend', 'ko')).toBe('ja');
  });

  it('日本語の歌詞に韓国語が少し混ざっても日本語', () => {
    expect(detectScript('君と歩いた道を忘れない\nどこまでも一緒に\n사랑해', 'ja')).toBe('ja');
  });
});
