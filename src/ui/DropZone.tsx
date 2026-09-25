import { useState } from 'react';
import { LIMITS, checkSubtitleFileSize } from '../limits';
import { decodeBytes, parseSubtitle } from '../parsers/detect';
import type { ParseResult } from '../parsers/types';

interface Props {
  onLoaded: (fileName: string, result: ParseResult) => void;
}

export function DropZone({ onLoaded }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      // 大きすぎるファイルは読み込む前に弾く
      const sizeIssue = checkSubtitleFileSize(file.size);
      if (sizeIssue) throw new Error(sizeIssue.message);
      const text = decodeBytes(await file.arrayBuffer());
      const result = parseSubtitle(file.name, text);
      if (result.cues.length === 0) throw new Error('字幕が1件も見つかりませんでした');
      if (result.cues.length > LIMITS.maxCues) {
        throw new Error(`字幕が多すぎます（${result.cues.length} 件）。上限は ${LIMITS.maxCues} 件です。`);
      }
      onLoaded(file.name, result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <strong>SRT / SBV ファイルをドロップ</strong>
        <span>またはクリックして選択（ファイルはブラウザ内でのみ処理され、送信されません）</span>
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
