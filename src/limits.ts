import type { ExportFormat } from './export/protocol';
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

export interface Issue {
  level: 'error' | 'warning';
  message: string;
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
    message: `字幕ファイルが大きすぎます（${Math.ceil(bytes / 1024).toLocaleString()}KB）。上限は ${(LIMITS.maxSubtitleBytes / 1024).toLocaleString()}KB（1MB）です。`,
  };
}

/** 字幕内容の妥当性チェック（件数・長さ・時刻の打ち間違いの疑い） */
export function validateSubtitles(cues: Cue[]): Issue[] {
  const issues: Issue[] = [];
  if (cues.length > LIMITS.maxCues) {
    issues.push({ level: 'error', message: `字幕が多すぎます（${cues.length} 件）。上限は ${LIMITS.maxCues} 件です。` });
  }
  const end = cues.reduce((m, c) => Math.max(m, c.end), 0);
  if (end > LIMITS.maxExportSec) {
    issues.push({
      level: 'error',
      message: `字幕の終わり（${formatTime(end)}）が書き出し上限の ${formatTime(LIMITS.maxExportSec)} を超えています。時刻に打ち間違いがないか確認してください。`,
    });
  }
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const prevEnd = i > 0 ? cues[i - 1].end : 0;
    if (c.start - prevEnd >= LIMITS.suspiciousGapSec) {
      issues.push({
        level: 'warning',
        message: `${i + 1} 件目（${formatTime(c.start)}）が前の字幕から ${formatTime(c.start - prevEnd)} 離れています。時刻の打ち間違いの可能性があります。`,
      });
    }
    if (c.end - c.start >= LIMITS.longCueSec) {
      issues.push({
        level: 'warning',
        message: `${i + 1} 件目（${formatTime(c.start)}）の表示時間が ${formatTime(c.end - c.start)} あります。終了時刻の打ち間違いの可能性があります。`,
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
    issues.push({ level: 'error', message: `書き出しの長さ（${formatTime(exportSec)}）が上限の ${formatTime(LIMITS.maxExportSec)} を超えています。` });
  } else if (format === 'png' && exportSec > LIMITS.warnPngSequenceSec) {
    const frames = Math.ceil(exportSec * fps);
    issues.push({
      level: 'warning',
      message: `PNG連番は ${frames.toLocaleString()} 枚になり、数GBのディスク容量と長い書き出し時間が必要です。保存先の空き容量を確認してください。`,
    });
  } else if (format !== 'png' && exportSec > LIMITS.warnExportSec) {
    issues.push({ level: 'warning', message: `書き出しが ${formatTime(exportSec)} と長いため、時間とメモリを多く使います。` });
  }
  if (mvDuration !== undefined) {
    if (mvDuration > LIMITS.maxExportSec) {
      issues.push({
        level: 'warning',
        message: `MV（${formatTime(mvDuration)}）が上限の ${formatTime(LIMITS.maxExportSec)} を超えるため、書き出しの長さは字幕に合わせます。`,
      });
    } else if (subtitleEnd > mvDuration) {
      issues.push({
        level: 'warning',
        message: `字幕の終わり（${formatTime(subtitleEnd)}）が MV の長さ（${formatTime(mvDuration)}）を超えています。字幕ファイルと MV の組み合わせを確認してください。`,
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
