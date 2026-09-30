// 曲のリズム解析の結果（MV／曲の音声から求める。字幕の時刻と同じ秒単位）。
// 解析は音声だけから決まる（同じファイル・同じブラウザなら同じ結果）。Worker へ送れるよう、数値と配列だけで持つ。

/** 解析方法を変えたら上げる（結果が変わることを示す） */
export const RHYTHM_VERSION = 1;

export interface Onset {
  /** 時刻（秒） */
  t: number;
  /** 強さ 0..1（曲の中で強い立ち上がりほど 1 に近い） */
  s: number;
}

export interface Rhythm {
  version: number;
  /** 解析した音声の長さ（秒） */
  duration: number;
  /** テンポ（拍/分）。倍・半分のテンポと取り違えることがある */
  bpm: number;
  /**
   * 拍の検出の確からしさ 0..1（推測に基づく目安）。拍の位置で音の立ち上がりがどれだけ強いかで決める。
   * 低い場合は、演出を拍に合わせない判断に使う
   */
  confidence: number;
  /** 拍の時刻（秒、昇順） */
  beats: number[];
  /** 小節の頭の拍の時刻（4拍子を仮定した推定。精度は低め） */
  downbeats: number[];
  /** 音の立ち上がり（時刻順） */
  onsets: Onset[];
  /** 音量の変化（0..1。rate 回/秒） */
  energy: { rate: number; values: number[] };
  /** 曲の区切りと推定した時刻（秒、昇順。曲の先頭は含まない） */
  sections: number[];
}
