// 拍の確認（URL に ?beats=1 を付けたときだけ出す、解析結果を目と耳で確かめるための表示）。
// 検出した拍でプレビューの隅を点滅させ（小節の頭は大きく）、選べば拍ごとにクリック音を鳴らす。書き出しには含まれない。
import { useEffect, useRef, useState } from 'react';
import type { Rhythm } from '../audio/types';
import { useI18n } from '../i18n/react';

interface Props {
  rhythm: Rhythm;
  /** プレビューの現在の再生位置（秒） */
  getTime: () => number;
  /** 再生中か */
  isPlaying: () => boolean;
}

/** URL に ?beats=1 があるか（拍の確認を出すか） */
export const beatCheckEnabled = () => new URLSearchParams(window.location.search).has('beats');

/** 時刻 t 以下で最後の拍の番号（無ければ -1） */
function lastBeatAt(beats: number[], t: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** クリック音をどれだけ先まで予約するか（秒）。描画の間隔より長くし、音の遅れを防ぐ */
const SCHEDULE_AHEAD = 0.15;

export function BeatCheck({ rhythm, getTime, isPlaying }: Props) {
  const { t } = useI18n();
  const dotRef = useRef<HTMLDivElement>(null);
  const [clicks, setClicks] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const downbeats = new Set(rhythm.downbeats);
    let raf = 0;
    let lastIdx = -2;
    let lastT = -1;
    let scheduledUpTo = -1;
    let scheduled: OscillatorNode[] = [];
    const stopScheduled = () => {
      for (const o of scheduled) o.stop();
      scheduled = [];
    };
    const loop = () => {
      const now = getTime();
      const playing = isPlaying();
      const idx = lastBeatAt(rhythm.beats, now);
      // 拍をまたいだら点滅させる（再生中に前へ進んだときだけ。止めてシークしたときは点滅しない）
      if (idx !== lastIdx && idx >= 0 && playing && now >= lastT) {
        const big = downbeats.has(rhythm.beats[idx]);
        dotRef.current?.animate(
          [
            { opacity: 1, transform: `scale(${big ? 1.6 : 1})` },
            { opacity: 0, transform: 'scale(1)' },
          ],
          { duration: 180, easing: 'ease-out' },
        );
      }
      // クリック音は少し先まで予約する（止めた・戻った場合は予約を捨てる）
      const ctx = audioRef.current;
      if (ctx && clicks && playing) {
        if (now < lastT || scheduledUpTo < idx) {
          stopScheduled();
          scheduledUpTo = idx;
        }
        for (let k = scheduledUpTo + 1; k < rhythm.beats.length && rhythm.beats[k] <= now + SCHEDULE_AHEAD; k++) {
          const when = ctx.currentTime + Math.max(0, rhythm.beats[k] - now);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = downbeats.has(rhythm.beats[k]) ? 1760 : 1175;
          gain.gain.setValueAtTime(0.3, when);
          gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
          osc.connect(gain).connect(ctx.destination);
          osc.start(when);
          osc.stop(when + 0.06);
          scheduled.push(osc);
          scheduledUpTo = k;
        }
        scheduled = scheduled.slice(-8);
      } else if (scheduled.length) {
        stopScheduled();
        scheduledUpTo = idx;
      }
      lastIdx = idx;
      lastT = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stopScheduled();
    };
  }, [rhythm, getTime, isPlaying, clicks]);

  useEffect(() => () => void audioRef.current?.close(), []);

  return (
    <div className="beat-check">
      <div className="beat-dot" ref={dotRef} aria-hidden="true" />
      <p className="hint">
        <strong>{t('beatCheck.title')}</strong>{' '}
        {t('beatCheck.info', {
          bpm: rhythm.bpm,
          conf: rhythm.confidence.toFixed(2),
          beats: rhythm.beats.length,
          sections: rhythm.sections.length ? rhythm.sections.map((s) => s.toFixed(1)).join(', ') : '-',
        })}
      </p>
      <label className="inline">
        <input
          type="checkbox"
          checked={clicks}
          onChange={(e) => {
            // AudioContext は利用者の操作の中で作る（ブラウザの自動再生の制限のため）
            audioRef.current ??= new AudioContext();
            void audioRef.current.resume();
            setClicks(e.target.checked);
          }}
        />
        {t('beatCheck.click')}
      </label>
    </div>
  );
}
