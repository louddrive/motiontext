import { ASPECTS, SIZE_LEVELS, VERTICAL_MODES, type Aspect, type SizeLevel, type VerticalMode } from '../director/types';
import { SIZE_CONTRAST_LEVELS, type SizeContrast } from '../render/charClass';
import { isKeyUnsafe } from '../themes/color';
import { EFFECT_LEVELS, type EffectLevel } from '../themes/effectLevel';
import type { ExportFormat } from '../export/protocol';
import type { BackgroundMode } from '../themes/types';
import type { MessageKey } from '../i18n';
import { useI18n } from '../i18n/react';

export interface StyleSettings {
  /** 出力形式（PNG 連番は背景透過なので background を使わない） */
  output: ExportFormat;
  aspect: Aspect;
  effectLevel: EffectLevel;
  background: BackgroundMode;
  sizeLevel: SizeLevel;
  sizeContrast: SizeContrast;
  strokeEmphasis: boolean;
  verticalMode: VerticalMode;
  colorMode: 'auto' | 'single';
  color: string;
}

export const DEFAULT_STYLE: StyleSettings = {
  output: 'mp4',
  aspect: 'landscape',
  effectLevel: 'standard',
  background: 'black',
  sizeLevel: 'm',
  sizeContrast: 'normal',
  strokeEmphasis: true,
  verticalMode: 'auto',
  colorMode: 'auto',
  color: '#FFFFFF',
};

interface Props {
  value: StyleSettings;
  onChange: (v: StyleSettings) => void;
  /** PNG 連番書き出しに対応しているか（Chrome / Edge） */
  pngSupported: boolean;
  /** 合成書き出しに対応しているか（Chrome / Edge） */
  compositeSupported: boolean;
  /** MV／曲が読み込まれていて、合成に使える長さか */
  hasMedia: boolean;
}

// 選択肢の値 → 翻訳キー（キーの打ち間違いは型で検出される）
const ASPECT_KEYS: Record<Aspect, MessageKey> = { landscape: 'aspect.landscape', portrait: 'aspect.portrait' };
const EFFECT_KEYS: Record<EffectLevel, MessageKey> = {
  none: 'effect.none',
  subtle: 'effect.subtle',
  standard: 'effect.standard',
  emo: 'effect.emo',
  ultra: 'effect.ultra',
};
const SIZE_KEYS: Record<SizeLevel, MessageKey> = { xs: 'size.xs', s: 'size.s', m: 'size.m', l: 'size.l', xl: 'size.xl' };
const CONTRAST_KEYS: Record<SizeContrast, MessageKey> = {
  none: 'contrast.none',
  soft: 'contrast.soft',
  normal: 'contrast.normal',
  strong: 'contrast.strong',
};
const VERTICAL_KEYS: Record<VerticalMode, MessageKey> = { auto: 'vertical.auto', off: 'vertical.off', always: 'vertical.always' };

export function StylePanel({ value, onChange, pngSupported, compositeSupported, hasMedia }: Props) {
  const { t } = useI18n();
  const png = value.output === 'png';
  const composite = value.output === 'composite';
  const set = <K extends keyof StyleSettings>(k: K, v: StyleSettings[K]) => onChange({ ...value, [k]: v });
  const keyWarning = !png && !composite && value.background === 'green' && value.colorMode === 'single' && isKeyUnsafe(value.color);
  const darkWarning = !png && !composite && value.background === 'black' && value.colorMode === 'single' && luminance(value.color) < 0.25;

  return (
    <div>
      <div className="controls">
        <label>
          {t('style.aspect')}
          <select value={value.aspect} onChange={(e) => set('aspect', e.target.value as Aspect)}>
            {(Object.keys(ASPECTS) as Aspect[]).map((k) => (
              <option key={k} value={k}>
                {t(ASPECT_KEYS[k])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('style.effect')}
          <select value={value.effectLevel} onChange={(e) => set('effectLevel', e.target.value as EffectLevel)}>
            {EFFECT_LEVELS.map((k) => (
              <option key={k} value={k}>
                {t(EFFECT_KEYS[k])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('style.output')}
          <select value={value.output} onChange={(e) => set('output', e.target.value as ExportFormat)}>
            <option value="mp4">{t('output.mp4')}</option>
            <option value="png" disabled={!pngSupported}>
              {t('output.png')}
              {pngSupported ? '' : t('output.chromeOnly')}
            </option>
            <option value="composite" disabled={!compositeSupported || !hasMedia}>
              {t('output.composite')}
              {!compositeSupported ? t('output.chromeOnly') : !hasMedia ? t('output.needMedia') : ''}
            </option>
          </select>
        </label>
        <label>
          {t('style.background')}
          {png || composite ? (
            <select disabled value="fixed">
              <option value="fixed">{png ? t('bg.transparent') : t('bg.mv')}</option>
            </select>
          ) : (
            <select value={value.background} onChange={(e) => set('background', e.target.value as BackgroundMode)}>
              <option value="black">{t('bg.black')}</option>
              <option value="green">{t('bg.green')}</option>
            </select>
          )}
        </label>
        <label>
          {t('style.size')}
          <select value={value.sizeLevel} onChange={(e) => set('sizeLevel', e.target.value as SizeLevel)}>
            {(Object.keys(SIZE_LEVELS) as SizeLevel[]).map((k) => (
              <option key={k} value={k}>
                {t(SIZE_KEYS[k])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('style.contrast')}
          <select value={value.sizeContrast} onChange={(e) => set('sizeContrast', e.target.value as SizeContrast)}>
            {(Object.keys(SIZE_CONTRAST_LEVELS) as SizeContrast[]).map((k) => (
              <option key={k} value={k}>
                {t(CONTRAST_KEYS[k])}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={value.strokeEmphasis} onChange={(e) => set('strokeEmphasis', e.target.checked)} />
          {t('style.strokeEmphasis')}
        </label>
      </div>
      <div className="controls">
        <label>
          {t('style.vertical')}
          <select value={value.verticalMode} onChange={(e) => set('verticalMode', e.target.value as VerticalMode)}>
            {VERTICAL_MODES.map((k) => (
              <option key={k} value={k}>
                {t(VERTICAL_KEYS[k])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('style.color')}
          <select value={value.colorMode} onChange={(e) => set('colorMode', e.target.value as StyleSettings['colorMode'])}>
            <option value="auto">{t('color.auto')}</option>
            <option value="single">{t('color.single')}</option>
          </select>
        </label>
        {value.colorMode === 'single' && (
          <label>
            <input type="color" value={value.color} onChange={(e) => set('color', e.target.value.toUpperCase())} />
            <code>{value.color}</code>
          </label>
        )}
      </div>
      {keyWarning && <p className="error">{t('style.keyWarning')}</p>}
      {darkWarning && <p className="error">{t('style.darkWarning')}</p>}
    </div>
  );
}

/** 相対輝度（0..1） */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
