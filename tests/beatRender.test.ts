// 曲の拍に合わせた描画（拍の脈動・文字送りの間隔・間奏の音量表示）のテスト
import { describe, expect, it } from 'vitest';
import { syncStagger } from '../src/animations/registry';
import { PULSE_ATTACK_SEC, PULSE_DECAY_SEC, PULSE_DOWNBEAT_BOOST, pulseScale } from '../src/render/fx';
import { ecgShape, ecgValue, exaggerated, METER_BARS, METER_STEP_SEC, meterLevel, meterRange } from '../src/render/interlude';

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

  it('横型: 拍で鋭い山が立ち、拍の間は基準線に戻る', () => {
    expect(ecgShape(0)).toBeGreaterThan(0.9);
    expect(ecgShape(0.018)).toBeLessThan(0);
    expect(Math.abs(ecgShape(0.4))).toBeLessThan(0.01);
    const range = { lo: 0.5, hi: 1 };
    expect(ecgValue([7], energy, 7, range)).toBeGreaterThan(0.9);
    // 音量が小さい所の拍は、山が低い
    expect(ecgValue([2], energy, 2, range)).toBeLessThan(0.4);
    expect(ecgValue([2, 7], energy, 4.5, range)).toBe(0);
  });
});
