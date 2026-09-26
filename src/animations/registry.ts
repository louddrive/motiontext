import {
  clamp01,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  lerp,
  progress,
} from '../render/easing';
import { applyCameraAt } from '../render/camera';
import { drawGlyph, glyphRand, PLAIN_STYLE } from './draw';
import type { BackgroundMode } from '../themes/types';
import type { AnimationFn, AnimationId } from './types';

/** 共通の退場: フェードしながら少し上へ */
const exitAlpha = (outP: number) => 1 - easeInCubic(outP);

const fadeUp: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item }) => {
  const stagger = 0.06;
  for (const p of layout.phrases) {
    const e = easeOutCubic(progress(t, p.index * stagger, inDur));
    const rise = 36 * (0.6 + item.energy);
    for (const g of p.glyphs) {
      drawGlyph(ctx, g, gs, { dy: rise * (1 - e) - 16 * easeInCubic(outP), alpha: e * exitAlpha(outP) });
    }
  }
};

const slideMask: AnimationFn = ({ ctx, gs, layout, t, inDur, outP }) => {
  layout.lines.forEach((line, li) => {
    const e = easeOutExpo(progress(t, li * 0.12, inDur * 1.2));
    const o = easeInCubic(outP);
    const h = line.h;
    // 横書き: 左から右へ開き、左から閉じる / 縦書き: 上から下へ開き、上から閉じる
    const v = layout.vertical;
    const start = v ? line.y - h / 2 : line.x;
    const len = v ? h : line.w;
    const a0 = start - 8 + (len + 16) * o;
    const a1 = start - 8 + (len + 16) * e;
    if (a1 <= a0) return;
    ctx.save();
    // 完全に表示されている間はマスク不要（カメラの近似誤差で端が欠けるのも防ぐ）
    if (e < 1 || o > 0) {
      if (gs.cam) applyCameraAt(ctx, gs.cam, line.x + line.w / 2, line.y);
      ctx.beginPath();
      if (v) ctx.rect(line.x - 20, a0, line.w + 40, a1 - a0);
      else ctx.rect(a0, line.y - h / 2 - 20, a1 - a0, h + 40);
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    for (const p of line.phrases) for (const g of p.glyphs) drawGlyph(ctx, g, gs, v ? { dy: -50 * (1 - e) } : { dx: -50 * (1 - e) });
    ctx.restore();
  });
};

const phraseStack: AnimationFn = ({ ctx, gs, layout, t, dur, inDur, outP, item }) => {
  const n = layout.phrases.length;
  const span = Math.min(dur * 0.55, n * 0.32);
  const step = n > 1 ? span / (n - 1) : 0;
  for (const p of layout.phrases) {
    const e = progress(t, p.index * step, inDur * 0.8);
    const dir = p.index % 2 === 0 ? -1 : 1;
    const d = dir * 90 * (0.5 + item.energy) * (1 - easeOutBack(e));
    const alpha = easeOutCubic(e) * exitAlpha(outP);
    // 縦書きは文節が上下から、横書きは左右から入る
    for (const g of p.glyphs) {
      drawGlyph(ctx, g, gs, layout.vertical ? { dy: d, dx: 12 * easeInCubic(outP), alpha } : { dx: d, dy: -12 * easeInCubic(outP), alpha });
    }
  }
};

const scatter: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item }) => {
  const spread = 50 + 90 * item.energy;
  for (const g of layout.glyphs) {
    const r = glyphRand(item.seed, g.index);
    const ox = (r() - 0.5) * 2 * spread;
    const oy = (r() - 0.5) * 2 * spread;
    const rot = (r() - 0.5) * 1.2;
    const delay = r() * inDur * 0.6;
    const e = easeOutCubic(progress(t, delay, inDur));
    const o = easeInCubic(outP);
    drawGlyph(ctx, g, gs, {
      dx: ox * (1 - e) + ox * 0.4 * o,
      dy: oy * (1 - e) + oy * 0.4 * o,
      rot: rot * (1 - e) + rot * 0.5 * o,
      alpha: e * (1 - o),
    });
  }
};

const charPop: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item }) => {
  const n = layout.glyphs.length;
  const stagger = Math.min(0.05, (inDur * 1.2) / Math.max(n, 1));
  for (const g of layout.glyphs) {
    const e = progress(t, g.index * stagger, inDur * 0.7);
    const oLocal = clamp01(outP * 1.6 - (g.index / Math.max(n, 1)) * 0.6);
    drawGlyph(ctx, g, gs, {
      scale: easeOutBack(e) * (1 + 0.15 * item.energy * (1 - e)),
      alpha: clamp01(e * 3) * (1 - easeInCubic(oLocal)),
      dy: 40 * easeInCubic(oLocal),
    });
  }
};

const typewriter: AnimationFn = ({ ctx, gs, layout, t, dur, outP }) => {
  const n = layout.glyphs.length;
  const step = Math.min(0.09, (dur * 0.6) / Math.max(n, 1));
  for (const g of layout.glyphs) {
    const e = progress(t, g.index * step, 0.08);
    drawGlyph(ctx, g, gs, { alpha: e * exitAlpha(outP), scale: lerp(1.25, 1, easeOutCubic(e)) });
  }
};

const scaleBurst: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item }) => {
  const e = easeOutExpo(progress(t, 0, inDur));
  const o = easeInCubic(outP);
  const cx = layout.bbox.x + layout.bbox.w / 2;
  const cy = layout.bbox.y + layout.bbox.h / 2;
  const s = lerp(1.5 + 0.4 * item.energy, 1, e) * (1 + 0.08 * o);
  const spacing = 1 + 0.6 * (1 - e);
  for (const g of layout.glyphs) {
    // 中心からの距離を字間ごと拡大 → 収束（縦書きは縦方向の字間）
    const v = layout.vertical;
    const dx = (g.cx - cx) * ((v ? 1 : spacing) * s - 1);
    const dy = (g.y - cy) * ((v ? spacing : 1) * s - 1);
    drawGlyph(ctx, g, gs, { dx, dy, scale: s, alpha: clamp01(e * 1.5) * (1 - o) });
  }
};

const wave: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item }) => {
  const amp = 6 + 10 * item.energy;
  for (const g of layout.glyphs) {
    const e = easeOutCubic(progress(t, g.index * 0.035, inDur));
    const w = Math.sin(t * 5 - g.index * 0.55) * amp * e;
    // 縦書きは左右に揺らす
    const xf = layout.vertical ? { dx: w, dy: 44 * (1 - e) } : { dy: 44 * (1 - e) + w };
    drawGlyph(ctx, g, gs, { ...xf, alpha: e * exitAlpha(outP) });
  }
};

/** 動きなしの短いフェード（演出なし・可読性重視用） */
const fade: AnimationFn = ({ ctx, gs, layout, t, dur }) => {
  const f = Math.min(0.2, dur * 0.2);
  const alpha = Math.min(progress(t, 0, f), 1 - progress(t, dur - f, f));
  for (const g of layout.glyphs) drawGlyph(ctx, g, gs, { alpha });
};

/** 残響: 文字から残像が広がりながら消え、本体が静かに定着する（エモ系） */
const echo: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item }) => {
  const o = easeInCubic(outP);
  const ghosts = item.energy >= 0.9 ? 4 : 3;
  // 残像には縁取り・影・シャインを付けない（うるさくなるため）
  const ghost = { ...PLAIN_STYLE, cam: gs.cam };
  for (const g of layout.glyphs) {
    const delay = g.index * 0.02;
    for (let k = ghosts; k >= 1; k--) {
      // 登場時は外側へ広がって消える。退場時にもう一度にじむ
      const ge = easeOutCubic(progress(t, delay + k * 0.07, 0.9));
      const spreadIn = 1 + k * 0.16 * ge * (0.6 + item.energy);
      const aIn = (0.4 / k) * (ge > 0 ? 1 - ge : 0);
      const aOut = (0.35 / k) * o * (1 - o) * 4;
      if (aIn > 0.005) drawGlyph(ctx, g, ghost, { scale: spreadIn, alpha: aIn });
      if (aOut > 0.005) drawGlyph(ctx, g, ghost, { scale: 1 + k * 0.1 * o, alpha: aOut });
    }
    const me = easeOutCubic(progress(t, delay, inDur));
    drawGlyph(ctx, g, gs, { scale: lerp(1.08, 1, me), alpha: me * (1 - o) });
  }
};

/** グリッチの色ずれ（赤と青緑）。グリーン背景では青緑の代わりに黄を使う（クロマキーで抜けないように） */
export const GLITCH_RED = '#FF2D55';
export const GLITCH_CYAN = '#00E5FF';
export const GLITCH_YELLOW = '#FFD166';
export const glitchColors = (bg: BackgroundMode): [string, string] => [GLITCH_RED, bg === 'green' ? GLITCH_YELLOW : GLITCH_CYAN];

/** グリッチが乱れている秒数（登場時） */
const GLITCH_IN_SEC = 0.35;
/** 乱れの切り替え周波数 */
const GLITCH_HZ = 12;

/** グリッチ: 色ずれと小刻みな横ずれを伴って登場し、退場の直前にもう一度乱れる */
const glitch: AnimationFn = ({ ctx, gs, layout, t, outP, item, bg }) => {
  const inP = progress(t, 0, GLITCH_IN_SEC);
  const amount = Math.max(1 - easeOutCubic(inP), outP > 0 ? Math.sin(Math.PI * Math.min(1, outP * 1.6)) : 0);
  const alpha = exitAlpha(outP);
  const tick = Math.floor(t * GLITCH_HZ);
  const [c1, c2] = glitchColors(bg);
  const copy = { ...PLAIN_STYLE, cam: gs.cam };
  for (const g of layout.glyphs) {
    if (amount < 0.01) {
      drawGlyph(ctx, g, gs, { alpha });
      continue;
    }
    const r = glyphRand(item.seed, 100000 + tick * 1000 + g.index);
    const jitter = (r() - 0.5) * 2 * g.size * 0.22 * amount;
    const split = g.size * (0.05 + 0.06 * r()) * amount;
    // 登場中はたまに瞬く
    const flicker = inP < 1 && r() < 0.18 ? 0.35 : 1;
    const a = alpha * flicker * (inP < 1 ? Math.min(1, inP * 3 + 0.15) : 1);
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = c1;
    drawGlyph(ctx, g, copy, { dx: jitter - split, alpha: a * 0.7 * amount });
    ctx.fillStyle = c2;
    drawGlyph(ctx, g, copy, { dx: jitter + split, alpha: a * 0.7 * amount });
    ctx.restore();
    drawGlyph(ctx, g, gs, { dx: jitter * 0.4, alpha: a });
  }
};

export const ANIMATIONS: Record<AnimationId, AnimationFn> = {
  glitch,
  fade,
  echo,
  fadeUp,
  slideMask,
  phraseStack,
  scatter,
  charPop,
  typewriter,
  scaleBurst,
  wave,
};
