import { graphemes } from '../analysis/segment';
import type { TimelineItem } from '../director/types';
import { cssFont } from '../fonts/catalog';
import { charScale, classifyChar, hasKanji, kanjiBoost } from './charClass';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface GlyphBox {
  ch: string;
  /** グリフ中心 x */
  cx: number;
  /** グリフの視覚的な中心 y（変形の基準点） */
  y: number;
  /** 中心 y からベースラインまでの距離（textBaseline = alphabetic で描く） */
  baseOff: number;
  w: number;
  size: number;
  font: string;
  line: number;
  phrase: number;
  /** アイテム内の通し番号 */
  index: number;
  /** 文字自体の回転（縦書きの「ー」やかっこ等） */
  rot?: number;
}

export interface PhraseBox {
  x: number;
  w: number;
  y: number;
  line: number;
  index: number;
  glyphs: GlyphBox[];
}

export interface LineBox {
  x: number;
  /** 行の中心 y */
  y: number;
  w: number;
  h: number;
  phrases: PhraseBox[];
}

export interface ItemLayout {
  font: string;
  /** 基準（漢字）サイズ */
  size: number;
  lines: LineBox[];
  phrases: PhraseBox[];
  glyphs: GlyphBox[];
  bbox: { x: number; y: number; w: number; h: number };
  /** 縦書き（lines は右から左への列、x/w は列の左端と幅、y/h は列の中心と長さ） */
  vertical: boolean;
}

export const MIN_SIZE = 32;
const MAX_LINES = 3;
export const LINE_GAP = 1.3;
/** CJK グリフの中心はベースラインからおよそ 0.38em 上にある（下揃え時の中心計算に使う近似値） */
export const CENTER_FROM_BASELINE = 0.38;

interface ShapedGlyph {
  ch: string;
  /** フレーズ先頭からの中心 x */
  x: number;
  w: number;
  size: number;
  font: string;
}

interface ShapedPhrase {
  text: string;
  w: number;
  glyphs: ShapedGlyph[];
  maxSize: number;
}

/**
 * 文字ごとの倍率（scales）でフレーズを組む。同じサイズが続く区間はまとめて計測し、カーニングを保つ。
 */
function shapePhrase(ctx: Ctx2D, item: TimelineItem, chars: string[], scales: number[], size: number): ShapedPhrase {
  const glyphs: ShapedGlyph[] = [];
  const sizes = scales.map((s) => Math.round(size * s));
  let x = 0;
  let maxSize = 0;
  let i = 0;
  while (i < chars.length) {
    const s = sizes[i];
    let j = i + 1;
    while (j < chars.length && sizes[j] === s) j++;
    const font = cssFont(item.fontId, item.weight, s);
    ctx.font = font;
    let prefix = '';
    for (let k = i; k < j; k++) {
      const left = ctx.measureText(prefix).width;
      prefix += chars[k];
      const right = ctx.measureText(prefix).width;
      glyphs.push({ ch: chars[k], x: x + (left + right) / 2, w: right - left, size: s, font });
      if (chars[k].trim()) maxSize = Math.max(maxSize, s);
    }
    x += ctx.measureText(prefix).width;
    i = j;
  }
  return { text: chars.join(''), w: x, glyphs, maxSize };
}

interface Row {
  phrases: ShapedPhrase[];
  w: number;
  h: number;
  maxSize: number;
}

/** 行ごとの各書記素の倍率（文字種による強弱 × 画数強調）と、その行の基準サイズ倍率 */
export function lineScales(item: TimelineItem, li: number): { chars: string[]; scales: number[]; sizeFactor: number } {
  const text = item.lines[li].join('');
  const chars = graphemes(text);
  // 漢字を含まない行（ひらがなのみ・英語のみ等）は強弱をつけず、基準より一段小さい等倍で組む
  const contrast = item.kanaRatio < 1 && hasKanji(text);
  const range = item.emphasisRanges[li];
  const scales = chars.map((ch, k) => {
    const base = contrast ? charScale(classifyChar(ch), item.kanaRatio) : 1;
    return range && k >= range.start && k < range.end ? base * item.emphasisScale : base;
  });
  return { chars, scales, sizeFactor: contrast ? 1 : 1 / kanjiBoost(item.kanaRatio) };
}

function buildRows(ctx: Ctx2D, item: TimelineItem, size: number, maxW: number): Row[] {
  const rows: Row[] = [];
  const push = (phrases: ShapedPhrase[]) => {
    const maxSize = Math.max(...phrases.map((p) => p.maxSize), 1);
    rows.push({ phrases, w: phrases.reduce((s, p) => s + p.w, 0), h: maxSize * LINE_GAP, maxSize });
  };
  item.lines.forEach((phrases, li) => {
    const { chars, scales, sizeFactor } = lineScales(item, li);
    const lineSize = Math.round(size * sizeFactor);
    let offset = 0;
    let cur: ShapedPhrase[] = [];
    let curW = 0;
    for (const p of phrases) {
      const n = graphemes(p).length;
      const shaped = shapePhrase(ctx, item, chars.slice(offset, offset + n), scales.slice(offset, offset + n), lineSize);
      if (cur.length && curW + shaped.w > maxW) {
        push(cur);
        // 折り返した行頭の空白は落とす
        const lead = p.length - p.trimStart().length;
        const trimmed = shapePhrase(ctx, item, chars.slice(offset + lead, offset + n), scales.slice(offset + lead, offset + n), lineSize);
        cur = [trimmed];
        curW = trimmed.w;
      } else {
        cur.push(shaped);
        curW += shaped.w;
      }
      offset += n;
    }
    if (cur.length) push(cur);
  });
  return rows;
}

export function computeLayout(ctx: Ctx2D, item: TimelineItem, width: number, height: number): ItemLayout {
  // 画面いっぱいモードは余白を詰め、行数も多めに許す
  const maxW = width * (item.fit ? 0.92 : 0.84);
  const maxH = height * (item.fit ? 0.86 : 0.6);
  const maxLines = item.fit ? 4 : MAX_LINES;
  const startSize = item.fit ? item.fontSize : Math.round(item.fontSize * kanjiBoost(item.kanaRatio));

  const tryRows = (size: number): Row[] | null => {
    const rows = buildRows(ctx, item, size, maxW);
    const widest = Math.max(...rows.map((r) => r.w));
    const totalH = rows.reduce((s, r) => s + r.h, 0);
    return widest <= maxW && rows.length <= maxLines && totalH <= maxH ? rows : null;
  };

  // 開始サイズで収まればそのまま。収まらなければ収まる最大サイズを二分探索する
  let size = startSize;
  let rows = tryRows(size);
  if (!rows) {
    let lo = MIN_SIZE;
    let hi = startSize - 1;
    let best: Row[] | null = null;
    let bestSize = MIN_SIZE;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const r = tryRows(mid);
      if (r) {
        best = r;
        bestSize = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    size = bestSize;
    rows = best ?? buildRows(ctx, item, MIN_SIZE, maxW);
  }

  const blockH = rows.reduce((s, r) => s + r.h, 0);
  // 縦型は Shorts / Reels の UI（下部のキャプション・ボタン類）を避けて下寄せ位置を上げる
  const portrait = height > width;
  const lowerY = portrait ? 0.74 : 0.86;
  const upperY = portrait ? 0.18 : 0.14;
  const top =
    item.anchor === 'lower' ? height * lowerY - blockH : item.anchor === 'upper' ? height * upperY : (height - blockH) / 2;
  const blockW = Math.max(...rows.map((r) => r.w));
  const blockX = (width - blockW) / 2;

  const lines: LineBox[] = [];
  const phrases: PhraseBox[] = [];
  const glyphs: GlyphBox[] = [];

  let rowTop = top;
  rows.forEach((row, li) => {
    const x0 = item.align === 'left' ? blockX : (width - row.w) / 2;
    const cy = rowTop + row.h / 2;
    // 行内で最大の文字を中央に置き、全文字をそのベースラインに下揃えする
    const baseline = cy + row.maxSize * CENTER_FROM_BASELINE;
    const lineBox: LineBox = { x: x0, y: cy, w: row.w, h: row.h, phrases: [] };
    let px = x0;
    for (const sp of row.phrases) {
      const pb: PhraseBox = { x: px, w: sp.w, y: cy, line: li, index: phrases.length, glyphs: [] };
      for (const sg of sp.glyphs) {
        if (!sg.ch.trim()) continue;
        const baseOff = sg.size * CENTER_FROM_BASELINE;
        const g: GlyphBox = {
          ch: sg.ch,
          cx: px + sg.x,
          y: baseline - baseOff,
          baseOff,
          w: sg.w,
          size: sg.size,
          font: sg.font,
          line: li,
          phrase: pb.index,
          index: glyphs.length,
        };
        glyphs.push(g);
        pb.glyphs.push(g);
      }
      px += sp.w;
      phrases.push(pb);
      lineBox.phrases.push(pb);
    }
    lines.push(lineBox);
    rowTop += row.h;
  });

  return { font: cssFont(item.fontId, item.weight, size), size, lines, phrases, glyphs, bbox: { x: blockX, y: top, w: blockW, h: blockH }, vertical: false };
}
