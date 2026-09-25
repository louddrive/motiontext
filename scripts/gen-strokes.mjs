// Unihan データベースから漢字の総画数表 src/data/strokes.ts を生成する。
// 使い方:
//   1. https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip を取得して展開
//   2. node scripts/gen-strokes.mjs <展開先ディレクトリ>
// 対象: JIS X 0208 / 0212 / 0213 に含まれる漢字（kIRG_JSource が J0 / J1 / J13 / J14）
// データのライセンス: Unicode License v3（src/data/UNICODE-LICENSE.txt）

import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/gen-strokes.mjs <Unihan dir>');
  process.exit(1);
}
const src = fs.readFileSync(path.join(dir, 'Unihan_IRGSources.txt'), 'utf8');

const version = /# Unicode Version (\S+)/.exec(src)?.[1] ?? 'unknown';
const jis = new Set();
const strokes = new Map();
for (const line of src.split('\n')) {
  const m = /^U\+([0-9A-F]+)\t(kIRG_JSource|kTotalStrokes)\t(.+)$/.exec(line);
  if (!m) continue;
  const cp = parseInt(m[1], 16);
  if (m[2] === 'kIRG_JSource') {
    if (/^J(0|1|13|14)-/.test(m[3])) jis.add(cp);
  } else {
    // 値が2つある場合は 1つ目が簡体字(G)、2つ目が繁体字(T)向け。日本の字形に近い後者を採用する
    const values = m[3].trim().split(/\s+/).map(Number);
    strokes.set(cp, values[values.length - 1]);
  }
}

const byCount = new Map();
for (const cp of [...jis].sort((a, b) => a - b)) {
  const n = strokes.get(cp);
  if (!n) continue;
  byCount.set(n, (byCount.get(n) ?? '') + String.fromCodePoint(cp));
}

const entries = [...byCount.entries()].sort((a, b) => a[0] - b[0]);
const body = entries.map(([n, chars]) => `  ${n}: '${chars}',`).join('\n');
const total = entries.reduce((s, [, c]) => s + [...c].length, 0);
const out = `// 自動生成ファイル（scripts/gen-strokes.mjs）。手で編集しないこと。
// 出典: Unicode Unihan Database ${version} kTotalStrokes / 対象 ${total} 字（JIS X 0208/0212/0213）
// ライセンス: Unicode License v3（src/data/UNICODE-LICENSE.txt）
export const STROKES_BY_COUNT: Record<number, string> = {
${body}
};
`;
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/strokes.ts', out);
console.log(`wrote src/data/strokes.ts: ${total} chars, Unicode ${version}`);
