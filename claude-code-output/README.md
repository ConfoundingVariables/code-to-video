# A million hellos — Claude Code output

A 2:24 motion-design explainer on scaling a chat app to 1,000,000 people, from first principles.
1920×1080, 60 fps. Every frame is rendered from one HTML file; the soundtrack is synthesized from the same timeline.

- `out/a-million-hellos.mp4`: the film (H.264 + AAC, −15 LUFS; stored with Git LFS)
- `dist/a-million-hellos.html`: the single self-contained animated file (fonts, GSAP, Three.js, soundtrack inlined). Open it and press Play.
- `out/cues.json`: every audio cue and music section, exported from the animation timeline
- `out/soundtrack.m4a`: the synthesized soundtrack

## Rebuild

Requires Node, pnpm/npm, Python 3 with numpy + scipy, and ffmpeg.

```bash
pnpm install
npx playwright install chromium-headless-shell
./make.sh
```

`make.sh` builds the HTML, renders 8,652 frames in headless Chromium (6 workers), synthesizes the soundtrack from `out/cues.json`, and muxes the MP4. About 3 minutes on an Apple Silicon Mac.

## How it works

- `src/core.js`: one paused GSAP master timeline is the only clock. `seek(t)` drives GSAP, Three.js, scroll positions (and with them the CSS scroll-driven animations), and View Transitions: they are started for real, then every `::view-transition-*` animation is paused and its `currentTime` set from `t`.
- `src/world.js`: Three.js scene with 1,000,000 seeded points, message comets, and the 3D architecture finale.
- `src/scenes.js`: ten scenes on a 120 BPM grid (1 bar = 2 s); each registers its audio cues next to the animation it accompanies.
- `render/render.mjs`: Playwright + GPU headless Chromium; workers seek and screenshot their frame ranges and pipe PNGs into ffmpeg.
- `audio/synth.py`: numpy/scipy synth (pads, sub, drums, arpeggio, sound effects) driven by `cues.json`.

Art direction: a transit map. Enamel paper, ink, and one MTA line colour per layer (red messages, blue connections, green storage, yellow log, purple presence). Type is Barlow (SIL Open Font License), self-hosted.
