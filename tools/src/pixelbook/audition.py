"""音色试听对比：同一段测试旁白，用每个候选音色各生成一份。"""

import json
import shutil
from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml

from pixelbook.audio import wav_seconds
from pixelbook.tts import TtsEngine
from pixelbook.voice import PARAM_KEYS, Voice, save_voice_config, unknown_param

EPISODE_LINES = 100
BASE_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"


class AuditionError(Exception):
    pass


def run_audition(plan_path: Path, engine: TtsEngine, out_dir: Path) -> dict[str, Any]:
    """生成每个候选音色的试听音频，并在 `out_dir/report.json` 里记录每句的开销。"""
    plan = yaml.safe_load(plan_path.read_text())
    params = plan.get("params", {})
    if key := unknown_param(params):
        raise AuditionError(
            f"{plan_path}: `params.{key}` 不是认识的参数（可用：{sorted(PARAM_KEYS)}）"
        )
    out_dir.mkdir(parents=True, exist_ok=True)

    def narrate(text: str, voice: Voice, file_name: str) -> dict[str, Any]:
        stats = engine.synthesize(text, voice, out_dir / file_name)
        return {
            "file": file_name,
            "text": text,
            "elapsed_seconds": stats.elapsed_seconds,
            "audio_seconds": wav_seconds(out_dir / file_name),
            "peak_memory_bytes": stats.peak_memory_bytes,
        }

    candidates = []
    for candidate in plan["candidates"]:
        name = candidate["name"]
        voice = Voice(
            model=candidate["model"],
            speaker=candidate.get("speaker"),
            instruct=candidate.get("instruct"),
            params=params,
        )
        lines = [
            narrate(line, voice, f"{name}-{number}.wav")
            for number, line in enumerate(plan["lines"], start=1)
        ]
        mean_elapsed = sum(line["elapsed_seconds"] for line in lines) / len(lines)
        entry: dict[str, Any] = {
            "name": name,
            "voice": asdict(voice),
            "lines": lines,
            "estimated_seconds_per_100_lines": mean_elapsed * EPISODE_LINES,
        }
        if voice.instruct:
            # 设计音色另读一句干净的参考句，选中后存成参考音频供 Base 克隆
            entry["reference"] = narrate(
                plan["reference_text"], voice, f"{name}-ref.wav"
            )
        candidates.append(entry)

    report = {"candidates": candidates}
    (out_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2)
    )
    return report


def choose_voice(audition_dir: Path, name: str, repo_root: Path) -> Voice:
    """把试听过的一个候选音色写成项目默认音色配置 `repo_root/voice.yaml`。

    设计音色的声音每次生成都会变，所以保存它读的参考句，之后用 Base 模型克隆。
    """
    report_path = audition_dir / "report.json"
    if not report_path.is_file():
        raise AuditionError(f"{report_path} 不存在：先运行 `pixelbook audition`")
    report = json.loads(report_path.read_text())
    names = [c["name"] for c in report["candidates"]]
    if name not in names:
        raise AuditionError(
            f"没有试听过 `{name}`；{audition_dir} 里的候选是：{', '.join(names)}"
        )
    entry = report["candidates"][names.index(name)]
    auditioned = Voice(**entry["voice"])

    if auditioned.instruct:
        reference = Path("voices") / f"{name}.wav"
        (repo_root / reference).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(
            audition_dir / entry["reference"]["file"], repo_root / reference
        )
        voice = Voice(
            model=BASE_MODEL,
            ref_audio=reference.as_posix(),
            ref_text=entry["reference"]["text"],
            params=auditioned.params,
        )
    else:
        voice = auditioned

    repo_root.mkdir(parents=True, exist_ok=True)
    save_voice_config(voice, repo_root / "voice.yaml")
    return voice
