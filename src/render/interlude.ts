// 長い間奏の進み具合の表示（画面下部の横線／画面中央の円と、カウントアップするパーセンテージ）。
// 最初はゆっくり進み、最後の約1秒で一気に 100% に達して、その直後に次の歌詞が始まる
import type { Interlude, Timeline, TimelineRhythm } from '../director/types';
import { cssFont } from '../fonts/catalog';
import { hexToRgb } from '../themes/color';
import type { Ctx2D } from './layout';
import { easeOutCubic, progress } from './easing';

/** 表示を始めるときのフェードインの秒数 */
export const INTERLUDE_FADE_SEC = 0.3;
/** 進み具合を塗る前の下地の濃さ */
const TRACK_ALPHA = 0.2;
/** パーセンテージの表示に使う文字（歌詞に含まれなくてもフォントを読み込んでおく） */
export const INTERLUDE_GLYPHS = '0123456789%';

/** 最後に一気に 100% へ進める秒数（100% で止めておく INTERLUDE_HOLD_SEC を含む） */
export const INTERLUDE_RUSH_SEC = 1;
/** 一気に進める直前までに到達している進み具合 */
export const INTERLUDE_SLOW_SHARE = 0.77;
/** 次の歌詞の直前に 100% のまま見せておく秒数（加速したまま終わると 100% が1フレームも写らないため） */
export const INTERLUDE_HOLD_SEC = 0.1;

/**
 * 間奏の経過秒 elapsed（長さ length）での表示上の進み具合 0..1。
 * 最後の INTERLUDE_RUSH_SEC 秒の手前までは INTERLUDE_SLOW_SHARE までゆっくり一定に進み、
 * そこから加速しながら一気に 100% に達し、次の歌詞の直前の INTERLUDE_HOLD_SEC 秒は 100% のまま
 */
export function interludeProgress(elapsed: number, length: number): number {
  const rush = Math.min(INTERLUDE_RUSH_SEC, length);
  const slowLen = length - rush;
  if (elapsed <= slowLen) return slowLen > 0 ? INTERLUDE_SLOW_SHARE * Math.max(0, elapsed / slowLen) : 0;
  const rise = Math.max(rush - INTERLUDE_HOLD_SEC, 1e-6);
  const u = Math.min(1, (elapsed - slowLen) / rise);
  return INTERLUDE_SLOW_SHARE + (1 - INTERLUDE_SLOW_SHARE) * u * u;
}

export interface InterludeState {
  interlude: Interlude;
  /** 進み具合 0..1 */
  p: number;
  alpha: number;
}

/** 時刻 t に表示中の間奏と、その進み具合。100% に達した時刻（end）以降は表示しない */
export function interludeAt(interludes: Interlude[], t: number): InterludeState | null {
  for (const iv of interludes) {
    if (t < iv.start) break; // 以降の区間はもっと後
    if (t >= iv.end) continue;
    return {
      interlude: iv,
      p: interludeProgress(t - iv.start, iv.end - iv.start),
      alpha: easeOutCubic(progress(t, iv.start, INTERLUDE_FADE_SEC)),
    };
  }
  return null;
}

/** 表示するパーセンテージ（p が 0 を超えたら切り上げ。100 は p = 1 に届いた後の INTERLUDE_HOLD_SEC 秒に写る） */
export const percentLabel = (p: number): number => Math.min(100, Math.max(0, Math.ceil(p * 100)));

/**
 * パーセンテージを描く。数字は1桁ずつ「0」の幅の枠に置き、カウントアップ中に左右に揺れないようにする。
 * align = left: x から右へ / center: x を中心に
 */
function drawPercent(ctx: Ctx2D, iv: Interlude, value: number, size: number, x: number, cy: number, align: 'left' | 'center'): void {
  ctx.font = cssFont(iv.fontId, iv.weight, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const digitW = ctx.measureText('0').width;
  const percentW = ctx.measureText('%').width;
  const digits = String(value);
  const total = digits.length * digitW + percentW;
  let cx = align === 'left' ? x : x - total / 2;
  for (const d of digits) {
    ctx.fillText(d, cx + digitW / 2, cy);
    cx += digitW;
  }
  ctx.fillText('%', cx + percentW / 2, cy);
}

/** 円形の間奏の音量表示の棒の数と、1本あたりにさかのぼる秒数（時計回りに過去から今へ） */
export const METER_BARS = 32;
export const METER_STEP_SEC = 0.05;
/** 棒の長さの強調（音量の差を大げさに見せるため、区間の中の最小〜最大を 0〜1 に広げてからこのべき乗にする） */
const METER_CONTRAST = 1.8;

type Energy = NonNullable<TimelineRhythm['energy']>;

/** from〜to 秒の音量の最小と最大（音量表示の強調の基準） */
export function meterRange(energy: Energy, from: number, to: number): { lo: number; hi: number } {
  const a = Math.max(0, Math.floor(from * energy.rate));
  const b = Math.min(energy.values.length, Math.ceil(to * energy.rate) + 1);
  let lo = 1;
  let hi = 0;
  for (let i = a; i < b; i++) {
    lo = Math.min(lo, energy.values[i]);
    hi = Math.max(hi, energy.values[i]);
  }
  return hi > lo ? { lo, hi } : { lo: 0, hi: 1 };
}

/** 時刻 at の音量を、区間の最小〜最大で 0〜1 に広げて強調した値 */
export function exaggerated(energy: Energy, at: number, range: { lo: number; hi: number }): number {
  const i = Math.floor(at * energy.rate);
  const v = i >= 0 && i < energy.values.length ? energy.values[i] : range.lo;
  // 区間の中でほとんど変化しない場合（差が 0.05 未満）は、広げすぎないよう元の値を使う
  const u = range.hi - range.lo < 0.05 ? v : (v - range.lo) / (range.hi - range.lo);
  return Math.min(1, Math.max(0, u)) ** METER_CONTRAST;
}

/** 円形の音量表示の、k 本目（0 = 最も過去、METER_BARS - 1 = 今）の長さ 0..1 */
export function meterLevel(energy: Energy, t: number, k: number, range: { lo: number; hi: number }): number {
  return exaggerated(energy, t - (METER_BARS - 1 - k) * METER_STEP_SEC, range);
}

/** 横型の音量表示: 左右それぞれの、中央から端までの波の数（線が上下に振れる回数） */
export const WAVE_CYCLES = 14;
/** 波が中央から外へ流れる速さ（波の数/秒） */
const WAVE_FLOW = 1.2;
/** 拍の瞬間に、中央（低音側）を跳ねさせる強さと、元に戻る秒数 */
const WAVE_KICK = 1.2;
const WAVE_KICK_DECAY_SEC = 0.15;

/** 横型の音量表示の、中央から端までの帯域の数（帯域の間はなめらかにつなぐ） */
export const WAVE_BANDS = 24;

/** 帯域 j のゆらぎの位相（帯域の番号だけで決まる。乱数を使わず決定的） */
const bandPhase = (j: number, k: number) => ((Math.sin((j + 1) * 12.9898 * k + 78.233) * 43758.5453) % 1) * Math.PI * 2;

/** 帯域 j（0 = 中央、WAVE_BANDS - 1 = 端）の、時刻 t の大きさ（0..1 程度。拍の跳ねを含む） */
function bandMagnitude(j: number, t: number, level: number, kick: number): number {
  const u = j / (WAVE_BANDS - 1);
  // 中央（低音側）ほど大きく、端（高音側）ほど小さい
  const envelope = 0.15 + 0.85 * (1 - u) ** 0.8;
  // 帯域ごとにばらばらに揺らす（速さと位相を帯域ごとに変える）
  const wobble =
    0.55 + 0.3 * Math.sin(2 * Math.PI * (1.3 + 3.1 * u) * t + bandPhase(j, 1)) + 0.15 * Math.sin(2 * Math.PI * (2.7 + 5.3 * u) * t + bandPhase(j, 2));
  return envelope * wobble * (0.2 + 0.8 * level) * (1 + WAVE_KICK * kick * (1 - u) ** 2);
}

/**
 * 横型の疑似スペアナ: 画面中央からの距離 u（0 = 中央、1 = 端）の、時刻 t の振れ（-1..1 程度）。
 * 実際の周波数を解析するのではなく、音量と拍から作る見た目だけの動き。中央ほど低い音に見立てて大きく動かし、
 * 帯域ごとにばらばらに揺らし、拍の瞬間に中央を跳ねさせる。線が上下に振れる波は、中央から外へ流れる
 */
export function waveOffset(u: number, t: number, level: number, kick: number): number {
  // 帯域の間は、なめらかにつなぐ（線がギザギザしないように）
  const x = Math.min(1, Math.max(0, u)) * (WAVE_BANDS - 1);
  const j = Math.min(WAVE_BANDS - 2, Math.floor(x));
  const f = x - j;
  const w = f * f * (3 - 2 * f);
  const magnitude = bandMagnitude(j, t, level, kick) * (1 - w) + bandMagnitude(j + 1, t, level, kick) * w;
  // 上下に振れる波（中央から外へ流れる）
  return magnitude * Math.sin(2 * Math.PI * (WAVE_CYCLES * u - WAVE_FLOW * t));
}

/** 時刻 t の拍の跳ね（直前の拍からの経過で 1 → 0） */
export function waveKick(beats: number[], t: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return last < 0 ? 0 : Math.exp(-(t - beats[last]) / WAVE_KICK_DECAY_SEC);
}

/** 線の色（端ほど薄くする） */
function fadeColor(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 時刻 t の間奏の進み具合を描く */
export function drawInterlude(ctx: Ctx2D, timeline: Timeline, t: number): void {
  const state = interludeAt(timeline.interludes, t);
  if (!state || state.alpha <= 0) return;
  const { interlude, p, alpha } = state;
  const { width, height } = timeline;
  const res = Math.min(width, height) / 1080;

  const label = percentLabel(p);

  ctx.save();
  ctx.strokeStyle = interlude.color;
  ctx.fillStyle = interlude.color;
  ctx.lineCap = 'round';
  if (timeline.glow > 0) {
    ctx.shadowColor = interlude.color;
    ctx.shadowBlur = timeline.glow;
  }

  if (interlude.style === 'bar') {
    // 縦型は Shorts / Reels の下部 UI を避けて少し上に置く
    const y = height * (height > width ? 0.76 : 0.88);
    const w = width * 0.6;
    const lw = 28 * res;
    const labelSize = Math.round(lw * 2);
    const gap = lw;
    // 「バー＋間隔＋パーセンテージ（最大の 100%）」のまとまりを画面中央に置く
    ctx.font = cssFont(interlude.fontId, interlude.weight, labelSize);
    const labelW = ctx.measureText('0').width * 3 + ctx.measureText('%').width;
    const x0 = (width - (w + lw + gap + labelW)) / 2 + lw / 2;
    ctx.lineWidth = lw;
    ctx.globalAlpha = alpha * TRACK_ALPHA;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
    if (p > 0) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w * p, y);
      ctx.stroke();
    }
    // 画面の中央を水平に横切る、曲の音量と拍に合わせて動く疑似スペアナの線（左右対称。端ほど薄い）
    const rhythm = timeline.rhythm;
    if (rhythm?.energy) {
      const range = meterRange(rhythm.energy, interlude.start, interlude.end);
      const level = exaggerated(rhythm.energy, t, range);
      const kick = waveKick(rhythm.beats, t);
      const cy = height / 2;
      const amp = Math.min(width, height) * 0.14;
      const step = Math.max(1, 2 * res);
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, fadeColor(interlude.color, 0));
      grad.addColorStop(0.3, fadeColor(interlude.color, 0.8));
      grad.addColorStop(0.5, fadeColor(interlude.color, 1));
      grad.addColorStop(0.7, fadeColor(interlude.color, 0.8));
      grad.addColorStop(1, fadeColor(interlude.color, 0));
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3 * res;
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let x = 0; x <= width; x += step) {
        const u = Math.abs(x - width / 2) / (width / 2);
        const yy = cy - amp * waveOffset(u, t, level, kick);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = alpha;
    drawPercent(ctx, interlude, label, labelSize, x0 + w + lw / 2 + gap, y, 'left');
  } else {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.12;
    const top = -Math.PI / 2;
    ctx.lineWidth = 8 * res;
    ctx.globalAlpha = alpha * TRACK_ALPHA;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (p > 0) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(cx, cy, r, top, top + Math.PI * 2 * p);
      ctx.stroke();
    }
    // 曲の音量に合わせて動く棒（円の外側に放射状に並べる。時計回りに過去から今へ）
    const energy = timeline.rhythm?.energy;
    if (energy) {
      const range = meterRange(energy, interlude.start, interlude.end);
      const inner = r + 14 * res;
      const maxLen = 150 * res;
      ctx.lineWidth = 5 * res;
      ctx.lineCap = 'butt';
      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      for (let k = 0; k < METER_BARS; k++) {
        const a = top + (Math.PI * 2 * (k + 0.5)) / METER_BARS;
        const len = Math.max(3 * res, maxLen * meterLevel(energy, t, k, range));
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * (inner + len), cy + Math.sin(a) * (inner + len));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    drawPercent(ctx, interlude, label, Math.round(r * 0.45), cx, cy, 'center');
  }
  ctx.restore();
}
