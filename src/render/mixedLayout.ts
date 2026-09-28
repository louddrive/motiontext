// 縦横混在レイアウト。2つの塊の一方を縦書きの列、もう一方を横書きの行で組み、L字型／逆L字型に並べる。
// 横書きの行は、縦の列の最後の文字と中心の高さをそろえて、読む流れが途切れないようにする。

import type { TimelineItem } from '../director/types';
import { cssFont } from '../fonts/catalog';
import { computeLayout, MIN_SIZE, startSizeOf, type Ctx2D, type GlyphBox, type ItemLayout, type LineBox, type PhraseBox } from './layout';
import { computeVerticalLayout } from './verticalLayout';

/** 縦の列の幅（字の左右に 0.15em の余白を含む）に加える、横書きの行との間隔（基準サイズに対する比） */
const GAP = 0.1;

interface Placed {
  layout: ItemLayout;
  dx: number;
  dy: number;
}

/** 1つの塊だけを持つサブアイテム */
function part(item: TimelineItem, li: number, vertical: boolean): TimelineItem {
  return {
    ...item,
    lines: [item.lines[li]],
    emphasisRanges: [item.emphasisRanges[li]],
    vertical,
    mixed: null,
    side: 'center',
    anchor: 'center',
    align: 'center',
  };
}

export function computeMixedLayout(ctx: Ctx2D, item: TimelineItem, width: number, height: number): ItemLayout {
  const mixed = item.mixed!;
  const vl = mixed.verticalLine;
  const hl = vl === 0 ? 1 : 0;
  const maxW = width * 0.84;
  const maxH = height * 0.74;

  /** size で組んで並べる。どちらかが2列（2行）以上に折り返す・画面に収まらない場合は null（force で常に並べる） */
  const arrange = (size: number, force = false) => {
    const v = computeVerticalLayout(part(item, vl, true), width, height, size);
    const h = computeLayout(ctx, part(item, hl, false), width, height, size);
    if (!force && (v.lines.length !== 1 || h.lines.length !== 1)) return null;
    // 縦の列を原点に置く
    const vp: Placed = { layout: v, dx: -v.bbox.x, dy: -v.bbox.y };
    const col = v.lines[0];
    const lastGlyph = v.glyphs[v.glyphs.length - 1];
    const row = h.lines[0];
    const targetY = (lastGlyph ? lastGlyph.y : col.y) + vp.dy;
    const gap = GAP * size;
    const hx = mixed.shape === 'L' ? v.bbox.w + gap : -gap - row.w;
    const hp: Placed = { layout: h, dx: hx - row.x, dy: targetY - row.y };

    const boxes = [vp, hp].map(({ layout: { bbox }, dx, dy }) => ({ x0: bbox.x + dx, y0: bbox.y + dy, x1: bbox.x + bbox.w + dx, y1: bbox.y + bbox.h + dy }));
    const minX = Math.min(...boxes.map((b) => b.x0));
    const minY = Math.min(...boxes.map((b) => b.y0));
    const w = Math.max(...boxes.map((b) => b.x1)) - minX;
    const hh = Math.max(...boxes.map((b) => b.y1)) - minY;
    if (!force && (w > maxW || hh > maxH)) return null;
    // 全体を画面の中央へ
    const ox = (width - w) / 2 - minX;
    const oy = (height - hh) / 2 - minY;
    for (const p of [vp, hp]) {
      p.dx += ox;
      p.dy += oy;
    }
    const placed = vl === 0 ? [vp, hp] : [hp, vp];
    return { placed, bbox: { x: minX + ox, y: minY + oy, w, h: hh } };
  };

  // 開始サイズで収まればそのまま。収まらなければ収まる最大サイズを二分探索する
  let size = startSizeOf(item);
  let result = arrange(size);
  if (!result) {
    let lo = MIN_SIZE;
    let hi = size - 1;
    let best: ReturnType<typeof arrange> = null;
    let bestSize = MIN_SIZE;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const r = arrange(mid);
      if (r) {
        best = r;
        bestSize = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    size = bestSize;
    result = best ?? arrange(MIN_SIZE, true)!;
  }

  // 読む順（塊1 → 塊2）に行・フレーズ・文字をつなげ、通し番号を振り直す
  const lines: LineBox[] = [];
  const phrases: PhraseBox[] = [];
  const glyphs: GlyphBox[] = [];
  for (const { layout, dx, dy } of result.placed) {
    const phraseBase = phrases.length;
    const glyphBase = glyphs.length;
    for (const line of layout.lines) {
      const li = lines.length;
      const lb: LineBox = { ...line, x: line.x + dx, y: line.y + dy, phrases: [] };
      for (const p of line.phrases) {
        const pb: PhraseBox = { ...p, x: p.x + dx, y: p.y + dy, line: li, index: p.index + phraseBase, glyphs: [] };
        for (const g of p.glyphs) {
          const gb: GlyphBox = { ...g, cx: g.cx + dx, y: g.y + dy, line: li, phrase: pb.index, index: g.index + glyphBase };
          pb.glyphs.push(gb);
          glyphs.push(gb);
        }
        lb.phrases.push(pb);
        phrases.push(pb);
      }
      lines.push(lb);
    }
  }

  return { font: cssFont(item.fontId, item.weight, size), size, lines, phrases, glyphs, bbox: result.bbox, vertical: false };
}
