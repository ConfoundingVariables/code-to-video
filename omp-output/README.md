# Signal — One million

A narrated motion-design film about systems design from first principles and scaling a chat application to one million **registered accounts**. The film distinguishes accounts, active users, concurrent sockets, writes and recipient deliveries. Its capacity figures are explicit illustrative assumptions, not benchmarks.

## Watch

- **Video:** [`output/one-million-chat.mp4`](output/one-million-chat.mp4)
- **Self-contained interactive master:** [`film.html`](film.html) — open in a current Chromium browser and press **Play film**. Fonts, libraries and the mixed soundtrack are embedded; playback needs no API key or CDN.
- **Storyboard:** [`output/storyboard.jpg`](output/storyboard.jpg)
- **Research:** [`RESEARCH.md`](RESEARCH.md) — 28 numbered first-party source entries, claim boundaries and scene-level citation mapping.
- **Installed skills:** [`SKILLS.md`](SKILLS.md) — six upstream skill families, pinned revisions and retained licenses.

The authored timeline is **8:02.567**, **1920 × 1080**, **30 fps**, **14,477 frames**, across 15 chapters. The MP4 includes chapter markers. `output/captions.srt` is a **chapter-level transcript**, not forced-aligned sentence/word captions; the HTML's Transcript button likewise displays the current chapter's complete narration.

## The film

Promises → workload arithmetic → the smallest useful system → transactional outbox → idempotent sends and local ordering → WebSocket gateways → fan-out → reconnect replay → partitioned history and media → ephemeral state and security → backpressure → regional failure boundaries → capacity experiments.

Visual direction: cobalt blueprint, copper messages, tide-green durable progress, Sora typography and a seeded 3D network. No stock footage, external music or placeholder narration. `ART_DIRECTION.md` records the rationale, visual tokens and motion thesis.

## Techniques and tool choices

| Technique | Actual use |
|---|---|
| GSAP 3.13 | One labeled, paused, absolute-time master timeline; SVG path reveals, packet travel and staggered explanation |
| Three.js | A seeded WebGL network, rendered from absolute timeline time, without clock-dependent physics |
| Lottie | A real vector checkmark animation sought to the durable-commit frame |
| Scroll-driven CSS | A real `ScrollTimeline` animates the reconnect replay progress bar from the history viewport's scroll position |
| View Transitions | Native chapter-navigation transitions in the interactive HTML; MP4 chapter cuts remain deterministically seekable |
| Animation principles | Staging, anticipation, controlled timing/easing, arcs, secondary action and follow-through; restrained premium motion |
| HTML-to-video | Playwright captures each exact frame; four independent chunks are encoded with ffmpeg, concatenated and muxed |
| API narration | All 15 delivered scenes use Gemini's **Charon** voice; two supported TTS models resolved an observed per-model quota limit |
| Original soundtrack | Python/numpy synthesizes pads, arpeggios and quiet message cues; all events and ducking use the measured narration timeline |

HyperFrames and Remotion were researched, not added redundantly. A small direct Playwright/ffmpeg pipeline preserves the requested single-HTML master, exposes exact-time seeking, and avoids a second framework. GSAP's runtime is under its standard no-charge license, not MIT; see `THIRD_PARTY_LICENSES.txt` and the notices embedded in the HTML. The downloaded guidance skills have their own independently recorded licenses.

## Reproduce or edit

Prerequisites: Node, standalone pnpm, uv, ffmpeg/ffprobe and Chromium. On the production machine, use `/Users/cxnbf/Library/pnpm/bin/pnpm`, not the nvm/Corepack shadow.

From the repository root, enter this project directory before running the commands below:
```sh
cd omp-output
pnpm install
pnpm exec playwright install chromium

# For changed narration, or to reconstruct the audio outputs from cached WAVs:
pnpm audio

# Embed the measured timeline, typography, JS and mixed soundtrack:
pnpm build

# Interactive preview:
pnpm preview

# Actual frame-by-frame render, then media/browser verification:
pnpm render
pnpm verify
```

For first-time or changed speech synthesis, `LLM_GEMINI_KEY` or `GEMINI_API_KEY` must be present in the environment. Keys are neither embedded in the film nor written to the repository. The final 15 measured Gemini WAVs and metadata are committed under `audio/cache/`, preserving the expensive generation work. Dependencies are locked in `pnpm-lock.yaml` and `audio/uv.lock`; Python runs in a uv-managed venv.

Production reused an already installed Chromium executable:

```sh
export BROWSER_EXECUTABLE_PATH=/Users/cxnbf/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell
pnpm render
pnpm verify
```

`RENDER_WORKERS` controls concurrency (default 4). `node production/render.mjs --smoke` renders the first two seconds to a separate preview, never over the finished film. `--from SECONDS --to SECONDS` renders a focused range. `--poster` captures chapter images.

Source boundaries:

- `film.json`: narration and chapter/source metadata.
- `src/film.js`, `src/film.css`: authored visual scenes, motion and accessible playback.
- `production/build.mjs`: self-contained HTML and license embedding.
- `audio/synthesize.py`: real TTS requests, measured scene timing, score synthesis and mix normalization.
- `production/render.mjs`: exact `frame / fps` seeks, browser screenshots, ffmpeg encoding and chapter/audio mux.
- `production/verify.mjs`: encoded-media invariants and representative browser seeks.

All video-related outputs are included under `output/`: the finished film, audio masters and stems, captions, timing metadata, storyboards, previews, render segments and verification captures. Dependencies, local environments and tooling caches remain ignored. The measured narration WAVs under `audio/cache/` are production assets and are included.

## Verification record

The live HTML was exercised in Chromium: audio play/pause, chapter navigation, transcript display, embedded font/audio readiness, and native scroll replay. The replay bar's actual animation timeline was observed as `ScrollTimeline`, with its scale changing as the persisted cursor advanced. Reverse/out-of-order seeks produced byte-identical screenshots for the Three.js opening, Lottie commit scene and CSS-scroll history scene. All 15 final chapter compositions were captured into the storyboard, and the final playback produced no console errors. Opening, storage-arithmetic and closing narration samples were independently transcribed from the synthesized audio and matched the intended text.

The two-second frame-render smoke produced exactly 60 frames. The final stereo master was measured at **−16.66 LUFS integrated / −1.50 dBTP**, 48 kHz. Detailed audio provenance and timing are in `output/audio-report.md`. Encoded-video verification and delivery checks are recorded in `output/verification.md` after the full render.
