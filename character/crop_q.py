"""把 character/Q.png 的四个 Q 版角色裁成单独的透明底 PNG（占位用）。

背景：从图边缘出发，把与米色底相近的连通像素设为透明；脚下影子（灰褐色）只在底部带内去掉。
产品名标签在 y >= LABEL_TOP 的区域，整块丢掉。角色按连通块的水平位置分到四组。

一次性脚本，依赖不进项目，在仓库根目录运行：
    uv run --no-project --with pillow --with numpy --with scipy \
        python -I character/crop_q.py character/Q.png video/public/character
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

LABEL_TOP = 770
BG = np.array([254, 249, 237])
img = np.asarray(Image.open(src).convert("RGB")).astype(int)
h, w, _ = img.shape

dist_bg = np.abs(img - BG).max(axis=2)
r, g, b = img[..., 0], img[..., 1], img[..., 2]
# 影子：低饱和的灰褐色，只在脚下那一带
shadow = (
    (np.arange(h)[:, None] >= 700)
    & (r >= 165) & (r <= 225) & (r - b >= 10) & (r - b <= 50)
    & (g >= 145) & (g <= 205)
)
candidate = (dist_bg <= 28) | shadow
labels, _ = ndimage.label(candidate)
border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
border.discard(0)
background = np.isin(labels, list(border))
fg = ~background
fg[LABEL_TOP:] = False
# 去掉抗锯齿留下的零星像素
fg = ndimage.binary_opening(fg, iterations=1)

comp, n = ndimage.label(fg)
slices = ndimage.find_objects(comp)
sizes = ndimage.sum(fg, comp, range(1, n + 1))
SPLITS = [0, 420, 800, 1235, w]
NAMES = ["q-1-dragon", "q-2-reader", "q-3-whale", "q-4-gothic"]
groups = {i: np.zeros_like(fg) for i in range(4)}
for i, (sl, size) in enumerate(zip(slices, sizes), start=1):
    if size < 30:
        continue
    cx = (sl[1].start + sl[1].stop) / 2
    k = next(j for j in range(4) if SPLITS[j] <= cx < SPLITS[j + 1])
    groups[k] |= comp == i

rgba = np.dstack([img, np.zeros((h, w), dtype=int)]).astype(np.uint8)
for k, mask in groups.items():
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    piece = rgba[y0:y1, x0:x1].copy()
    piece[..., 3] = np.where(mask[y0:y1, x0:x1], 255, 0)
    Image.fromarray(piece, "RGBA").save(out_dir / f"{NAMES[k]}.png", optimize=True)
    print(NAMES[k], (x0, y0, x1, y1), piece.shape[1], "x", piece.shape[0])
