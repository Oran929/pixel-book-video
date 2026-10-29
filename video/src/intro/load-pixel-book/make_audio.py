"""片头 8-bit 音效 + 配乐：方波/三角波/噪声合成，时间点读 src/timing.json，与画面同帧对齐。
用法：python3 audio/make_audio.py src/timing.json out/intro-audio.wav
"""
import json
import sys
import wave

import numpy as np

SR = 44100
T = json.load(open(sys.argv[1]))
FPS = T["fps"]
DUR = T["total"] / FPS
N = int(DUR * SR) + SR
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def sec(frame):
    return frame / FPS


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    n, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((names[n] + (o - 4) * 12 - 9) / 12)


def tvec(d):
    return np.arange(int(d * SR)) / SR


def square(freq, d, duty=0.5):
    t = tvec(d)
    f = np.broadcast_to(freq, t.shape) if np.ndim(freq) else np.full(t.shape, freq)
    ph = np.cumsum(f) / SR
    return np.where((ph % 1) < duty, 1.0, -1.0)


def tri(freq, d):
    t = tvec(d)
    f = np.broadcast_to(freq, t.shape) if np.ndim(freq) else np.full(t.shape, freq)
    ph = np.cumsum(f) / SR
    return 4 * np.abs((ph % 1) - 0.5) - 1


def noise(d, step=1):
    n = int(d * SR)
    x = rng.uniform(-1, 1, n // step + 1)
    return np.repeat(x, step)[:n]


def env(d, a=0.002, decay=None, sustain=1.0):
    t = tvec(d)
    e = np.minimum(1, t / a) if a > 0 else np.ones_like(t)
    if decay:
        e = e * np.exp(-t / decay)
    else:
        rel = min(0.01, d / 4)
        e = e * np.clip((d - t) / rel, 0, 1) * sustain
    return e


def add(start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * (1 - max(0, pan))
    R[i : i + len(sig)] += sig * (1 + min(0, pan))


def lowpass(x, k):
    # 简单一阶低通
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


# ---------------- 1. CRT 嗡声（开场到切场） ----------------
d = sec(T["scene"])
hum = 0.5 * np.sin(2 * np.pi * 60 * tvec(d)) + 0.25 * np.sin(2 * np.pi * 120 * tvec(d)) + 0.15 * noise(d, 4)
hum *= np.clip(tvec(d) / 0.4, 0, 1)
add(0, hum, 0.05)
# 光标闪烁时的极轻滴答
for f in range(0, T["keys"][0], 24):
    add(sec(f), square(1760, 0.02) * env(0.02, decay=0.006), 0.06)

# ---------------- 2. 敲键盘 ----------------
def crisp_click(d=0.025, ping=4000, decay=0.0025):
    x = noise(d)
    x = np.diff(np.diff(x, prepend=0), prepend=0)  # 两次差分 = 高通，去掉闷的低频
    x = x / np.max(np.abs(x))
    p = np.sin(2 * np.pi * ping * tvec(d))
    return (x * 0.8 + p * 0.5) * env(d, a=0.0002, decay=decay)


for i, k in enumerate(T["keys"]):
    pan = rng.uniform(-0.3, 0.3)
    g = rng.uniform(0.5, 0.75)
    add(sec(k), crisp_click(ping=rng.uniform(3500, 5200)), g, pan)
    add(sec(k), np.sin(2 * np.pi * rng.uniform(900, 1200) * tvec(0.02)) * env(0.02, a=0.0002, decay=0.004), g * 0.25, pan)
    add(sec(k) + rng.uniform(0.04, 0.06), crisp_click(0.015, rng.uniform(5000, 6500), 0.0015), g * 0.4, pan)
# 回车：更重
add(sec(T["enter"]), crisp_click(0.04, 3000, 0.005), 1.0)
add(sec(T["enter"]), np.sin(2 * np.pi * 700 * tvec(0.04)) * env(0.04, a=0.0002, decay=0.008), 0.35)
add(sec(T["enter"]) + 0.07, crisp_click(0.02, 4500, 0.002), 0.45)
# 读盘数据声：快速随机方波音高
t0 = sec(T["enter"] + 3)
step = 0.022
for j in range(int((sec(T["shake"]) - t0) / step)):
    add(t0 + j * step, square(rng.choice([800, 1200, 1600, 2400, 600]), step) * env(step), 0.07)

# ---------------- 3. 震屏：爆炸 + 下坠音 + 故障噪声 ----------------
ts = sec(T["shake"])
dboom = 0.9
boom = lowpass(noise(dboom), 0.08) * env(dboom, a=0.001, decay=0.25) * 3
add(ts, boom, 0.9)
fdrop = np.geomspace(260, 35, int(0.6 * SR))
add(ts, square(fdrop, 0.6) * env(0.6, decay=0.25), 0.35)
for j in range(6):
    add(ts + j * 0.07, noise(0.05, step=rng.integers(8, 40)) * env(0.05), 0.25, rng.uniform(-0.6, 0.6))

# ---------------- 4. 进场 power-up + 配乐 ----------------
tsc = sec(T["scene"])
for j, n in enumerate(["C4", "E4", "G4", "C5", "E5", "G5", "C6"]):
    add(tsc + j * 0.03, square(note(n), 0.05, 0.25) * env(0.05), 0.18)

BPM = 150
beat = 60 / BPM
eighth = beat / 2
music_start = tsc
music_end = sec(T["flash"])
bass_pat = ["A2", "A2", "A3", "A2", "F2", "F2", "F3", "F2", "G2", "G2", "G3", "G2", "E2", "E2", "E3", "G2"]
lead_pat = ["A4", "C5", "E5", "A5", "F4", "A4", "C5", "F5", "G4", "B4", "D5", "G5", "E4", "G#4", "B4", "E5"]
k = 0
t = music_start
while t < music_end - 0.01:
    fade = np.clip((music_end - t) / 1.2, 0.25, 1)
    b = bass_pat[k % 16]
    add(t, tri(note(b), eighth * 0.9) * env(eighth * 0.9), 0.32 * fade)
    add(t, square(note(lead_pat[k % 16]), eighth * 0.5, 0.125) * env(eighth * 0.5, decay=0.06), 0.09 * fade, 0.25)
    # 鼓：底鼓 / 军鼓 / 踩镲
    if k % 4 == 0:
        add(t, np.sin(2 * np.pi * np.cumsum(np.geomspace(150, 45, int(0.12 * SR))) / SR) * env(0.12, a=0.0005, decay=0.04), 0.5 * fade)
    if k % 4 == 2:
        add(t, noise(0.1, step=2) * env(0.1, a=0.0005, decay=0.03), 0.22 * fade)
    add(t, noise(0.03) * env(0.03, a=0.0005, decay=0.006), 0.07 * fade, -0.3)
    k += 1
    t += eighth

# 角色下落哨音 + 落地音 + 登场小旋律（每人音高递升）
jingles = [["C5", "G5"], ["E5", "B5"], ["G5", "D6"], ["C6", "G6", "C7"]]
pans = [-0.5, -0.17, 0.17, 0.5]
for i, c in enumerate(T["chars"]):
    t0 = sec(c)
    fall = np.geomspace(2400, 500, int(sec(7) * SR))
    add(t0, square(fall, sec(7), 0.25) * env(sec(7)), 0.07, pans[i])
    land = sec(c + 7)
    add(land, np.sin(2 * np.pi * np.cumsum(np.geomspace(200, 50, int(0.15 * SR))) / SR) * env(0.15, a=0.0005, decay=0.05), 0.7, pans[i])
    add(land, noise(0.06, step=3) * env(0.06, decay=0.015), 0.25, pans[i])
    for j, n in enumerate(jingles[i]):
        add(land + 0.05 + j * 0.07, square(note(n), 0.09, 0.5) * env(0.09, decay=0.05), 0.16, pans[i])

# ---------------- 5. 书放大发光：上升音 + 闪烁琶音 + 白闪 ----------------
tf = sec(T["focus"])
dfo = sec(T["flash"] - T["focus"])
rise = np.geomspace(120, 1800, int(dfo * SR)) * (1 + 0.02 * np.sin(2 * np.pi * 9 * tvec(dfo)))
add(tf, square(rise, dfo, 0.25) * np.linspace(0.2, 1, int(dfo * SR)), 0.12)
add(tf, tri(rise / 2, dfo) * np.linspace(0.2, 1, int(dfo * SR)), 0.2)
arp = ["A5", "C6", "E6", "A6", "E6", "C6"]
t = tf
j = 0
while t < sec(T["flash"]):
    p = (t - tf) / dfo
    dn = 0.09 - 0.06 * p
    add(t, square(note(arp[j % 6]), dn * 0.8, 0.125) * env(dn * 0.8, decay=0.04), 0.06 + 0.06 * p, 0.3 * np.sin(j))
    t += dn
    j += 1
# 白闪：大镲
add(sec(T["flash"]) - 0.05, noise(1.2) * env(1.2, a=0.002, decay=0.35), 0.35)
add(sec(T["flash"]) - 0.05, np.sin(2 * np.pi * np.cumsum(np.geomspace(120, 40, int(0.3 * SR))) / SR) * env(0.3, decay=0.1), 0.8)

# ---------------- 6. 街机快切：每一刀一个音效 ----------------
ta = sec(T["arcade"])
cut = sec(T["cut"])
for i in range(8):
    t0 = ta + i * cut
    kick = np.sin(2 * np.pi * np.cumsum(np.geomspace(180, 50, int(0.1 * SR))) / SR) * env(0.1, a=0.0005, decay=0.035)
    add(t0, kick, 0.6)
    add(t0, noise(0.04, step=2) * env(0.04, decay=0.01), 0.15)
    if i == 0:  # 投币
        add(t0, square(note("B5"), 0.05) * env(0.05), 0.15)
        add(t0 + 0.05, square(note("E6"), 0.11) * env(0.11, decay=0.06), 0.15)
    elif i == 1:  # 计分
        for j in range(5):
            add(t0 + j * 0.03, square(1500 + j * 200, 0.02) * env(0.02), 0.1)
    elif i == 2:  # 心
        for j, n in enumerate(["C5", "E5", "G5"]):
            add(t0 + j * 0.045, tri(note(n), 0.06) * env(0.06), 0.35)
    elif i == 3:  # 怪物摇摆
        wob = 300 + 120 * np.sin(2 * np.pi * 30 * tvec(cut))
        add(t0, square(wob, cut, 0.5) * env(cut, decay=0.08), 0.12)
    elif i == 4:  # 升级
        for j, n in enumerate(["G5", "C6", "E6", "G6"]):
            add(t0 + j * 0.035, square(note(n), 0.05, 0.25) * env(0.05), 0.13)
    elif i == 5:  # 按键
        add(t0, square(220, 0.04) * env(0.04, decay=0.015), 0.2)
        add(t0 + 0.07, square(440, 0.04) * env(0.04, decay=0.015), 0.2)
    elif i == 6:  # 连击
        add(t0, square(np.geomspace(600, 2400, int(cut * SR)), cut, 0.125) * env(cut), 0.1)
    else:  # READY?
        add(t0, square(note("A5"), cut * 0.9, 0.5) * env(cut * 0.9), 0.14)

# ---------------- 7. 标题：字母落地 + 胜利号角 ----------------
tt = sec(T["title"])
add(tt, noise(0.5) * env(0.5, decay=0.15), 0.25)
scale = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5"]
for i in range(10):
    land = sec(T["title"] + 4 + i * 2 + 5)
    add(land, np.sin(2 * np.pi * np.cumsum(np.geomspace(160, 60, int(0.08 * SR))) / SR) * env(0.08, a=0.0005, decay=0.03), 0.4)
    add(land, square(note(scale[i]), 0.06, 0.25) * env(0.06, decay=0.04), 0.1)
all_in = sec(T["title"] + 4 + 9 * 2 + 5)
add(all_in, noise(1.5) * env(1.5, a=0.002, decay=0.45), 0.3)
add(all_in, np.sin(2 * np.pi * np.cumsum(np.geomspace(140, 40, int(0.4 * SR))) / SR) * env(0.4, decay=0.15), 0.9)
fan = [("C5", 0.0, 0.1), ("E5", 0.1, 0.1), ("G5", 0.2, 0.1), ("C6", 0.3, 0.5)]
for n, o, dd in fan:
    add(all_in + o, square(note(n), dd, 0.5) * env(dd, decay=dd * 0.8 if dd > 0.2 else None), 0.14, -0.15)
    add(all_in + o, square(note(n) * 1.5, dd, 0.25) * env(dd, decay=dd * 0.8 if dd > 0.2 else None), 0.07, 0.15)
# 收尾和弦（持续到关机）
held = sec(T["off"]) - (all_in + 0.3)
for n in ["C4", "E4", "G4"]:
    add(all_in + 0.3, tri(note(n), held) * env(held, a=0.01, decay=held * 0.7), 0.16)
add(all_in + 0.3, tri(note("C2"), held) * env(held, a=0.005, decay=held * 0.6), 0.4)
# PRESS START 闪烁滴
for f in range(T["title"] + 27 + 15, T["cursorIn"], 16):
    add(sec(f), square(note("E6"), 0.03, 0.25) * env(0.03), 0.04)

# ---------------- 鼠标：悬停 + 点击 + 开始游戏 ----------------
add(sec(T["hover"]), square(note("A6"), 0.03, 0.25) * env(0.03), 0.08)
add(sec(T["click"]), crisp_click(0.02, 2600, 0.0025), 0.9)
add(sec(T["click"]) + 0.065, crisp_click(0.015, 3400, 0.0018), 0.5)
for j, n in enumerate(["C6", "E6", "G6", "C7", "E7", "G7"]):
    add(sec(T["click"] + 2) + j * 0.035, square(note(n), 0.05, 0.25) * env(0.05), 0.12)

# ---------------- 8. CRT 关机 ----------------
toff = sec(T["off"])
doff = sec(T["total"] - T["off"])
add(toff, np.sin(2 * np.pi * np.cumsum(np.geomspace(3000, 200, int(doff * SR))) / SR) * env(doff), 0.18)
add(sec(T["total"] - 2), noise(0.04) * env(0.04, a=0.0005, decay=0.01), 0.4)

# ---------------- 母带 ----------------
out = np.stack([L, R], axis=1)[: int(DUR * SR)]
out = np.tanh(out * 1.2) / np.tanh(1.2)
out /= np.max(np.abs(out)) / 0.89
fade = int(0.01 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("ok", out.shape[0] / SR, "s")
