import { useState } from 'react';
import { LocalizedError } from '../i18n/errors';
import { useI18n } from '../i18n/react';
import { LIMITS, checkSubtitleFileSize } from '../limits';
import { decodeBytes, parseSubtitle } from '../parsers/detect';
import type { ParseResult } from '../parsers/types';

interface Props {
  onLoaded: (fileName: string, result: ParseResult) => void;
}

export function DropZone({ onLoaded }: Props) {
  const { t, te } = useI18n();
  // エラーは表示時に翻訳する（言語を切り替えたときも追従する）
  const [error, setError] = useState<unknown>(null);
  const [over, setOver] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      // 大きすぎるファイルは読み込む前に弾く
      const sizeIssue = checkSubtitleFileSize(file.size);
      if (sizeIssue) throw new LocalizedError(sizeIssue.key, sizeIssue.params);
      const text = decodeBytes(await file.arrayBuffer());
      const result = parseSubtitle(file.name, text);
      if (result.cues.length === 0) throw new LocalizedError('parse.noCues');
      if (result.cues.length > LIMITS.maxCues) {
        throw new LocalizedError('limits.tooManyCues', { count: result.cues.length, max: LIMITS.maxCues });
      }
      onLoaded(file.name, result);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <label
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files[0]);
        }}
      >
        <input type="file" accept=".srt,.sbv,text/plain" hidden onChange={(e) => void handle(e.target.files?.[0])} />
        <strong>{t('drop.title')}</strong>
        <span>{t('drop.sub')}</span>
      </label>
      {error != null && <p className="error">{te(error)}</p>}
    </div>
  );
}
