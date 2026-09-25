import { ASPECTS, SIZE_LEVELS, VERTICAL_MODES, type Aspect, type SizeLevel, type VerticalMode } from '../director/types';
import { SIZE_CONTRAST_LEVELS, type SizeContrast } from '../render/charClass';
import { isKeyUnsafe } from '../themes/color';
import { EFFECT_LEVELS, type EffectLevel } from '../themes/effectLevel';
import type { ExportFormat } from '../export/protocol';
import type { BackgroundMode } from '../themes/types';

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
  sizeLevel: 'medium',
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

export function StylePanel({ value, onChange, pngSupported, compositeSupported, hasMedia }: Props) {
  const png = value.output === 'png';
  const composite = value.output === 'composite';
  const set = <K extends keyof StyleSettings>(k: K, v: StyleSettings[K]) => onChange({ ...value, [k]: v });
  const keyWarning = !png && !composite && value.background === 'green' && value.colorMode === 'single' && isKeyUnsafe(value.color);
  const darkWarning = !png && !composite && value.background === 'black' && value.colorMode === 'single' && luminance(value.color) < 0.25;

  return (
    <div>
      <div className="controls">
        <label>
          画面比率
          <select value={value.aspect} onChange={(e) => set('aspect', e.target.value as Aspect)}>
            {(Object.keys(ASPECTS) as Aspect[]).map((k) => (
              <option key={k} value={k}>
                {ASPECTS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          演出レベル
          <select value={value.effectLevel} onChange={(e) => set('effectLevel', e.target.value as EffectLevel)}>
            {(Object.keys(EFFECT_LEVELS) as EffectLevel[]).map((k) => (
              <option key={k} value={k}>
                {EFFECT_LEVELS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          出力形式
          <select value={value.output} onChange={(e) => set('output', e.target.value as ExportFormat)}>
            <option value="mp4">MP4（CapCut など）</option>
            <option value="png" disabled={!pngSupported}>
              PNG連番・背景透過（DaVinci Resolve など）{pngSupported ? '' : ' ※Chrome / Edge のみ'}
            </option>
            <option value="composite" disabled={!compositeSupported || !hasMedia}>
              MV／曲と合成（MP4・音声付き）
              {!compositeSupported ? ' ※Chrome / Edge のみ' : !hasMedia ? ' ※プレビューで MV／曲を読み込むと選べます' : ''}
            </option>
          </select>
        </label>
        <label>
          背景
          {png || composite ? (
            <select disabled value="fixed">
              <option value="fixed">{png ? '透過' : 'MV（曲だけの場合は黒）'}</option>
            </select>
          ) : (
            <select value={value.background} onChange={(e) => set('background', e.target.value as BackgroundMode)}>
              <option value="black">黒（CapCut「スクリーン」合成・推奨）</option>
              <option value="green">グリーン（CapCut「クロマキー」）</option>
            </select>
          )}
        </label>
        <label>
          文字サイズ
          <select value={value.sizeLevel} onChange={(e) => set('sizeLevel', e.target.value as SizeLevel)}>
            {(Object.keys(SIZE_LEVELS) as SizeLevel[]).map((k) => (
              <option key={k} value={k}>
                {SIZE_LEVELS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          漢字とかなのサイズ差
          <select value={value.sizeContrast} onChange={(e) => set('sizeContrast', e.target.value as SizeContrast)}>
            {(Object.keys(SIZE_CONTRAST_LEVELS) as SizeContrast[]).map((k) => (
              <option key={k} value={k}>
                {SIZE_CONTRAST_LEVELS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={value.strokeEmphasis} onChange={(e) => set('strokeEmphasis', e.target.checked)} />
          画数の多い漢字を強調
        </label>
      </div>
      <div className="controls">
        <label>
          縦書き
          <select value={value.verticalMode} onChange={(e) => set('verticalMode', e.target.value as VerticalMode)}>
            {(Object.keys(VERTICAL_MODES) as VerticalMode[]).map((k) => (
              <option key={k} value={k}>
                {VERTICAL_MODES[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          文字色
          <select value={value.colorMode} onChange={(e) => set('colorMode', e.target.value as StyleSettings['colorMode'])}>
            <option value="auto">自動（テーマ配色）</option>
            <option value="single">単色指定</option>
          </select>
        </label>
        {value.colorMode === 'single' && (
          <label>
            <input type="color" value={value.color} onChange={(e) => set('color', e.target.value.toUpperCase())} />
            <code>{value.color}</code>
          </label>
        )}
      </div>
      {keyWarning && <p className="error">この色は緑に近いため、クロマキーで文字ごと抜けてしまう可能性があります。黒背景か別の色を推奨します。</p>}
      {darkWarning && <p className="error">暗い色は「スクリーン」合成でほとんど見えなくなります。明るい色かグリーン背景を推奨します。</p>}
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
