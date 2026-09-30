// 描画命令を記録する偽の Canvas 2D（ゴールデンテスト用）。
// 変形行列と save/restore の状態を追跡し、「最終的にどこへ・どの見た目で描いたか」だけを1行ずつ記録する。
// 変形の組み立て方（translate → scale の順番等）には依存しないので、見た目が同じリファクタリングでは差分が出ない。
import type { Ctx2D } from '../../src/render/layout';

type M = [number, number, number, number, number, number];

interface State {
  m: M;
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  font: string;
  shadowBlur: number;
  shadowColor: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalCompositeOperation: string;
  textAlign: string;
  textBaseline: string;
}

const STATE_KEYS = [
  'globalAlpha',
  'fillStyle',
  'strokeStyle',
  'font',
  'shadowBlur',
  'shadowColor',
  'lineWidth',
  'lineCap',
  'lineJoin',
  'globalCompositeOperation',
  'textAlign',
  'textBaseline',
] as const;

const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** 小数2桁に丸める（-0 は 0 にそろえる） */
const r = (v: number) => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};

class Gradient {
  stops: string[] = [];
  constructor(readonly coords: number[]) {}
  addColorStop(o: number, c: string) {
    this.stops.push(`${r(o)}:${c}`);
  }
  toString() {
    return `grad(${this.coords.map(r).join(',')}|${this.stops.join(' ')})`;
  }
}

/** 文字幅は「書記素の数 × font の px」で近似する（実フォントに依存しない） */
const seg = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const fontPx = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
/** 記録用に font を短くする（代替フォントの列は省き、先頭の書体名だけ残す） */
const shortFont = (font: string) => font.replace(/"([^"]+)"(,.*)?$/, '$1');

export interface Recorder {
  ctx: Ctx2D;
  log: string[];
}

/** label は記録の行頭に付ける名前（モーションブラーの作業キャンバスを区別する） */
export function recordingCtx(width: number, height: number, log: string[] = [], label = ''): Recorder {
  const canvas = { width, height, label };
  let s: State = {
    m: [1, 0, 0, 1, 0, 0],
    globalAlpha: 1,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '10px sans-serif',
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalCompositeOperation: 'source-over',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  const stack: State[] = [];
  let path: string[] = [];
  const pre = label ? `[${label}] ` : '';

  const pt = (x: number, y: number) => {
    const m = s.m;
    return `${r(m[0] * x + m[2] * y + m[4])},${r(m[1] * x + m[3] * y + m[5])}`;
  };
  const lin = () => `m[${r(s.m[0])},${r(s.m[1])},${r(s.m[2])},${r(s.m[3])}]`;
  const style = (kind: 'fill' | 'stroke') => {
    const parts = [`a=${r(s.globalAlpha)}`, `${kind}=${String(kind === 'fill' ? s.fillStyle : s.strokeStyle)}`];
    if (kind === 'stroke') parts.push(`lw=${r(s.lineWidth)}`, s.lineCap, s.lineJoin);
    if (s.shadowBlur > 0 && s.shadowColor !== 'transparent') parts.push(`glow=${r(s.shadowBlur)}:${s.shadowColor}`);
    if (s.globalCompositeOperation !== 'source-over') parts.push(`op=${s.globalCompositeOperation}`);
    return parts.join(' ');
  };
  const emit = (line: string) => {
    // 透明で見えない描画は記録しない
    if (s.globalAlpha <= 0) return;
    log.push(pre + line);
  };

  const api = {
    canvas,
    save() {
      stack.push({ ...s, m: [...s.m] as M });
    },
    restore() {
      const prev = stack.pop();
      if (prev) s = prev;
    },
    setTransform(a: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number) {
      if (typeof a === 'object') s.m = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
      else s.m = [a, b!, c!, d!, e!, f!];
    },
    getTransform() {
      const [a, b, c, d, e, f] = s.m;
      return { a, b, c, d, e, f };
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      s.m = mul(s.m, [a, b, c, d, e, f]);
    },
    translate(x: number, y: number) {
      s.m = mul(s.m, [1, 0, 0, 1, x, y]);
    },
    rotate(t: number) {
      const cs = Math.cos(t);
      const sn = Math.sin(t);
      s.m = mul(s.m, [cs, sn, -sn, cs, 0, 0]);
    },
    scale(x: number, y: number) {
      s.m = mul(s.m, [x, 0, 0, y, 0, 0]);
    },
    measureText(text: string) {
      return { width: [...seg.segment(text)].length * fontPx(s.font) };
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      return new Gradient([x0, y0, x1, y1]);
    },
    fillText(text: string, x: number, y: number) {
      emit(`fillText ${JSON.stringify(text)} @${pt(x, y)} ${lin()} font=${shortFont(s.font)} align=${s.textAlign} ${style('fill')}`);
    },
    strokeText(text: string, x: number, y: number) {
      emit(`strokeText ${JSON.stringify(text)} @${pt(x, y)} ${lin()} font=${shortFont(s.font)} ${style('stroke')}`);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      emit(`fillRect ${pt(x, y)} ${pt(x + w, y + h)} ${style('fill')}`);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      emit(`clearRect ${pt(x, y)} ${pt(x + w, y + h)}`);
    },
    drawImage(img: { label?: string }, x: number, y: number) {
      emit(`drawImage ${img.label ?? '?'} @${pt(x, y)} ${style('fill')}`);
    },
    beginPath() {
      path = [];
    },
    closePath() {
      path.push('Z');
    },
    moveTo(x: number, y: number) {
      path.push(`M${pt(x, y)}`);
    },
    lineTo(x: number, y: number) {
      path.push(`L${pt(x, y)}`);
    },
    rect(x: number, y: number, w: number, h: number) {
      path.push(`R${pt(x, y)} ${pt(x + w, y)} ${pt(x + w, y + h)} ${pt(x, y + h)}`);
    },
    arc(x: number, y: number, rad: number, a0: number, a1: number, ccw?: boolean) {
      path.push(`A${pt(x, y)} r=${r(rad * Math.hypot(s.m[0], s.m[1]))} ${r(a0)}..${r(a1)}${ccw ? ' ccw' : ''}`);
    },
    fill() {
      emit(`fill ${path.join(' ')} ${style('fill')}`);
    },
    stroke() {
      emit(`stroke ${path.join(' ')} ${style('stroke')}`);
    },
    clip() {
      emit(`clip ${path.join(' ')}`);
    },
    setLineDash() {},
  };
  for (const k of STATE_KEYS) {
    Object.defineProperty(api, k, {
      get: () => s[k],
      set: (v) => {
        (s as unknown as Record<string, unknown>)[k] = v;
      },
    });
  }
  return { ctx: api as unknown as Ctx2D, log };
}

/**
 * モーションブラーの作業キャンバス（OffscreenCanvas）を記録用の ctx に差し替える。
 * 作業キャンバスへの描画も同じ log に、キャンバスごとの名前付きで記録する
 */
export function installOffscreenCanvas(log: string[]): () => void {
  const g = globalThis as unknown as { OffscreenCanvas?: unknown };
  const original = g.OffscreenCanvas;
  let n = 0;
  g.OffscreenCanvas = class {
    readonly label = `off${n++}`;
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      const rec = recordingCtx(this.width, this.height, log, this.label);
      (rec.ctx as unknown as { canvas: unknown }).canvas = this;
      return rec.ctx;
    }
  };
  return () => {
    g.OffscreenCanvas = original;
  };
}
