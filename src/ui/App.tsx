import { useMemo, useRef, useState } from 'react';
import { analyze } from '../analysis/features';
import { detectScript } from '../analysis/script';
import { shiftCues } from '../analysis/timing';
import { direct } from '../director/director';
import { ASPECTS } from '../director/types';
import { isCompositeSupported, isPngSequenceSupported } from '../export/encoder';
import { LANGUAGES, LANGUAGE_NAMES, isLang, type MessageKey } from '../i18n';
import type { Localized } from '../i18n/errors';
import { useI18n } from '../i18n/react';
import { usableMvDuration, validateExport, validateSubtitles } from '../limits';
import { DEFAULT_FONTS, DEFAULT_FONTS_BY_SCRIPT, type FontChoice, type FontScript } from '../fonts/catalog';
import type { ParseResult } from '../parsers/types';
import { SIZE_CONTRAST_LEVELS } from '../render/charClass';
import { INTERLUDE_GLYPHS } from '../render/interlude';
import { createObjectUrl, revokeAll, revokeObjectUrl } from '../session/session';
import { defaultTheme } from '../themes/default';
import { applyEffectLevel } from '../themes/effectLevel';
import { APP_VERSION_LABEL } from '../version';
import { CueList } from './CueList';
import { DropZone } from './DropZone';
import { ExportPanel } from './ExportPanel';
import { FontSelect } from './FontSelect';
import { IssueList } from './IssueList';
import { Preview, type PreviewHandle } from './Preview';
import { SeedControls, TimingControls } from './PreviewControls';
import { Section } from './Section';
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

/** 画面上部の通知。表示時に翻訳する（言語を切り替えても追従する）。wrap は message を包む定型文 */
interface Notice {
  msg: Localized;
  wrap?: MessageKey;
}

export function App() {
  const { t, tl, lang, setLang } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fonts, setFonts] = useState<FontChoice>(DEFAULT_FONTS);
  /** 利用者が書体を選んだか（選んでいれば、字幕の読み込み時に歌詞の言語に合わせて切り替えない） */
  const [fontsTouched, setFontsTouched] = useState(false);
  /** 読み込んだ歌詞の言語（書体の並び順と自動切替に使う） */
  const [lyricScript, setLyricScript] = useState<FontScript | null>(null);
  /** 歌詞の言語に合わせて書体を自動で切り替えたとき、その言語（案内の表示用） */
  const [autoScript, setAutoScript] = useState<FontScript | null>(null);
  // 読み込む書体（通常行と強調行が同じなら1つ）
  const fontIds = useMemo(() => [...new Set([fonts.body, fonts.display ?? fonts.body])], [fonts]);
  // 書体の一覧で先頭に並べる言語。字幕の読み込み前は UI の言語（英語なら日本語）
  const listScript: FontScript = lyricScript ?? (lang === 'en' ? 'ja' : lang);
  const [seed, setSeed] = useState(randomSeed);
  /** 「1つ前に戻す」用のパターン番号（seed）の履歴 */
  const [seedHistory, setSeedHistory] = useState<number[]>([]);
  /** 字幕全体のタイミング調整（秒）。正で遅く、負で早く表示する */
  const [offsetSec, setOffsetSec] = useState(0);
  const [style, setStyle] = useState<StyleSettings>(DEFAULT_STYLE);
  const [mv, setMv] = useState<Mv | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** プレビューで表示中の字幕（サイドバーの字幕の一覧で強調する） */
  const [activeId, setActiveId] = useState<number | null>(null);
  const previewRef = useRef<PreviewHandle>(null);

  // フォントを読み込む文字。間奏のパーセンテージの数字も、歌詞に含まれなくても同じ書体で出るよう加える
  const text = useMemo(() => (loaded ? `${loaded.result.cues.map((c) => c.text).join('\n')}\n${INTERLUDE_GLYPHS}` : ''), [loaded]);
  // タイミング調整を反映した字幕（演出の生成と書き出しの検証に使う）
  const cues = useMemo(() => (loaded ? shiftCues(loaded.result.cues, offsetSec) : []), [loaded, offsetSec]);
  const sample = loaded?.result.cues.find((c) => c.text.length >= 4)?.text.split('\n')[0] ?? t('font.sample');

  const timeline = useMemo(() => {
    if (!loaded) return null;
    return direct(analyze(cues), {
      theme: applyEffectLevel(defaultTheme, style.effectLevel),
      seed,
      fontIds,
      fontRoles: fonts,
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
      outline: style.outline,
      shadow: style.shadow,
      // 背景の色レイヤーは合成と PNG 連番でだけ有効（MP4 では効かないので渡さない）
      backdrop:
        style.output === 'mp4'
          ? undefined
          : { opacity: style.backdropOpacity, mode: style.backdropMode, color: style.backdropColor },
    });
  }, [loaded, cues, seed, fontIds, fonts, mv?.duration, style]);

  const subtitleIssues = useMemo(() => (loaded ? validateSubtitles(loaded.result.cues) : []), [loaded]);
  const exportIssues = useMemo(() => {
    if (!loaded || !timeline) return [];
    const subtitleEnd = cues.reduce((m, c) => Math.max(m, c.end), 0);
    const issues = validateExport(timeline.duration, subtitleEnd, mv?.duration, style.output, timeline.fps);
    // 合成は MV／曲が必要（MV を外した・上限超えの場合）
    if (style.output === 'composite' && (!mv || usableMvDuration(mv.duration) === undefined)) {
      issues.unshift({ level: 'error', key: 'composite.needMedia' });
    }
    return issues;
  }, [loaded, cues, timeline, mv?.duration, style.output]);

  /** パターンを変える。今のパターン番号は「1つ前に戻す」用に履歴へ積む */
  function changeSeed(next: number) {
    if (next === seed) return;
    setSeedHistory((h) => [...h, seed].slice(-100));
    setSeed(next);
  }
  function undoSeed() {
    if (seedHistory.length === 0) return;
    setSeed(seedHistory[seedHistory.length - 1]);
    setSeedHistory(seedHistory.slice(0, -1));
  }

  function wipe(message: Notice) {
    revokeAll();
    setLoaded(null);
    setMv(null);
    setFonts(DEFAULT_FONTS);
    setFontsTouched(false);
    setLyricScript(null);
    setAutoScript(null);
    setSeed(randomSeed());
    setSeedHistory([]);
    setOffsetSec(0);
    setStyle(DEFAULT_STYLE);
    setResetKey((k) => k + 1); // ファイル入力等を再マウントして選択状態も消す
    setNotice(message);
  }

  function onSubtitleLoaded(fileName: string, result: ParseResult) {
    setNotice(null);
    setLoaded({ fileName, result });
    const script = detectScript(result.cues.map((c) => c.text).join('\n'), lang);
    setLyricScript(script);
    // 書体を選んでいなければ、歌詞の言語の既定の書体にする
    if (!fontsTouched) {
      setFonts(DEFAULT_FONTS_BY_SCRIPT[script]);
      setAutoScript(script === 'ja' ? null : script);
    }
  }

  function changeFont(next: Partial<FontChoice>) {
    setFonts((f) => ({ ...f, ...next }));
    setFontsTouched(true);
    setAutoScript(null);
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
      setNotice({ msg: { key: 'mv.loadFailed' } });
    };
    probe.src = url;
  }

  const baseName = loaded?.fileName.replace(/\.[^.]+$/, '') || 'lyrics';

  return (
    <div className="app layout" key={resetKey}>
      <aside className="sidebar">
        <header>
          <h1>motiontext</h1>
          <select
            className="lang-select"
            aria-label={t('app.language')}
            value={lang}
            onChange={(e) => {
              if (isLang(e.target.value)) setLang(e.target.value);
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
          <span className="tag">{t('app.tagline')}</span>
        </header>

        {notice && (
          <p className="notice" onClick={() => setNotice(null)}>
            {notice.wrap ? t(notice.wrap, { message: tl(notice.msg) }) : tl(notice.msg)}
          </p>
        )}

        <Section title={t('sec.subtitle')}>
          {loaded ? (
            <div className="loaded">
              <span>
                {t('subtitle.loaded', { name: loaded.fileName, format: loaded.result.format.toUpperCase(), count: loaded.result.cues.length })}
              </span>
              <IssueList issues={subtitleIssues} />
              {loaded.result.warnings.length > 0 && (
                <details>
                  <summary>{t('subtitle.warnings', { count: loaded.result.warnings.length })}</summary>
                  <ul>
                    {loaded.result.warnings.slice(0, 50).map((w, i) => (
                      <li key={i}>{tl(w)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <DropZone onLoaded={onSubtitleLoaded} />
          )}
          <div className="controls">
            <label className="file-btn">
              {t('mv.load')}
              <input type="file" accept="video/*,audio/*" hidden onChange={(e) => loadMv(e.target.files?.[0])} />
            </label>
            {mv && <span className="hint">{t('mv.loaded', { name: mv.name, sec: mv.duration.toFixed(1) })}</span>}
          </div>
          {loaded && (
            <div className="controls">
              <TimingControls offsetSec={offsetSec} onChange={setOffsetSec} />
            </div>
          )}
        </Section>

        <Section title={t('sec.fonts')}>
          <p className="hint">{t('font.hint')}</p>
          <FontSelect
            role="body"
            label={t('font.body')}
            value={fonts.body}
            onChange={(id) => id && changeFont({ body: id })}
            sample={sample}
            script={listScript}
          />
          {/* 強調は任意（指定しないと、強調行も通常行と同じ書体・太さで描く） */}
          <FontSelect
            role="display"
            optional
            label={t('font.display')}
            value={fonts.display}
            onChange={(id) => changeFont({ display: id })}
            sample={sample}
            script={listScript}
          />
          {autoScript && <p className="hint">{t('font.autoSelected', { lang: LANGUAGE_NAMES[autoScript] })}</p>}
        </Section>

        {timeline && (
          <>
            <Section title={t('sec.style')}>
              <div className="controls">
                <SeedControls
                  seed={seed}
                  canUndo={seedHistory.length > 0}
                  onRegenerate={() => changeSeed(randomSeed())}
                  onUndo={undoSeed}
                  onSeedInput={changeSeed}
                />
              </div>
              <StylePanel
                value={style}
                onChange={setStyle}
                pngSupported={isPngSequenceSupported()}
                compositeSupported={isCompositeSupported()}
                hasMedia={!!mv && usableMvDuration(mv.duration) !== undefined}
              />
            </Section>

            <Section title={t('sec.cueList')} defaultOpen={false}>
              <CueList items={timeline.items} activeId={activeId} onSeek={(sec) => previewRef.current?.seek(sec)} lang={lang} />
            </Section>

            <Section title={t('sec.export')}>
              <ExportPanel
                timeline={timeline}
                fontIds={fontIds}
                text={text}
                baseName={baseName}
                format={style.output}
                media={mv ? { file: mv.file, duration: mv.duration } : null}
                issues={exportIssues}
                onExported={(autoWipe, message) => {
                  if (autoWipe) wipe({ msg: message, wrap: 'export.done.wiped' });
                  else setNotice({ msg: message, wrap: 'export.done.keep' });
                }}
              />
            </Section>
          </>
        )}

        <div className="sidebar-end">
          {loaded && (
            <button className="danger" onClick={() => wipe({ msg: { key: 'app.wiped' } })}>
              {t('app.wipe')}
            </button>
          )}
          <footer>
            <p>{APP_VERSION_LABEL}</p>
            <p>{t('footer.privacy')}</p>
            <p>
              {t('footer.licenses')}{' '}
              <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noopener noreferrer">
                {t('footer.licenseLink')}
              </a>
            </p>
          </footer>
        </div>
      </aside>

      <main className="main" aria-label={t('sec.preview')}>
        {timeline ? (
          <Preview
            ref={previewRef}
            timeline={timeline}
            fontIds={fontIds}
            text={text}
            mvUrl={mv?.url ?? null}
            alphaPreview={style.output === 'png'}
            compositePreview={style.output === 'composite'}
            onActiveChange={setActiveId}
          />
        ) : (
          <p className="main-empty">{t('preview.empty')}</p>
        )}
      </main>
    </div>
  );
}
