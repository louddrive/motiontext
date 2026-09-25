import { useMemo, useState } from 'react';
import { analyze } from '../analysis/features';
import { direct } from '../director/director';
import { ASPECTS } from '../director/types';
import { isCompositeSupported, isPngSequenceSupported } from '../export/encoder';
import { usableMvDuration, validateExport, validateSubtitles } from '../limits';
import { DEFAULT_FONT_IDS } from '../fonts/catalog';
import type { ParseResult } from '../parsers/types';
import { SIZE_CONTRAST_LEVELS } from '../render/charClass';
import { createObjectUrl, revokeAll, revokeObjectUrl } from '../session/session';
import { defaultTheme } from '../themes/default';
import { applyEffectLevel } from '../themes/effectLevel';
import { DropZone } from './DropZone';
import { ExportPanel } from './ExportPanel';
import { FontPicker } from './FontPicker';
import { IssueList } from './IssueList';
import { Preview } from './Preview';
import { DEFAULT_STYLE, StylePanel, type StyleSettings } from './StylePanel';

interface Loaded {
  fileName: string;
  result: ParseResult;
}

interface Mv {
  /** 合成書き出しで中身を読むため File を保持する（破棄時に参照を消す） */
  file: File;
  url: string;
  name: string;
  duration: number;
}

const randomSeed = () => Math.floor(Math.random() * 1e9);

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fontIds, setFontIds] = useState<string[]>(DEFAULT_FONT_IDS);
  const [seed, setSeed] = useState(randomSeed);
  const [style, setStyle] = useState<StyleSettings>(DEFAULT_STYLE);
  const [mv, setMv] = useState<Mv | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const text = useMemo(() => loaded?.result.cues.map((c) => c.text).join('\n') ?? '', [loaded]);
  const sample = loaded?.result.cues.find((c) => c.text.length >= 4)?.text.split('\n')[0] ?? '歌詞のサンプル Lyrics';

  const timeline = useMemo(() => {
    if (!loaded) return null;
    return direct(analyze(loaded.result.cues), {
      theme: applyEffectLevel(defaultTheme, style.effectLevel),
      seed,
      fontIds,
      // PNG 連番は透過で書き出すので、配色ルールは黒背景相当（グロー有効・緑系も可）にする
      background: style.output === 'png' ? 'black' : style.background,
      width: ASPECTS[style.aspect].width,
      height: ASPECTS[style.aspect].height,
      // 上限を超える MV の長さは書き出し長に使わない
      minDuration: usableMvDuration(mv?.duration),
      kanaRatio: SIZE_CONTRAST_LEVELS[style.sizeContrast].kanaRatio,
      strokeEmphasis: style.strokeEmphasis,
      color: style.colorMode === 'single' ? style.color : undefined,
      sizeLevel: style.sizeLevel,
      verticalMode: style.verticalMode,
    });
  }, [loaded, seed, fontIds, mv?.duration, style]);

  const subtitleIssues = useMemo(() => (loaded ? validateSubtitles(loaded.result.cues) : []), [loaded]);
  const exportIssues = useMemo(() => {
    if (!loaded || !timeline) return [];
    const subtitleEnd = loaded.result.cues.reduce((m, c) => Math.max(m, c.end), 0);
    const issues = validateExport(timeline.duration, subtitleEnd, mv?.duration, style.output, timeline.fps);
    // 合成は MV／曲が必要（MV を外した・上限超えの場合）
    if (style.output === 'composite' && (!mv || usableMvDuration(mv.duration) === undefined)) {
      issues.unshift({ level: 'error', message: '合成書き出しには、15分以内の MV／曲の読み込みが必要です。' });
    }
    return issues;
  }, [loaded, timeline, mv?.duration, style.output]);

  function wipe(message: string) {
    revokeAll();
    setLoaded(null);
    setMv(null);
    setFontIds(DEFAULT_FONT_IDS);
    setSeed(randomSeed());
    setStyle(DEFAULT_STYLE);
    setResetKey((k) => k + 1); // ファイル入力等を再マウントして選択状態も消す
    setNotice(message);
  }

  function loadMv(file: File | undefined) {
    if (!file) return;
    revokeObjectUrl(mv?.url);
    const url = createObjectUrl(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      setMv({ file, url, name: file.name, duration: Number.isFinite(probe.duration) ? probe.duration : 0 });
      probe.removeAttribute('src');
    };
    probe.onerror = () => {
      revokeObjectUrl(url);
      setNotice('MV / 音声ファイルを読み込めませんでした');
    };
    probe.src = url;
  }

  const baseName = loaded?.fileName.replace(/\.[^.]+$/, '') || 'lyrics';

  return (
    <div className="app" key={resetKey}>
      <header>
        <h1>motiontext</h1>
        <span className="tag">字幕 → リリックモーション自動生成</span>
        {loaded && (
          <button className="danger" onClick={() => wipe('データを破棄しました。')}>
            データを破棄
          </button>
        )}
      </header>

      {notice && (
        <p className="notice" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}

      <section>
        <h2>1. 字幕ファイル</h2>
        {loaded ? (
          <div className="loaded">
            <span>
              {loaded.fileName}（{loaded.result.format.toUpperCase()} / {loaded.result.cues.length} 件）
            </span>
            <IssueList issues={subtitleIssues} />
            {loaded.result.warnings.length > 0 && (
              <details>
                <summary>警告 {loaded.result.warnings.length} 件</summary>
                <ul>
                  {loaded.result.warnings.slice(0, 50).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <DropZone
            onLoaded={(fileName, result) => {
              setNotice(null);
              setLoaded({ fileName, result });
            }}
          />
        )}
      </section>

      <section>
        <h2>2. フォント</h2>
        <FontPicker selected={fontIds} onChange={setFontIds} sample={sample} />
      </section>

      {timeline && (
        <>
          <section>
            <h2>3. スタイル</h2>
            <StylePanel
              value={style}
              onChange={setStyle}
              pngSupported={isPngSequenceSupported()}
              compositeSupported={isCompositeSupported()}
              hasMedia={!!mv && usableMvDuration(mv.duration) !== undefined}
            />
          </section>

          <section>
            <h2>4. プレビュー</h2>
            <div className="controls">
              <button onClick={() => setSeed(randomSeed())}>演出を再生成</button>
              <label className="file-btn">
                MV / 音声を読み込む（任意・確認用）
                <input type="file" accept="video/*,audio/*" hidden onChange={(e) => loadMv(e.target.files?.[0])} />
              </label>
              {mv && (
                <span className="hint">
                  {mv.name}（{mv.duration.toFixed(1)} 秒・書き出し長に反映）
                </span>
              )}
            </div>
            <Preview
              timeline={timeline}
              fontIds={fontIds}
              text={text}
              mvUrl={mv?.url ?? null}
              alphaPreview={style.output === 'png'}
              compositePreview={style.output === 'composite'}
            />
          </section>

          <section>
            <h2>5. 書き出し</h2>
            <ExportPanel
              timeline={timeline}
              fontIds={fontIds}
              text={text}
              baseName={baseName}
              format={style.output}
              media={mv ? { file: mv.file, duration: mv.duration } : null}
              issues={exportIssues}
              onExported={(autoWipe, message) => {
                if (autoWipe) wipe(`${message} アプリ内のデータを破棄しました。`);
                else setNotice(message);
              }}
            />
          </section>
        </>
      )}

      <footer>
        <p>
          プライバシー: 字幕・MV はすべてこのブラウザ内で処理され、サーバーへは送信されません。ブラウザのストレージにも保存しません。
          ただし、ダウンロードしたファイルとブラウザのダウンロード履歴はアプリから削除できないため、必要に応じてご自身で管理してください。
        </p>
        <p>
          同梱フォントはすべて SIL Open Font License 1.1 です。漢字の画数データは Unicode Unihan Database（Unicode License v3,
          © Unicode, Inc.）を使用しています。
          <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noopener noreferrer">
            ライセンス一覧
          </a>
        </p>
      </footer>
    </div>
  );
}
