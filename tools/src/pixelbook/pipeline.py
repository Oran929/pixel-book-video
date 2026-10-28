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
from pixelbook.tts_cache import TtsCache
from pixelbook.verification import Verifier
from pixelbook.voice import Voice
from pixelbook.voice_lock import LOCK_NAME, lock_mismatch, lock_record, write_lock

MANIFEST_NAME = "episode.json"
# 检查报告：需要人看的问题（复核未通过的句子……），每次配音重写
REPORT_NAME = "report.json"
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
    verifier: Verifier,
    revoice: bool = False,
) -> dict[str, Any]:
    """为 `script_path` 这一期逐句配音，写出期目录里的合成清单并返回它。

    `voice` 是这本书解析出的音色（`voice_lock.resolve_book_voice`）。配音前守卫
    比较它和书的锁定音色，不一致就拒绝，除非 `revoice`；配音完成后写入锁定。
    朗读文本按读音表 `pronunciation` 生成（手写的 `speech` 优先）。

    每句配音经 `verifier` 的语音识别复核，和朗读文本对比；重试后仍不通过的
    句子照常使用，并列进期目录里的检查报告 `report.json`（每次运行都列出）。
    """
    script = load_script(script_path)
    if terms := find_new_terms(script, pronunciation):
        raise PipelineError(new_terms_message(script_path, terms))
    # 旁白稿在 books/<书>/<章>/<期>/script.yaml，配音缓存和锁定音色放在书的目录下
    book_dir = script_path.parents[2]
    try:
        locked = lock_record(voice)
        cache = TtsCache(book_dir / "cache" / "tts", engine, voice, verifier)
    except FileNotFoundError as error:
        raise PipelineError(f"参考音频 {error.filename} 不存在，无法配音") from error
    if not revoice and (differences := lock_mismatch(book_dir, locked)):
        raise PipelineError(voice_lock_message(script_path, book_dir, differences))

    segments, scenes, lines, failures = [], [], [], []
    wavs: dict[str, Path] = {}
    for segment in script.segments:
        segments.append({"id": segment.id, "title": segment.title})
        for scene in segment.scenes:
            scenes.append({"id": scene.id, "segment": segment.id})
            for line in scene.lines:
                spoken = spoken_text(line, pronunciation)
                cached = cache.line(spoken)
                wav = cached.wav
                if not (verification := cached.verification)["passed"]:
                    chosen = verification["attempts"][verification["chosen"]]
                    failures.append(
                        {
                            "id": line.id,
                            "text": line.text,
                            "spoken": spoken,
                            "heard": chosen["heard"],
                            "diff_rate": chosen["diff_rate"],
                            "cache": wav.relative_to(book_dir).as_posix(),
                        }
                    )
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

    manifest = {
        "voice_fingerprint": cache.voice_fingerprint,
        "segments": segments,
        "scenes": scenes,
        "lines": lines,
    }
    (script_path.parent / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )

    (script_path.parent / REPORT_NAME).write_text(
        json.dumps({"asr_failures": failures}, ensure_ascii=False, indent=2) + "\n"
    )

    stage = public_dir / STAGE_DIR
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for audio, wav in wavs.items():
        shutil.copyfile(wav, public_dir / audio)
    stage_episode(script_path.parent, public_dir)
    write_lock(book_dir, locked)
    return manifest


def new_terms_message(script_path: Path, terms: dict[str, list[str]]) -> str:
    listing = "\n".join(f"  {term}：{'、'.join(ids)}" for term, ids in terms.items())
    return (
        f"{script_path}: 有 {len(terms)} 个新术语不在读音表里，拒绝配音：\n"
        f"{listing}\n"
        f"先用 `pixelbook terms {script_path}` 试听，再把读法写进 pronunciation.yaml"
        "（读法不变就写成 `术语: 术语`），或者给所在旁白句手写 `speech`。"
    )


def voice_lock_message(
    script_path: Path, book_dir: Path, differences: list[str]
) -> str:
    listing = "\n".join(f"  {line}" for line in differences)
    return (
        f"{book_dir / LOCK_NAME}: 当前音色和这本书的锁定音色不一致，拒绝配音"
        f"（ADR-0005：一本书只用一种音色）：\n{listing}\n"
        "两个选项：\n"
        "  1. 改回原来的音色：把项目默认音色 voice.yaml、或书配置 book.yaml 的 "
        "`voice` 引用的音色文件改回锁定值（参考音频内容变了就换回原来的文件）；\n"
        f"  2. 整本书用新音色重新配音：`pixelbook voice {script_path} --revoice`，"
        "锁定会更新，这本书的其他期也要各自重新配音。"
    )


def stage_episode(episode_dir: Path, public_dir: Path) -> None:
    """把期目录里的 JSON（合成清单，以后还有分镜）复制到 Remotion 静态目录。"""
    manifest = episode_dir / MANIFEST_NAME
    if not manifest.is_file():
        raise PipelineError(f"{manifest} 不存在：先运行 `pixelbook voice` 配音")
    (public_dir / STAGE_DIR).mkdir(parents=True, exist_ok=True)
    for name in (MANIFEST_NAME,):
        shutil.copyfile(episode_dir / name, public_dir / STAGE_DIR / name)
