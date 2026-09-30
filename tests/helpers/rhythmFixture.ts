// テスト用のリズムの解析結果（一定のテンポの拍と、ゆっくり変化する音量）
import type { Rhythm } from '../../src/audio/types';

export function makeRhythm(o: { bpm?: number; start?: number; duration?: number; confidence?: number; sections?: number[] } = {}): Rhythm {
  const bpm = o.bpm ?? 120;
  const start = o.start ?? 0.5;
  const duration = o.duration ?? 60;
  const beats: number[] = [];
  for (let t = start; t < duration; t += 60 / bpm) beats.push(Math.round(t * 1000) / 1000);
  const rate = 20;
  const values = Array.from({ length: Math.ceil(duration * rate) }, (_, i) => Math.round((0.5 + 0.4 * Math.sin(i / rate / 5)) * 1000) / 1000);
  return {
    version: 1,
    duration,
    bpm,
    confidence: o.confidence ?? 1,
    beats,
    downbeats: beats.filter((_, k) => k % 4 === 0),
    onsets: beats.map((t) => ({ t, s: 1 })),
    energy: { rate, values },
    sections: o.sections ?? [],
  };
}
