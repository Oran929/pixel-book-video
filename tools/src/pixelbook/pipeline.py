"""配音流水线：一期旁白稿 → 每句 wav → 合成清单（ADR-0004）。

对外只有 `voice_episode` 一个入口，TTS 引擎作为适配器传入。
"""

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from pixelbook.audio import wav_seconds
from pixelbook.pronunciation import find_new_terms, spoken_text
from pixelbook.script import load_script
from pixelbook.tts import TtsEngine
from pixelbook.voice import Voice

MANIFEST_NAME = "episode.json"
# Remotion 静态目录（video/public/）里存放本期文件的子目录
STAGE_DIR = "episode"


class PipelineError(Exception):
    pass


def voice_episode(
    script_path: Path,
    engine: TtsEngine,
    voice: Voice,
    public_dir: Path,
    pronunciation: dict[str, str],
) -> dict[str, Any]:
    """为 `script_path` 这一期逐句配音，写出期目录里的合成清单并返回它。

    朗读文本按读音表 `pronunciation` 生成（手写的 `speech` 优先）。
    """
    script = load_script(script_path)
    if terms := find_new_terms(script, pronunciation):
        raise PipelineError(new_terms_message(script_path, terms))
    # 旁白稿在 books/<书>/<章>/<期>/script.yaml；03 还没有缓存，按旁白句 ID 命名
    tts_dir = script_path.parents[2] / "cache" / "tts"
    tts_dir.mkdir(parents=True, exist_ok=True)

    segments, scenes, lines = [], [], []
    wavs: dict[str, Path] = {}
    for segment in script.segments:
        segments.append({"id": segment.id, "title": segment.title})
        for scene in segment.scenes:
            scenes.append({"id": scene.id, "segment": segment.id})
            for line in scene.lines:
                wav = tts_dir / f"{line.id}.wav"
                engine.synthesize(spoken_text(line, pronunciation), voice, wav)
                # 文件名带内容哈希：内容变了，Studio 就不会播放浏览器缓存里的旧音频
                digest = hashlib.sha256(wav.read_bytes()).hexdigest()[:8]
                audio = f"{STAGE_DIR}/{line.id}-{digest}.wav"
                wavs[audio] = wav
                lines.append(
                    {
                        "id": line.id,
                        "scene": scene.id,
                        "text": line.text,
                        "audio": audio,
                        "seconds": wav_seconds(wav),
                    }
                )

    manifest = {"segments": segments, "scenes": scenes, "lines": lines}
    (script_path.parent / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )

    stage = public_dir / STAGE_DIR
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for audio, wav in wavs.items():
        shutil.copyfile(wav, public_dir / audio)
    stage_episode(script_path.parent, public_dir)
    return manifest


def new_terms_message(script_path: Path, terms: dict[str, list[str]]) -> str:
    listing = "\n".join(f"  {term}：{'、'.join(ids)}" for term, ids in terms.items())
    return (
        f"{script_path}: 有 {len(terms)} 个新术语不在读音表里，拒绝配音：\n"
        f"{listing}\n"
        f"先用 `pixelbook terms {script_path}` 试听，再把读法写进 pronunciation.yaml"
        "（读法不变就写成 `术语: 术语`），或者给所在旁白句手写 `speech`。"
    )


def stage_episode(episode_dir: Path, public_dir: Path) -> None:
    """把期目录里的 JSON（合成清单，以后还有分镜）复制到 Remotion 静态目录。"""
    manifest = episode_dir / MANIFEST_NAME
    if not manifest.is_file():
        raise PipelineError(f"{manifest} 不存在：先运行 `pixelbook voice` 配音")
    (public_dir / STAGE_DIR).mkdir(parents=True, exist_ok=True)
    for name in (MANIFEST_NAME,):
        shutil.copyfile(episode_dir / name, public_dir / STAGE_DIR / name)
