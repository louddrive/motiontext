// MV／曲との合成書き出しのパラメータ決定（純粋関数）
import { safeName } from './sequence';

/** 合成出力の最大フレームレート */
export const MAX_COMPOSITE_FPS = 60;
/** 映像トラックがない（曲だけの）場合のフレームレート */
export const AUDIO_ONLY_FPS = 30;

/** よく使われるフレームレート。実測値がこれに近ければ丸める（29.97 など） */
const STANDARD_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];

/** MV の平均フレームレートから出力 fps を決める。上限60、曲だけ・不明な場合は30 */
export function compositeFps(averageRate: number | null | undefined, hasVideo: boolean): number {
  if (!hasVideo || !averageRate || !Number.isFinite(averageRate) || averageRate <= 0) return AUDIO_ONLY_FPS;
  const capped = Math.min(averageRate, MAX_COMPOSITE_FPS);
  // 最も近い標準値（差が 0.3 未満のときだけ採用）
  const nearest = STANDARD_RATES.reduce((best, r) => (Math.abs(r - capped) < Math.abs(best - capped) ? r : best));
  return Math.abs(nearest - capped) < 0.3 ? nearest : Math.round(capped * 1000) / 1000;
}

/** 映像ビットレート。1080p30 で 12Mbps、60fps で 1.5 倍（18Mbps）、画素数に比例 */
export function compositeBitrate(width: number, height: number, fps: number): number {
  const pixelScale = (width * height) / (1920 * 1080);
  const fpsScale = 0.5 + (0.5 * fps) / 30;
  return Math.round(12_000_000 * pixelScale * fpsScale);
}

/** 出力ファイル名: <字幕名>_with_mv_<幅>x<高さ>.mp4 */
export function compositeFileName(base: string, width: number, height: number): string {
  return `${safeName(base)}_with_mv_${width}x${height}.mp4`;
}

/** 合成書き出しの目安（MB と秒）。音声は約256kbps で見積もる */
export function estimateComposite(
  durationSec: number,
  width: number,
  height: number,
  fps: number,
  framesPerSec = COMPOSITE_FRAMES_PER_SEC,
): { mb: number; sec: number } {
  const bytes = ((compositeBitrate(width, height, fps) + 256_000) * durationSec) / 8;
  const pixelScale = (width * height) / (1920 * 1080);
  return { mb: bytes / 1024 / 1024, sec: (durationSec * fps * pixelScale) / framesPerSec };
}

/** 合成書き出しの速度の目安（1080p のフレーム/秒）。MV のデコード＋歌詞描画＋エンコード */
export const COMPOSITE_FRAMES_PER_SEC = 60;
