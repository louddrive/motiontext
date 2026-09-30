// リズム解析（src/audio）のテスト。合成音（tests/helpers/synth.ts）で、拍・テンポ・小節の頭・区切り・音量を検査する
import { describe, expect, it } from 'vitest';
import { analyzePcm } from '../src/audio/analyzePcm';
import { PowerSpectrum } from '../src/audio/fft';
import { FrameExtractor } from '../src/audio/frames';
import { ENERGY_RATE } from '../src/audio/rhythm';
import { RHYTHM_VERSION } from '../src/audio/types';
import { beatFMeasure, medianOffset } from './helpers/beatEval';
import { addMelody, addNoise, addPad, beatTimes, clickTrack, drumTrack, resample, scale, SR, type Synth } from './helpers/synth';

describe('PowerSpectrum', () => {
  it('正弦波のパワーは、その周波数のビンで最大になる', () => {
    const n = 1024;
    const fft = new PowerSpectrum(n);
    const sig = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 37 * i) / n));
    const out = new Float64Array(n / 2 + 1);
    fft.power(sig, 0, out);
    expect(out.indexOf(Math.max(...out))).toBe(37);
  });

  it('2のべき乗以外の大きさは受け付けない', () => {
    expect(() => new PowerSpectrum(1000)).toThrow(/power of 2/);
  });
});

describe('FrameExtractor', () => {
  it('流す単位（チャンクの大きさ）に関係なく、同じ特徴量になる', () => {
    const { pcm } = drumTrack({ bpm: 120, seconds: 6 });
    const run = (chunk: number) => {
      const fx = new FrameExtractor(SR);
      for (let i = 0; i < pcm.length; i += chunk) fx.push(pcm.subarray(i, i + chunk));
      const f = fx.finish();
      return { flux: [...f.flux], rms: [...f.rms], duration: f.duration };
    };
    expect(run(997)).toEqual(run(44100));
  });

  it('約 86 フレーム/秒で、音声の長さを返す', () => {
    const fx = new FrameExtractor(48000);
    fx.push(new Float32Array(48000 * 3));
    const f = fx.finish();
    expect(f.frameRate).toBeCloseTo(86.1, 0);
    expect(f.duration).toBeCloseTo(3, 5);
    expect(f.flux.length).toBeGreaterThanOrEqual(Math.floor(3 * f.frameRate));
  });
});

describe('拍とテンポ', () => {
  const cases: [string, Synth, number][] = [
    ['クリック 120', clickTrack({ bpm: 120, seconds: 30 }), 120],
    ['クリック 120 + ノイズ', clickTrack({ bpm: 120, seconds: 30, noise: 0.05 }), 120],
    ['ドラム 95', drumTrack({ bpm: 95, seconds: 40, noise: 0.01 }), 95],
    ['ドラム 128', drumTrack({ bpm: 128, seconds: 40 }), 128],
    ['ドラム 150', drumTrack({ bpm: 150, seconds: 40 }), 150],
    ['ドラム 174', drumTrack({ bpm: 174, seconds: 40 }), 174],
    ['ドラム 110 + 強いノイズ', drumTrack({ bpm: 110, seconds: 40, noise: 0.2 }), 110],
  ];
  for (const [name, s, bpm] of cases) {
    it(`${name}: テンポ ±1.5%、拍の F 値 0.95 以上、ずれ 15ms 以内、小節の頭の F 値 0.9 以上`, () => {
      const r = analyzePcm(s.pcm, SR)!;
      expect(Math.abs(r.bpm - bpm) / bpm).toBeLessThan(0.015);
      expect(beatFMeasure(r.beats, s.beats).f).toBeGreaterThanOrEqual(0.95);
      expect(Math.abs(medianOffset(r.beats, s.beats))).toBeLessThan(0.015);
      expect(beatFMeasure(r.downbeats, s.downbeats).f).toBeGreaterThanOrEqual(0.9);
      expect(r.confidence).toBeGreaterThan(0.8);
    });
  }

  it('テンポが少しずつ変わっても追える（100 → 116 BPM）', () => {
    const s = drumTrack({ bpmAt: (t) => 100 + t * 0.4, seconds: 40 });
    expect(beatFMeasure(analyzePcm(s.pcm, SR)!.beats, s.beats).f).toBeGreaterThanOrEqual(0.95);
  });

  it('音が始まる前（無音）には拍を置かない', () => {
    const s = drumTrack({ bpm: 110, seconds: 30, start: 6 });
    const r = analyzePcm(s.pcm, SR)!;
    expect(r.beats[0]).toBeGreaterThan(5.9);
    expect(beatFMeasure(r.beats, s.beats).f).toBeGreaterThanOrEqual(0.95);
  });

  it('遅い曲は、倍のテンポで検出することがある（拍の位置はそろう）', () => {
    const s = drumTrack({ bpm: 75, seconds: 40 });
    const r = analyzePcm(s.pcm, SR)!;
    const level = r.bpm > 110 ? 2 : 1;
    expect(Math.abs(r.bpm - 75 * level) / (75 * level)).toBeLessThan(0.02);
    // 倍で検出した場合は、8分音符の格子と比べる
    const truth = level === 2 ? s.beats.flatMap((t, k) => [t, (t + (s.beats[k + 1] ?? t + 0.8)) / 2]) : s.beats;
    expect(beatFMeasure(r.beats, truth).f).toBeGreaterThanOrEqual(0.95);
  });

  it('48kHz・22.05kHz の音声でも同じように検出する', () => {
    const s = drumTrack({ bpm: 128, seconds: 30 });
    for (const rate of [48000, 22050]) {
      const r = analyzePcm(resample(s.pcm, SR, rate), rate)!;
      expect(Math.abs(r.bpm - 128)).toBeLessThan(2);
      expect(beatFMeasure(r.beats, s.beats).f).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('ノイズ・持続音・無音では拍を求めず、確からしさは 0', () => {
    const noise = new Float32Array(SR * 30);
    addNoise(noise, 0.3, 5);
    const pad = new Float32Array(SR * 30);
    addPad(pad, 0, 30, [220, 330], 0.3);
    for (const pcm of [noise, pad, new Float32Array(SR * 10)]) {
      const r = analyzePcm(pcm, SR)!;
      expect(r.beats).toEqual([]);
      expect(r.confidence).toBe(0);
      expect(r.bpm).toBe(0);
    }
  });

  it('同じ音声なら同じ結果（決定的）', () => {
    const s = drumTrack({ bpm: 128, seconds: 20 });
    expect(analyzePcm(s.pcm, SR)).toEqual(analyzePcm(s.pcm, SR));
    expect(analyzePcm(s.pcm, SR)!.version).toBe(RHYTHM_VERSION);
  });

  it('何も流さなければ null', () => {
    expect(analyzePcm(new Float32Array(0), SR)).toBeNull();
  });
});

describe('実曲に近い条件', () => {
  it('拍と関係のない位置にメロディーがあっても、テンポを倍と取り違えない', () => {
    for (const bpm of [80, 96, 132, 150]) {
      const s = drumTrack({ bpm, seconds: 40 });
      addMelody(s.pcm, bpm, 0.5, 39, bpm);
      const r = analyzePcm(s.pcm, SR)!;
      expect(Math.abs(r.bpm - bpm) / bpm, `${bpm} BPM`).toBeLessThan(0.015);
      expect(beatFMeasure(r.beats, s.beats).f, `${bpm} BPM`).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('メロディーがドラムより大きくても拍を追える', () => {
    const s = drumTrack({ bpm: 140, seconds: 50 });
    scale(s.pcm, 0, 50, 0.4);
    addMelody(s.pcm, 140, 0.5, 49, 5);
    addMelody(s.pcm, 140, 0.5, 49, 6);
    expect(beatFMeasure(analyzePcm(s.pcm, SR)!.beats, s.beats).f).toBeGreaterThanOrEqual(0.95);
  });

  it('ドラムの無いイントロ（和音だけ）の間は拍を置かず、ドラムが入ってから追う', () => {
    const s = drumTrack({ bpm: 100, seconds: 50, start: 10 });
    addPad(s.pcm, 0, 50, [220, 277.2, 329.6], 0.25);
    const r = analyzePcm(s.pcm, SR)!;
    expect(r.beats[0]).toBeGreaterThan(9.9);
    expect(beatFMeasure(r.beats, s.beats).f).toBeGreaterThanOrEqual(0.95);
  });

  it('フェードイン・フェードアウトしても追える', () => {
    const s = drumTrack({ bpm: 118, seconds: 50 });
    for (let i = 0; i < s.pcm.length; i++) s.pcm[i] *= Math.min(1, i / SR / 8, (50 - i / SR) / 8);
    const r = analyzePcm(s.pcm, SR)!;
    const inRange = (t: number) => t >= 3 && t <= 47;
    expect(beatFMeasure(r.beats.filter(inRange), s.beats.filter(inRange)).f).toBeGreaterThanOrEqual(0.95);
  });

  it('間奏でドラムが抜けても、前後の拍はそろい、区切りを見つける', () => {
    const s = drumTrack({ bpm: 124, seconds: 90 });
    scale(s.pcm, 40, 56, 0);
    addPad(s.pcm, 38, 58, [196, 246.9, 293.7], 0.3);
    const r = analyzePcm(s.pcm, SR)!;
    expect(Math.abs(r.bpm - 124)).toBeLessThan(1.5);
    const drums = (t: number) => t < 39 || t > 57;
    expect(beatFMeasure(r.beats.filter(drums), s.beats.filter(drums)).recall).toBeGreaterThanOrEqual(0.95);
    expect(beatFMeasure(r.beats, s.beats).f).toBeGreaterThanOrEqual(0.85);
    expect(r.sections.some((t) => Math.abs(t - 40) <= 2)).toBe(true);
  });
});

describe('曲の区切りと音量', () => {
  // 0〜24秒: ドラム / 24〜48秒: ドラム + 和音（音色が変わる） / 48〜72秒: 全体を小さく
  const s = drumTrack({ bpm: 120, seconds: 72 });
  addPad(s.pcm, 24, 48, [220, 277.2, 329.6], 0.35);
  scale(s.pcm, 48, 72, 0.25);
  const r = analyzePcm(s.pcm, SR)!;

  it('音色・音量が変わる所を区切りにし、小節の頭にそろえる', () => {
    expect(r.sections).toHaveLength(2);
    expect(Math.abs(r.sections[0] - 24)).toBeLessThanOrEqual(0.55);
    expect(Math.abs(r.sections[1] - 48)).toBeLessThanOrEqual(0.55);
    for (const t of r.sections) expect(r.downbeats).toContain(t);
  });

  it('変化の無い曲には区切りを付けない', () => {
    for (const bpm of [95, 128, 150]) expect(analyzePcm(drumTrack({ bpm, seconds: 60 }).pcm, SR)!.sections).toEqual([]);
  });

  it('音量は 0..1 で、小さくした区間は低い', () => {
    const e = r.energy.values;
    expect(r.energy.rate).toBe(ENERGY_RATE);
    expect(e.length).toBe(Math.ceil(r.duration * ENERGY_RATE));
    expect(Math.min(...e)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...e)).toBeLessThanOrEqual(1);
    const avg = (a: number, b: number) => e.slice(a * ENERGY_RATE, b * ENERGY_RATE).reduce((x, y) => x + y, 0) / ((b - a) * ENERGY_RATE);
    expect(avg(26, 46)).toBeGreaterThan(avg(2, 22));
    expect(avg(50, 70)).toBeLessThan(avg(2, 22) - 0.2);
  });
});

describe('音の立ち上がり', () => {
  it('クリック音の位置に立ち上がりを見つけ、強さは 0..1', () => {
    const s = clickTrack({ bpm: 100, seconds: 20 });
    const r = analyzePcm(s.pcm, SR)!;
    const times = r.onsets.map((o) => o.t);
    expect(beatFMeasure(times, s.beats).recall).toBeGreaterThanOrEqual(0.95);
    for (const o of r.onsets) {
      expect(o.s).toBeGreaterThan(0);
      expect(o.s).toBeLessThanOrEqual(1);
    }
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('beatTimes（テスト用の正解の生成）', () => {
  it('一定のテンポなら等間隔', () => {
    expect(beatTimes(() => 120, 0, 2)).toEqual([0, 0.5, 1, 1.5]);
  });
});

describe('処理時間', () => {
  it('5分の曲を数秒で解析できる（桁違いに遅くなっていないかの確認）', () => {
    const s = drumTrack({ bpm: 128, seconds: 300, bass: false });
    const t0 = performance.now();
    analyzePcm(s.pcm, SR);
    expect(performance.now() - t0).toBeLessThan(20_000);
  }, 60_000);
});
