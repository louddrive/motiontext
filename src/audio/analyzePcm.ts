// モノラルの PCM を少しずつ流して解析する（Worker とテストで共通）
import { FrameExtractor } from './frames';
import { analyzeFrames } from './rhythm';
import type { Rhythm } from './types';

/** 流しながら解析する。push でモノラルの PCM を足し、finish で結果を得る */
export class RhythmAnalyzer {
  private extractor: FrameExtractor | null = null;

  /** mono: -1..1 のモノラル PCM。サンプリング周波数は最初の値に固定する */
  push(mono: Float32Array, sampleRate: number): void {
    this.extractor ??= new FrameExtractor(sampleRate);
    this.extractor.push(mono);
  }

  finish(): Rhythm | null {
    if (!this.extractor) return null;
    return analyzeFrames(this.extractor.finish());
  }
}

/** PCM 全体を一度に解析する（テスト用）。chunk ごとに分けて流し、ストリーム処理と同じ経路を通す */
export function analyzePcm(pcm: Float32Array, sampleRate: number, chunk = 4410): Rhythm | null {
  const a = new RhythmAnalyzer();
  for (let i = 0; i < pcm.length; i += chunk) a.push(pcm.subarray(i, i + chunk), sampleRate);
  return a.finish();
}
