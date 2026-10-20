# Audio production report

- Gemini REST: opening probe succeeded. Six former Daniel scenes now use Gemini Charon (five gemini-3.1-flash-tts-preview caches and one gemini-2.5-flash-preview-tts retry). Primary 2.5 requests returned HTTP 429 with "You exceeded your current quota" while testing those scenes; all 15 scenes completed via Gemini.
- Narration voice: Charon (Gemini) in all 15 final scenes; no Daniel narration was delivered.
- Narration backends by scene: gemini × 15
- Gemini models by scene: gemini-2.5-flash-preview-tts × 10, gemini-3.1-flash-tts-preview × 5
- Timeline duration: 482.567s (14477 frames at 30fps)

## Timing and synchronization

Narration files were converted to 48kHz mono PCM and their frame counts were measured. Each scene starts at an integer 30fps frame; narration starts exactly 1.1s (33 frames) after that start. Scene duration is ceil(max(18s, measured narration duration + 3.2s) × 30) / 30. The score's pulse cues and ducking ramps use those measured narrationStart/narrationDuration values. Captions use one scene-level SRT cue per narration file, so cue boundaries are measured and synchronized but not sentence-level; captions/chapter boundaries are generated from the same timeline.

## Measured scene audio

| Scene | Backend | Narration start | Narration duration | Scene duration | Cached WAV |
|---|---|---:|---:|---:|---|
| opening | gemini | 1.100s | 22.651s | 25.867s | `opening-gemini-6f0236ba597f8580370e.wav` |
| promises | gemini | 26.967s | 25.531s | 28.733s | `promises-gemini-7c639a87f29c8485cd1a.wav` |
| workload | gemini | 55.700s | 27.051s | 30.267s | `workload-gemini-36737f75c154c8d86701.wav` |
| baseline | gemini | 85.967s | 26.011s | 29.233s | `baseline-gemini-f83dfb9f8558ad7bff11.wav` |
| durability | gemini | 115.200s | 28.051s | 31.267s | `durability-gemini-9e0e19794a69e72d2444.wav` |
| ordering | gemini | 146.467s | 26.771s | 30.000s | `ordering-gemini-b3fad020c00266759e36.wav` |
| gateways | gemini | 176.467s | 31.131s | 34.333s | `gateways-gemini-8292630f538d74bb96af.wav` |
| fanout | gemini | 210.800s | 30.331s | 33.533s | `fanout-gemini-2ae825a04c3c4044fa24.wav` |
| offline | gemini | 244.333s | 25.291s | 28.500s | `offline-gemini-b38060ae6ede396809bc.wav` |
| storage | gemini | 272.833s | 33.920s | 37.133s | `storage-gemini-3.1-flash-tts-preview-9f86fd258cbdcce1f4cc.wav` |
| ephemeral | gemini | 309.967s | 31.720s | 34.933s | `ephemeral-gemini-3.1-flash-tts-preview-34605d85c6f97e8c2376.wav` |
| overload | gemini | 344.900s | 30.320s | 33.533s | `overload-gemini-3.1-flash-tts-preview-feab355a8496564c1255.wav` |
| regions | gemini | 378.433s | 32.531s | 35.733s | `regions-gemini-7c99c10f0f11654b08f4.wav` |
| operate | gemini | 414.167s | 32.520s | 35.733s | `operate-gemini-3.1-flash-tts-preview-b4f86e6ae05b671580d7.wav` |
| closing | gemini | 449.900s | 30.560s | 33.767s | `closing-gemini-3.1-flash-tts-preview-50c49066f7f57cfe0122.wav` |

## Output files

| File | Measured duration |
|---|---:|
| `music.wav` | 482.567s |
| `narration.wav` | 482.567s |
| `master.wav` | 482.567s |
| `master.mp3` | 482.567s |

- Loudnorm measurement input integrated loudness: -16.66 LUFS; input true peak: -1.50 dBTP.
- Final master loudness measurement: integrated loudness and true peak are measured on the normalized master above; ffmpeg loudnorm targeted approximately -16 LUFS integrated and ≤ -1.5 dBTP.
- `music.wav` is the original numpy-generated pad/arpeggio bed plus quiet timeline message/pulse cues, ducked under narration. No external music is used.
