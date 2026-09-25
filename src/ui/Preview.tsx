import { useEffect, useRef, useState } from 'react';
import type { Timeline } from '../director/types';
import { ensureGlyphs } from '../fonts/loader';
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

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export function Preview({ timeline, fontIds, text, mvUrl, alphaPreview = false, compositePreview = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const layoutsRef = useRef<Layouts | null>(null);
  const clockRef = useRef({ playing: false, base: 0, startedAt: 0 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overlay, setOverlay] = useState(true);

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
      if (ctx && layouts) renderFrame(ctx, timeline, layouts, t, { transparent });
      setTime(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, transparent, showMv]);

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
  function seek(t: number) {
    const c = clockRef.current;
    c.base = t;
    c.startedAt = performance.now();
    if (videoRef.current) videoRef.current.currentTime = t;
  }

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
        {loading && <div className="stage-msg">フォントを読み込み中…</div>}
      </div>
      <div className="transport">
        <button onClick={() => (playing ? pause() : play())}>{playing ? '一時停止' : '再生'}</button>
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
            MVに重ねて表示
          </label>
        )}
      </div>
    </div>
  );
}
