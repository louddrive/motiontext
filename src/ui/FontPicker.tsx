import { useEffect, useState } from 'react';
import { FONT_CATALOG, familyName } from '../fonts/catalog';
import { ensureGlyphs } from '../fonts/loader';
import { useI18n } from '../i18n/react';

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
  sample: string;
}

export function FontPicker({ selected, onChange, sample }: Props) {
  const { t, tn } = useI18n();
  const [ready, setReady] = useState<Set<string>>(new Set());

  // 見本テキストの描画に必要な分だけ各フォントをロード
  useEffect(() => {
    let alive = true;
    for (const f of FONT_CATALOG) {
      ensureGlyphs(document.fonts, [f.id], sample)
        .then(() => alive && setReady((prev) => new Set(prev).add(f.id)))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [sample]);

  function toggle(id: string) {
    if (selected.includes(id)) {
      if (selected.length > 1) onChange(selected.filter((x) => x !== id));
    } else onChange([...selected, id]);
  }

  return (
    <div>
      <p className="hint">
        {tn('font.hint', { body: <b>{t('font.role.body')}</b>, display: <b>{t('font.role.display')}</b> })}
      </p>
      <div className="font-grid">
        {FONT_CATALOG.map((f) => {
          const on = selected.includes(f.id);
          return (
            <label key={f.id} className={`font-card ${on ? 'on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(f.id)} />
              <span className="font-meta">
                {f.label}
                <span className={`badge ${f.role}`}>{t(f.role === 'body' ? 'font.role.body' : 'font.role.display')}</span>
              </span>
              <span
                className="font-sample"
                style={{ fontFamily: `"${familyName(f.id)}", sans-serif`, opacity: ready.has(f.id) ? 1 : 0.3 }}
              >
                {sample}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
