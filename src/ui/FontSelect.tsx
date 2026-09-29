import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FONT_CATALOG, fallbackIds, familyName, getFont, type FontDef, type FontRole, type FontScript } from '../fonts/catalog';
import { ensureGlyphs } from '../fonts/loader';
import { LANGUAGE_NAMES } from '../i18n';
import { useI18n } from '../i18n/react';

interface Props {
  /** このドロップダウンで選ぶ役割（並び順と見本の太さに使う） */
  role: FontRole;
  label: string;
  value: string;
  onChange: (id: string) => void;
  /** 見本に使う文字列（歌詞の一部） */
  sample: string;
  /** 先頭に並べる言語（歌詞の言語） */
  script: FontScript;
}

const SCRIPT_ORDER: FontScript[] = ['ja', 'ko', 'zh-Hans', 'zh-Hant'];

/** 見本の描画用の font-family（Canvas と同じフォールバック順） */
function familyCss(id: string): string {
  return `${[id, ...fallbackIds(id)].map((x) => `"${familyName(x)}"`).join(', ')}, sans-serif`;
}

/** 役割に使うウェイト（強調は太い方） */
function roleWeight(def: FontDef, role: FontRole): number {
  return role === 'display' ? def.weights[def.weights.length - 1] : def.weights[0];
}

/**
 * 書体のドロップダウン。各選択肢をその書体で描いた見本付きで表示する。
 * 標準の <select> では選択肢に書体を反映できないブラウザがあるため、WAI-ARIA の Select-Only Combobox として作る。
 */
export function FontSelect({ role, label, value, onChange, sample, script }: Props) {
  const { t } = useI18n();
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  /** 見本の文字を読み込み終えた書体 */
  const [ready, setReady] = useState<Set<string>>(new Set());
  /** 一度でも開いたか（開くまでは選択中の書体の見本だけを読み込む） */
  const [everOpened, setEverOpened] = useState(false);

  // 歌詞の言語の書体を先頭に、各言語の中では役割に合う区分の書体を先に並べる
  const groups = useMemo(() => {
    const order = [script, ...SCRIPT_ORDER.filter((s) => s !== script)];
    return order
      .map((s) => ({
        script: s,
        fonts: FONT_CATALOG.filter((f) => f.script === s).sort((a, b) => Number(b.role === role) - Number(a.role === role)),
      }))
      .filter((g) => g.fonts.length > 0);
  }, [script, role]);
  const options = useMemo(() => groups.flatMap((g) => g.fonts), [groups]);
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  // 見本の文字が変わったら読み込み直す
  useEffect(() => setReady(new Set()), [sample]);
  useEffect(() => {
    let alive = true;
    const ids = everOpened ? FONT_CATALOG.map((f) => f.id) : [value];
    for (const id of ids) {
      ensureGlyphs(document.fonts, [id], sample)
        .then(() => alive && setReady((prev) => (prev.has(id) ? prev : new Set(prev).add(id))))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [sample, everOpened, value]);

  // 外側をクリックしたら閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // キー操作で動かした選択肢を見える位置へ
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function show() {
    const rect = rootRef.current?.getBoundingClientRect();
    // 下に十分な余白がなく、上の方が広いときは上向きに開く
    setUp(!!rect && window.innerHeight - rect.bottom < 340 && rect.top > window.innerHeight - rect.bottom);
    setActive(Math.max(0, options.findIndex((f) => f.id === value)));
    setOpen(true);
    setEverOpened(true);
  }

  function choose(i: number) {
    const f = options[i];
    if (f && f.id !== value) onChange(f.id);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const move = (i: number) => {
      e.preventDefault();
      setActive(Math.min(last, Math.max(0, i)));
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(active + 1);
      case 'ArrowUp':
        return move(active - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(last);
      case 'PageDown':
        return move(active + 5);
      case 'PageUp':
        return move(active - 5);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return choose(active);
      case 'Escape':
        e.preventDefault();
        return setOpen(false);
      case 'Tab':
        return setOpen(false);
    }
  }

  const current = getFont(value);
  const sampleStyle = (f: FontDef) => ({
    fontFamily: familyCss(f.id),
    fontWeight: roleWeight(f, role),
    opacity: ready.has(f.id) ? 1 : 0.3,
  });
  let index = -1;

  return (
    <div className="font-select" ref={rootRef}>
      <span className="font-select-label" id={`${baseId}-label`}>
        {label}
      </span>
      <div className="font-select-box">
        <button
          type="button"
          role="combobox"
          className="font-select-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${baseId}-list`}
          aria-labelledby={`${baseId}-label ${baseId}-value`}
          aria-activedescendant={open ? optionId(active) : undefined}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={onKeyDown}
        >
          <span className="font-select-name" id={`${baseId}-value`}>
            {current.label}
          </span>
          <span className="font-select-sample" style={sampleStyle(current)}>
            {sample}
          </span>
        </button>
        {open && (
          <div className={`font-select-list ${up ? 'up' : ''}`} role="listbox" id={`${baseId}-list`} aria-labelledby={`${baseId}-label`}>
            {groups.map((g) => (
              <div role="group" key={g.script} aria-labelledby={`${baseId}-g-${g.script}`}>
                <div className="font-select-group" role="presentation" id={`${baseId}-g-${g.script}`}>
                  {LANGUAGE_NAMES[g.script]}
                </div>
                {g.fonts.map((f) => {
                  const i = ++index;
                  return (
                    <div
                      key={f.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={f.id === value}
                      className={`font-select-option ${i === active ? 'active' : ''}`}
                      // フォーカスをトリガーに残したまま選ぶ
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(i)}
                    >
                      <span className="font-meta">
                        {f.label}
                        <span className={`badge ${f.role}`}>{t(f.role === 'body' ? 'font.role.body' : 'font.role.display')}</span>
                      </span>
                      <span className="font-select-sample" style={sampleStyle(f)}>
                        {sample}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
