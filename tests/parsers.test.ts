import { describe, expect, it } from 'vitest';
import { decodeBytes, detectFormat, parseSubtitle } from '../src/parsers/detect';
import { parseSbv } from '../src/parsers/sbv';
import { parseSrt } from '../src/parsers/srt';

describe('parseSrt', () => {
  it('基本形式を読める（複数行・タグ除去）', () => {
    const src = `1
00:00:01,000 --> 00:00:03,500
<i>君の笑顔を</i>
忘れないように

2
00:00:04,000 --> 00:00:06,250 X1:100 X2:200
{\\an8}今日も歌うよ
`;
    const r = parseSrt(src);
    expect(r.cues).toEqual([
      { index: 0, start: 1, end: 3.5, text: '君の笑顔を\n忘れないように' },
      { index: 1, start: 4, end: 6.25, text: '今日も歌うよ' },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('BOM・CRLF・ピリオド区切り・番号欠落を許容する', () => {
    const src = '﻿00:00:01.500 --> 00:00:02.000\r\nA\r\n\r\n00:00:03,000 --> 00:00:04,000\r\nB\r\n';
    const r = parseSrt(src);
    expect(r.cues.map((c) => [c.start, c.end, c.text])).toEqual([
      [1.5, 2, 'A'],
      [3, 4, 'B'],
    ]);
  });

  it('空行なしで次のブロックが続く壊れたファイルでも分割する', () => {
    const src = '1\n00:00:01,000 --> 00:00:02,000\nA\n2\n00:00:03,000 --> 00:00:04,000\nB\n';
    expect(parseSrt(src).cues.map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('終了が開始以前のものは除外して警告し、開始順に並べる', () => {
    const src = `00:00:05,000 --> 00:00:06,000
後
00:00:03,000 --> 00:00:02,000
不正
00:00:01,000 --> 00:00:02,000
先
`;
    const r = parseSrt(src);
    expect(r.cues.map((c) => c.text)).toEqual(['先', '後']);
    expect(r.cues.map((c) => c.index)).toEqual([0, 1]);
    expect(r.warnings.length).toBe(1);
  });
});

describe('parseSbv', () => {
  it('基本形式を読める', () => {
    const src = `0:00:01.000,0:00:03.500
君の笑顔を
忘れないように

0:00:04.000,0:00:06.250
今日も歌うよ
`;
    expect(parseSbv(src).cues).toEqual([
      { index: 0, start: 1, end: 3.5, text: '君の笑顔を\n忘れないように' },
      { index: 1, start: 4, end: 6.25, text: '今日も歌うよ' },
    ]);
  });

  it('1時間を超える時刻', () => {
    expect(parseSbv('1:02:03.400,1:02:05.000\nX\n').cues[0].start).toBeCloseTo(3723.4);
  });
});

describe('detect / decode', () => {
  it('拡張子と内容で形式を判定する', () => {
    expect(detectFormat('a.SRT', '')).toBe('srt');
    expect(detectFormat('a.txt', '00:00:01,000 --> 00:00:02,000')).toBe('srt');
    expect(detectFormat('a.txt', '0:00:01.000,0:00:02.000\nx')).toBe('sbv');
    expect(detectFormat('a.txt', 'hello')).toBeNull();
  });

  it('拡張子と中身が食い違う場合は中身で読む', () => {
    const r = parseSubtitle('a.srt', '0:00:01.000,0:00:02.000\nX\n');
    expect(r.format).toBe('sbv');
    expect(r.cues.length).toBe(1);
  });

  it('認識できない形式はエラー', () => {
    expect(() => parseSubtitle('a.txt', 'hello')).toThrow();
  });

  it('UTF-8 と Shift_JIS を自動判別する', () => {
    const utf8 = new TextEncoder().encode('歌詞').buffer as ArrayBuffer;
    expect(decodeBytes(utf8)).toBe('歌詞');
    // "歌詞" の Shift_JIS バイト列
    const sjis = new Uint8Array([0x89, 0xcc, 0x8e, 0x8c]).buffer;
    expect(decodeBytes(sjis)).toBe('歌詞');
  });
});
