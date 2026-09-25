# motiontext

**English** | [日本語](README.ja.md)

A web app that automatically turns a lyrics subtitle file into lyric-video-style text animation.
You can overlay the result on your own MV (music video).

**▶ Open the app: [https://louddrive.github.io/motiontext/](https://louddrive.github.io/motiontext/)**

- **Free, nothing to install**: just open it in your browser.
- **Fully automatic**: motion, layout, colors and vertical text are chosen for you. Don't like it? Regenerate with one click.
- **Your data never leaves your computer**: subtitles and MVs are processed only inside your browser.
- **5 languages**: the interface is available in English, 日本語, 简体中文, 繁體中文 and 한국어 (language menu at the top right).

---

## Contents

1. [What you need](#what-you-need)
2. [Getting started (5 steps)](#getting-started-5-steps)
3. [Settings](#settings)
4. [Choosing an output format](#choosing-an-output-format)
5. [Troubleshooting](#troubleshooting)
6. [Limits](#limits)
7. [Privacy](#privacy)
8. [For developers](#for-developers)

---

## What you need

### 1. A computer with Chrome or Edge

- Use the latest **Google Chrome** or **Microsoft Edge**.
- On Safari, Firefox and smartphones, some (or all) export features are not available.

### 2. A lyrics subtitle file (SRT or SBV)

A subtitle file is a text file that says which lyric to show at which time. Its extension is `.srt` or `.sbv`.

SRT example:

```text
1
00:00:12,500 --> 00:00:15,000
Walking through the city at dawn

2
00:00:15,200 --> 00:00:18,000
So I never forget your smile
```

- Each cue has a number, a time range (start --> end) and the lyric, separated by a blank line.
- You can download `.srt` or `.sbv` files from the subtitle editor in YouTube Studio, or use files made with subtitle software.
- UTF-8 and Shift_JIS text encodings are supported (detected automatically).
- A sample file is available at [tests/fixtures/sample.srt](tests/fixtures/sample.srt) (Japanese lyrics) if you just want to try it.

### 3. (Optional) The MV or song you want to overlay

- Used to check the result, or to export with "Composite with MV / song".
- For MVs, an **H.264 MP4** is recommended.

---

## Getting started (5 steps)

The page is divided into five sections, "1. Subtitle file" to "5. Export". Work from top to bottom.

> The interface language is chosen from your browser's language settings (English unless it is Japanese, Chinese or Korean). You can change it with the language menu at the top right.
> The chosen language is added to the URL (e.g. `?lang=en`), so a bookmark opens in the same language next time (nothing is saved in the browser).

### Step 1: Load a subtitle file ("1. Subtitle file")

1. Drag and drop your subtitle file onto the box that says "**Drop an SRT / SBV file**". You can also click the box to choose a file.
2. Once loaded, the file name and the number of cues are shown, and the sections from "2." onward appear.

> If a timestamp looks like a typo, it is shown as "Note:". Please check it.

### Step 2: Choose fonts ("2. Fonts")

- Check the fonts you want to use. **You can select more than one.**
- Fonts come in two types: "**Regular**" and "**Emphasis**".
  - Regular fonts are used for normal lyrics.
  - Emphasis fonts are used automatically for lines you want to stand out, such as the chorus.
- If unsure, keep the defaults, "Noto Sans JP" and "Dela Gothic One".

> The bundled fonts are Japanese fonts. They also cover English. Some Korean (Hangul) and Simplified Chinese characters are not included and are drawn with your system's fonts instead.

### Step 3: Choose a style ("3. Style")

- Choose the aspect ratio, effect level, text size and more.
- Every change is reflected in the preview right away.
- See [Settings](#settings) for what each option does. **The defaults are fine to start with.**

### Step 4: Check the preview ("4. Preview")

- Press "**Play**" to watch the animation. Drag the bar to jump to any time.
- You can also use the keyboard (when you are not typing in a text field):
  - Space: play / pause
  - ← →: back / forward 1 second
  - Shift + ← →: back / forward 0.1 seconds
- Press "**Regenerate**" to create a different animation pattern for the same subtitles. Press it as many times as you like.
  - "**Undo**" goes back to the previous pattern (up to 100 steps).
  - "**Pattern No.**" is the number of the current pattern. Write it down, and later type it into the field and press Enter to reproduce the same pattern (with the same subtitles and settings).
- Use "**Load MV / audio (optional, for preview)**" to see how the lyrics look over your MV or song.
  - The "Overlay on MV" checkbox turns the overlay on and off.
  - The length of the loaded MV / song is also used as the export length.
- If the subtitles and the MV are out of sync, shift all subtitles with "**Subtitle timing**".
  - "+0.1 s" shows the subtitles later, "-0.1 s" earlier. You can also type a value (up to ±30 seconds).
  - "Reset to 0" undoes the shift. The subtitle file itself is not modified.
- Open the "**Subtitle list**" to see all cues in time order. Click a row to jump to that cue. The cue being played is highlighted.

### Step 5: Export ("5. Export")

1. Press the button for your output format (chosen under "Output" in "3. Style"):
   - MP4: "**Export MP4**". The file is saved like a normal download.
   - PNG sequence: "**Choose a folder and export the PNG sequence**". A dialog opens to choose the destination folder.
   - Composite: "**Choose a file and export the composite MP4**". A dialog opens to choose the file name and location.
2. The progress and the estimated time left are shown. Keep the page open until it finishes. Press "Cancel" to stop.
3. Overlay the exported file on your MV in your video editor (see [Choosing an output format](#choosing-an-output-format)).

> After exporting, the page stays as it is, so you can also export in another format (for example, both MP4 and a PNG sequence).
> When you are done, click "**Clear data**" at the top right or close the page.
> To clear the data automatically, check "Clear app data (subtitles, MV, results) after exporting" before exporting.

---

## Settings

What each option in "3. Style" does. When in doubt, pick the "Recommended" value.

| Option | Choices | What it changes | Recommended |
|---|---|---|---|
| Aspect ratio | 16:9 (landscape) / 9:16 (portrait · Shorts / Reels / TikTok) | A landscape video or a vertical video for phones | 16:9 for a regular MV |
| Effect level | None (readability first) / Subtle / Standard / Emotional / Ultra emotional | How intense the motion is. Higher levels add more 3D camera moves, vertical text and decorations | "Standard"–"Emotional" for Japanese audiences; "None" for English-speaking audiences or maximum readability |
| Output | MP4 (CapCut, etc.) / PNG sequence · transparent (DaVinci Resolve, etc.) / Composite with MV / song (MP4 with audio) | The type of file to export | See [Choosing an output format](#choosing-an-output-format) |
| Background | Black / Green | The MP4 background color. Set automatically for PNG sequences and composites | Black |
| Text size | XS / S / M / L / XL (fill the screen) | Size of the lyrics. M is the standard size and L is about 1.5×. "XL" fills the screen | M |
| Kanji / kana size contrast | None / Subtle / Standard / Strong | Makes kanji larger and kana smaller for rhythm (Japanese lyrics only) | Standard |
| Emphasize kanji with many strokes | On / Off | Slightly enlarges the kanji word with the most strokes on each line (Japanese lyrics only) | On |
| Vertical text | Auto / Off / Always (Japanese lines) | Sets Japanese lyrics vertically. "Auto" mixes vertical and horizontal lines | Auto |
| Text color | Auto (theme colors) / Single color | The text color. "Single color" lets you pick one color | Auto |

Notes:

- Only lines that are entirely Japanese become **vertical**. Lines containing Latin letters or digits stay horizontal.
- With **"None"**, the text does not move; it simply fades in and out. Use it when readability comes first.
- A warning is shown if you pick a dark text color with a black background (it becomes nearly invisible when overlaid), or a greenish color with a green background.

---

## Choosing an output format

### Which one should I use?

| What you want to do | Output to choose |
|---|---|
| Overlay on your MV in **CapCut** or similar | MP4 (CapCut, etc.) + "Black" background |
| Overlay on your MV in **DaVinci Resolve** or similar | PNG sequence · transparent (DaVinci Resolve, etc.) |
| Get a **finished video** without an editor | Composite with MV / song (MP4 with audio) |

### MP4 (CapCut, etc.)

- A video with only the lyrics on a black (or green) background.
- How to overlay it in CapCut:
  - **Black background (recommended)**: add it on top of the MV as an "Overlay" and set the blend mode to "**Screen**". The black disappears, leaving only the lyrics.
  - **Green background**: add it on top of the MV as an "Overlay" and remove the green with "**Chroma key**".
- If you exported a portrait (9:16) video, set the CapCut project ratio to 9:16 as well.

### PNG sequence · transparent (DaVinci Resolve, etc.)

- Each frame is saved as a numbered PNG image in a folder. The background is transparent.
- When saving, you choose a parent folder. A new folder is created inside it for the images.
  - Existing folders are never overwritten (a suffix such as `_2` is added).
- In DaVinci Resolve: drag the exported folder into the Media Pool. The images are loaded as a single clip, with transparency.
- This uses a lot of files and disk space: about 1,800 images and 0.3–0.6 GB per minute. Check the free space at the destination.

### Composite with MV / song (MP4 with audio)

- Exports a **finished video with audio**, with the lyrics over the loaded MV.
- If you load a song (audio only), the video shows the lyrics on a black background.
- To choose this format, first load an MV or song with "Load MV / audio (optional, for preview)" in "4. Preview".
- If the MV's aspect ratio differs from the output, the MV is scaled to fill the screen and the overflow is cropped.
- The frame rate (frames per second, fps) follows the MV (up to 60).
- The audio is kept as-is whenever possible (no quality change).

---

## Troubleshooting

### The subtitle file won't load

- Make sure the extension is `.srt` or `.sbv`.
- Make sure the timestamps are well-formed (for example `00:00:12,500 --> 00:00:15,000`).
- Subtitle files are limited to 1 MB and 3,000 cues.

### The save dialog doesn't open / an output format can't be selected

- Use the latest Chrome or Edge. PNG sequences and composites work only in these two browsers.
- "Composite with MV / song" can't be selected until you load an MV or song.

### The MV won't load / compositing fails

- Some video formats can't be read by browsers (especially HEVC / H.265).
- Convert the video to an H.264 MP4 with a tool such as HandBrake, then load it again.

### Exporting takes a long time

- It depends heavily on your computer. The estimated time left is shown while exporting.
- Don't close or reload the page while exporting.

### I want to recreate a pattern I liked

- If you pressed "Regenerate" too many times, use "Undo" to go back.
- To recreate the same pattern later, write down the "Pattern No.". Entering it with the same subtitles and settings (fonts, style, subtitle timing) gives the same animation.
- Pattern numbers and settings are not saved in the browser (they are gone when you close the page).

### I canceled and was asked "Delete it?"

- A partially exported file (or folder) remains.
- Press "Delete file" (or "Delete folder") if you don't need it, or "Keep" to keep it.

---

## Limits

- Subtitle file: **up to 1 MB** and **3,000 cues**
- Export length: **up to 15 minutes**
  - Over 10 minutes (5 minutes for PNG sequences), a note warns that it will take more time and space.
- Timestamp checks: a note is shown when
  - a cue starts 10 minutes or more after the previous one, or
  - a single cue is displayed for 60 seconds or more.
- MV: no file size limit, but MVs longer than 15 minutes can't be used for compositing.

---

## Privacy

- Subtitles, MVs and songs are **processed only in your browser** and are never sent anywhere on the internet.
- Nothing is saved in the browser. Closing the page or pressing "**Clear data**" removes the data from the app.
- Exported files are saved where you choose. The app can't delete them (or your browser's download history), so please manage them yourself as needed.

---

## For developers

### Development

```sh
npm install
npm run dev      # dev server
npm test         # unit tests (Vitest)
npm run build    # type check + production build (serve dist/ as static files)
```

### Technical notes

- Rendering uses Canvas 2D. Exporting runs in a Worker with WebCodecs (H.264) and [Mediabunny](https://mediabunny.dev/) to create MP4s and read MVs.
- PNG sequences and composites are written directly to the destination with the File System Access API (nothing accumulates in memory, so long videos are fine).
- Lyrics-only MP4s are built in memory before saving, so a warning is shown over 10 minutes.
- The production build blocks external connections with a CSP (meta tag in `index.html`). localStorage / IndexedDB / cookies / Service Workers are not used.
- Limits are defined in `LIMITS` in [src/limits.ts](src/limits.ts).
- UI text lives in the dictionaries in [src/i18n/messages/](src/i18n/messages/). English (`en.ts`) is the source; missing keys in other languages are caught by the type checker. Logic code (validation, export errors) returns keys and parameters instead of text, and the UI translates them.

### Structure

```text
src/parsers    SRT/SBV parsers
src/analysis   Features (tempo, sections, chorus detection, phrase segmentation, stroke counts, vertical-text check)
src/director   Features + theme + seed → Timeline (deterministic)
src/themes     Theme definitions and effect levels
src/fonts      Bundled font catalog and loader (@fontsource, OFL-1.1)
src/animations Animations and decorations
src/render     Layout (horizontal / vertical), pseudo-3D camera, rendering (renderFrame is a pure function of time)
src/export     Export (MP4 / PNG sequence / composite with MV, in a Worker)
src/session    Blob URL management and cleanup
src/ui         React UI
src/i18n       Localization (dictionaries: en / ja / zh-Hans / zh-Hant / ko, language detection, React context)
src/data       Generated data (kanji stroke counts)
scripts        Data generation and license collection scripts
```

### Deployment (GitHub Pages)

- Pushing to `main` runs `.github/workflows/deploy.yml`: test → build → deploy to GitHub Pages.
- The base path comes from the repository name (`BASE_PATH=/<repo name>/`).
  - To reproduce it locally: `BASE_PATH=/motiontext/ npm run build && BASE_PATH=/motiontext/ npx vite preview` (in Git Bash, prefix with `MSYS_NO_PATHCONV=1`).
- One-time setup: set the repository's Settings → Pages → Source to "GitHub Actions".
- Third-party licenses are generated at build time as `dist/THIRD_PARTY_LICENSES.txt` and linked from "Licenses" at the bottom of the page.

### License

- This app: Apache License 2.0 ([LICENSE](LICENSE))
- Fonts: via @fontsource (SIL Open Font License 1.1)
- Kanji stroke counts: Unicode Unihan Database 18.0.0 `kTotalStrokes` (Unicode License v3, [src/data/UNICODE-LICENSE.txt](src/data/UNICODE-LICENSE.txt))
  - 12,155 kanji from JIS X 0208/0212/0213. Regenerate with `node scripts/gen-strokes.mjs <Unihan dir>`.
