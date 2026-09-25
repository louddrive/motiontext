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
  onExported: (autoWipe: boolean, message: string) => void;
}

/** MP4 書き出し速度の目安（フレーム/秒）。開発機の実測（約130fps）より控えめに見積もる */
const ESTIMATED_FPS = 90;

function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.max(1, Math.round(mb))}MB`;
}

export function ExportPanel({ timeline, fontIds, text, baseName, format, issues, media, onExported }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoWipe, setAutoWipe] = useState(true);
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

  async function runPng(): Promise<string> {
    // 保存先はクリック直後に選ばせる（ブラウザの制約）
    const parent = await pickOutputDirectory();
    setProgress(0);
    startedAtRef.current = performance.now();
    const job = startPngSequenceExport(parent, baseName, timeline, fontIds, text, setProgress);
    jobRef.current = job;
    const result = await job.promise;
    return `「${result.folderName}」に ${result.frames.toLocaleString()} 枚（${formatMB(result.bytes / 1024 / 1024)}）書き出しました。`;
  }

  async function runComposite(): Promise<string> {
    if (!media) throw new Error('MV／曲が読み込まれていません');
    // 保存先はクリック直後に選ばせる（ブラウザの制約）
    const handle = await pickOutputFile(compositeFileName(baseName, timeline.width, timeline.height));
    setProgress(0);
    startedAtRef.current = performance.now();
    const job = startCompositeExport(handle, media.file, timeline, fontIds, text, setProgress);
    jobRef.current = job;
    const r = await job.promise;
    const audio = r.audio === 'copy' ? '音声はそのままコピー' : r.audio === 'aac' ? '音声は AAC に変換' : '音声なし';
    return `「${handle.name}」に書き出しました（${formatTime(r.duration)} / ${r.fps}fps / ${audio}）。`;
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
        onExported(autoWipe, '書き出しが完了しました。');
      }
    } catch (e) {
      if (e instanceof PartialOutputError) {
        // 途中まで書いたフォルダが残っている。削除するかは利用者に確認する
        setPartial(e);
        if (!e.aborted) setError(e.message);
      } else if (!(e instanceof DOMException && e.name === 'AbortError')) {
        // AbortError: 書き出しのキャンセル、またはフォルダ選択のキャンセル
        setError(e instanceof Error ? e.message : String(e));
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
      setError(`削除できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!supported) {
    return <p className="error">このブラウザは WebCodecs による動画書き出しに対応していません。Chrome または Edge の最新版をご利用ください。</p>;
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
        <p className="hint">
          MV（曲だけの場合は黒背景）の上に歌詞を重ねた、音声付きの MP4 を書き出します。MV は画面を埋めるように配置し、はみ出した部分は切り取ります。
          フレームレートは MV に合わせます（最大60fps）。ボタンを押すと保存先のファイルを選ぶ画面が開き、そこへ直接書き込みます。
          H.264 の MV を推奨します（HEVC は PC の環境によって読み込めない場合があります）。
        </p>
      ) : png ? (
        <p className="hint">
          DaVinci Resolve: 書き出したフォルダをメディアプールにドラッグすると、連番が1本のクリップとして読み込まれ、透過（アルファ）もそのまま使えます。
          ボタンを押すと保存先の親フォルダを選ぶ画面が開き、その中に新しいフォルダを作って書き出します（既存のファイルは上書きしません）。
        </p>
      ) : (
        <p className="hint">
          {timeline.background === 'black'
            ? 'CapCut: MVの上に「オーバーレイ」で追加し、描画モードを「スクリーン」にすると黒が消えます。'
            : 'CapCut: MVの上に「オーバーレイ」で追加し、「クロマキー」で緑を選択して抜いてください。'}
          {portrait && ' 縦型は CapCut のプロジェクト比率も 9:16 にしてください。'}
        </p>
      )}
      <p className="hint">
        {composite
          ? `長さ ${formatTime(media?.duration ?? 0)}（MV／曲に合わせる） / ${timeline.width}x${timeline.height} / fps は MV に合わせる / `
          : `長さ ${formatTime(timeline.duration)} / ${timeline.width}x${timeline.height} / ${timeline.fps}fps / `}
        {composite
          ? `MV／曲と合成・H.264＋音声 ／ サイズの目安 約${formatMB(compEst.mb)} ／ 書き出し時間の目安 約${formatTime(Math.max(1, compEst.sec))}（30fps の場合。60fps の MV は約2倍）`
          : png
          ? `PNG連番（透過） ／ ${pngEst.frames.toLocaleString()} 枚・約${formatMB(pngEst.lowMB)}〜${formatMB(pngEst.highMB)} ／ 書き出し時間の目安 約${formatTime(Math.max(1, pngEst.sec))}`
          : `H.264 ／ サイズの目安 約${formatMB(mp4Size.low)}〜${formatMB(mp4Size.high)} ／ 書き出し時間の目安 約${formatTime(Math.max(1, mp4Sec))}`}
        （PCの性能で大きく変わります）
      </p>
      <IssueList issues={issues} />
      <label className="inline">
        <input type="checkbox" checked={autoWipe} onChange={(e) => setAutoWipe(e.target.checked)} />
        書き出し後にアプリ内のデータ（字幕・MV・生成結果）を自動で破棄する
      </label>
      {progress === null ? (
        <button className="primary" disabled={blocked} onClick={() => void run()}>
          {composite ? '保存先を選んで合成 MP4 を書き出す' : png ? '保存先を選んで PNG連番を書き出す' : 'MP4 を書き出す'}
        </button>
      ) : (
        <div className="progress-row">
          <progress value={progress} max={1} />
          <span>{Math.round(progress * 100)}%</span>
          {remaining && <span className="hint">残り 約{remaining}</span>}
          <button onClick={() => jobRef.current?.cancel()}>キャンセル</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {partial && (
        <div className="partial">
          <span>
            途中まで書き出した{partial.kind === 'folder' ? 'フォルダ' : 'ファイル'}「{partial.label}」が残っています。削除しますか？
          </span>
          <button className="danger-inline" onClick={() => void deletePartial()}>
            {partial.kind === 'folder' ? 'フォルダを削除する' : 'ファイルを削除する'}
          </button>
          <button onClick={() => setPartial(null)}>残す</button>
        </div>
      )}
    </div>
  );
}
