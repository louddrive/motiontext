import { useEffect, useState } from 'react';
import { MAX_TIMING_OFFSET_SEC, clampOffset } from '../analysis/timing';
import { useI18n } from '../i18n/react';

interface SeedProps {
  seed: number;
  canUndo: boolean;
  onRegenerate: () => void;
  onUndo: () => void;
  onSeedInput: (seed: number) => void;
}

/** 演出パターンの操作: 再生成・1つ前に戻す・パターン番号の表示と入力 */
export function SeedControls({ seed, canUndo, onRegenerate, onUndo, onSeedInput }: SeedProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(String(seed));
  useEffect(() => setDraft(String(seed)), [seed]);

  const commit = () => {
    const n = Number(draft.trim());
    if (Number.isInteger(n) && n >= 0) onSeedInput(n);
    else setDraft(String(seed));
  };

  return (
    <>
      <button onClick={onRegenerate}>{t('seed.regenerate')}</button>
      <button onClick={onUndo} disabled={!canUndo}>
        {t('seed.undo')}
      </button>
      <label className="inline" title={t('seed.title')}>
        {t('seed.label')}
        <input
          className="seed-input"
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      </label>
    </>
  );
}

interface TimingProps {
  offsetSec: number;
  onChange: (sec: number) => void;
}

/** 字幕全体のタイミング調整（正で遅く、負で早く） */
export function TimingControls({ offsetSec, onChange }: TimingProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(offsetSec.toFixed(2));
  useEffect(() => setDraft(offsetSec.toFixed(2)), [offsetSec]);
  const set = (v: number) => onChange(clampOffset(v));

  return (
    // ボタンを含むので <label> では囲まない（ラベルのクリックが先頭のボタンに伝わるため）
    <div className="inline" role="group" aria-label={t('timing.label')} title={t('timing.title', { max: MAX_TIMING_OFFSET_SEC })}>
      <span>{t('timing.label')}</span>
      <button type="button" onClick={() => set(offsetSec - 0.1)}>
        {t('timing.minus')}
      </button>
      <input
        className="offset-input"
        aria-label={t('timing.aria')}
        type="number"
        step={0.05}
        min={-MAX_TIMING_OFFSET_SEC}
        max={MAX_TIMING_OFFSET_SEC}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => set(Number(draft))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') set(Number(draft));
        }}
      />
      {t('timing.unit')}
      <button type="button" onClick={() => set(offsetSec + 0.1)}>
        {t('timing.plus')}
      </button>
      <button type="button" onClick={() => set(0)} disabled={offsetSec === 0}>
        {t('timing.reset')}
      </button>
    </div>
  );
}
