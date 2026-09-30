// 曲の拍に合わせた描画（拍の脈動・文字送りの間隔・間奏の音量表示）のテスト
import { describe, expect, it } from 'vitest';
import { syncStagger } from '../src/animations/registry';
import { PULSE_ATTACK_SEC, PULSE_DECAY_SEC, PULSE_DOWNBEAT_BOOST, pulseScale } from '../src/render/fx';
import { METER_BARS, METER_STEP_SEC, meterLevel } from '../src/render/interlude';

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
  const energy = { rate: 20, values: Array.from({ length: 200 }, (_, i) => (i >= 100 ? 1 : 0.5)) };
  it('右端が今の音量で、左へ行くほど過去の音量（高さは音量の2乗）', () => {
    const t = 5 + METER_STEP_SEC * 2;
    expect(meterLevel(energy, t, METER_BARS - 1)).toBe(1);
    expect(meterLevel(energy, t, 0)).toBe(0.25);
    expect(meterLevel(energy, 100, METER_BARS - 1)).toBe(0);
  });
});
