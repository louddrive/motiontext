// MV／曲と歌詞を合成して MP4 に書き出す（Worker 内で実行）。
// MV のフレームを取り出して画面を埋めるように描き（cover）、その上に歌詞を重ねて H.264 で再エンコードする。
// 音声は可能ならそのままコピーし（劣化なし）、MP4 に入れられない形式だけ AAC に再エンコードする。
// 出力はメモリに溜めず、保存先ファイルへ直接書き込む（StreamTarget）。
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type StreamTargetChunk,
} from 'mediabunny';
import type { Timeline } from '../director/types';
import { LocalizedError } from '../i18n/errors';
import { buildLayouts, renderFrame } from '../render/renderer';
import { compositeBitrate, compositeFps } from './compositeParams';

export type AudioMode = 'copy' | 'aac' | 'none';

export interface CompositeResult {
  frames: number;
  fps: number;
  duration: number;
  audio: AudioMode;
  hasVideo: boolean;
}

export class CompositeCanceled extends Error {}

export async function runComposite(opts: {
  media: File;
  timeline: Timeline;
  writable: WritableStream;
  isCanceled: () => boolean;
  onProgress: (done: number, total: number) => void;
}): Promise<CompositeResult> {
  const { media, timeline, writable, isCanceled, onProgress } = opts;
  const { width, height } = timeline;
  const input = new Input({ source: new BlobSource(media), formats: ALL_FORMATS });
  let output: Output | null = null;
  try {
    const vTrack = await input.getPrimaryVideoTrack();
    const aTrack = await input.getPrimaryAudioTrack();
    if (!vTrack && !aTrack) throw new LocalizedError('err.noTracks');
    if (vTrack && !(await vTrack.canDecode())) {
      const codec = await vTrack.getCodec();
      // codec が不明な場合は '?' を渡す（画面側で翻訳）
      throw new LocalizedError('err.unsupportedCodec', { codec: codec ?? '?' });
    }
    const duration = await input.computeDuration();
    const fps = compositeFps(vTrack ? (await vTrack.computePacketStats(120)).averagePacketRate : null, !!vTrack);
    const bitrate = compositeBitrate(width, height, fps);
    if (!(await canEncodeVideo('avc', { width, height, bitrate }))) {
      throw new LocalizedError('err.h264Unsupported');
    }

    // 保存先ファイルへ直接書き込む（moov は最後に位置指定で書くので fastStart なし）
    const format = new Mp4OutputFormat({ fastStart: false });
    output = new Output({ format, target: new StreamTarget(writable as WritableStream<StreamTargetChunk>) });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new LocalizedError('err.canvasUnavailable');
    const layouts = buildLayouts(ctx, timeline);
    const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });

    // 音声: MP4 に入る形式ならコピー、入らなければ AAC に再エンコード、どちらも無理なら音声なし
    let audio: AudioMode = 'none';
    let audioPassthrough: EncodedAudioPacketSource | null = null;
    let audioEncode: AudioSampleSource | null = null;
    if (aTrack) {
      const codec = await aTrack.getCodec();
      if (codec && format.getSupportedCodecs().includes(codec)) {
        audioPassthrough = new EncodedAudioPacketSource(codec as AudioCodec);
        output.addAudioTrack(audioPassthrough);
        audio = 'copy';
      } else if ((await aTrack.canDecode()) && (await canEncodeAudio('aac'))) {
        audioEncode = new AudioSampleSource({ codec: 'aac', quality: QUALITY_HIGH });
        output.addAudioTrack(audioEncode);
        audio = 'aac';
      }
    }
    await output.start();

    const total = Math.max(1, Math.ceil(duration * fps));
    const checkCancel = () => {
      if (isCanceled()) throw new CompositeCanceled('canceled');
    };

    const videoLoop = async () => {
      const drawLyrics = async (i: number) => {
        const t = i / fps;
        // 描いた MV（または黒背景）を消さずに歌詞だけを重ねる
        renderFrame(ctx, timeline, layouts, t, { overlay: true });
        await videoSource.add(t, 1 / fps);
        if (i % 10 === 0) onProgress(i, total);
      };
      if (vTrack) {
        const sink = new VideoSampleSink(vTrack);
        const timestamps = function* () {
          for (let i = 0; i < total; i++) yield i / fps;
        };
        let i = 0;
        for await (const sample of sink.samplesAtTimestamps(timestamps())) {
          checkCancel();
          // MV の先頭より前など、フレームが無い時刻は黒
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
          if (sample) {
            sample.drawWithFit(ctx, { fit: 'cover' });
            sample.close();
          }
          await drawLyrics(i);
          i++;
        }
      } else {
        // 曲だけ: 黒背景に歌詞
        for (let i = 0; i < total; i++) {
          checkCancel();
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
          await drawLyrics(i);
        }
      }
    };

    const audioLoop = async () => {
      if (!aTrack) return;
      if (audioPassthrough) {
        const decoderConfig = (await aTrack.getDecoderConfig()) ?? undefined;
        let first = true;
        for await (const packet of new EncodedPacketSink(aTrack).packets()) {
          checkCancel();
          if (packet.timestamp >= duration) break;
          await audioPassthrough.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
          first = false;
        }
      } else if (audioEncode) {
        for await (const sample of new AudioSampleSink(aTrack).samples(0, duration)) {
          checkCancel();
          await audioEncode.add(sample);
          sample.close();
        }
      }
    };

    // 映像と音声は並行して流す（片方ずつだとインターリーブ待ちで止まることがある）
    await Promise.all([videoLoop(), audioLoop()]);
    await output.finalize();
    onProgress(total, total);
    return { frames: total, fps, duration, audio, hasVideo: !!vTrack };
  } catch (err) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
    throw err;
  } finally {
    input.dispose();
  }
}
