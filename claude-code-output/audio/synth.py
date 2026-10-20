"""Soundtrack synthesized from the video's own timeline.

Reads cues.json (exported by render.mjs straight from the page's GSAP master
timeline): music `section` cues set chord / energy, every other cue fires a
sound effect at its exact frame time. Output: 48 kHz stereo WAV.

usage: python3 -I audio/synth.py out/cues.json out/soundtrack.wav
"""
import json
import sys

import numpy as np
from scipy import signal

SR = 48000
BPM = 120.0
BEAT = 60.0 / BPM
rng = np.random.default_rng(7)

NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def midi(name):  # "D3" -> 50
    return NOTE[name[:-1]] + 12 * (int(name[-1]) + 1)


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(n - a - d - r, 0)
    e = np.concatenate([np.linspace(0, 1, a, endpoint=False), np.linspace(1, s, d, endpoint=False),
                        np.full(sus, s), np.linspace(s, 0, r)])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


def saw_additive(f, n, harmonics=24, phase=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        if f * k > SR * 0.4:
            break
        out += np.sin(2 * np.pi * f * k * t + phase * k) / k
    return out * 0.55


# ---------------------------------------------------------------- instruments
def pad_voice(freqs, n, cutoff):
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.11, 0.0, 0.13):  # detune in semitones
            out += saw_additive(f * 2 ** (det / 12), n, phase=rng.uniform(0, 6.28))
    return hp(lp(out / (len(freqs) * 3), cutoff, 2), 110, 2)  # leave the low end to the sub


def kick(level=1.0):
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 44 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 11)
    click = hp(rng.standard_normal(n), 2500) * np.exp(-t * 400) * 0.25
    return (body + click) * level


def hat(level=1.0, decay=60):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000, 4) * np.exp(-t * decay) * level


def snap(level=1.0):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000) * np.exp(-t * 22)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    return (noise * 0.8 + tone * 0.4) * level


def pluck(f, dur=0.5, level=1.0, bright=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 2 * t) * (2.5 * bright) * np.exp(-t * 9)
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 6.5)
    return x * env_adsr(n, 0.003, 0.05, 0.8, 0.05) * level


def bell(f, dur=2.2, level=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 3.0 * np.exp(-t * 2.2)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.4) * level


def sub(f, dur, level=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.tanh(1.1 * np.sin(2 * np.pi * f * t)) * env_adsr(n, 0.02, 0.2, 0.6, 0.15) * level


# ------------------------------------------------------------------ sfx bank
def sfx_send(p):  # bubble pop: fast upward glide + click (anticipation -> release)
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    f = 520 + 900 * (1 - np.exp(-t * 40))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18)
    return x * 0.5 * p.get("gain", 1)


def sfx_msg(p):  # tiny delivery tick, pitched to the current chord
    f = p.get("freq", 1200)
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 60) * 0.22 * p.get("gain", 1)


def sfx_whoosh(p):
    d = p.get("dur", 0.7)
    n = int(d * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    hop = 512  # time-varying bandpass via short blocks with overlap-add
    win = np.hanning(hop * 2)
    for i in range(0, n - hop * 2, hop):
        c = 300 + 5000 * np.sin(np.pi * (i / n)) ** 2
        blk = bp(noise[i:i + hop * 2], c * 0.6, c * 1.6, 1) * win
        out[i:i + hop * 2] += blk
    return out * np.sin(np.pi * t / d) ** 2 * 0.35 * p.get("gain", 1)


def sfx_riser(p):
    d = p.get("dur", 1.6)
    n = int(d * SR)
    t = np.arange(n) / SR
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 1400 * (t / d) ** 2) / SR)
    noise = hp(rng.standard_normal(n), 3000) * 0.4
    return (sweep * 0.12 + noise * 0.08) * (t / d) ** 3 * p.get("gain", 1) * 0.6


def sfx_impact(p):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(30 + 80 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.8)
    crunch = lp(rng.standard_normal(n), 1800) * np.exp(-t * 9) * 0.5
    return (boom + crunch) * 0.7 * p.get("gain", 1)


def sfx_error(p):  # overload buzz: detuned tritone, rough
    n = int(p.get("dur", 0.5) * SR)
    t = np.arange(n) / SR
    x = np.sign(np.sin(2 * np.pi * 98 * t)) + np.sign(np.sin(2 * np.pi * 139 * t))
    return lp(x, 1400) * env_adsr(n, 0.005, 0.1, 0.6, 0.15) * 0.16 * p.get("gain", 1)


def sfx_tick(p):
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4000) * np.exp(-t * 300) * 0.25 * p.get("gain", 1)


def sfx_type(p):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    f = rng.uniform(1800, 2600)
    return (bp(rng.standard_normal(n), f * 0.7, f * 1.4) * np.exp(-t * 140)) * 0.35 * p.get("gain", 1)


def sfx_chime(p):
    f = p.get("freq", hz(81))
    return (bell(f, 2.5, 0.25) + bell(f * 1.5, 2.5, 0.12)) * p.get("gain", 1)


def sfx_click(p):
    n = int(0.02 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 3000 * t) * np.exp(-t * 400) * 0.25 * p.get("gain", 1)


def sfx_glitch(p):
    n = int(p.get("dur", 0.25) * SR)
    x = np.repeat(rng.standard_normal(n // 200 + 1), 200)[:n]
    return bp(x, 400, 6000) * 0.25 * p.get("gain", 1)


SFX = {"send": sfx_send, "msg": sfx_msg, "whoosh": sfx_whoosh, "riser": sfx_riser, "impact": sfx_impact,
       "error": sfx_error, "tick": sfx_tick, "type": sfx_type, "chime": sfx_chime, "click": sfx_click,
       "glitch": sfx_glitch}

CHORDS = {  # voicings (pad) ; root for sub
    "Dm9": ["D3", "F3", "A3", "C4", "E4"], "Bbmaj7": ["A#2", "D3", "F3", "A3", "D4"],
    "Fmaj9": ["F2", "A3", "C4", "E4", "G4"], "Csus": ["C3", "G3", "C4", "D4", "G4"],
    "Gm9": ["G2", "A#3", "D4", "F4", "A4"], "Am7": ["A2", "E3", "G3", "C4", "E4"],
    "Ebmaj7#11": ["D#3", "G3", "A#3", "D4", "A4"], "Dsus": ["D3", "A3", "D4", "E4", "A4"],
}


def place(buf, x, t, pan=0.0):
    i = int(round(t * SR))
    if i >= buf.shape[1] or i + len(x) <= 0:
        return
    if i < 0:
        x, i = x[-i:], 0
    x = x[: buf.shape[1] - i]
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(x)] += x * gl * 1.41
    buf[1, i:i + len(x)] += x * gr * 1.41


def reverb_ir(dur=2.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t * 2.6)
    ir[:, : int(0.012 * SR)] = 0
    return np.stack([lp(ir[0], 6000), lp(ir[1], 5500)]) * 0.04


def main(cues_path, out_path):
    meta = json.load(open(cues_path))
    dur = meta["duration"] + 1.5
    N = int(dur * SR)
    music, drums, fx, send = (np.zeros((2, N)) for _ in range(4))
    sections = sorted([c for c in meta["cues"] if c["type"] == "section"], key=lambda c: c["t"])
    sections.append({"t": dur, "type": "section", "chord": "Dsus", "energy": 0})

    # ---- music bed: one pad segment per section, 1.2 s crossfades
    for a, b in zip(sections, sections[1:]):
        ch = CHORDS[a["chord"]]
        e = a.get("energy", 0.5)
        t0, t1 = a["t"], b["t"]
        n = int((t1 - t0 + 1.2) * SR)
        voice = pad_voice([hz(midi(x)) for x in ch], n, 500 + 2600 * e)
        fade = env_adsr(n, 1.2, 0.0, 1.0, 1.2)
        pad = voice * fade * (0.20 + 0.10 * e)
        place(music, pad * 0.9, t0 - 0.6, -0.25)
        place(music, np.roll(pad, 700) * 0.9, t0 - 0.6, 0.25)
        root = hz(midi(ch[0])) / 2 if midi(ch[0]) > 45 else hz(midi(ch[0]))
        # rhythm grid in this section, locked to the 120 BPM grid
        beat0 = int(np.ceil(t0 / BEAT))
        for k in range(beat0, int(t1 / BEAT)):
            tb = k * BEAT
            if a.get("drums", e >= 0.45):
                if k % 4 == 0 or (e > 0.75 and k % 4 == 2 and k % 8 == 6):
                    place(drums, kick(0.55), tb)
                if k % 4 == 2 and e > 0.6:
                    place(drums, snap(0.35), tb, 0.1)
                place(drums, hat(0.12 + 0.1 * e), tb + BEAT / 2, 0.35)
                if e > 0.7:
                    place(drums, hat(0.06, 120), tb + BEAT / 4, -0.35)
            if k % 2 == 0 and e >= 0.3:
                place(music, sub(root, BEAT * 1.8, 0.09 + 0.05 * e), tb)
            if a.get("arp", e >= 0.55):  # 8th-note arpeggio up the voicing
                notes = [midi(x) + 12 for x in ch]
                for j in range(2):
                    m = notes[(k * 2 + j) % len(notes)]
                    place(music, pluck(hz(m), 0.45, 0.07 + 0.05 * e), tb + j * BEAT / 2, 0.5 * np.sin(k + j))

    # ---- sound effects at exact cue times
    cur = sections[0]
    for c in sorted(meta["cues"], key=lambda c: c["t"]):
        if c["type"] == "section":
            cur = c
            continue
        p = dict(c)
        if c["type"] == "msg" and "freq" not in p:
            ch = CHORDS[cur["chord"]]
            p["freq"] = hz(midi(ch[int(rng.integers(len(ch)))]) + 24)
        x = SFX[c["type"]](p)
        place(fx, x, c["t"] - c.get("lead", 0), c.get("pan", rng.uniform(-0.4, 0.4)))
        place(send, x * 0.6, c["t"] - c.get("lead", 0))

    # ---- sidechain: pads/sub duck under each kick
    duck = np.ones(N)
    env = 1 - 0.55 * np.exp(-np.arange(int(0.3 * SR)) / SR * 14)
    for k in range(int(dur / BEAT)):
        i = int(k * BEAT * SR)
        if np.abs(drums[0, i:i + 200]).max(initial=0) > 0.3:
            seg = duck[i:i + len(env)]
            duck[i:i + len(env)] = np.minimum(seg, env[: len(seg)])
    music *= duck

    ir = reverb_ir()
    wet = np.stack([signal.fftconvolve(music[0] + send[0], ir[0])[:N], signal.fftconvolve(music[1] + send[1], ir[1])[:N]])
    mix = music * 0.75 + drums * 0.6 + fx * 1.0 + wet * 0.7
    mix = hp(mix, 28)
    mix = mix / np.abs(mix).max() * 1.2
    mix = np.where(np.abs(mix) > 0.8, np.sign(mix) * (0.8 + 0.2 * np.tanh((np.abs(mix) - 0.8) / 0.2)), mix)  # soft-knee only on peaks
    fade_out = np.ones(N)
    fo = int(2.0 * SR)
    fade_out[N - fo:] = np.linspace(1, 0, fo) ** 2
    mix *= fade_out
    mix = mix / np.abs(mix).max() * 10 ** (-1.0 / 20)
    pcm = (mix.T * 32767).astype(np.int16)
    from scipy.io import wavfile
    wavfile.write(out_path, SR, pcm)
    print(f"{out_path}: {dur:.1f}s, {len(meta['cues'])} cues, {len(sections) - 1} sections")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
