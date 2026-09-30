// 曲の拍に合わせた描画（拍の脈動・文字送りの間隔・間奏の音量表示）のテスト
import { describe, expect, it } from 'vitest';
import { syncStagger } from '../src/animations/registry';
import { PULSE_ATTACK_SEC, PULSE_DECAY_SEC, PULSE_DOWNBEAT_BOOST, pulseScale } from '../src/render/fx';
import { exaggerated, METER_BARS, METER_STEP_SEC, meterLevel, meterRange, waveKick, waveOffset, WAVE_CYCLES } from '../src/render/interlude';

describe('拍の脈動', () => {
  const rhythm = { beats: [1, 1.5, 2, 2.5], downbeats: [1, 3] };

  it('拍の瞬間から大きくなり、元に戻っていく', () => {
    expect(pulseScale(rhythm, 0.02, 1.5, 0)).toBe(1);
    expect(pulseScale(rhythm, 0.02, 1.5 + PULSE_ATTACK_SEC, 0)).toBeCloseTo(1.02);
    expect(pulseScale(rhythm, 0.02, 1.5 + PULSE_ATTACK_SEC + PULSE_DECAY_SEC, 0)).toBeCloseTo(1 + 0.02 / Math.E);
    // 次の拍が遠ければ、十分に時間がたつと元の大きさに戻る
    expect(pulseScale({ beats: [1, 3], downbeats: [] }, 0.02, 1 + PULSE_DECAY_SEC * 6, 0)).toBe(1);
  });

  it('小節の頭は強く、登場が終わる前（from より前）の拍では弾まない', () => {
    expect(pulseScale(rhythm, 0.02, 1 + PULSE_ATTACK_SEC, 0)).toBeCloseTo(1 + 0.02 * PULSE_DOWNBEAT_BOOST);
    expect(pulseScale(rhythm, 0.02, 1.5 + PULSE_ATTACK_SEC, 1.6)).toBe(1);
    expect(pulseScale(rhythm, 0.02, 0.5, 0)).toBe(1);
    expect(pulseScale(rhythm, 0, 1.52, 0)).toBe(1);
  });
});

describe('2拍に1回の脈動', () => {
  // 小節の頭は 1 と 3。拍は 0.5 秒ごと（1 = 1拍目, 1.5 = 2拍目, 2 = 3拍目, 2.5 = 4拍目, 3 = 次の小節の1拍目）
  const rhythm = { beats: [0.5, 1, 1.5, 2, 2.5, 3, 3.5], downbeats: [1, 3] };
  const at = (t: number) => pulseScale(rhythm, 0.04, t + PULSE_ATTACK_SEC, 0, 2);

  it('小節の1・3拍目だけで弾み、2・4拍目では弾まない', () => {
    expect(at(1)).toBeCloseTo(1 + 0.04 * PULSE_DOWNBEAT_BOOST);
    expect(at(2)).toBeCloseTo(1.04);
    expect(at(3)).toBeCloseTo(1 + 0.04 * PULSE_DOWNBEAT_BOOST);
    // 2・4拍目の直後は、直前の弾む拍（1・3拍目）から 0.5 秒たった分だけ残る
    const decayed = 1 + 0.04 * Math.exp(-(0.5 - 0) / PULSE_DECAY_SEC);
    expect(at(2.5)).toBeCloseTo(decayed);
    expect(at(1.5)).toBeLessThan(at(1));
  });

  it('毎拍（every = 1）なら、2・4拍目でも弾む', () => {
    expect(pulseScale(rhythm, 0.04, 1.5 + PULSE_ATTACK_SEC, 0, 1)).toBeCloseTo(1.04);
  });

  it('小節の頭より前の拍は、拍の番号で数える', () => {
    const r = { beats: [0.5, 1, 1.5, 2], downbeats: [1.5] };
    expect(pulseScale(r, 0.04, 0.5 + PULSE_ATTACK_SEC, 0, 2)).toBeCloseTo(1.04);
    expect(pulseScale(r, 0.04, 1 + PULSE_ATTACK_SEC, 0, 2)).toBeLessThan(1.02);
  });
});

describe('文字送りの間隔', () => {
  it('拍の 1/2^k のうち、元の 1.2 倍を超えない最も長いものにそろえる', () => {
    expect(syncStagger(0.06, 0.5)).toBeCloseTo(0.0625);
    expect(syncStagger(0.05, 0.5)).toBeCloseTo(0.03125);
    expect(syncStagger(0.3, 0.5)).toBeCloseTo(0.25);
    expect(syncStagger(0.06, null)).toBe(0.06);
    expect(syncStagger(0, 0.5)).toBe(0);
  });
});

describe('間奏の音量表示', () => {
  // 0〜5秒は 0.5、5秒以降は 1
  const energy = { rate: 20, values: Array.from({ length: 200 }, (_, i) => (i >= 100 ? 1 : 0.5)) };

  it('区間の中の最小〜最大を 0〜1 に広げて強調する（差が小さい区間は広げない）', () => {
    const range = meterRange(energy, 0, 10);
    expect(range).toEqual({ lo: 0.5, hi: 1 });
    expect(exaggerated(energy, 7, range)).toBe(1);
    expect(exaggerated(energy, 2, range)).toBe(0);
    const flat = meterRange(energy, 0, 4);
    expect(flat).toEqual({ lo: 0, hi: 1 });
    expect(exaggerated(energy, 2, { lo: 0.5, hi: 0.52 })).toBeCloseTo(0.5 ** 1.8);
  });

  it('円形: 右回りの先（k = METER_BARS - 1）が今、根元に近いほど過去', () => {
    const range = meterRange(energy, 0, 10);
    const t = 5 + METER_STEP_SEC * 2;
    expect(meterLevel(energy, t, METER_BARS - 1, range)).toBe(1);
    expect(meterLevel(energy, t, 0, range)).toBe(0);
  });

  it('横型: 中央（低音側）ほど大きく振れ、音量が大きいほど・拍の直後ほど大きい', () => {
    // 振れの大きさ（波の山の付近の最大）を、中央の近くと端の近くで比べる
    const peak = (from: number, level: number, kick: number, t = 1.234) => {
      let m = 0;
      for (let i = 0; i <= 200; i++) m = Math.max(m, Math.abs(waveOffset(from + (i / 200) * (1 / WAVE_CYCLES), t, level, kick)));
      return m;
    };
    expect(peak(0, 1, 0)).toBeGreaterThan(peak(0.9, 1, 0) * 2);
    expect(peak(0, 1, 0)).toBeGreaterThan(peak(0, 0, 0) * 2);
    expect(peak(0, 1, 1)).toBeGreaterThan(peak(0, 1, 0) * 1.5);
    // 同じ入力なら同じ値（決定的）
    expect(waveOffset(0.3, 5.5, 0.7, 0.2)).toBe(waveOffset(0.3, 5.5, 0.7, 0.2));
  });

  it('横型: 拍の瞬間に 1 で、時間とともに 0 に近づく', () => {
    expect(waveKick([1, 2], 1)).toBe(1);
    expect(waveKick([1, 2], 1.15)).toBeCloseTo(Math.exp(-1));
    expect(waveKick([1, 2], 0.5)).toBe(0);
  });
});
