# Product

> Inferred from the user's brief, with no interview. Assumptions are labelled.

## What it is
"One Million Hellos": an explainer video (MP4, 1920×1080) on systems design from first principles. The case study is one chat application growing from one user to one million.

## Audience (assumption)
Engineers preparing for system-design interviews and developers who have built CRUD apps but have never scaled a real-time system. They know HTTP and databases, but not fan-out, sharding, or delivery semantics.

## Job
In about two minutes, the viewer should be able to retell the scaling path. Each bottleneck appears, gets named, and is answered by one structural change, and every claim is backed by a sourced number.

## Constraints
- One self-contained animated HTML file, rendered frame by frame with HyperFrames (headless Chrome + ffmpeg).
- The soundtrack is synthesized in Python from the same cue list that drives the visuals.
- No narration voice (assumption: no TTS/API key provided). Text on screen carries the story.
- The facts come from `research/sources.md`; nothing is invented.
