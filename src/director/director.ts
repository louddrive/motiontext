import type { CueFeature } from '../analysis/features';
import { findStrokeEmphasis } from '../analysis/strokes';
import { canTategaki } from '../analysis/tategaki';
import { getFont } from '../fonts/catalog';
import { LocalizedError } from '../i18n/errors';
import type { CameraMove } from '../render/camera';
import { isKeyUnsafe } from '../themes/color';
import type { BackgroundMode, Theme } from '../themes/types';
import { hashString, pick, pickWeighted, rngFor } from './rng';
import { FIT_MAX_FONT_SIZE, SIZE_LEVELS, type Anchor, type Deco, type Side, type SizeLevel, type Timeline, type TimelineItem, type VerticalMode } from './types';

export interface DirectOptions {
  theme: Theme;
  seed: number;
  fontIds: string[];
  background: BackgroundMode;
  width?: number;
  height?: number;
  fps?: number;
  /** MV の長さ等。字幕末尾より短い場合は字幕末尾が優先される */
  minDuration?: number;
  /** 漢字とかなのサイズ差（テーマの値を上書き） */
  kanaRatio?: number;
  /** 画数の多い漢字語の強調（テーマの値を上書き） */
  strokeEmphasis?: boolean;
  /** 単色指定（#RRGGBB）。指定時はテーマ配色を使わない */
  color?: string;
  /** 基本の文字サイズ */
  sizeLevel?: SizeLevel;
  /** 縦書きの使い方（既定: auto） */
  verticalMode?: VerticalMode;
}

export interface FontRoles {
  body: string[];
  display: string[];
}

/** 選択フォントを通常行用／強調行用に振り分ける。片方の役割が空ならもう片方で補う */
export function assignFontRoles(fontIds: string[]): FontRoles {
  if (fontIds.length === 0) throw new LocalizedError('err.fontRequired');
  const body = fontIds.filter((id) => getFont(id).role === 'body');
  const display = fontIds.filter((id) => getFont(id).role === 'display');
  return {
    body: body.length ? body : display,
    display: display.length ? display : body,
  };
}

function usablePalette(colors: string[], bg: BackgroundMode): string[] {
  if (bg !== 'green') return colors;
  const safe = colors.filter((c) => !isKeyUnsafe(c));
  return safe.length ? safe : ['#FFFFFF'];
}

/** 表示時間がこれより短い字幕にはカメラワークを付けない（動きがせわしなくなるため） */
export const CAMERA_MIN_DURATION = 1.2;

/**
 * 字幕ごとのカメラワーク。既存の演出選択に影響しないよう、独立した乱数列を使う。
 * 確率・強さはテーマの energy に連動し、サビは強め、画面いっぱいモードははみ出し防止で控えめ。
 */
export function chooseCamera(f: CueFeature, theme: Theme, seed: number, fit: boolean): CameraMove | null {
  if (f.duration < CAMERA_MIN_DURATION) return null;
  const cr = rngFor(seed, 'camera', f.cue.index);
  const base = theme.camera.probability * (0.5 + theme.energy);
  const probability = Math.min(1, f.isChorus ? base * 1.3 : base);
  if (cr() >= probability) return null;
  const intensity =
    theme.camera.intensity * (0.6 + 0.4 * theme.energy) * (f.isChorus ? 1.2 : 1) * (fit ? 0.5 : 1);
  return {
    type: pickWeighted(cr, theme.camera.moves),
    // 左右の向きを交互にして、字幕が変わるたびに流れが生まれるようにする
    dir: f.cue.index % 2 === 0 ? 1 : -1,
    intensity: Math.min(1.2, intensity),
  };
}

/** auto で縦書きを連続させる最大行数（横書きと必ず混在させる） */
export const MAX_VERTICAL_RUN = 2;

/**
 * 縦書きにするか。auto では行ごとに verticalRate（演出レベルに連動）の確率で縦書きにし、
 * MAX_VERTICAL_RUN 行を超えて続けない。対象は日本語の行のみ。
 */
export function chooseVertical(
  f: CueFeature,
  theme: Theme,
  seed: number,
  mode: VerticalMode,
  verticalRun: number,
): boolean {
  if (mode === 'off' || !canTategaki(f.cue.text.split('\n'))) return false;
  if (mode === 'always') return true;
  if (verticalRun >= MAX_VERTICAL_RUN) return false;
  return rngFor(seed, 'vertical', f.cue.index)() < theme.verticalRate;
}

/**
 * 縦書き行の横位置。縦書きが続くときは前と反対側へ振って左右のリズムを作る。
 * 表示が前の字幕と重なる場合は中央を避ける。画面いっぱいモードは中央固定。
 */
export function chooseSide(f: CueFeature, seed: number, fit: boolean, prevSide: Side | null): Side {
  if (fit) return 'center';
  const r = rngFor(seed, 'side', f.cue.index);
  if (prevSide === 'left' || prevSide === 'right') {
    if (r() < 0.7) return prevSide === 'left' ? 'right' : 'left';
  }
  const side = pick(r, ['center', 'left', 'right'] as const);
  if (side === 'center' && f.overlapsPrev) return r() < 0.5 ? 'left' : 'right';
  return side;
}

export function direct(features: CueFeature[], opts: DirectOptions): Timeline {
  const { theme, seed, background } = opts;
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const fps = opts.fps ?? 30;
  const roles = assignFontRoles(opts.fontIds);
  const textColors = usablePalette(theme.palette.text, background);
  const accentColors = usablePalette(theme.palette.accent, background);
  const singleFont = opts.fontIds.length === 1;
  const size = SIZE_LEVELS[opts.sizeLevel ?? 'medium'];
  const strokeEmphasis = opts.strokeEmphasis ?? theme.strokeEmphasis;

  const items: TimelineItem[] = [];
  let prevAnchor: Anchor = 'center';
  let prevAnim = '';
  // 直前まで縦書きが何行続いているか / 直前の縦書き行の配置
  let verticalRun = 0;
  let prevSide: Side | null = null;

  for (const f of features) {
    const r = rngFor(seed, 'cue', f.cue.index, hashString(f.cue.text));
    // フォントと配色はセクション単位で固定し、統一感を保つ
    const sr = rngFor(seed, 'section', f.section);
    const bodyFont = pick(sr, roles.body);
    const displayFont = pick(sr, roles.display);
    const sectionText = pick(sr, textColors);
    const sectionAccent = pick(sr, accentColors);

    const emphasis = f.isChorus;
    const fontId = emphasis ? displayFont : bodyFont;
    const weights = getFont(fontId).weights;
    // 1書体だけの場合はウェイト差で強弱を付ける
    const weight = emphasis || (singleFont && f.isSectionStart) ? weights[weights.length - 1] : weights[0];

    const table = emphasis
      ? theme.animations.chorus
      : f.tempo === 'fast'
        ? theme.animations.fast
        : f.tempo === 'slow'
          ? theme.animations.slow
          : theme.animations.normal;
    let animation = pickWeighted(r, table);
    // 同じ演出の連続を1回だけ引き直して避ける
    if (animation === prevAnim) animation = pickWeighted(r, table);
    // 表示時間が極端に短い字幕は文字送り系を避ける
    if (f.duration < 0.8 && (animation === 'typewriter' || animation === 'phraseStack')) animation = 'fadeUp';

    let anchor: Anchor = f.charCount > 22 ? 'lower' : 'center';
    // 前の字幕と表示が重なる場合は位置をずらす（画面いっぱいモードは常に中央）
    if (f.overlapsPrev && anchor === prevAnchor) anchor = prevAnchor === 'center' ? 'upper' : 'center';
    if (size.fit) anchor = 'center';

    let deco: Deco = 'none';
    if (f.isSectionStart && f.cue.index > 0 && r() < theme.energy) deco = 'ring';
    // サビの斜めライン。乱数の消費順は従来どおりにして、他の演出の選ばれ方を変えない
    else if (emphasis && r() < theme.energy * 0.6) {
      r();
      deco = 'lines';
    }

    const align = animation === 'phraseStack' && !emphasis && r() < 0.4 ? 'left' : 'center';
    const camera = chooseCamera(f, theme, seed, size.fit);
    const vertical = chooseVertical(f, theme, seed, opts.verticalMode ?? 'auto', verticalRun);
    const side: Side = vertical ? chooseSide(f, seed, size.fit, prevSide) : 'center';
    verticalRun = vertical ? verticalRun + 1 : 0;
    prevSide = vertical ? side : null;

    items.push({
      id: f.cue.index,
      start: f.cue.start,
      end: f.cue.end,
      lines: f.lines,
      animation,
      fontId,
      weight,
      fontSize: size.fit
        ? FIT_MAX_FONT_SIZE
        : Math.round(theme.baseFontSize * size.scale * (emphasis ? theme.chorusScale : 1)),
      fit: size.fit,
      camera,
      vertical,
      side,
      kanaRatio: opts.kanaRatio ?? theme.kanaRatio,
      emphasisRanges: f.lines.map((phrases) => (strokeEmphasis ? findStrokeEmphasis(phrases.join('')) : null)),
      emphasisScale: theme.emphasisScale,
      // 単色指定があっても乱数の消費順は変えない（色だけ変えて演出が変わらないように）
      color: opts.color ?? (emphasis ? sectionAccent : sectionText),
      anchor,
      align,
      emphasis,
      deco,
      seed: hashString(`${seed}:${f.cue.index}`),
      energy: theme.energy,
    });
    prevAnchor = anchor;
    prevAnim = animation;
  }

  const lastEnd = features.length ? features[features.length - 1].cue.end : 0;
  const maxEnd = features.reduce((m, f) => Math.max(m, f.cue.end), lastEnd);
  return {
    width,
    height,
    fps,
    duration: Math.max(maxEnd + 0.5, opts.minDuration ?? 0),
    background,
    glow: background === 'black' ? theme.glow : 0,
    items,
  };
}
