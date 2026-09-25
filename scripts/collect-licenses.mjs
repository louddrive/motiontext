// 本番で配信するサードパーティのライセンス本文を dist/THIRD_PARTY_LICENSES.txt にまとめる（npm run build から実行）
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// 実行時にバンドル・配信されるパッケージ（React の依存 scheduler を含む）
const packages = [...Object.keys(pkg.dependencies), 'scheduler'];

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'OFL.txt'];
const SOURCE_NOTES = {
  // MPL-2.0: 改変していないが、ソースの入手先を明記する
  mediabunny: 'Source code: https://github.com/Vanilagy/mediabunny (npm: https://www.npmjs.com/package/mediabunny). Used unmodified.',
};

const sections = [];
for (const name of packages.sort()) {
  const dir = path.join(root, 'node_modules', name);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = LICENSE_FILES.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) throw new Error(`license file not found: ${name}`);
  const note = SOURCE_NOTES[name] ? `${SOURCE_NOTES[name]}\n\n` : '';
  sections.push(`${'='.repeat(78)}\n${name}@${meta.version} (${meta.license})\n${'='.repeat(78)}\n${note}${fs.readFileSync(file, 'utf8').trim()}\n`);
}

// 漢字の画数データ（src/data/strokes.ts）
sections.push(
  `${'='.repeat(78)}\nUnicode Unihan Database (kTotalStrokes) — used in src/data/strokes.ts\n${'='.repeat(78)}\n${fs
    .readFileSync(path.join(root, 'src/data/UNICODE-LICENSE.txt'), 'utf8')
    .trim()}\n`,
);

const header = `motiontext — Third-party licenses\nGenerated at build time from node_modules.\n\n`;
fs.writeFileSync(path.join(root, 'dist', 'THIRD_PARTY_LICENSES.txt'), header + sections.join('\n'));
console.log(`wrote dist/THIRD_PARTY_LICENSES.txt (${sections.length} entries)`);
