#!/bin/sh
# Whole pipeline: build -> render frames -> synthesize soundtrack from the same cues -> mux.
set -e
cd "$(dirname "$0")"
node render/build.mjs
node render/render.mjs dist/a-million-hellos.html out/video-silent.mp4 --fps 60 --workers 6
python3 -I audio/synth.py out/cues.json out/soundtrack-raw.wav
ffmpeg -loglevel error -y -i out/soundtrack-raw.wav -af "volume=4.5dB,alimiter=limit=0.84:attack=4:release=90:level=false" -ar 48000 out/soundtrack.wav
ffmpeg -loglevel error -y -i out/soundtrack.wav -c:a aac -b:a 128k out/soundtrack.m4a
ffmpeg -loglevel error -y -i out/video-silent.mp4 -i out/soundtrack.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart -metadata title="A million hellos: scaling a chat app from first principles" out/a-million-hellos.mp4
node render/build.mjs   # re-inline, now with the soundtrack embedded for live playback
echo "done: out/a-million-hellos.mp4, dist/a-million-hellos.html"
