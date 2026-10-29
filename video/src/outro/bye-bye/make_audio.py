"""片尾音频：tianmei 片尾三句配音 + 8-bit 配乐（人声时压低）+ 音效。时间点读 src/timing.json。
用法：python3 audio/make_audio.py src/timing.json audio/voice out/outro-audio.wav
"""
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
T = json.load(open(sys.argv[1]))
VOICE_DIR = Path(sys.argv[2])
FPS = T["fps"]
DUR = T["total"] / FPS
N = int(DUR * SR) + SR
rng = np.random.default_rng(11)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
voice = np.zeros((N, 2))


def sec(f):
    return f / FPS


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    n, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((names[n] + (o - 4) * 12 - 9) / 12)


def tvec(d):
    return np.arange(int(d * SR)) / SR


def _phase(freq, d):
    n = int(d * SR)
    f = np.full(n, freq) if np.ndim(freq) == 0 else np.asarray(freq)[:n]
    return np.cumsum(f) / SR


def square(freq, d, duty=0.5):
    return np.where((_phase(freq, d) % 1) < duty, 1.0, -1.0)


def tri(freq, d):
    return 4 * np.abs((_phase(freq, d) % 1) - 0.5) - 1


def sine_sweep(f0, f1, d):
    return np.sin(2 * np.pi * _phase(np.geomspace(f0, f1, int(d * SR)), d))


def noise(d, step=1):
    n = int(d * SR)
    return np.repeat(rng.uniform(-1, 1, n // step + 1), step)[:n]


def env(d, a=0.002, decay=None):
    t = tvec(d)
    e = np.minimum(1, t / a) if a > 0 else np.ones_like(t)
    if decay:
        return e * np.exp(-t / decay)
    rel = min(0.01, d / 4)
    return e * np.clip((d - t) / rel, 0, 1)


def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    buf[i : i + len(sig), 0] += sig * (1 - max(0, pan))
    buf[i : i + len(sig), 1] += sig * (1 + min(0, pan))


def lowpass(x, k):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


def thump(f0=200, f1=50, d=0.15, decay=0.05):
    return sine_sweep(f0, f1, d) * env(d, a=0.0005, decay=decay)


# ---------------- 配音 ----------------
for n, line in enumerate(T["lines"], start=1):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(VOICE_DIR / f"outro-l{n:02d}.wav"), "-ar", str(SR), "-ac", "1", "-f", "s16le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    v = np.frombuffer(raw, dtype="<i2").astype(float) / 32768
    add(voice, sec(line["start"]), v, 1.0)
vpk = np.max(np.abs(voice))
voice *= 0.9 / vpk

# 人声包络 → 配乐压低
active = np.zeros(N)
for line in T["lines"]:
    a, b = int(sec(line["start"] - 3) * SR), int(sec(line["end"] + 4) * SR)
    active[a:b] = 1
duck = 1 - 0.6 * lowpass(active, 0.0008)

# ---------------- 配乐：C 大调轻快循环，到铺满为止 ----------------
BPM = 150
eighth = 60 / BPM / 2
bass = ["C3", "C3", "G2", "C3", "A2", "A2", "E2", "A2", "F2", "F2", "C3", "F2", "G2", "G2", "D3", "G2"]
lead = ["E5", "G5", "C6", "G5", "C5", "E5", "A5", "E5", "F5", "A5", "C6", "A5", "D5", "G5", "B5", "G5"]
t, k = 0.0, 0
end = sec(T["full"])
while t < end - 0.01:
    fade = min(1, t / 0.6)
    add(music, t, tri(note(bass[k % 16]), eighth * 0.9) * env(eighth * 0.9), 0.32 * fade)
    add(music, t, square(note(lead[k % 16]), eighth * 0.5, 0.125) * env(eighth * 0.5, decay=0.06), 0.08 * fade, 0.25)
    if k % 4 == 0:
        add(music, t, thump(150, 45, 0.12, 0.04), 0.4 * fade)
    if k % 4 == 2:
        add(music, t, noise(0.1, 2) * env(0.1, a=0.0005, decay=0.03), 0.16 * fade)
    add(music, t, noise(0.03) * env(0.03, a=0.0005, decay=0.006), 0.06 * fade, -0.3)
    t += eighth
    k += 1
# 冲刺段：加一层上行琶音
t = sec(T["dash"])
j = 0
while t < end:
    add(music, t, square(note(["C6", "E6", "G6", "C7"][j % 4]), 0.05, 0.25) * env(0.05, decay=0.03), 0.06, 0.3 * np.sin(j))
    t += 0.06
    j += 1
music *= duck[:, None]

# ---------------- 小人掉落 ----------------
jingles = [["C5", "G5"], ["E5", "B5"], ["G5", "D6"], ["C6", "G6"]]
pans = [-0.4, -0.13, 0.13, 0.4]
for i, f in enumerate(T["drops"]):
    fall = np.geomspace(2400, 500, int(sec(7) * SR))
    add(sfx, sec(f), square(fall, sec(7), 0.25) * env(sec(7)), 0.06, pans[i])
    land = sec(f + 7)
    add(sfx, land, thump(200, 50), 0.6, pans[i])
    add(sfx, land, noise(0.06, 3) * env(0.06, decay=0.015), 0.2, pans[i])
    for j, n in enumerate(jingles[i]):
        add(sfx, land + 0.05 + j * 0.07, square(note(n), 0.09) * env(0.09, decay=0.05), 0.12, pans[i])

# ---------------- 元素墙：低沉轰隆 + 每冒出一列一个方块音 ----------------
dw = sec(T["full"] - T["wallIn"])
rum = lowpass(noise(dw, 2), 0.03) * np.linspace(0.6, 1.4, int(dw * SR))
add(sfx, sec(T["wallIn"]), rum * env(dw, a=0.3), 0.5)
col_notes = ["C4", "E4", "G4", "A4", "C5", "D5", "E5", "G5"]
prev = 0


# 和 Outro.tsx 的 frontAt 同一个公式：前沿跨过 120 的整数倍时冒出一列
def front_at(f):
    if f < T["wallIn"]:
        return 0
    if f < T["dash"]:
        p = (f - T["wallIn"]) / (T["dash"] - T["wallIn"])
        return 640 * (1 - (1 - p) ** 2)
    p = min(1, (f - T["dash"]) / (T["full"] - T["dash"]))
    return 640 + 1280 * p * p


c = 0
for f10 in range(T["wallIn"] * 10, T["full"] * 10):
    f = f10 / 10
    if math.floor(front_at(f) / 120) > prev:
        prev = math.floor(front_at(f) / 120)
        add(sfx, sec(f), square(note(col_notes[c % 8]), 0.04, 0.25) * env(0.04, decay=0.02), 0.07, -0.6)
        add(sfx, sec(f), noise(0.03, 6) * env(0.03, decay=0.008), 0.08, -0.6)
        c += 1

# ---------------- 发现：头顶感叹号 ----------------
for i in range(4):
    t0 = sec(T["notice"] + i * 2)
    add(sfx, t0, square(note("A6"), 0.04, 0.25) * env(0.04), 0.07, pans[i])
    add(sfx, t0 + 0.045, square(note("E7"), 0.05, 0.25) * env(0.05, decay=0.03), 0.07, pans[i])

# ---------------- 奔跑脚步 ----------------
for f in range(T["run"], T["full"] - 4, 3):
    add(sfx, sec(f), noise(0.02, 2) * env(0.02, a=0.0005, decay=0.004), 0.08, 0.3 if (f // 3) % 2 else -0.3)

# ---------------- 冲刺 whoosh ----------------
dd = sec(T["full"] - T["dash"])
wh = lowpass(noise(dd), 0.15) * np.linspace(0.1, 1, int(dd * SR)) ** 2
add(sfx, sec(T["dash"]), wh, 0.5)

# ---------------- 铺满：撞击 ----------------
add(sfx, sec(T["full"]), thump(160, 35, 0.5, 0.18), 0.9)
add(sfx, sec(T["full"]), noise(0.8) * env(0.8, decay=0.22), 0.3)

# ---------------- 翻牌：一串快速咔哒，音高往上走 ----------------
for j in range(24):
    t0 = sec(T["flip"]) + j * sec(0.62)
    add(sfx, t0, square(900 + j * 60, 0.015, 0.25) * env(0.015), 0.07, -0.6 + j * 0.05)

# ---------------- BYE-BYE ----------------
tb = sec(T["bye"])
for o, n, d in [(0.0, "G5", 0.12), (0.14, "E5", 0.2), (0.42, "G5", 0.12), (0.56, "E5", 0.2), (0.84, "C5", 0.12), (0.98, "C6", 0.45)]:
    add(sfx, tb + o, square(note(n), d, 0.5) * env(d, decay=d * 0.7), 0.13, -0.1)
    add(sfx, tb + o, square(note(n) * 1.5, d, 0.25) * env(d, decay=d * 0.7), 0.05, 0.1)
held = sec(T["off"]) - tb
for n in ["C3", "G3", "E4"]:
    add(sfx, tb, tri(note(n), held) * env(held, a=0.01, decay=held * 0.6), 0.14)

# ---------------- CRT 关机 ----------------
doff = sec(T["total"] - T["off"])
add(sfx, sec(T["off"]), sine_sweep(3000, 200, doff) * env(doff), 0.16)
add(sfx, sec(T["total"] - 2), noise(0.04) * env(0.04, a=0.0005, decay=0.01), 0.35)

# ---------------- 混音 ----------------
bed = music + sfx
bed = np.tanh(bed * 1.1) / np.tanh(1.1)
bed *= 0.5 / max(1e-9, np.max(np.abs(bed)))
mix = voice + bed
out = mix[: int(DUR * SR)]
out = np.tanh(out * 1.1) / np.tanh(1.1)
out /= np.max(np.abs(out)) / 0.89
fade = int(0.01 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]
with wave.open(sys.argv[3], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("ok", len(out) / SR, "s")
