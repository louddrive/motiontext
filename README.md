# motiontext

SRT / SBV 字幕から、リリックビデオ風のモーショングラフィックスをルールベースで自動生成する Web アプリ。
生成物は既存 MV に重ねるための素材として、MP4（黒／グリーン背景・H.264、CapCut 向け）、PNG 連番（背景透過、DaVinci Resolve 向け）、または読み込んだ MV／曲と合成した音声付き MP4 で書き出す。

公開版: `https://<アカウント名>.github.io/motiontext/`（Chrome / Edge の最新版を推奨。書き出しには WebCodecs と File System Access API を使うため）

## 使い方

```sh
npm install
npm run dev      # 開発サーバー
npm test         # 単体テスト（Vitest）
npm run build    # 型チェック + 本番ビルド（dist/ を静的ホスティング）
```

1. 字幕ファイル（.srt / .sbv、UTF-8 または Shift_JIS）を読み込む
2. フォントを選ぶ（複数可。通常行向け＝本文、強調向け＝サビに自動割り当て）
3. スタイルを選ぶ
   - 出力形式（MP4 / PNG連番・背景透過 / MV／曲と合成）
   - 画面比率（16:9 横 1920x1080 / 9:16 縦 1080x1920）
   - 演出レベル（演出なし〔可読性重視・英語圏向け〕/ 控えめ / 標準 / エモい / 超エモ）
   - 背景（黒 / グリーン。PNG連番は透過固定）
   - 文字サイズ（小 / 中 / 大＝画面いっぱい）
   - 漢字とかなのサイズ差（なし / 控えめ / 標準 / 強め）
   - 画数の多い漢字を強調（行ごとに最も画数の多い漢字語を1つ拡大。10画未満は対象外）
   - 縦書き（自動 / なし / 常に）。日本語のみの行（英数字を含まない・1行20字以内・3行以内）が対象。自動では行ごとに縦書き・横書きを混在させ（縦書きの連続は最大2行、割合は演出レベルに連動）、縦書き行は中央／左寄せ／右寄せに配置
   - 文字色（自動 / 単色指定）
4. プレビュー。「演出を再生成」でシードを変えて別パターンを作れる。MV / 音声を読み込むと重ねて確認でき、書き出し長も MV に合わせる
5. 書き出す（MP4 はダウンロード、PNG連番は選んだフォルダ内に新しいフォルダを作って1枚ずつ保存）

### MV／曲と合成（音声付き MP4）
- プレビューで読み込んだ MV／曲の上に歌詞を重ねて書き出す。曲だけの場合は黒背景＋歌詞＋音声
- MV は画面を埋めるように配置し、はみ出しは切る（cover）。フレームレートは MV に合わせる（最大 60fps）。長さは MV／曲に合わせる
- 音声は MP4 に入る形式ならそのままコピー（劣化なし）、入らない形式は AAC に変換
- 保存先ファイルへ直接書き込む（Chrome / Edge のみ）。MV は H.264 推奨（HEVC は PC の環境によって読み込めない場合がある）

### DaVinci Resolve での使い方（PNG連番）
- 書き出したフォルダをメディアプールにドラッグすると、連番が1本のクリップとして読み込まれる。アルファはそのまま使える
- 保存は File System Access API を使うため Chrome / Edge のみ。既存のファイルは上書きしない（同名フォルダがあれば _2, _3 …）
- 途中でキャンセル・失敗した場合は、途中まで書き出したフォルダを削除するか確認する

### CapCut での重ね方
- **黒背景（推奨）**: オーバーレイで追加 →「描画モード」→「スクリーン」
- **グリーン背景**: オーバーレイで追加 →「クロマキー」で緑を選択

## 制限（src/limits.ts）
- 字幕ファイル: 1MB / 3,000 件まで
- 書き出しの長さ: 15 分まで。MP4 は全体をメモリ上に作ってから保存するため 10 分超で警告。PNG 連番はフォルダへ1枚ずつ書き込むのでメモリは溜まらないが、枚数・容量が大きいので 5 分超で警告（実測の目安: 1080p で1枚 約150〜350KB、15 分で 4〜9GB 程度）
- 字幕の時刻チェック: 前の字幕から 10 分以上離れている／1 件の表示が 60 秒以上なら打ち間違いの疑いとして警告
- MV: 容量制限なし（再生用 URL を作るだけでメモリに読み込まない）。15 分を超える MV は書き出し長に使わない。字幕が MV より長い場合は警告

## データの扱い
- 処理はすべてブラウザ内。サーバー送信・外部通信なし（本番ビルドは CSP で外部接続を禁止）
- localStorage / IndexedDB / Cookie / Service Worker は不使用。書き出し後はアプリ内データを自動破棄（オプション）
- ダウンロード済みファイル・書き出した PNG 連番フォルダ・ブラウザのダウンロード履歴はアプリから削除できない（PNG 連番の途中停止時のみ、確認のうえ削除できる）

## 構成
```
src/parsers    SRT/SBV パーサー
src/analysis   特徴量（テンポ・セクション・サビ推定・文節近似分割）
src/director   特徴量 + テーマ + シード → Timeline（決定的）
src/themes     テーマ定義（将来のテーマ指定の受け皿）
src/fonts      同梱フォントカタログとローダー（@fontsource, OFL-1.1）
src/animations 演出（8種）と装飾
src/render     レイアウト・描画（renderFrame は時刻の純関数）
src/export     WebCodecs + Mediabunny による MP4 生成（Worker）
src/session    Blob URL 管理・破棄
src/ui         React UI
src/data       生成データ（漢字の総画数表）
scripts        データ生成スクリプト
```

## 同梱データ・ライセンス
- フォント: @fontsource 経由（SIL OFL 1.1）
- 漢字の総画数: Unicode Unihan Database 18.0.0 `kTotalStrokes`（Unicode License v3、`src/data/UNICODE-LICENSE.txt`）。
  JIS X 0208/0212/0213 の漢字 12,155 字。再生成は `node scripts/gen-strokes.mjs <Unihan展開先>`

## 対応ブラウザ
書き出しには WebCodecs（VideoEncoder）と OffscreenCanvas が必要。Chrome / Edge の最新版で動作確認済み。

## デプロイ（GitHub Pages）
- `main` に push すると `.github/workflows/deploy.yml` が実行され、テスト → ビルド → GitHub Pages へのデプロイまで自動で行う
- 配信パスはリポジトリ名から自動で決まる（`BASE_PATH=/<リポジトリ名>/`）。手元で同じ構成を確認するときは `BASE_PATH=/motiontext/ npm run build && BASE_PATH=/motiontext/ npx vite preview`（Git Bash では先頭に `MSYS_NO_PATHCONV=1` を付ける）
- 初回のみ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする
- GitHub Pages はレスポンスヘッダーを設定できないため、CSP は `index.html` の meta タグで設定している（ビルド時に埋め込み）
- 第三者ライセンスはビルド時に `dist/THIRD_PARTY_LICENSES.txt` として生成し、画面下部からリンクしている
