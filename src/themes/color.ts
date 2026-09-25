export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 色相(0..360)と彩度(0..1) */
export function hueSat(hex: string): { hue: number; sat: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const l = (max + min) / 2;
  const sat = d / (1 - Math.abs(2 * l - 1));
  return { hue, sat };
}

/** グリーンバック出力時、クロマキーで抜けてしまう緑〜シアン系の色かどうか */
export function isKeyUnsafe(hex: string): boolean {
  const { hue, sat } = hueSat(hex);
  return sat > 0.15 && hue >= 60 && hue <= 200;
}
