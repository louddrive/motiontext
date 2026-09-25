import type { ExportFormat } from './export/protocol';
import type { Localized } from './i18n/errors';
import type { Cue } from './parsers/types';

// 入力・書き出しの制限値。書き出しは MP4 全体をメモリ上に保持してから保存するため、長さで上限を設ける。
export const LIMITS = {
  /** 字幕ファイルの最大サイズ（バイト） */
  maxSubtitleBytes: 1024 * 1024,
  /** 字幕の最大件数 */
  maxCues: 3000,
  /** 書き出しの最大長（秒） */
  maxExportSec: 15 * 60,
  /** これを超えたら警告する書き出し長（秒） */
  warnExportSec: 10 * 60,
  /** PNG 連番でこれを超えたら警告する書き出し長（秒）。枚数・容量が大きくなるため MP4 より短い */
  warnPngSequenceSec: 5 * 60,
  /** 前の字幕からこれ以上離れていたら時刻の打ち間違いを疑う（秒） */
  suspiciousGapSec: 10 * 60,
  /** 1つの字幕がこれ以上表示されるなら打ち間違いを疑う（秒） */
  longCueSec: 60,
} as const;

/** 検証結果。文言は持たず、画面側で key / params から翻訳する */
export interface Issue extends Localized {
  level: 'error' | 'warning';
}

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

/** 読み込み前のファイルサイズチェック */
export function checkSubtitleFileSize(bytes: number): Issue | null {
  if (bytes <= LIMITS.maxSubtitleBytes) return null;
  return {
    level: 'error',
    key: 'limits.fileTooLarge',
    params: { size: Math.ceil(bytes / 1024).toLocaleString('en-US'), max: (LIMITS.maxSubtitleBytes / 1024).toLocaleString('en-US') },
  };
}

/** 字幕内容の妥当性チェック（件数・長さ・時刻の打ち間違いの疑い） */
export function validateSubtitles(cues: Cue[]): Issue[] {
  const issues: Issue[] = [];
  if (cues.length > LIMITS.maxCues) {
    issues.push({ level: 'error', key: 'limits.tooManyCues', params: { count: cues.length, max: LIMITS.maxCues } });
  }
  const end = cues.reduce((m, c) => Math.max(m, c.end), 0);
  if (end > LIMITS.maxExportSec) {
    issues.push({
      level: 'error',
      key: 'limits.endBeyondMax',
      params: { end: formatTime(end), max: formatTime(LIMITS.maxExportSec) },
    });
  }
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const prevEnd = i > 0 ? cues[i - 1].end : 0;
    if (c.start - prevEnd >= LIMITS.suspiciousGapSec) {
      issues.push({
        level: 'warning',
        key: 'limits.gap',
        params: { n: i + 1, start: formatTime(c.start), gap: formatTime(c.start - prevEnd) },
      });
    }
    if (c.end - c.start >= LIMITS.longCueSec) {
      issues.push({
        level: 'warning',
        key: 'limits.longCue',
        params: { n: i + 1, start: formatTime(c.start), dur: formatTime(c.end - c.start) },
      });
    }
  }
  return issues;
}

/** MV の長さを書き出し長に使えるか。上限を超える MV は使わない */
export function usableMvDuration(mvDuration: number | undefined): number | undefined {
  return mvDuration && mvDuration <= LIMITS.maxExportSec ? mvDuration : undefined;
}

/** 書き出し前のチェック（長さ上限・MV とのずれ） */
export function validateExport(
  exportSec: number,
  subtitleEnd: number,
  mvDuration?: number,
  format: ExportFormat = 'mp4',
  fps = 30,
): Issue[] {
  const issues: Issue[] = [];
  if (exportSec > LIMITS.maxExportSec) {
    issues.push({ level: 'error', key: 'limits.exportTooLong', params: { len: formatTime(exportSec), max: formatTime(LIMITS.maxExportSec) } });
  } else if (format === 'png' && exportSec > LIMITS.warnPngSequenceSec) {
    const frames = Math.ceil(exportSec * fps);
    issues.push({
      level: 'warning',
      key: 'limits.pngMany',
      params: { frames: frames.toLocaleString('en-US') },
    });
  } else if (format !== 'png' && exportSec > LIMITS.warnExportSec) {
    issues.push({ level: 'warning', key: 'limits.exportLong', params: { len: formatTime(exportSec) } });
  }
  if (mvDuration !== undefined) {
    if (mvDuration > LIMITS.maxExportSec) {
      issues.push({
        level: 'warning',
        key: 'limits.mvTooLong',
        params: { len: formatTime(mvDuration), max: formatTime(LIMITS.maxExportSec) },
      });
    } else if (subtitleEnd > mvDuration) {
      issues.push({
        level: 'warning',
        key: 'limits.subsBeyondMv',
        params: { end: formatTime(subtitleEnd), mv: formatTime(mvDuration) },
      });
    }
  }
  return issues;
}

/** 書き出しサイズの目安（MB）。黒/緑背景は圧縮が効くため実測は下限寄りになることが多い */
export function estimateSizeMB(exportSec: number, bitrate: number): { low: number; high: number } {
  return { low: (exportSec * 1_000_000) / 8 / 1e6, high: (exportSec * bitrate) / 8 / 1e6 };
}

/** 字幕が1つ以上表示されている合計秒数（重なりは1回だけ数える） */
export function activeSeconds(items: { start: number; end: number }[]): number {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const it of sorted) {
    if (it.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = it.start;
      curEnd = it.end;
    } else curEnd = Math.max(curEnd, it.end);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/**
 * PNG 連番の1枚あたりのサイズ（KB）と書き出し速度（枚/秒）の目安。
 * 1920x1080・背景透過。開発機（Chrome）での実測: 表示中フレームの平均は 標準 約190KB / 超エモ 約290KB（最大 約680KB）、
 * 空フレーム 約43KB、速度は表示中フレームで 毎秒約38〜58枚。
 */
export const PNG_ESTIMATE = {
  frameKB: { low: 150, high: 350 },
  blankKB: 45,
  framesPerSec: 40,
};

/**
 * PNG 連番の枚数・容量（MB）・時間（秒）の目安。activeSec = 字幕が表示されている秒数。
 * 解像度が違う場合は画素数に比例させる。
 */
export function estimatePngSequence(
  exportSec: number,
  activeSec: number,
  fps: number,
  pixels = 1920 * 1080,
): { frames: number; lowMB: number; highMB: number; sec: number } {
  const frames = Math.ceil(exportSec * fps);
  const active = Math.min(frames, Math.ceil(activeSec * fps));
  const scale = pixels / (1920 * 1080);
  const blankMB = ((frames - active) * PNG_ESTIMATE.blankKB) / 1024;
  return {
    frames,
    lowMB: (active * PNG_ESTIMATE.frameKB.low * scale) / 1024 + blankMB,
    highMB: (active * PNG_ESTIMATE.frameKB.high * scale) / 1024 + blankMB,
    // 空フレームは使い回すので、時間はほぼ表示中のフレーム数で決まる
    sec: active / (PNG_ESTIMATE.framesPerSec / scale) + (frames - active) / 400,
  };
}
