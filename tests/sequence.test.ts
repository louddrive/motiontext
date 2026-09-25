import { describe, expect, it } from 'vitest';
import { frameFileName, pickUniqueName, safeName, sequenceFolderName } from '../src/export/sequence';

describe('PNG 連番の命名', () => {
  it('6桁ゼロ埋めの連番ファイル名', () => {
    expect(frameFileName('song', 0)).toBe('song_000000.png');
    expect(frameFileName('song', 26999)).toBe('song_026999.png');
  });

  it('サブフォルダ名に解像度と fps を含める', () => {
    expect(sequenceFolderName('song', 1920, 1080, 30)).toBe('song_1920x1080_30fps_png');
    expect(sequenceFolderName('song', 1080, 1920, 30)).toBe('song_1080x1920_30fps_png');
  });

  it('ファイル名に使えない文字は置き換える', () => {
    expect(safeName('a/b:c*?"<>|')).toBe('a_b_c______');
    expect(safeName('  ')).toBe('lyrics');
    expect(frameFileName('曲名:ver2', 1)).toBe('曲名_ver2_000001.png');
  });

  it('既存フォルダと重なったら _2, _3 を付ける（上書きしない）', () => {
    expect(pickUniqueName('out', new Set())).toBe('out');
    expect(pickUniqueName('out', new Set(['out']))).toBe('out_2');
    expect(pickUniqueName('out', new Set(['out', 'out_2', 'out_3']))).toBe('out_4');
  });
});
