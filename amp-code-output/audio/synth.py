"""Soundtrack for "One million hellos", synthesized from the film's own cue list.

The page exports every timed event (window.__cues) to audio/cues.json while
rendering; the music grid (120 BPM, 2 s bars) matches the scene boundaries.
"""
import json
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4

cfg = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "audio/cues.json"))
DUR = cfg["duration"]
CUES = cfg["cues"]
N = int(DUR * SR) + SR
rng = np.random.default_rng(1012)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
SCENES = [0, 8, 18, 32, 42, 54, 66, 80, 92, 102, 112, 122, 136]


def scene_at(t):
    return max(i for i, s in enumerate(SCENES[:-1]) if t >= s)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def add(buf, t0, x, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    if i >= N or len(x) == 0:
        return
    x = x[: N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(x), 0] += x * l * 1.414
    buf[i:i + len(x), 1] += x * r * 1.414


def env(n, a, r, sustain=None):
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na)
    if sustain is None:
        e[na:] = np.exp(-np.arange(n - na) / (r * SR))
    else:
        nr = max(1, int(r * SR))
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="high", fs=SR, output="sos"), x)


def noise(d):
    return rng.standard_normal(int(d * SR))


# ---------- instruments ----------

def pluck(m, d=0.9, bright=1.0):
    t = tt(d)
    f = hz(m)
    idx = 2.2 * bright * np.exp(-t / 0.12)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2 * f * t))
    return x * env(len(t), 0.003, 0.32)


def bell(m, d=2.5):
    t = tt(d)
    f = hz(m)
    x = np.sin(2 * np.pi * f * t + 3 * np.exp(-t / 0.6) * np.sin(2 * np.pi * 3.5 * f * t))
    return x * env(len(t), 0.002, 0.9)


def pad(notes, d, cutoff=1400, a=0.8):
    t = tt(d)
    x = np.zeros(len(t))
    for m in notes:
        for det in (-0.09, 0.0, 0.11):
            f = hz(m + det)
            for h in range(1, 7):
                x += np.sin(2 * np.pi * f * h * t + h * 1.7 + det * 9) / h
    x = lp(x, cutoff, 2)
    return x / (len(notes) * 6) * env(len(t), a, 0.9, sustain=True)


def bass(m, d):
    t = tt(d)
    x = np.sin(2 * np.pi * hz(m) * t) + 0.25 * np.sin(2 * np.pi * hz(m) * 2 * t)
    return np.tanh(1.6 * x) * env(len(t), 0.005, 0.12, sustain=True) * np.exp(-t / (d * 1.4))


def kick():
    t = tt(0.4)
    f = 45 + 95 * np.exp(-t / 0.035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    return x + 0.3 * hp(noise(0.4), 3000) * np.exp(-t / 0.004)


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    return hp(noise(d), 7000) * np.exp(-tt(d) / (0.05 if open_ else 0.012))


def clap():
    x = bp(noise(0.25), 900, 3200) * np.exp(-tt(0.25) / 0.06)
    t = tt(0.25)
    return x + 0.4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)


# ---------- harmony ----------
D = 50
PROG = [
    (38, [50, 53, 57, 60, 64]),   # Dm9
    (34, [46, 50, 53, 57, 62]),   # Bbmaj7
    (41, [53, 57, 60, 64, 65]),   # Fmaj7
    (36, [48, 52, 55, 62, 64]),   # Cadd9
]
TENSE = [(38, [50, 53, 57, 61]), (39, [51, 55, 58, 62])]
LIFT = (38, [50, 54, 57, 61, 64, 69])


def chord_at(bar, s):
    if s == 9:
        return TENSE[bar % 2]
    if s == 11 and bar >= 66:
        return LIFT
    return PROG[(bar // 2) % 4]


# ---------- music ----------
nbars = int(np.ceil(DUR / BAR))
for bar in range(nbars):
    t0 = bar * BAR
    s = scene_at(t0)
    root, notes = chord_at(bar, s)
    lvl = 0.1 + 0.04 * min(s, 8)
    cutoff = 700 + 260 * min(s, 10)
    if s == 9:
        cutoff = 900 + 500 * np.sin(bar)
    if s == 10:
        cutoff = 1200 + 300 * (t0 - 112)
    if bar % 2 == 0 or s == 9:
        d = BAR * (1 if s == 9 else 2) + 0.6
        p = pad(notes, d, cutoff=cutoff, a=0.6 if s else 1.5)
        add(music, t0, p, pan=-0.25, gain=lvl * 1.1)
        add(music, t0 + 0.013, p, pan=0.25, gain=lvl * 1.1)

    if s == 0:
        if bar % 2 == 0:
            add(music, t0 + 0.0, pluck(notes[0] + 12, 1.6), 0.1, 0.17)
    elif s in (1,):
        for b in range(0, 4, 2):
            add(music, t0 + b * BEAT, pluck(notes[(bar + b) % len(notes)] + 12, 1.2), 0.15, 0.15)
    elif s < 12:
        dens = 8 if s >= 5 else 4
        if s == 10:
            dens = 16 if t0 >= 116 else 8
        if s == 11:
            dens = 4 if t0 < 132 else 2
        step = BAR / dens
        for k in range(dens):
            m = notes[(k * 2 + bar) % len(notes)] + (12 if k % 4 < 2 else 24)
            if s == 9 and k % 3 == 2:
                continue
            add(music, t0 + k * step, pluck(m, 0.7, 0.8 + 0.3 * (k % 2)), 0.5 * np.sin(k * 1.3), 0.07 if s < 10 else 0.075)

    if 3 <= s <= 11 and not (s == 11 and t0 >= 130):
        pat = [0, 2] if s < 6 else [0, 1.5, 2, 3.5]
        if s == 9:
            pat = [0, 2.5]
        for b in pat:
            m = root if b in (0, 2) else root + 12
            add(music, t0 + b * BEAT, bass(m, BEAT * (0.9 if b in (0, 2) else 0.45)), 0, 0.1)

    if 4 <= s <= 10:
        kicks = [0, 2] if s in (4, 9) else [0, 1, 2, 3]
        if s == 10 and t0 < 116:
            kicks = [0]
        for b in kicks:
            add(music, t0 + b * BEAT, kick(), 0, 0.3)
    if 2 <= s <= 10:
        for k in range(8):
            if s == 2 and k % 2:
                continue
            add(music, t0 + k * BEAT / 2, hat(open_=(k % 4 == 2 and s >= 6)), 0.35 * (1 if k % 2 else -1), 0.05 if k % 2 else 0.07)
    if 6 <= s <= 8 or (s == 10 and t0 >= 116):
        for b in (1, 3):
            add(music, t0 + b * BEAT, clap(), 0.05, 0.16)

# ---------- sfx ----------

def sweep_noise(d, f0, f1, q=0.5):
    x = noise(d)
    out = np.zeros_like(x)
    seg = int(0.01 * SR)
    for i in range(0, len(x), seg):
        f = f0 * (f1 / f0) ** (i / len(x))
        lo, hi = f * (1 - q / 2), min(f * (1 + q / 2), SR / 2 - 100)
        out[i:i + seg] = bp(x[max(0, i - seg * 4):i + seg], lo, hi)[-len(x[i:i + seg]):]
    return out


def mixs(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[: len(x)] += x
    return out


def blip(f, d=0.05, shape=1.0):
    t = tt(d)
    return np.sin(2 * np.pi * f * t) * env(len(t), 0.002, d / 3) * shape


def tone_glide(f0, f1, d):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.004, d / 3)


SCALE = [74, 77, 79, 81, 84, 86, 89, 91]

for c in CUES:
    t, k = c["t"], c["k"]
    if k == "slot":
        n = len(tt(0.25))
        thunk = np.sin(2 * np.pi * np.cumsum(150 * np.exp(-tt(0.25) / 0.05) + 70) / SR) * np.exp(-tt(0.25) / 0.06)
        click = hp(noise(0.25), 2500) * np.exp(-tt(0.25) / 0.003)
        ring = bp(noise(0.25), 2300, 2600, 2) * np.exp(-tt(0.25) / 0.05)
        add(sfx, t, thunk * 0.8 + click * 0.5 + ring * 2.0, rng.uniform(-0.3, 0.3), 0.32)
    elif k == "key":
        add(sfx, t, mixs(hp(noise(0.03), 3000) * np.exp(-tt(0.03) / 0.004), blip(1800, 0.02, 0.3)), 0.3, 0.25)
    elif k == "send":
        add(sfx, t, tone_glide(420, 900, 0.09), 0.2, 0.22)
    elif k == "pop":
        add(sfx, t, mixs(tone_glide(620, 1150, 0.06), 0.3 * blip(2300, 0.03)), rng.uniform(-0.2, 0.4), 0.18)
    elif k in ("whoosh", "seam"):
        d = 0.55
        x = sweep_noise(d, 250, 2600 if k == "whoosh" else 1400, 0.8) * np.sin(np.pi * tt(d) / d) ** 2
        add(sfx, t, x, -0.2, 0.09 if k == "whoosh" else 0.06)
    elif k == "fly":
        d = 0.45
        x = sweep_noise(d, 500, 3200, 0.7) * np.sin(np.pi * tt(d) / d) ** 2
        add(sfx, t, x, 0.4, 0.08)
    elif k == "pencil":
        d = c.get("d", 0.6)
        tm = tt(d)
        strokes = 0.5 + 0.5 * np.sin(2 * np.pi * (11 + 4 * np.sin(tm * 7)) * tm) ** 2
        x = bp(noise(d), 1300, 3600, 2) * strokes * env(len(tm), 0.02, 0.06, sustain=True)
        add(sfx, t, x, 0.25, 0.32)
    elif k == "count":
        d = c.get("d", 3)
        tm = 0.0
        while tm < d:
            p = tm / d
            rate = 9 + 22 * np.sin(np.pi * p)
            add(sfx, t + tm, blip(2600 + 600 * p, 0.012, 0.6), rng.uniform(-0.5, 0.5), 0.05)
            tm += 1 / rate
        if c.get("big"):
            add(sfx, t, tone_glide(220, 440, d) * 0.5, 0, 0.05)
    elif k == "poll":
        add(sfx, t, mixs(blip(2100, 0.025), blip(1400, 0.02)), 0.5, 0.06)
    elif k == "frame":
        add(sfx, t, mixs(blip(1320, 0.035), 0.5 * blip(1980, 0.03)), -0.4, 0.07 if c.get("soft") else 0.12)
    elif k == "alarm":
        x = np.concatenate([np.sign(np.sin(2 * np.pi * 880 * tt(0.12))) * 0.3, np.sign(np.sin(2 * np.pi * 740 * tt(0.16))) * 0.3])
        x = lp(x, 3000) * env(len(x), 0.005, 0.1)
        add(sfx, t, x, 0, 0.13)
    elif k == "morph":
        d = 1.0
        x = mixs(sweep_noise(d, 180, 1800, 0.6) * np.sin(np.pi * tt(d) / d), 0.6 * tone_glide(110, 220, d))
        add(sfx, t, x, 0, 0.07 if c.get("soft") else 0.12)
    elif k == "bus":
        d = 0.9
        tm = tt(d)
        x = (np.sin(2 * np.pi * 110 * tm) + 0.5 * np.sin(2 * np.pi * 220 * tm) + 0.25 * np.sin(2 * np.pi * 330 * tm)) * np.sin(np.pi * tm / d)
        add(sfx, t, x, 0, 0.1)
    elif k == "fan":
        n = int(c.get("n", 1)) * 6
        for j in range(n):
            add(sfx, t + rng.uniform(0, 0.45), blip(hz(SCALE[j % len(SCALE)] + 12), 0.04), rng.uniform(-0.8, 0.8), 0.05)
    elif k == "scramble":
        d = c.get("d", 1.5)
        tm = 0.0
        while tm < d:
            add(sfx, t + tm, np.sign(np.sin(2 * np.pi * rng.choice([1600, 2000, 2400, 3200]) * tt(0.018))) * 0.3, rng.uniform(-0.6, 0.6), 0.04)
            tm += 1 / 30
    elif k == "bar":
        add(sfx, t, tone_glide(330 if c.get("lo") else 660, 180 if c.get("lo") else 520, 0.3), 0, 0.1)
    elif k == "sprinkle":
        for j in range(14):
            add(sfx, t + j * 0.03, blip(hz(SCALE[j % 8] + 12), 0.03), rng.uniform(-0.7, 0.7), 0.035)
    elif k == "tick":
        p = int(c.get("p", 0))
        f = hz(SCALE[p % 8] + (6 if c.get("alarm") else 0))
        add(sfx, t, mixs(blip(f, 0.08), 0.3 * blip(f * 2, 0.05)), -0.3 + 0.15 * p, 0.09)
    elif k == "typing":
        d = c.get("d", 1)
        tm = 0.0
        while tm < d:
            add(sfx, t + tm, blip(900, 0.03, 0.5), 0.3, 0.04)
            tm += 0.33
    elif k == "resolve":
        for j, m in enumerate([62, 66, 69, 74]):
            add(sfx, t + j * 0.04, bell(m, 2.0), -0.3 + 0.2 * j, 0.05)
    elif k == "push":
        add(sfx, t, bell(91, 1.4), 0.3, 0.09)
        add(sfx, t + 0.13, bell(96, 1.6), 0.3, 0.08)
    elif k == "rise":
        d = c.get("d", 7)
        tm = tt(d)
        x = mixs(sweep_noise(d, 300, 6000, 0.5) * (tm / d) ** 2, 0.4 * tone_glide(110, 440, d) * (tm / d))
        add(sfx, t, x, 0, 0.07)
    elif k == "million":
        tm = tt(3.5)
        sub = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-tm / 0.2)) / SR) * np.exp(-tm / 0.9)
        crash = hp(noise(3.5), 5000) * np.exp(-tm / 1.0)
        add(sfx, t, sub, 0, 0.55)
        add(sfx, t, crash, -0.3, 0.06)
        add(sfx, t + 0.01, crash, 0.3, 0.06)
        for j, m in enumerate([62, 66, 69, 73, 76, 81]):
            add(sfx, t + j * 0.035, bell(m, 3.5), -0.5 + 0.2 * j, 0.07)
    elif k == "end":
        for j, m in enumerate([50, 57, 62, 66, 69, 74]):
            add(sfx, t + j * 0.06, bell(m, 3.0), -0.5 + 0.2 * j, 0.06)


# ---------- reverb + master ----------
def reverb(x, seconds=2.4, mix=0.22):
    n = int(seconds * SR)
    ir_t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-ir_t / (seconds / 6.9))
        ir = lp(ir, 6000)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        out[:, ch] = signal.fftconvolve(x[:, ch], ir)[: len(x)]
    return x * (1 - mix) + out * mix * 1.4


mix = reverb(music, 2.6, 0.28) + reverb(sfx, 1.6, 0.16)
mix = hp(mix.T, 30).T
fade_in = int(0.05 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
end = int(DUR * SR)
tail = int(1.8 * SR)
mix[end - tail:end] *= np.linspace(1, 0, tail)[:, None] ** 1.5
mix = mix[:end]
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix *= 0.89 / np.max(np.abs(mix))

with wave.open("audio/soundtrack.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"audio/soundtrack.wav {DUR:.1f}s, {len(CUES)} cues")
