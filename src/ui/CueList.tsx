import { memo, useMemo, useRef } from 'react';
import type { TimelineItem } from '../director/types';
import { useI18n } from '../i18n/react';
import { formatClock } from './Preview';

interface Props {
  items: TimelineItem[];
  /** 言語の切り替えで再描画するため（memo の比較に使う） */
  lang: string;
  activeId: number | null;
  onSeek: (t: number) => void;
}

/** 字幕の一覧。クリックでその字幕の開始時刻へ移動する（再生中の字幕を強調） */
export const CueList = memo(function CueList({ items, activeId, onSeek }: Props) {
  const { t } = useI18n();
  const rows = useMemo(
    () => items.map((it) => ({ id: it.id, start: it.start, text: it.lines.map((phrases) => phrases.join('')).join(it.mixed ? '　' : ' / ') })),
    [items],
  );
  // onSeek は毎回新しい関数になるので ref で最新を使い、一覧の再描画を activeId の変化だけに抑える
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;
  return (
    <div className="cue-list">
      <p className="hint">{t('preview.cueList', { count: rows.length })}</p>
      <ol>
        {rows.map((r) => (
          <li key={r.id} className={r.id === activeId ? 'active' : ''}>
            <button type="button" onClick={() => seekRef.current(r.start)}>
              <span className="cue-time">{formatClock(r.start)}</span>
              <span className="cue-text">{r.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}, (a, b) => a.items === b.items && a.activeId === b.activeId && a.lang === b.lang);
