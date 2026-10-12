# Verified delivery — Signal / One million

## Finished artifact

| Property | Observed value |
|---|---|
| File | `output/one-million-chat.mp4` |
| Size | 45,968,198 bytes |
| Video | H.264 High, 1920 × 1080, yuv420p, limited-range BT.709 |
| Frame rate / count | 30 fps / 14,477 frames |
| Video duration | 482.566667 seconds |
| Audio | AAC, stereo, 48 kHz, approximately 192 kb/s |
| Audio duration | 482.566667 seconds |
| Chapters | 15, covering the complete timeline |
| Encoded-audio loudness | −16.68 LUFS integrated / −1.53 dBTP |
| Original PCM-master loudness | −16.66 LUFS integrated / −1.50 dBTP |
| Single HTML master | `film.html`, 16,971,169 bytes; JavaScript, fonts, mixed audio and licenses embedded |

## Commands actually exercised

1. `node production/render.mjs`: captured every exact `frame / 30` timestamp in four independent chunks; encoded and muxed all 14,477 frames. This is not a real-time screen recording.
2. `node production/verify.mjs --input output/one-million-chat-final.mp4`: passed on the final chapter-corrected assembly, with all 14,477 frames and matching audio duration. That verified file was renamed, without changing its contents, to `output/one-million-chat.mp4`.
3. `ffmpeg -v error -i <verified MP4> -f null -`: decoded the entire video and audio with no reported errors.
4. `ffprobe`: confirmed the frame count, 30/1 rate, H.264/AAC streams, dimensions, pixel format, color range, matching audio/video duration and all 15 chapter markers.
5. `ffmpeg ... -af loudnorm=...:print_format=json`: measured the delivered AAC stream at −16.68 LUFS / −1.53 dBTP. No additional normalization pass was written over the finished file.
6. ffmpeg decoded representative frames at 12, 138, 265 and 471 seconds. The final early-replay frame at 251 seconds was separately decoded and visually inspected: the progress bar correctly showed about 10% while the cursor remained 1041.

The permanent renderer was corrected at the source: `-pix_fmt yuv420p` alone had preserved the browser JPEG's full-range flag. A one-frame before/after probe produced `yuvj420p / pc / bt470bg` before, and `yuv420p / tv / bt709` after actual conversion. The corrected browser-render smoke produced exactly 60 standard-range frames over two seconds. The existing complete frame-render was color-converted at high quality for delivery, preserving the frame count and copying the already synchronized AAC audio. The checker was not weakened to hide the failure.

The final native-scroll correction removed Playwright's `animations: disabled`, which had fast-forwarded the CSS replay bar during capture. The 855-frame history chapter (frames 7297–8151) was re-rendered with seeked animations preserved, spliced at exact frame boundaries, and the complete assembly re-verified and decoded. Source/HTML timing and the copied AAC soundtrack were unchanged.

## Browser and playback proof

- Final HTML: embedded audio readyState 4, loaded fonts, 15 scenes, no console errors during tested play/pause, chapter navigation, transcript display and native scroll replay.
- Native replay: the progress animation's timeline was observed as `ScrollTimeline`. Scroll offsets 72 → 408 changed its scale 0.176471 → 1 and the contiguous cursor 1042 → 1047.
- Deterministic reverse/out-of-order seeking: byte-identical screenshots after leaving and returning to the Three.js opening, Lottie durable-commit scene and CSS-scroll replay scene.
- All 15 final chapter compositions were captured and reviewed as `output/storyboard.jpg`.
- Offline local-file playback: direct Chromium opened `file:///.../film.html`, with all external requests blocked. Playback advanced and paused, with zero external requests and zero page errors.
- Reduced motion / mobile: at 390 × 844 the stage fit the 390px width; the 3D canvas remained byte-identical between seeks; the player reported reduced-motion viewing.
- Final delivered MP4 in direct Chromium: successfully sought to 138, 251, 265 and 471 seconds, then played past 472 seconds. Observed duration 482.567s, 1920 × 1080, and no media error.
- The preview server's byte-range support was exercised against the actual MP4: `bytes=0-1023` and `bytes=-1024` returned 206 with exactly 1024 bytes and correct Content-Range; an offset at EOF returned 416.

The media checks also sought the HTML at 19 representative timestamps, including every chapter start and the last video frame. These observations are smoke/production verification, not implementation-text tests.

## Sound and source fidelity

All 15 delivered narration scenes are real Gemini **Charon** audio: ten `gemini-2.5-flash-preview-tts`, five `gemini-3.1-flash-tts-preview`. An observed per-model quota error was resolved using the other supported model; no macOS voice remains in the delivered film. Each measured scene begins on a 30fps frame, with speech starting 33 frames later. Python-synthesized music, accents and ducking share those measured timestamps.

Opening, storage-arithmetic and closing audio samples were independently transcribed from the actual narration WAV and matched the intended text. The score is original synthesized audio, not stock music. The SRT is explicitly a chapter-level transcript, not word-accurate forced alignment.

Research includes 28 numbered first-party source entries and separates model assumptions from source-owned claims. Skill sources, pinned revisions and license boundaries are retained in `SKILLS.md`; runtime/font notices are embedded in the single HTML and in `THIRD_PARTY_LICENSES.txt`. API credentials are not part of the delivery.
