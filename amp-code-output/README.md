# One million hellos

A 2-minute-16-second motion-design explainer: systems design from first principles, scaling a chat app from 1 user to 1,000,000. The whole film is one animated HTML file. It is rendered frame by frame in headless Chrome, encoded with ffmpeg, and scored by a soundtrack synthesized in Python from the same timeline's cue list.

## Pipeline

```diagram
┌───────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────┐
│ research/sources.md   │──▶│ src/ (HTML, GSAP, Three, │──▶│ dist/one-million-    │
│ 31 primary sources    │   │ Lottie, CSS scroll + VT) │   │ hellos.html (single) │
└───────────────────────┘   └──────────────────────────┘   └──────────┬───────────┘
                                                                       │ render.mjs: seek(t) per frame,
                                                                       │ CDP screenshot → ffmpeg pipe
                              ┌──────────────────────────┐   ┌─────────▼────────────┐
                              │ audio/synth.py (numpy)   │◀──│ audio/cues.json      │
                              │ 120 BPM, 169 cue sounds  │   │ exported by the page │
                              └────────────┬─────────────┘   └──────────────────────┘
                                           ▼
                                 out/one-million-hellos.mp4
```

## Commands

```sh
npm install                                   # gsap, three, lottie-web, motion, esbuild, hyperframes, puppeteer-core
node build.mjs                                # → dist/one-million-hellos.html
node render.mjs --at=12,44.2,117              # review stills → out/stills/
node render.mjs --out=out/video.mp4           # full frame-by-frame render (also writes audio/cues.json)
.venv/bin/python -I audio/synth.py audio/cues.json   # → audio/soundtrack.wav
ffmpeg -i out/video.mp4 -i audio/soundtrack.wav -c:v copy -c:a aac -b:a 192k \
  -af loudnorm=I=-16:TP=-1.5 -shortest out/one-million-hellos.mp4
node build.mjs audio/soundtrack.m4a           # optional: embed the score so the HTML plays as a film
```

## Where each technique lives

| Technique | Where |
|---|---|
| GSAP 3.13+ (free plugins): SplitText, DrawSVG, MorphSVG, MotionPath, CustomEase | `src/main.js`: headline masks, grease-pencil rings, square→hash ring, message flight paths |
| Three.js | `src/sector.js`: sector chart with exactly 1,000,000 seeded points, four-step magnitude ramp |
| Scroll-driven CSS (`animation-timeline: view()` / `scroll()`) | Phone chat feed (S2) and the sources roll (S11); GSAP drives `scrollTop`, CSS does the rest |
| View Transitions | Counter strip morph into the HUD (7 s) and the monolith splitting into five roles (43.6 s); pseudo-element animations are paused and seeked per frame |
| Motion AI Kit | Docs queried over its MCP endpoint; `spring()` from `motion` generates the CSS `linear()` springs, reused as a GSAP CustomEase so CSS and JS share one motion signature |
| Lottie (LottieFiles principles) | `src/typing.js`: hand-authored typing-indicator Lottie, seeked frame-exactly |
| Emil Kowalski / Impeccable / frontend-design | Strong ease-out `cubic-bezier(.23,1,.32,1)`, blur-bridged seams, no scale-from-0, `docs/direction.md` art direction via Impeccable concept-seed |
| HyperFrames | Composition follows its contract (`data-composition-id`, paused timeline on `window.__timelines`); used for lint, snapshots and the technique probe. Its MP4 capture loop did not apply scroll offsets, so the final render uses `render.mjs` |

## Folder layout

| Path | What it is |
|---|---|
| `out/one-million-hellos.mp4` | The film: 1920×1080, 30 fps, 2:16, H.264 + AAC (Git LFS) |
| `out/one-million-hellos-h265.mp4` | Same film in H.265/HEVC, 82 MB (Git LFS) |
| `out/contact-sheet.jpg`, `out/render.log` | One frame every 6 s from the final MP4; the frame-by-frame render log |
| `dist/one-million-hellos.html` | The single self-contained animated HTML file, score embedded |
| `src/` | Film source: `index.html`, `main.js` (GSAP timeline), `sector.js` (Three.js), `typing.js` (Lottie), fonts, grain, credits |
| `build.mjs`, `render.mjs` | Bundler into one HTML file; headless-Chrome frame-by-frame renderer piping to ffmpeg |
| `audio/` | `synth.py` soundtrack synthesizer, `cues.json` exported from the timeline, `soundtrack.m4a` |
| `research/sources.md` | The 31 sources and the facts checked against each |
| `docs/direction.md`, `PRODUCT.md`, `.impeccable/` | Art direction (air-traffic-control strip board) chosen through Impeccable |
| `prototypes/` | HyperFrames composition and the early technique probe with its snapshots |
| `tools/` | Debug scripts used while probing HyperFrames' seek contract |
| `.mcp.json` | The Motion MCP endpoint used for the Motion AI Kit docs |

Not included: `node_modules/`, the Python `.venv/` (numpy only), the cloned skill repos, intermediate render masters and review stills.

## Skills used

Installed into `.claude/skills/` from these repositories (not vendored here; reinstall from source):

- Impeccable: https://github.com/pbakaus/impeccable
- frontend-design: https://github.com/anthropics/skills
- Emil Kowalski's skills: https://github.com/emilkowalski/skill
- GSAP skills: https://github.com/greensock/gsap-skills
- Motion AI Kit: https://github.com/motiondivision/ai-kit
- LottieFiles motion design: https://github.com/LottieFiles/motion-design-skill
- HyperFrames skills: https://github.com/heygen-com/hyperframes

`render.mjs` uses the Chrome binary at `$CHROME`; set it to any local Chrome or Chromium.
