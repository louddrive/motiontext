// リズム解析の Worker（MV／曲の音声をデコードしながら解析する。すべてこの端末内で処理し、外部へは送らない）
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { LocalizedError } from '../i18n/errors';
import { RhythmAnalyzer } from './analyzePcm';
import type { FromRhythmWorker, ToRhythmWorker } from './protocol';

const scope = self as unknown as {
  postMessage(msg: FromRhythmWorker): void;
  onmessage: ((e: MessageEvent<ToRhythmWorker>) => void) | null;
};

/** 進み具合を送る間隔（解析した割合） */
const PROGRESS_STEP = 0.02;

scope.onmessage = async (e) => {
  try {
    const rhythm = await analyzeMedia(e.data.media);
    scope.postMessage(rhythm ? { type: 'done', rhythm } : { type: 'noAudio' });
  } catch (err) {
    if (err instanceof LocalizedError) scope.postMessage({ type: 'error', message: err.message, key: err.key, params: err.params });
    else scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

async function analyzeMedia(media: File) {
  const input = new Input({ source: new BlobSource(media), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    if (!(await track.canDecode())) throw new LocalizedError('rhythm.undecodable', { codec: (await track.getCodec()) ?? '?' });
    const duration = await input.computeDuration();
    const analyzer = new RhythmAnalyzer();
    let first = true;
    let sampleRate = 0;
    let lastProgress = 0;
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const n = sample.numberOfFrames;
        const channels = sample.numberOfChannels;
        if (first) {
          first = false;
          // サンプリング周波数は最初の値に固定する（途中で変わる音声はまれなので扱わない）
          sampleRate = sample.sampleRate;
          // 音声が 0 秒より後から始まる場合は、その分の無音を足して時刻を MV とそろえる
          if (sample.timestamp > 0) analyzer.push(new Float32Array(Math.round(sample.timestamp * sampleRate)), sampleRate);
        }
        // モノラルにする（各チャンネルの平均）
        const mono = new Float32Array(n);
        const plane = new Float32Array(n);
        for (let c = 0; c < channels; c++) {
          sample.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
          for (let i = 0; i < n; i++) mono[i] += plane[i] / channels;
        }
        // 0 秒より前の部分（エンコーダーの先頭の遅延等）は捨てる
        const skip = sample.timestamp < 0 ? Math.min(n, Math.round(-sample.timestamp * sampleRate)) : 0;
        analyzer.push(skip ? mono.subarray(skip) : mono, sampleRate);
        const ratio = duration > 0 ? Math.min(1, (sample.timestamp + sample.duration) / duration) : 0;
        if (ratio - lastProgress >= PROGRESS_STEP) {
          lastProgress = ratio;
          scope.postMessage({ type: 'progress', ratio });
        }
      } finally {
        sample.close();
      }
    }
    return analyzer.finish();
  } finally {
    input.dispose();
  }
}
