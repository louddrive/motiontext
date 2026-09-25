import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/features';
import { splitPhrases, visibleLength } from '../src/analysis/segment';
import type { Cue } from '../src/parsers/types';

const cue = (index: number, start: number, end: number, text: string): Cue => ({ index, start, end, text });

describe('splitPhrases', () => {
  it('助詞・活用語尾を直前の語にまとめる', () => {
    const p = splitPhrases('君の笑顔を忘れないように');
    expect(p.join('')).toBe('君の笑顔を忘れないように');
    expect(p[0]).toBe('君の');
    expect(p).toContain('笑顔を');
  });

  it('連結すると元の文字列に戻る（英語・記号混在）', () => {
    for (const s of ['Hello, my friend!', '「さよなら」なんて言わないで', 'Oh 夢の中へ…', '']) {
      expect(splitPhrases(s).join('')).toBe(s);
    }
  });

  it('英単語は空白ごとに区切る', () => {
    expect(splitPhrases('Hello my friend')).toEqual(['Hello ', 'my ', 'friend']);
  });

  it('表示文字数は空白を除き書記素単位で数える', () => {
    expect(visibleLength('あい う👍🏽')).toBe(4);
  });
});

describe('analyze', () => {
  const cues = [
    cue(0, 1, 3, 'はじまりの歌'),
    cue(1, 3.2, 5, 'ゆっくり進む'),
    // 間奏（3秒以上空く）→ 新セクション
    cue(2, 9, 11, '空へ飛び立て'),
    cue(3, 11, 13, '明日へ走れ'),
    cue(4, 13, 13.8, 'はい'),
    cue(5, 18, 20, '空へ飛び立て'),
    cue(6, 20, 22, '明日へ走れ'),
  ];
  const f = analyze(cues);

  it('間が空いたところでセクションを分ける', () => {
    expect(f.map((x) => x.section)).toEqual([0, 0, 1, 1, 1, 2, 2]);
    expect(f[2].isSectionStart).toBe(true);
    expect(f[1].isSectionStart).toBe(false);
  });

  it('繰り返し歌詞を含むセクションをサビと推定する', () => {
    expect(f[2].isChorus).toBe(true);
    expect(f[5].isChorus).toBe(true);
    expect(f[0].isChorus).toBe(false);
  });

  it('短い表示時間は fast', () => {
    expect(f[4].tempo).toBe('fast');
  });

  it('表示時間の重なりを検出する', () => {
    const g = analyze([cue(0, 0, 2, 'a'), cue(1, 1.5, 3, 'b')]);
    expect(g[1].overlapsPrev).toBe(true);
  });
});
