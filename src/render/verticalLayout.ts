// 縦書きレイアウト。右の列から左へ組み、2列目以降を少しずつ下げる（千鳥配置）。
// 文字種による強弱・画数強調は横書きと同じ倍率（lineScales）を使う。

import { graphemes } from '../analysis/segment';
import type { TimelineItem } from '../director/types';
import { cssFont } from '../fonts/catalog';
import { kanjiBoost } from './charClass';
import {
  CENTER_FROM_BASELINE,
  LINE_GAP,
  MIN_SIZE,
  lineScales,
  type GlyphBox,
  type ItemLayout,
  type LineBox,
  type PhraseBox,
} from './layout';

/** 縦書きで90°回転させる文字（長音・波ダッシュ・三点リーダー・かっこ類など） */
const ROTATE = /[ー－―‐〜～…‥「」『』（）()【】〈〉《》［］[\]｛｝{}＝=→←]/;
/** 字の右上に寄せる句読点 */
const PUNCT = /[、。，．]/;
/** やや右上に寄せる小書きのかな */
const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵ]/;

const MAX_COLUMNS = 4;

interface VGlyph {
  ch: string;
  /** 列の先頭からの中心位置 */
  y: number;
  size: number;
  font: string;
}

interface VPhrase {
  glyphs: VGlyph[];
  len: number;
  maxSize: number;
}

interface Column {
  phrases: VPhrase[];
  len: number;
  maxSize: number;
}

function shapeVPhrase(item: TimelineItem, chars: string[], scales: number[], size: number): VPhrase {
  const glyphs: VGlyph[] = [];
  let y = 0;
  let maxSize = 0;
  chars.forEach((ch, k) => {
    const s = Math.round(size * scales[k]);
    // 空白は半角分だけ送る
    if (!ch.trim()) {
      y += s * 0.5;
      return;
    }
    glyphs.push({ ch, y: y + s / 2, size: s, font: cssFont(item.fontId, item.weight, s) });
    y += s;
    maxSize = Math.max(maxSize, s);
  });
  return { glyphs, len: y, maxSize };
}

function buildColumns(item: TimelineItem, size: number, maxLen: number): Column[] {
  const cols: Column[] = [];
  const push = (phrases: VPhrase[]) =>
    cols.push({
      phrases,
      len: phrases.reduce((s, p) => s + p.len, 0),
      maxSize: Math.max(...phrases.map((p) => p.maxSize), 1),
    });
  item.lines.forEach((phrases, li) => {
    const { chars, scales, sizeFactor } = lineScales(item, li);
    const lineSize = Math.round(size * sizeFactor);
    let offset = 0;
    let cur: VPhrase[] = [];
    let curLen = 0;
    for (const p of phrases) {
      const n = graphemes(p).length;
      const vp = shapeVPhrase(item, chars.slice(offset, offset + n), scales.slice(offset, offset + n), lineSize);
      if (cur.length && curLen + vp.len > maxLen) {
        push(cur);
        cur = [vp];
        curLen = vp.len;
      } else {
        cur.push(vp);
        curLen += vp.len;
      }
      offset += n;
    }
    if (cur.length) push(cur);
  });
  return cols;
}

export function computeVerticalLayout(item: TimelineItem, width: number, height: number): ItemLayout {
  const maxLen = height * (item.fit ? 0.86 : 0.74);
  const maxW = width * (item.fit ? 0.92 : 0.84);
  const stagger = (size: number) => size * 0.9;
  const totalLen = (cols: Column[], size: number) => Math.max(...cols.map((c, i) => c.len + i * stagger(size)));
  const startSize = item.fit ? item.fontSize : Math.round(item.fontSize * kanjiBoost(item.kanaRatio));

  const tryCols = (size: number): Column[] | null => {
    const cols = buildColumns(item, size, maxLen);
    const w = cols.reduce((s, c) => s + c.maxSize * LINE_GAP, 0);
    return cols.length <= MAX_COLUMNS && w <= maxW && totalLen(cols, size) <= height * 0.9 && cols.every((c) => c.len <= maxLen)
      ? cols
      : null;
  };

  // 開始サイズで収まればそのまま。収まらなければ収まる最大サイズを二分探索する
  let size = startSize;
  let cols = tryCols(size);
  if (!cols) {
    let lo = MIN_SIZE;
    let hi = startSize - 1;
    let best: Column[] | null = null;
    let bestSize = MIN_SIZE;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const c = tryCols(mid);
      if (c) {
        best = c;
        bestSize = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    size = bestSize;
    cols = best ?? buildColumns(item, MIN_SIZE, maxLen);
  }

  const widths = cols.map((c) => c.maxSize * LINE_GAP);
  const blockW = widths.reduce((s, w) => s + w, 0);
  const blockH = totalLen(cols, size);
  const top = (height - blockH) / 2;
  // 横位置: 中央 / 左寄せ / 右寄せ。寄せても画面端の余白（6%）からははみ出さないよう補正する
  const portrait = height > width;
  const centerX =
    item.side === 'left' ? width * (portrait ? 0.3 : 0.22) : item.side === 'right' ? width * (portrait ? 0.7 : 0.78) : width / 2;
  const margin = width * 0.06;
  const right = Math.min(width - margin, Math.max(margin + blockW, centerX + blockW / 2));

  const lines: LineBox[] = [];
  const phrases: PhraseBox[] = [];
  const glyphs: GlyphBox[] = [];
  let x = right;
  cols.forEach((col, ci) => {
    const colW = widths[ci];
    x -= colW;
    const cx = x + colW / 2;
    const colTop = top + ci * stagger(size);
    const line: LineBox = { x, y: colTop + col.len / 2, w: colW, h: col.len, phrases: [] };
    let y = colTop;
    for (const vp of col.phrases) {
      const pb: PhraseBox = { x, w: colW, y: y + vp.len / 2, line: ci, index: phrases.length, glyphs: [] };
      for (const vg of vp.glyphs) {
        const s = vg.size;
        let dx = 0;
        let dy = 0;
        if (PUNCT.test(vg.ch)) {
          dx = s * 0.55;
          dy = -s * 0.55;
        } else if (SMALL_KANA.test(vg.ch)) {
          dx = s * 0.1;
          dy = -s * 0.1;
        }
        const g: GlyphBox = {
          ch: vg.ch,
          cx: cx + dx,
          y: y + vg.y + dy,
          baseOff: s * CENTER_FROM_BASELINE,
          w: s,
          size: s,
          font: vg.font,
          line: ci,
          phrase: pb.index,
          index: glyphs.length,
          rot: ROTATE.test(vg.ch) ? Math.PI / 2 : 0,
        };
        glyphs.push(g);
        pb.glyphs.push(g);
      }
      y += vp.len;
      phrases.push(pb);
      line.phrases.push(pb);
    }
    lines.push(line);
  });

  return {
    font: cssFont(item.fontId, item.weight, size),
    size,
    lines,
    phrases,
    glyphs,
    bbox: { x: right - blockW, y: top, w: blockW, h: blockH },
    vertical: true,
  };
}
