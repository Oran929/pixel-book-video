"""按句配音缓存（ADR-0005、ADR-0006）。

每句配音存成 `<缓存目录>/<指纹>.wav`，旁边的 `<指纹>.json` 记录生成信息。
指纹 = 朗读文本 + 音色指纹；音色指纹 = 规范化后的音色设置 + 引擎自身的设置。
缓存只是加速手段：删掉之后，流水线能完整重建。
"""

import hashlib
import json
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.tts import SynthesisStats, TtsEngine
from pixelbook.verification import Attempt, Verification, Verifier
from pixelbook.voice import Voice

# 每次生成都可能不同、但不改变"这是哪一句、用什么音色"的参数，不进指纹。
# 07 重试时换种子，通过的那一版仍然存在同一个指纹下。
UNFINGERPRINTED_PARAMS = {"seed"}


def _digest(data: Any) -> str:
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def voice_fingerprint(voice: Voice, engine: TtsEngine) -> str:
    """音色指纹：模型、音色来源、生成参数，加上引擎自身的设置。

    参考音频按文件内容算指纹（路径不算），所以同一路径换了内容也会换指纹。
    参考音频不存在时抛 `FileNotFoundError`。
    """
    return _digest(_settings(voice, engine))


def _settings(voice: Voice, engine: TtsEngine) -> dict[str, Any]:
    return {"voice": normalized_voice(voice), "engine": engine.settings}


def normalized_voice(voice: Voice) -> dict[str, Any]:
    """音色设置的规范化形式：参考音频换成内容的 sha256，去掉不进指纹的参数。"""
    ref_audio = None
    if voice.ref_audio:
        # `ref_audio` 相对仓库根目录；绝对路径接在后面仍是它自己
        content = (REPO_ROOT / voice.ref_audio).read_bytes()
        ref_audio = hashlib.sha256(content).hexdigest()
    return {
        "model": voice.model,
        "speaker": voice.speaker,
        "instruct": voice.instruct,
        "ref_audio_sha256": ref_audio,
        "ref_text": voice.ref_text,
        "params": {
            k: v for k, v in voice.params.items() if k not in UNFINGERPRINTED_PARAMS
        },
    }


@dataclass(frozen=True)
class CachedLine:
    wav: Path
    verification: Verification


class TtsCache:
    def __init__(
        self, directory: Path, engine: TtsEngine, voice: Voice, verifier: Verifier
    ) -> None:
        self.directory = directory
        self.engine = engine
        self.voice = voice
        self.verifier = verifier
        self._settings = _settings(voice, engine)
        self.voice_fingerprint = _digest(self._settings)

    def line(self, text: str) -> CachedLine:
        """返回朗读 `text` 的 wav 和它的复核结果；缓存里没有时才生成并复核。

        每一版都先生成到临时文件、经语音识别复核；不通过就重新生成，最多重试
        `max_retries` 次。通过的那一版写入缓存；都不通过时，缓存差异率最低的
        一版并标记"复核未通过"。之后命中缓存的句子不再生成，也不再识别。
        `<指纹>.json` 最后写出，有它（且带复核结果）才算缓存命中。
        """
        key = _digest({"text": text, "voice": self.voice_fingerprint})
        wav = self.directory / f"{key}.wav"
        info = self.directory / f"{key}.json"
        if wav.is_file() and info.is_file():
            record = json.loads(info.read_text())
            # 票 07 之前写的缓存没有复核结果，当作没有缓存
            if "verification" in record:
                return CachedLine(wav, Verification.from_record(record["verification"]))
        self.directory.mkdir(parents=True, exist_ok=True)

        takes: list[Path] = []
        stats: list[SynthesisStats] = []
        attempts: list[Attempt] = []
        try:
            for attempt in range(1 + self.verifier.max_retries):
                takes.append(_temp_path(wav))
                voice = _reseeded(self.voice, attempt)
                stats.append(self.engine.synthesize(text, voice, takes[-1]))
                heard = self.verifier.asr.transcribe(takes[-1])
                attempts.append(self.verifier.check(text, heard))
                if attempts[-1].passed_by:
                    break
            chosen = len(attempts) - 1
            if not attempts[chosen].passed_by:
                # 都不通过（每版都算了拼音）：选拼音差异率最低的一版，再比字符差异率
                chosen = min(
                    range(len(attempts)),
                    key=lambda i: (
                        attempts[i].pinyin_diff_rate,
                        attempts[i].diff_rate,
                    ),
                )
            takes[chosen].replace(wav)
        finally:
            for tmp in takes:
                tmp.unlink(missing_ok=True)
        verification = Verification(
            passed=attempts[chosen].passed_by is not None,
            chosen=chosen,
            attempts=attempts,
            max_diff_rate=self.verifier.max_diff_rate,
            asr=self.verifier.asr.settings,
        )

        record = {
            "text": text,
            "voice_fingerprint": self.voice_fingerprint,
            **self._settings,
            # 选中那一版的生成耗时；`total_elapsed_seconds` 含所有重试
            "elapsed_seconds": stats[chosen].elapsed_seconds,
            "total_elapsed_seconds": sum(s.elapsed_seconds for s in stats),
            "peak_memory_bytes": max(s.peak_memory_bytes for s in stats),
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "verification": verification.to_record(),
        }
        with _staged(info) as tmp:
            tmp.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
        return CachedLine(wav, verification)


def _reseeded(voice: Voice, attempt: int) -> Voice:
    """第 `attempt` 次重试用的音色：固定了随机种子时换一个种子，保证可能得到不同的音频。

    没有固定种子时每次采样本来就是随机的，原样返回。
    """
    seed = voice.params.get("seed")
    if attempt == 0 or seed is None:
        return voice
    return replace(voice, params={**voice.params, "seed": seed + attempt})


def _temp_path(target: Path) -> Path:
    """同目录下的临时文件，保留原扩展名（音频库按扩展名决定格式），以 `.` 开头。"""
    fd, name = tempfile.mkstemp(
        dir=target.parent, prefix=f".{target.stem}-", suffix=target.suffix
    )
    os.close(fd)
    return Path(name)


@contextmanager
def _staged(target: Path) -> Iterator[Path]:
    """先写同目录下的临时文件，写完再改名成 `target`；中途出错就删掉临时文件。"""
    tmp = _temp_path(target)
    try:
        yield tmp
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)
