"""新术语试听：为一期旁白稿的每个新术语单独生成一小段音频，听完再决定读法。"""

import re
import shutil
from pathlib import Path
from typing import Any

from pixelbook.pronunciation import find_new_terms
from pixelbook.script import load_script
from pixelbook.tts import TtsEngine
from pixelbook.voice import Voice

# 文件名里不能用（或会造成麻烦）的字符，换成 `_`
_UNSAFE = re.compile(r'[/\\:*?"<>|\s]|^\.')


def file_stem(term: str) -> str:
    return _UNSAFE.sub("_", term)


def audition_terms(
    script_path: Path,
    pronunciation: dict[str, str],
    engine: TtsEngine,
    voice: Voice,
    out_dir: Path,
) -> list[dict[str, Any]]:
    """清空 `out_dir`，为每个新术语生成 `<术语>.wav`，返回术语、所在旁白句和文件。"""
    terms = find_new_terms(load_script(script_path), pronunciation)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    used: set[str] = set()
    results = []
    for term, lines in terms.items():
        stem = file_stem(term)
        name, n = stem, 1
        # 文件系统可能不区分大小写（macOS），按小写判断撞名
        while name.lower() in used:
            n += 1
            name = f"{stem}-{n}"
        used.add(name.lower())
        wav = out_dir / f"{name}.wav"
        engine.synthesize(term, voice, wav)
        results.append({"term": term, "lines": lines, "file": wav})
    return results
