import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Timeline, TimelineItem } from '../director/types';
import { ensureGlyphs } from '../fonts/loader';
import { useI18n } from '../i18n/react';
import { buildLayouts, renderFrame, type Layouts } from '../render/renderer';

interface Props {
  timeline: Timeline;
  fontIds: string[];
  text: string;
  /** 任意で読み込んだ MV / 音声の Blob URL */
  mvUrl: string | null;
  /** PNG 連番（透過）書き出し用に、背景を塗らずに市松模様の上で確認する */
  alphaPreview?: boolean;
  /** 合成書き出し用: MV を画面いっぱい（cover）に表示し、歌詞を透過で重ねる（出力と同じ見え方） */
  compositePreview?: boolean;
}

/** キー操作を横取りしない要素（文字入力・選択肢・ボタン等。スペースでの押下と二重にならないように） */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return el.type !== 'range';
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement || el.isContentEditable;
}

/** 表示中の字幕（重なっている場合は後から始まったもの） */
function activeItemId(items: TimelineItem[], t: number): number | null {
  let id: number | null = null;
  for (const it of items) if (t >= it.start && t < it.end) id = it.id;
  return id;
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export function Preview({ timeline, fontIds, text, mvUrl, alphaPreview = false, compositePreview = false }: Props) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const layoutsRef = useRef<Layouts | null>(null);
  const clockRef = useRef({ playing: false, base: 0, startedAt: 0 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);

  const showMv = !!mvUrl && overlay;
  // 黒背景は CSS のスクリーン合成で CapCut の「スクリーン」と同じ見え方にする。グリーンは透過描画で近似
  const transparent = alphaPreview || (showMv && (compositePreview || timeline.background === 'green'));

  // フォントロード → レイアウト計算（タイムラインやフォントが変わるたびに）
  useEffect(() => {
    let alive = true;
    setLoading(true);
    layoutsRef.current = null;
    ensureGlyphs(document.fonts, fontIds, text).then(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!alive || !ctx) return;
      layoutsRef.current = buildLayouts(ctx, timeline);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [timeline, fontIds, text]);

  const now = () => {
    const v = videoRef.current;
    if (showMv && v) return v.currentTime;
    const c = clockRef.current;
    return c.playing ? c.base + (performance.now() - c.startedAt) / 1000 : c.base;
  };

  // 描画ループ
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const ctx = canvasRef.current?.getContext('2d');
      const layouts = layoutsRef.current;
      let t = now();
      if (t >= timeline.duration) {
        pause();
        t = timeline.duration;
      }
      // 合成・PNG 連番のプレビューでは、書き出しと同じく背景の色レイヤーも描く
      if (ctx && layouts) renderFrame(ctx, timeline, layouts, t, { transparent, backdrop: alphaPreview || compositePreview });
      setTime(t);
      // 字幕の一覧の強調表示は、表示中の字幕が変わったときだけ更新する
      const id = activeItemId(timeline.items, t);
      if (id !== activeRef.current) {
        activeRef.current = id;
        setActiveId(id);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, transparent, showMv, alphaPreview, compositePreview]);

  function play() {
    const c = clockRef.current;
    if (c.base >= timeline.duration) c.base = 0;
    c.playing = true;
    c.startedAt = performance.now();
    if (showMv && videoRef.current) void videoRef.current.play();
    setPlaying(true);
  }
  function pause() {
    const c = clockRef.current;
    c.base = now();
    c.playing = false;
    videoRef.current?.pause();
    setPlaying(false);
  }
  function seek(target: number) {
    const t = Math.min(timeline.duration, Math.max(0, target));
    const c = clockRef.current;
    c.base = t;
    c.startedAt = performance.now();
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  // キーボード操作: スペース=再生／停止、←→=1秒、Shift+←→=0.1秒（最新の関数を参照するため ref 経由）
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (playing) pause();
      else play();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.shiftKey ? 0.1 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      seek(now() + step);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="preview">
      <div className={`stage ${timeline.height > timeline.width ? 'portrait' : ''} ${alphaPreview && !showMv ? 'alpha' : ''}`}>
        {mvUrl && (
          <video
            ref={videoRef}
            src={mvUrl}
            className="mv"
            style={{ visibility: showMv ? 'visible' : 'hidden', objectFit: compositePreview ? 'cover' : 'contain' }}
            playsInline
            onEnded={pause}
          />
        )}
        <canvas
          ref={canvasRef}
          width={timeline.width}
          height={timeline.height}
          style={{ mixBlendMode: showMv && !transparent ? 'screen' : 'normal' }}
        />
        {loading && <div className="stage-msg">{t('preview.loadingFonts')}</div>}
      </div>
      <div className="transport">
        <button onClick={() => (playing ? pause() : play())}>{playing ? t('preview.pause') : t('preview.play')}</button>
        <input
          type="range"
          min={0}
          max={timeline.duration}
          step={1 / timeline.fps}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="time">
          {fmt(time)} / {fmt(timeline.duration)}
        </span>
        {mvUrl && (
          <label className="inline">
            <input
              type="checkbox"
              checked={overlay}
              onChange={(e) => {
                pause();
                setOverlay(e.target.checked);
              }}
            />
            {t('preview.overlay')}
          </label>
        )}
      </div>
      <p className="hint keys">{t('preview.keys')}</p>
      <CueList items={timeline.items} activeId={activeId} onSeek={seek} lang={lang} />
    </div>
  );
}

interface CueListProps {
  items: TimelineItem[];
  /** 言語の切り替えで再描画するため（memo の比較に使う） */
  lang: string;
  activeId: number | null;
  onSeek: (t: number) => void;
}

/** 字幕の一覧。クリックでその字幕の開始時刻へ移動する（再生中の字幕を強調） */
const CueList = memo(function CueList({ items, activeId, onSeek }: CueListProps) {
  const { t } = useI18n();
  const rows = useMemo(
    () => items.map((it) => ({ id: it.id, start: it.start, text: it.lines.map((phrases) => phrases.join('')).join(' / ') })),
    [items],
  );
  // onSeek は毎回新しい関数になるので ref で最新を使い、一覧の再描画を activeId の変化だけに抑える
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;
  return (
    <details className="cue-list">
      <summary>{t('preview.cueList', { count: rows.length })}</summary>
      <ol>
        {rows.map((r) => (
          <li key={r.id} className={r.id === activeId ? 'active' : ''}>
            <button type="button" onClick={() => seekRef.current(r.start)}>
              <span className="cue-time">{fmt(r.start)}</span>
              <span className="cue-text">{r.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  );
}, (a, b) => a.items === b.items && a.activeId === b.activeId && a.lang === b.lang);
