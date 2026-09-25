import { useRef, useState } from 'react';
import type { Timeline } from '../director/types';
import {
  DEFAULT_BITRATE,
  PartialOutputError,
  isExportSupported,
  pickOutputDirectory,
  pickOutputFile,
  startCompositeExport,
  startExport,
  startPngSequenceExport,
  type ExportJob,
} from '../export/encoder';
import { compositeFileName, estimateComposite } from '../export/compositeParams';
import type { ExportFormat } from '../export/protocol';
import { activeSeconds, estimatePngSequence, estimateSizeMB, formatTime, type Issue } from '../limits';
import { LocalizedError, type Localized } from '../i18n/errors';
import { useI18n } from '../i18n/react';
import { downloadBlob } from '../session/session';
import { IssueList } from './IssueList';

interface Props {
  timeline: Timeline;
  fontIds: string[];
  text: string;
  baseName: string;
  format: ExportFormat;
  issues: Issue[];
  /** 合成書き出しに使う MV／曲 */
  media: { file: File; duration: number } | null;
  onExported: (autoWipe: boolean, message: Localized) => void;
}

/** MP4 書き出し速度の目安（フレーム/秒）。開発機の実測（約130fps）より控えめに見積もる */
const ESTIMATED_FPS = 90;

function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.max(1, Math.round(mb))}MB`;
}

export function ExportPanel({ timeline, fontIds, text, baseName, format, issues, media, onExported }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const { t, te } = useI18n();
  // エラーは表示時に翻訳する（言語を切り替えたときも追従する）
  const [error, setError] = useState<unknown>(null);
  // 初期値はオフ（続けて別の形式でも書き出せるように）。オンにすると書き出し後にアプリ内のデータを破棄する
  const [autoWipe, setAutoWipe] = useState(false);
  /** 途中で止まった出力（PNG 連番のフォルダ／合成 MP4 のファイル）。削除するか利用者に確認する */
  const [partial, setPartial] = useState<PartialOutputError | null>(null);
  const jobRef = useRef<ExportJob<unknown> | null>(null);
  const startedAtRef = useRef(0);
  const supported = isExportSupported();
  const blocked = issues.some((i) => i.level === 'error');
  const png = format === 'png';
  const composite = format === 'composite';

  // 経過時間と進捗から残り時間を推定（序盤は不安定なので 3% 以降に表示）
  let remaining: string | null = null;
  if (progress !== null && progress >= 0.03 && progress < 1) {
    const elapsed = (performance.now() - startedAtRef.current) / 1000;
    remaining = formatTime((elapsed * (1 - progress)) / progress);
  }

  async function runMp4() {
    const job = startExport(timeline, fontIds, text, setProgress);
    jobRef.current = job;
    const blob = await job.promise;
    downloadBlob(blob, `${baseName}_${timeline.background}_${timeline.width}x${timeline.height}_${timeline.fps}fps.mp4`);
  }

  async function runPng(): Promise<Localized> {
    // 保存先はクリック直後に選ばせる（ブラウザの制約）
    const parent = await pickOutputDirectory();
    setProgress(0);
    startedAtRef.current = performance.now();
    const job = startPngSequenceExport(parent, baseName, timeline, fontIds, text, setProgress);
    jobRef.current = job;
    const result = await job.promise;
    return {
      key: 'export.done.png',
      params: { name: result.folderName, frames: result.frames.toLocaleString('en-US'), size: formatMB(result.bytes / 1024 / 1024) },
    };
  }

  async function runComposite(): Promise<Localized> {
    if (!media) throw new LocalizedError('export.noMedia');
    // 保存先はクリック直後に選ばせる（ブラウザの制約）
    const handle = await pickOutputFile(compositeFileName(baseName, timeline.width, timeline.height), t('picker.mp4'));
    setProgress(0);
    startedAtRef.current = performance.now();
    const job = startCompositeExport(handle, media.file, timeline, fontIds, text, setProgress);
    jobRef.current = job;
    const r = await job.promise;
    const audio = t(r.audio === 'copy' ? 'audio.copy' : r.audio === 'aac' ? 'audio.aac' : 'audio.none');
    return { key: 'export.done.composite', params: { name: handle.name, len: formatTime(r.duration), fps: r.fps, audio } };
  }

  async function run() {
    setError(null);
    setPartial(null);
    if (!png && !composite) {
      setProgress(0);
      startedAtRef.current = performance.now();
    }
    try {
      if (png) onExported(autoWipe, await runPng());
      else if (composite) onExported(autoWipe, await runComposite());
      else {
        await runMp4();
        onExported(autoWipe, { key: 'export.done' });
      }
    } catch (e) {
      if (e instanceof PartialOutputError) {
        // 途中まで書いたフォルダが残っている。削除するかは利用者に確認する
        setPartial(e);
        if (!e.aborted) setError(e.reason);
      } else if (!(e instanceof DOMException && e.name === 'AbortError')) {
        // AbortError: 書き出しのキャンセル、またはフォルダ選択のキャンセル
        setError(e);
      }
    } finally {
      jobRef.current = null;
      setProgress(null);
    }
  }

  async function deletePartial() {
    if (!partial) return;
    try {
      await partial.remove();
      setPartial(null);
    } catch (e) {
      setError(new LocalizedError('export.deleteFailed', { error: te(e) }));
    }
  }

  if (!supported) {
    return <p className="error">{t('export.unsupported')}</p>;
  }

  const portrait = timeline.height > timeline.width;
  const pngEst = estimatePngSequence(timeline.duration, activeSeconds(timeline.items), timeline.fps, timeline.width * timeline.height);
  const mp4Size = estimateSizeMB(timeline.duration, DEFAULT_BITRATE);
  const mp4Sec = (timeline.duration * timeline.fps) / ESTIMATED_FPS;
  // 合成の fps は MV を解析するまで分からないので 30fps で見積もる（60fps の MV は約2倍）
  const compEst = estimateComposite(media?.duration ?? timeline.duration, timeline.width, timeline.height, 30);

  return (
    <div className="export">
      {composite ? (
        <p className="hint">{t('export.hint.composite')}</p>
      ) : png ? (
        <p className="hint">{t('export.hint.png')}</p>
      ) : (
        <p className="hint">
          {t(timeline.background === 'black' ? 'export.hint.black' : 'export.hint.green')}
          {portrait && t('export.hint.portrait')}
        </p>
      )}
      <p className="hint">
        {composite
          ? t('export.info.compositeLength', { len: formatTime(media?.duration ?? 0), w: timeline.width, h: timeline.height })
          : t('export.info.length', { len: formatTime(timeline.duration), w: timeline.width, h: timeline.height, fps: timeline.fps })}
        {composite
          ? t('export.info.composite', { size: formatMB(compEst.mb), time: formatTime(Math.max(1, compEst.sec)) })
          : png
            ? t('export.info.png', {
                frames: pngEst.frames.toLocaleString('en-US'),
                low: formatMB(pngEst.lowMB),
                high: formatMB(pngEst.highMB),
                time: formatTime(Math.max(1, pngEst.sec)),
              })
            : t('export.info.mp4', { low: formatMB(mp4Size.low), high: formatMB(mp4Size.high), time: formatTime(Math.max(1, mp4Sec)) })}
        {t('export.info.note')}
      </p>
      <IssueList issues={issues} />
      <label className="inline">
        <input type="checkbox" checked={autoWipe} onChange={(e) => setAutoWipe(e.target.checked)} />
        {t('export.autoWipe')}
      </label>
      {progress === null ? (
        <button className="primary" disabled={blocked} onClick={() => void run()}>
          {t(composite ? 'export.btn.composite' : png ? 'export.btn.png' : 'export.btn.mp4')}
        </button>
      ) : (
        <div className="progress-row">
          <progress value={progress} max={1} />
          <span>{Math.round(progress * 100)}%</span>
          {remaining && <span className="hint">{t('export.remaining', { time: remaining })}</span>}
          <button onClick={() => jobRef.current?.cancel()}>{t('export.cancel')}</button>
        </div>
      )}
      {error != null && <p className="error">{te(error)}</p>}
      {partial && (
        <div className="partial">
          <span>{t(partial.kind === 'folder' ? 'export.partial.folder' : 'export.partial.file', { name: partial.label })}</span>
          <button className="danger-inline" onClick={() => void deletePartial()}>
            {t(partial.kind === 'folder' ? 'export.partial.deleteFolder' : 'export.partial.deleteFile')}
          </button>
          <button onClick={() => setPartial(null)}>{t('export.partial.keep')}</button>
        </div>
      )}
    </div>
  );
}
