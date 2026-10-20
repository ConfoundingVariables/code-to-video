#!/usr/bin/env python3
"""Produce cached narration, original score, and a synchronized master for film.json.

The pipeline intentionally keeps narration independent from the animation.  It measures
actual rendered narration WAVs first, then derives frame-aligned scene timing and renders
the score/mix from that timing.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import io
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import wave
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "audio"
OUTPUT_DIR = ROOT / "output"
CACHE_DIR = AUDIO_DIR / "cache"
RATE = 48_000
FPS = 30
MODEL = "gemini-2.5-flash-preview-tts"
ALTERNATE_MODELS = ("gemini-3.1-flash-tts-preview", "gemini-3.8-flash-tts")
VOICE = "Charon"
FALLBACK_VOICE = "Daniel"




def brief_error(exc: BaseException) -> str:
    """Return useful API/process diagnostics without ever exposing credentials."""
    msg = str(exc)
    msg = re.sub(r"AIza[0-9A-Za-z_-]{20,}", "[redacted]", msg)
    msg = re.sub(r"x-goog-api-key[=:][^, ]+", "x-goog-api-key=[redacted]", msg, flags=re.I)
    msg = " ".join(msg.split())
    return msg[:360]


def run_checked(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def wav_write(path: Path, audio: np.ndarray, rate: int = RATE) -> None:
    """Write clipped float32 mono or (samples, channels) audio as PCM16 WAV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = np.asarray(audio, dtype=np.float32)
    if arr.ndim == 1:
        channels = 1
    elif arr.ndim == 2:
        channels = arr.shape[1]
    else:
        raise ValueError(f"audio must be 1D or 2D, got shape {arr.shape}")
    pcm = np.clip(arr, -1.0, 1.0)
    pcm = np.rint(pcm * 32767.0).astype("<i2", copy=False)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm.tobytes())


def wav_read(path: Path) -> tuple[np.ndarray, int, int]:
    """Read PCM WAV into float32 [samples, channels], preserving measured rate."""
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        rate = wf.getframerate()
        width = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())
    if width == 1:
        values = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    elif width == 2:
        values = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 3:
        raw = np.frombuffer(frames, dtype=np.uint8).reshape(-1, 3)
        values = (
            raw[:, 0].astype(np.int32)
            | (raw[:, 1].astype(np.int32) << 8)
            | (raw[:, 2].astype(np.int32) << 16)
        )
        values = np.where(values & 0x800000, values - 0x1000000, values).astype(np.float32) / 8388608.0
    elif width == 4:
        values = np.frombuffer(frames, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"unsupported WAV sample width: {width}")
    if channels > 1:
        values = values.reshape(-1, channels)
    else:
        values = values.reshape(-1, 1)
    return values, rate, channels


def standardize_wav(source: Path, destination: Path) -> tuple[float, np.ndarray]:
    """Convert any TTS/fallback output to measured 48kHz mono PCM."""
    if source.suffix.lower() == ".wav":
        try:
            samples, source_rate, source_channels = wav_read(source)
            if source_rate == RATE and source_channels == 1:
                mono = samples[:, 0]
                wav_write(destination, mono)
                return len(mono) / RATE, mono
        except (wave.Error, ValueError):
            pass
    with tempfile.TemporaryDirectory(prefix="audio-convert-") as td:
        converted = Path(td) / "converted.wav"
        run_checked([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_s16le", str(converted),
        ])
        samples, source_rate, source_channels = wav_read(converted)
        if source_rate != RATE or source_channels != 1:
            raise RuntimeError("ffmpeg did not produce the required 48kHz mono WAV")
        mono = samples[:, 0]
        wav_write(destination, mono)
        return len(mono) / RATE, mono


def hash_for(text: str, backend: str, model: str = MODEL) -> str:
    identity = json.dumps(
        {"text": text, "backend": backend, "model": model, "voice": VOICE, "fallbackVoice": FALLBACK_VOICE},
        ensure_ascii=False,
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(identity).hexdigest()[:20]


def cache_paths(scene_id: str, text: str, backend: str, model: str = MODEL) -> tuple[Path, Path]:
    digest = hash_for(text, backend, model)
    stem = f"{scene_id}-{backend}-{digest}"
    return CACHE_DIR / f"{stem}.wav", CACHE_DIR / f"{stem}.json"


def load_cached(scene_id: str, text: str, backend: str, model: str = MODEL) -> tuple[Path, float] | None:
    wav_path, meta_path = cache_paths(scene_id, text, backend, model)
    if not wav_path.exists() or not meta_path.exists():
        return None
    try:
        metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        if metadata.get("text") != text or metadata.get("backend") != backend:
            return None
        samples, rate, channels = wav_read(wav_path)
        if rate != RATE or channels != 1 or len(samples) == 0:
            return None
        return wav_path, len(samples) / RATE
    except (OSError, ValueError, wave.Error, json.JSONDecodeError):
        return None


def save_cached(scene: dict[str, Any], backend: str, source: Path, model: str = MODEL) -> tuple[Path, float]:
    text = scene["narration"]
    wav_path, meta_path = cache_paths(scene["id"], text, backend, model)
    duration, _ = standardize_wav(source, wav_path)
    metadata = {
        "scene": scene["id"],
        "backend": backend,
        "model": model if backend.startswith("gemini") else None,
        "voice": VOICE if backend.startswith("gemini") else FALLBACK_VOICE,
        "text": text,
        "sha256": hashlib.sha256(wav_path.read_bytes()).hexdigest(),
        "sampleRate": RATE,
        "channels": 1,
        "duration": duration,
    }
    meta_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return wav_path, duration


def find_inline_audio(value: Any) -> tuple[str, bytes] | None:
    """Find Gemini's inlineData payload across camelCase/snake_case response variants."""
    if isinstance(value, dict):
        for key in ("inlineData", "inline_data"):
            item = value.get(key)
            if isinstance(item, dict) and isinstance(item.get("data"), str):
                mime = str(item.get("mimeType") or item.get("mime_type") or "audio/L16;rate=24000")
                return mime, base64.b64decode(item["data"])
        for item in value.values():
            found = find_inline_audio(item)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = find_inline_audio(item)
            if found:
                return found
    return None


def bytes_to_float(mime: str, payload: bytes) -> tuple[np.ndarray, int]:
    """Decode a Gemini PCM/WAV response to mono float32 plus source rate."""
    if payload[:4] == b"RIFF":
        with wave.open(io.BytesIO(payload), "rb") as wf:
            channels = wf.getnchannels()
            rate = wf.getframerate()
            width = wf.getsampwidth()
            raw = wf.readframes(wf.getnframes())
        if width != 2:
            raise ValueError(f"unsupported Gemini WAV width: {width}")
        values = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        if channels > 1:
            values = values.reshape(-1, channels).mean(axis=1)
        return values, rate
    rate_match = re.search(r"(?:rate|sample[_-]?rate)\s*=\s*(\d+)", mime, re.I)
    rate = int(rate_match.group(1)) if rate_match else 24_000
    channels_match = re.search(r"channels?\s*=\s*(\d+)", mime, re.I)
    channels = int(channels_match.group(1)) if channels_match else 1
    if "f32" in mime.lower() or "float" in mime.lower():
        values = np.frombuffer(payload, dtype="<f4").astype(np.float32)
    else:
        values = np.frombuffer(payload, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        values = values[: len(values) - (len(values) % channels)].reshape(-1, channels).mean(axis=1)
    return values, rate


def gemini_tts(text: str, api_key: str, model: str = MODEL) -> Path:
    """Call Gemini TTS over REST using only the x-goog-api-key header."""
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='')}:generateContent"
    request_body = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}},
        },
    }
    payload = json.dumps(request_body, ensure_ascii=False).encode("utf-8")
    command = [
        "curl", "--http1.1", "--silent", "--show-error", "--fail-with-body", "--max-time", "180",
        "-H", f"x-goog-api-key: {api_key}", "-H", "Content-Type: application/json",
        "--data-binary", "@-", endpoint,
    ]
    response = subprocess.run(command, input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if response.returncode != 0:
        detail = (response.stderr + response.stdout).decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"Gemini REST request failed: {detail[:360]}")
    try:
        parsed = json.loads(response.stdout.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Gemini REST response was not JSON") from exc
    found = find_inline_audio(parsed)
    if not found:
        raise RuntimeError("Gemini response contained no inline audio data")
    mime, audio_payload = found
    samples, rate = bytes_to_float(mime, audio_payload)
    if len(samples) < rate // 4:
        raise RuntimeError("Gemini returned an unexpectedly short audio response")
    handle = tempfile.NamedTemporaryFile(prefix="gemini-", suffix=".wav", delete=False)
    temp = Path(handle.name)
    handle.close()
    peak = max(1.0, float(np.max(np.abs(samples))))
    wav_write(temp, samples / peak, rate)
    return temp


def macos_say(text: str) -> Path:
    """Use the explicitly permitted audible fallback, retaining its provenance."""
    tempdir = tempfile.mkdtemp(prefix="say-")
    aiff = Path(tempdir) / "narration.aiff"
    run_checked(["/usr/bin/say", "-v", FALLBACK_VOICE, "-o", str(aiff), text])
    return aiff


def list_gemini_models(api_key: str) -> bool:
    """Check model visibility after a failed probe without ever printing response data."""
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models"
    command = [
        "curl", "--http1.1", "--silent", "--show-error", "--fail-with-body", "--max-time", "30",
        "-H", f"x-goog-api-key: {api_key}", endpoint,
    ]
    response = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if response.returncode != 0:
        return False
    try:
        parsed = json.loads(response.stdout.decode("utf-8"))
    except json.JSONDecodeError:
        return False
    names = {str(item.get("name", "")).split("/")[-1] for item in parsed.get("models", [])}
    return any(model in names for model in (MODEL, *ALTERNATE_MODELS))


def synthesize_scene(scene: dict[str, Any], preferred: str, api_key: str | None) -> dict[str, Any]:
    text = scene["narration"]
    scene_id = scene["id"]
    attempts: list[str] = []
    if preferred == "gemini" and api_key:
        for model in (MODEL, *ALTERNATE_MODELS):
            cache_backend = "gemini" if model == MODEL else model
            cached = load_cached(scene_id, text, cache_backend, model)
            if cached:
                return {"scene": scene_id, "path": str(cached[0]), "duration": cached[1], "backend": "gemini", "model": model, "cached": True, "apiAttempts": attempts}
            try:
                raw = gemini_tts(text, api_key, model)
                try:
                    path, duration = save_cached(scene, cache_backend, raw, model)
                finally:
                    raw.unlink(missing_ok=True)
                return {"scene": scene_id, "path": str(path), "duration": duration, "backend": "gemini", "model": model, "cached": False, "apiAttempts": attempts}
            except Exception as exc:
                detail = brief_error(exc)
                attempts.append(f"{model}: {detail}")
                print(f"Gemini {model} scene {scene_id} unavailable ({detail})", file=sys.stderr)
    cached = load_cached(scene_id, text, "say")
    if cached:
        return {"scene": scene_id, "path": str(cached[0]), "duration": cached[1], "backend": "macOS say Daniel", "model": None, "cached": True, "apiAttempts": attempts}
    raw = macos_say(text)
    try:
        path, duration = save_cached(scene, "say", raw, MODEL)
    finally:
        raw.unlink(missing_ok=True)
    return {"scene": scene_id, "path": str(path), "duration": duration, "backend": "macOS say Daniel", "model": None, "cached": False, "apiAttempts": attempts}


def build_timeline(film: dict[str, Any], results: dict[str, dict[str, Any]]) -> dict[str, Any]:
    frame_cursor = 0
    scenes: list[dict[str, Any]] = []
    for scene in film["scenes"]:
        duration = float(results[scene["id"]]["duration"])
        scene_frames = math.ceil(max(18.0, duration + 3.2) * FPS - 1e-9)
        start_frame = frame_cursor
        frame_cursor += scene_frames
        item = dict(scene)
        item.update({
            "start": start_frame / FPS,
            "duration": scene_frames / FPS,
            "narrationStart": (start_frame + round(1.1 * FPS)) / FPS,
            "narrationDuration": duration,
        })
        scenes.append(item)
    return {
        "duration": frame_cursor / FPS,
        "fps": FPS,
        "width": film["width"],
        "height": film["height"],
        "scenes": scenes,
    }


def equal_power_fade(length: int, fade_in: int, fade_out: int) -> np.ndarray:
    envelope = np.ones(length, dtype=np.float32)
    if fade_in > 0:
        x = np.linspace(0.0, 1.0, min(fade_in, length), dtype=np.float32)
        envelope[: len(x)] *= np.sin(x * np.pi / 2.0) ** 2
    if fade_out > 0:
        x = np.linspace(1.0, 0.0, min(fade_out, length), dtype=np.float32)
        envelope[-len(x):] *= np.sin(x * np.pi / 2.0) ** 2
    return envelope


def add_soft_pulse(buffer: np.ndarray, at: int, rate: int, amplitude: float, seed: int) -> None:
    """Add a short, rounded message/pulse cue without a harsh square/beep transient."""
    length = min(int(rate * 0.72), len(buffer) - at)
    if at < 0 or length <= 0:
        return
    t = np.arange(length, dtype=np.float32) / rate
    attack = np.minimum(t / 0.035, 1.0)
    release = np.minimum((0.72 - t) / 0.32, 1.0).clip(0.0, 1.0)
    env = attack * release * np.exp(-2.2 * t)
    base = 270.0 + 18.0 * (seed % 7)
    tone = np.sin(2.0 * np.pi * base * t + 0.15 * np.sin(2.0 * np.pi * 3.0 * t))
    overtone = 0.32 * np.sin(2.0 * np.pi * (base * 2.03) * t)
    pulse = amplitude * env * (tone + overtone)
    buffer[at:at + length] += pulse


def render_music(timeline: dict[str, Any]) -> np.ndarray:
    total_samples = int(round(timeline["duration"] * RATE))
    music = np.zeros((total_samples, 2), dtype=np.float32)
    roots = np.array([110.0, 123.47, 146.83, 164.81, 98.0, 130.81, 146.83, 116.54], dtype=np.float32)
    semitone = 2.0 ** (1.0 / 12.0)
    for index, scene in enumerate(timeline["scenes"]):
        start = int(round(scene["start"] * RATE))
        end = min(total_samples, int(round((scene["start"] + scene["duration"]) * RATE)))
        n = max(0, end - start)
        if n == 0:
            continue
        t = np.arange(n, dtype=np.float32) / RATE
        root = float(roots[index % len(roots)])
        # Slow, detuned sine pads establish a calm documentary bed.
        pad = (
            0.48 * np.sin(2.0 * np.pi * root * t)
            + 0.28 * np.sin(2.0 * np.pi * root * 1.502 * t + 0.4)
            + 0.20 * np.sin(2.0 * np.pi * root * 2.003 * t + 1.1)
        )
        pad *= 0.072 * (0.78 + 0.22 * np.sin(2.0 * np.pi * 0.075 * t + index * 0.7))
        # A gently legato four-note arpeggio gives the score a quiet electronic pulse.
        arp = np.zeros(n, dtype=np.float32)
        notes = (0, 4, 7, 11, 7, 4)
        note_len = 0.9
        for note_index in range(int(math.ceil((n / RATE) / note_len))):
            note_start = int(round(note_index * note_len * RATE))
            note_end = min(n, note_start + int(round(note_len * RATE)))
            if note_start >= n:
                break
            local = np.arange(note_end - note_start, dtype=np.float32) / RATE
            f = root * (semitone ** notes[(note_index + index) % len(notes)])
            # Long release and low amplitude avoid an intrusive repeated beep.
            env = np.minimum(local / 0.09, 1.0) * np.minimum((note_len - local) / 0.44, 1.0).clip(0.0, 1.0)
            env *= 0.027 * np.exp(-0.38 * local)
            arp[note_start:note_end] += env * np.sin(2.0 * np.pi * f * local)
        bed = pad + arp
        envelope = equal_power_fade(n, min(int(RATE * 2.6), n // 3), min(int(RATE * 2.8), n // 3))
        bed *= envelope
        # A minute stereo drift makes the synthetic bed feel wider without phase tricks.
        pan = 0.5 + 0.16 * np.sin(2.0 * np.pi * 0.035 * t + index)
        music[start:end, 0] += bed * (0.78 + 0.18 * (1.0 - pan))
        music[start:end, 1] += bed * (0.78 + 0.18 * pan)
        add_soft_pulse(music[:, 0], start + int(0.34 * RATE), RATE, 0.018, index)
        add_soft_pulse(music[:, 1], start + int(0.36 * RATE), RATE, 0.018, index + 1)
        narration_event = int(round(scene["narrationStart"] * RATE))
        add_soft_pulse(music[:, 0], narration_event, RATE, 0.010, index + 2)
        add_soft_pulse(music[:, 1], narration_event + int(0.018 * RATE), RATE, 0.010, index + 3)
    # Gentle ducking follows measured narration intervals, with short ramps at each edge.
    duck = np.ones(total_samples, dtype=np.float32)
    for scene in timeline["scenes"]:
        begin = int(round(scene["narrationStart"] * RATE))
        finish = min(total_samples, begin + int(round(scene["narrationDuration"] * RATE)))
        if finish <= begin:
            continue
        attack = min(int(0.34 * RATE), max(0, finish - begin))
        release = min(int(0.70 * RATE), max(0, finish - begin))
        if attack:
            duck[begin:begin + attack] = np.linspace(1.0, 0.24, attack, dtype=np.float32)
        sustain_end = max(begin + attack, finish - release)
        duck[begin + attack:sustain_end] = 0.24
        if release:
            duck[sustain_end:finish] = np.linspace(0.24, 1.0, finish - sustain_end, dtype=np.float32)
    music *= duck[:, None]
    return np.clip(music, -0.95, 0.95)


def render_narration(timeline: dict[str, Any], results: dict[str, dict[str, Any]]) -> np.ndarray:
    total_samples = int(round(timeline["duration"] * RATE))
    narration = np.zeros((total_samples, 2), dtype=np.float32)
    for scene in timeline["scenes"]:
        path = Path(results[scene["id"]]["path"])
        samples, rate, channels = wav_read(path)
        if rate != RATE or channels != 1:
            raise RuntimeError(f"cached narration is not 48kHz mono: {path}")
        start = int(round(scene["narrationStart"] * RATE))
        end = min(total_samples, start + len(samples))
        actual = samples[: max(0, end - start), 0]
        narration[start:end, 0] = actual
        narration[start:end, 1] = actual
    return narration


def srt_timestamp(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000.0))
    hours, rem = divmod(milliseconds, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def write_chapters(timeline: dict[str, Any]) -> Path:
    lines = [";FFMETADATA1", "title=ONE MILLION / Designing chat from first principles", "artist=Original audio production", ""]
    for scene in timeline["scenes"]:
        start = int(round(scene["start"] * 1000.0))
        end = int(round((scene["start"] + scene["duration"]) * 1000.0))
        title = f"{scene['chapter']} — {scene['title']}"
        lines.extend(["[CHAPTER]", "TIMEBASE=1/1000", f"START={start}", f"END={end}", f"title={title}", ""])
    path = OUTPUT_DIR / "chapters.ffmeta"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def write_captions(timeline: dict[str, Any]) -> Path:
    blocks: list[str] = []
    for number, scene in enumerate(timeline["scenes"], 1):
        begin = scene["narrationStart"]
        end = begin + scene["narrationDuration"]
        caption = "\n".join(textwrap.wrap(scene["narration"], width=68, break_long_words=False, break_on_hyphens=False))
        blocks.append(f"{number}\n{srt_timestamp(begin)} --> {srt_timestamp(end)}\n{caption}\n")
    path = OUTPUT_DIR / "captions.srt"
    path.write_text("\n".join(blocks), encoding="utf-8")
    return path


def ffprobe_duration(path: Path) -> float:
    result = run_checked([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path),
    ], capture=True)
    return float(result.stdout.strip())


def measure_loudnorm(path: Path) -> dict[str, str]:
    result = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-i", str(path),
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
            "-f", "null", "-",
        ], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
    )
    matches = re.findall(r"\{\s*\"input_i\".*?\}", result.stderr, flags=re.S)
    if not matches:
        return {}
    try:
        parsed = json.loads(matches[-1])
        return {key: str(parsed.get(key, "")) for key in ("input_i", "input_tp", "input_lra", "output_i", "output_tp")}
    except json.JSONDecodeError:
        return {}


def finalize_audio(music: np.ndarray, narration: np.ndarray, timeline: dict[str, Any]) -> dict[str, float]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    music_path = OUTPUT_DIR / "music.wav"
    narration_path = OUTPUT_DIR / "narration.wav"
    pre_master = OUTPUT_DIR / ".master-pre-loudnorm.wav"
    wav_write(music_path, music)
    wav_write(narration_path, narration)
    # Voice is kept forward but leaves enough headroom for the score and transient cues.
    mix = np.clip(music + narration * 0.82, -0.98, 0.98)
    wav_write(pre_master, mix)
    master_path = OUTPUT_DIR / "master.wav"
    run_checked([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(pre_master),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(RATE), "-ac", "2", "-c:a", "pcm_s16le", str(master_path),
    ])
    run_checked([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(master_path),
        "-codec:a", "libmp3lame", "-b:a", "192k", "-id3v2_version", "3", "-metadata", "title=ONE MILLION / Designing chat from first principles", str(OUTPUT_DIR / "master.mp3"),
    ])
    pre_master.unlink(missing_ok=True)
    return {name: ffprobe_duration(OUTPUT_DIR / name) for name in ("music.wav", "narration.wav", "master.wav", "master.mp3")}


def write_report(
    timeline: dict[str, Any],
    results: dict[str, dict[str, Any]],
    file_durations: dict[str, float],
    loudness: dict[str, str],
    api_probe: str,
) -> Path:
    backends: dict[str, int] = {}
    models: dict[str, int] = {}
    for result in results.values():
        backends[result["backend"]] = backends.get(result["backend"], 0) + 1
        model = result.get("model")
        if model:
            models[model] = models.get(model, 0) + 1
    lines = [
        "# Audio production report",
        "",
        f"- Gemini probe/API: {api_probe}",
        f"- Narration voice: {VOICE} for {backends.get('gemini', 0)} final Gemini scene(s); {FALLBACK_VOICE} for {backends.get('macOS say Daniel', 0)} fallback scene(s).",
        f"- Narration backends by scene: {', '.join(f'{key} × {value}' for key, value in backends.items())}",
        f"- Gemini models by scene: {', '.join(f'{key} × {value}' for key, value in models.items()) or 'none'}",
        f"- Timeline duration: {timeline['duration']:.3f}s ({int(round(timeline['duration'] * FPS))} frames at {FPS}fps)",
        "",
        "## Timing and synchronization",
        "",
        "Narration files were converted to 48kHz mono PCM and their frame counts were measured. Each scene starts at an integer 30fps frame; narration starts exactly 1.1s (33 frames) after that start. Scene duration is ceil(max(18s, measured narration duration + 3.2s) × 30) / 30. The score's pulse cues and ducking ramps use those measured narrationStart/narrationDuration values, and captions/chapter boundaries are generated from the same timeline.",
        "",
        "## Measured scene audio",
        "",
        "| Scene | Backend | Narration start | Narration duration | Scene duration | Cached WAV |",
        "|---|---|---:|---:|---:|---|",
    ]
    for scene in timeline["scenes"]:
        result = results[scene["id"]]
        lines.append(f"| {scene['id']} | {result['backend']} | {scene['narrationStart']:.3f}s | {scene['narrationDuration']:.3f}s | {scene['duration']:.3f}s | `{Path(result['path']).name}` |")
    lines.extend([
        "",
        "## Output files",
        "",
        "| File | Measured duration |",
        "|---|---:|",
    ])
    for name, duration in file_durations.items():
        lines.append(f"| `{name}` | {duration:.3f}s |")
    lines.extend([
        "",
        f"- Loudnorm measurement input integrated loudness: {loudness.get('input_i', 'unavailable')} LUFS; input true peak: {loudness.get('input_tp', 'unavailable')} dBTP.",
        "- Final master loudness measurement: integrated loudness and true peak are measured on the normalized master above; ffmpeg loudnorm targeted approximately -16 LUFS integrated and ≤ -1.5 dBTP.",
        "- `music.wav` is the original numpy-generated pad/arpeggio bed plus quiet timeline message/pulse cues, ducked under narration. No external music is used.",
    ])
    path = OUTPUT_DIR / "audio-report.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--film", type=Path, default=ROOT / "film.json")
    parser.add_argument("--workers", type=int, default=2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.workers < 1 or args.workers > 2:
        raise SystemExit("--workers must be between 1 and 2")
    film = json.loads(args.film.read_text(encoding="utf-8"))
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    api_key = os.environ.get("LLM_GEMINI_KEY", "").strip() or None
    if not api_key:
        print("LLM_GEMINI_KEY is not set; using macOS say Daniel for all narration", file=sys.stderr)
    results: dict[str, dict[str, Any]] = {}
    preferred = "gemini" if api_key else "say"
    api_probe = "not attempted (LLM_GEMINI_KEY missing)"

    # Probe the opening scene before fan-out, as a guard against model/quota failures.
    opening = film["scenes"][0]
    opening_result = synthesize_scene(opening, preferred, api_key)
    results[opening["id"]] = opening_result
    if opening_result["backend"] == "gemini":
        api_probe = "Gemini REST succeeded for opening scene"
    elif api_key:
        visible = list_gemini_models(api_key)
        api_probe = f"Gemini REST probe unusable; model listed by API: {'yes' if visible else 'no'}; used macOS say Daniel"
    else:
        api_probe = "not attempted (LLM_GEMINI_KEY missing); used macOS say Daniel"
    print(f"Probe {opening['id']}: {opening_result['backend']} {opening_result['duration']:.3f}s", file=sys.stderr)

    if opening_result["backend"] != "gemini":
        preferred = "say"
    remaining = film["scenes"][1:]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(synthesize_scene, scene, preferred, api_key): scene for scene in remaining}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results[result["scene"]] = result
            print(f"Narration {result['scene']}: {result['backend']} {result['duration']:.3f}s", file=sys.stderr)
    if len(results) != len(film["scenes"]):
        raise RuntimeError("not all scenes produced narration")

    backend_counts = {backend: sum(result["backend"] == backend for result in results.values()) for backend in {result["backend"] for result in results.values()}}
    attempt_notes = sorted({attempt for result in results.values() for attempt in result.get("apiAttempts", [])})
    if attempt_notes:
        api_probe = f"{api_probe}; observed candidate errors: {attempt_notes[0][:240]}"
    if api_key and backend_counts.get("macOS say Daniel", 0):
        api_probe = f"{api_probe}; {backend_counts.get('gemini', 0)} scene(s) used Gemini REST and {backend_counts['macOS say Daniel']} used macOS say Daniel after API quota/availability fallback"
    timeline = build_timeline(film, results)
    (OUTPUT_DIR / "timeline.json").write_text(json.dumps(timeline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_chapters(timeline)
    write_captions(timeline)
    music = render_music(timeline)
    narration = render_narration(timeline, results)
    file_durations = finalize_audio(music, narration, timeline)
    loudness = measure_loudnorm(OUTPUT_DIR / "master.wav")
    write_report(timeline, results, file_durations, loudness, api_probe)
    print(json.dumps({"timelineDuration": timeline["duration"], "files": file_durations, "loudness": loudness}, indent=2), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
