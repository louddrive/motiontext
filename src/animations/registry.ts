import {
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  lerp,
  progress,
} from '../render/easing';
import { applyCameraAt } from '../render/camera';
import type { ItemLayout } from '../render/layout';
import { clipWith, drawGlyph, glyphRand, outlineWidth, PLAIN_STYLE, strokeGlyph } from './draw';
import type { BackgroundMode } from '../themes/types';
import type { AnimationFn, AnimationId } from './types';

/**
 * 文字送りの間隔を、曲の拍の間隔の 1/2^k（8分・16分・32分…音符）にそろえる。元の間隔の 1.2 倍を超えない最も長いものを選ぶ
 * （登場にかかる時間が元より長くなりすぎないように）。拍に合わせないとき（beat が null）は元の間隔のまま
 */
export function syncStagger(s: number, beat: number | null): number {
  if (!beat || s <= 0) return s;
  let c = beat / 2;
  while (c > s * 1.2 && c > 1e-3) c /= 2;
  return c;
}

/** 共通の退場: フェードしながら少し上へ */
const exitAlpha = (outP: number) => 1 - easeInCubic(outP);

const fadeUp: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item, beat }) => {
  const stagger = syncStagger(0.06, beat);
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
    // 横書き: 左から右へ開き、左から閉じる / 縦書き: 上から下へ開き、上から閉じる（縦横混在は行ごと）
    const v = line.vertical;
    const start = v ? line.y - h / 2 : line.x;
    const len = v ? h : line.w;
    const a0 = start - 8 + (len + 16) * o;
    const a1 = start - 8 + (len + 16) * e;
    if (a1 <= a0) return;
    ctx.save();
    // 完全に表示されている間はマスク不要（カメラの近似誤差で端が欠けるのも防ぐ）
    if (e < 1 || o > 0) {
      clipWith(ctx, gs.cam, line.x + line.w / 2, line.y, (c) =>
        v ? c.rect(line.x - 20, a0, line.w + 40, a1 - a0) : c.rect(a0, line.y - h / 2 - 20, a1 - a0, h + 40),
      );
    }
    for (const p of line.phrases) for (const g of p.glyphs) drawGlyph(ctx, g, gs, v ? { dy: -50 * (1 - e) } : { dx: -50 * (1 - e) });
    ctx.restore();
  });
};

const phraseStack: AnimationFn = ({ ctx, gs, layout, t, dur, inDur, outP, item, beat }) => {
  const n = layout.phrases.length;
  const span = Math.min(dur * 0.55, n * 0.32);
  const step = syncStagger(n > 1 ? span / (n - 1) : 0, beat);
  for (const p of layout.phrases) {
    const e = progress(t, p.index * step, inDur * 0.8);
    const dir = p.index % 2 === 0 ? -1 : 1;
    const d = dir * 90 * (0.5 + item.energy) * (1 - easeOutBack(e));
    const alpha = easeOutCubic(e) * exitAlpha(outP);
    // 縦書きは文節が上下から、横書きは左右から入る
    const v = layout.lines[p.line].vertical;
    for (const g of p.glyphs) {
      drawGlyph(ctx, g, gs, v ? { dy: d, dx: 12 * easeInCubic(outP), alpha } : { dx: d, dy: -12 * easeInCubic(outP), alpha });
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

const charPop: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item, beat }) => {
  const n = layout.glyphs.length;
  const stagger = syncStagger(Math.min(0.05, (inDur * 1.2) / Math.max(n, 1)), beat);
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

const typewriter: AnimationFn = ({ ctx, gs, layout, t, dur, outP, beat }) => {
  const n = layout.glyphs.length;
  const step = syncStagger(Math.min(0.09, (dur * 0.6) / Math.max(n, 1)), beat);
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
    const v = layout.lines[g.line].vertical;
    const dx = (g.cx - cx) * ((v ? 1 : spacing) * s - 1);
    const dy = (g.y - cy) * ((v ? spacing : 1) * s - 1);
    drawGlyph(ctx, g, gs, { dx, dy, scale: s, alpha: clamp01(e * 1.5) * (1 - o) });
  }
};

const wave: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item, beat }) => {
  const amp = 6 + 10 * item.energy;
  const stagger = syncStagger(0.035, beat);
  for (const g of layout.glyphs) {
    const e = easeOutCubic(progress(t, g.index * stagger, inDur));
    const w = Math.sin(t * 5 - g.index * 0.55) * amp * e;
    // 縦書きは左右に揺らす
    const xf = layout.lines[g.line].vertical ? { dx: w, dy: 44 * (1 - e) } : { dy: 44 * (1 - e) + w };
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

/**
 * 帯ワイプの帯の秒数。登場の秒数（inDur）に連動させると短すぎて帯が一瞬で消えるため、字幕の長さから決める
 */
export const bandDuration = (dur: number) => Math.min(1.1, Math.max(0.45, dur * 0.45));

/**
 * 帯ワイプの、行の頭からの割合（0..1）。head = 帯の先端、tail = 帯の後端（文字はここまで見える）。
 * 先端は目で追える速さで伸び、途中から後端が追いかけ、dur 経過で帯は消えて文字が全部見える
 */
export function bandSpan(t: number, start: number, dur: number): { head: number; tail: number } {
  return {
    head: easeInOutCubic(progress(t, start, dur * 0.55)),
    tail: easeInOutCubic(progress(t, start + dur * 0.4, dur * 0.6)),
  };
}

/** 帯ワイプ: 字幕の色の帯が行を走り、帯が通った跡に文字が現れる（横書きは左から、縦書きは上から） */
const bandWipe: AnimationFn = ({ ctx, gs, layout, t, dur, outP }) => {
  const alpha = exitAlpha(outP);
  const bandDur = bandDuration(dur);
  layout.lines.forEach((line, li) => {
    const { head, tail } = bandSpan(t, li * 0.12, bandDur);
    if (head <= 0) return;
    const v = line.vertical;
    const cx = line.x + line.w / 2;
    const cy = line.y;
    const pad = 8;
    const start = (v ? line.y - line.h / 2 : line.x) - pad;
    const len = (v ? line.h : line.w) + pad * 2;
    if (tail > 0) {
      ctx.save();
      if (tail < 1) {
        clipWith(ctx, gs.cam, cx, cy, (c) =>
          v
            ? c.rect(line.x - line.w, start - 40, line.w * 3, len * tail + 40)
            : c.rect(start - 40, cy - line.h * 1.5, len * tail + 40, line.h * 3),
        );
      }
      for (const p of line.phrases) for (const g of p.glyphs) drawGlyph(ctx, g, gs, { alpha });
      ctx.restore();
    }
    if (head > tail) {
      // 帯（文字色）。グローは付けない
      const thick = (v ? line.w : line.h) * 0.8;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      if (gs.cam) applyCameraAt(ctx, gs.cam, cx, cy);
      ctx.beginPath();
      if (v) ctx.rect(cx - thick / 2, start + len * tail, thick, len * (head - tail));
      else ctx.rect(start + len * tail, cy - thick / 2, len * (head - tail), thick);
      ctx.fill();
      ctx.restore();
    }
  });
};

/** スロットで本来の文字の前に流す文字の数 */
export const SLOT_DECOYS = 3;

/**
 * スロットで流れる文字の並び（最後が本来の文字）。流す文字は同じ字幕の別の文字から選ぶ
 * （読み込み済みのグリフだけを使い、別のフォントに置き換わらないようにする）。seed とグリフ番号から決定的
 */
export function slotReel(layout: ItemLayout, seed: number, index: number): string[] {
  // 毎フレーム同じ並びになるので、レイアウト・seed ごとに1回だけ作って使い回す
  let cache = reelCache.get(layout);
  if (!cache || cache.seed !== seed) reelCache.set(layout, (cache = { seed, reels: new Map() }));
  let reel = cache.reels.get(index);
  if (!reel) {
    const target = layout.glyphs[index].ch;
    const pool = [...new Set(layout.glyphs.map((g) => g.ch))];
    const others = pool.filter((c) => c !== target);
    const src = others.length ? others : pool;
    const r = glyphRand(seed, -1000 - index);
    reel = [...Array.from({ length: SLOT_DECOYS }, () => src[Math.floor(r() * src.length)]), target];
    cache.reels.set(index, reel);
  }
  return reel;
}

const reelCache = new WeakMap<ItemLayout, { seed: number; reels: Map<number, string[]> }>();

/** スロット: 文字の枠の中を別の文字が上から流れ、本来の文字で少し行き過ぎて止まる */
const slot: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item, beat }) => {
  const n = layout.glyphs.length;
  const stagger = syncStagger(Math.min(0.04, (inDur * 0.8) / Math.max(n, 1)), beat);
  const alpha = exitAlpha(outP);
  for (const g of layout.glyphs) {
    const e = progress(t, g.index * stagger, inDur * 1.1);
    if (e <= 0) continue;
    if (e >= 1) {
      drawGlyph(ctx, g, gs, { alpha });
      continue;
    }
    const reel = slotReel(layout, item.seed, g.index);
    const cell = g.size * 1.1;
    const half = Math.max(g.w, g.size) * 0.6;
    // 枠の中央に来ている位置（0 = 先頭の文字、reel.length - 1 = 本来の文字）
    const pos = easeOutBack(e) * (reel.length - 1);
    ctx.save();
    clipWith(ctx, gs.cam, g.cx, g.y, (c) => c.rect(g.cx - half, g.y - cell / 2, half * 2, cell));
    reel.forEach((ch, k) => {
      const dy = (pos - k) * cell;
      if (Math.abs(dy) >= cell) return;
      // 流す文字は縦書き用の回転を引き継がない
      drawGlyph(ctx, k === reel.length - 1 ? g : { ...g, ch, rot: 0 }, gs, { dy, alpha });
    });
    ctx.restore();
  }
};

/** スプリットの半分ずつのずれ（登場の終わりで0） */
export const splitOffset = (e: number, size: number, energy: number) => (1 - easeOutCubic(e)) * size * 1.6 * (0.6 + energy);

/** スプリット: 字の上半分と下半分（縦書きは左半分と右半分）が逆方向から来て合体する */
const split: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item, beat }) => {
  const n = layout.glyphs.length;
  const stagger = syncStagger(Math.min(0.04, (inDur * 0.8) / Math.max(n, 1)), beat);
  const alpha = exitAlpha(outP);
  // クリップ範囲は、ずれる方向には十分に長く取る
  const far = 1e4;
  for (const g of layout.glyphs) {
    const e = progress(t, g.index * stagger, inDur);
    if (e <= 0) continue;
    const a = Math.min(1, e * 2) * alpha;
    // 合体した後はクリップせずに描く（つなぎ目にグローの切れ目を残さない）
    if (e >= 1) {
      drawGlyph(ctx, g, gs, { alpha: a });
      continue;
    }
    const d = splitOffset(e, g.size, item.energy);
    const v = layout.lines[g.line].vertical;
    const r = g.size * 2;
    for (const side of [-1, 1] as const) {
      ctx.save();
      clipWith(ctx, gs.cam, g.cx, g.y, (c) =>
        v ? c.rect(side < 0 ? g.cx - r : g.cx, g.y - far, r, far * 2) : c.rect(g.cx - far, side < 0 ? g.y - r : g.y, far * 2, r),
      );
      drawGlyph(ctx, g, gs, v ? { dy: side * d, alpha: a } : { dx: side * d, alpha: a });
      ctx.restore();
    }
  }
};

/** アウトラインの反復の向きの乱数に使うキー（グリフ番号・装飾と衝突しない値） */
const OUTLINE_ECHO_KEY = -3;

/** アウトラインの反復の広がり（0 = 本体に収束）。登場時に縮み、退場時にもう一度広がる */
export const outlineEchoSpread = (e: number, o: number) => Math.max(1 - e, o);

/** アウトラインの反復: 縁取りだけの複製が斜め方向にずれて重なり、本体に収束しながら消える */
const outlineEcho: AnimationFn = ({ ctx, gs, layout, t, inDur, outP, item }) => {
  const r = glyphRand(item.seed, OUTLINE_ECHO_KEY);
  const angle = Math.PI / 4 + Math.floor(r() * 4) * (Math.PI / 2);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const copies = item.energy >= 0.9 ? 4 : 3;
  const o = easeInCubic(outP);
  for (const g of layout.glyphs) {
    const delay = g.index * 0.02;
    const e = easeOutCubic(progress(t, delay, inDur * 1.2));
    const spread = outlineEchoSpread(e, o);
    const appear = progress(t, delay, 0.15);
    if (spread > 0.01) {
      for (let k = copies; k >= 1; k--) {
        const d = k * g.size * 0.14 * spread * (0.6 + item.energy);
        const a = 0.7 * (1 - (k - 1) / copies) * clamp01(spread * 3) * appear;
        strokeGlyph(ctx, g, gs.cam, { dx: ux * d, dy: uy * d, alpha: a }, outlineWidth(g.size) * 1.2);
      }
    }
    drawGlyph(ctx, g, gs, { alpha: e * exitAlpha(outP) });
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
  bandWipe,
  slot,
  split,
  outlineEcho,
};
