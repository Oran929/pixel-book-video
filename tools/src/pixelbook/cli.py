"""命令行入口：`uv run pixelbook <命令>`。"""

import argparse
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.audition import AuditionError, choose_voice, run_audition

AUDITION_PLAN = REPO_ROOT / "voices" / "audition.yaml"
AUDITION_OUT = REPO_ROOT / "out" / "audition"


def _print_report(report: dict[str, Any], out_dir: Path) -> None:
    print(f"试听音频在 {out_dir}")
    for candidate in report["candidates"]:
        print(f"\n{candidate['name']}")
        rows = list(candidate["lines"])
        if "reference" in candidate:
            rows.append(candidate["reference"])
        for line in rows:
            print(
                f"  {line['file']:<24} 耗时 {line['elapsed_seconds']:6.1f}s"
                f"  音频 {line['audio_seconds']:5.1f}s"
                f"  峰值内存 {line['peak_memory_bytes'] / 1024**3:5.1f} GB"
            )
        minutes = candidate["estimated_seconds_per_100_lines"] / 60
        print(f"  估算一期（100 句）：约 {minutes:.0f} 分钟")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pixelbook")
    commands = parser.add_subparsers(dest="command", required=True)

    audition = commands.add_parser("audition", help="用每个候选音色生成试听音频")
    audition.add_argument("--plan", type=Path, default=AUDITION_PLAN)
    audition.add_argument("--out", type=Path, default=AUDITION_OUT)

    choose = commands.add_parser(
        "choose-voice", help="把试听过的一个音色设为项目默认音色"
    )
    choose.add_argument("name")
    choose.add_argument("--from", dest="audition_dir", type=Path, default=AUDITION_OUT)

    args = parser.parse_args(argv)
    if args.command == "audition":
        from pixelbook.qwen_tts import QwenTtsEngine

        _print_report(run_audition(args.plan, QwenTtsEngine(), args.out), args.out)
    else:
        try:
            voice = choose_voice(args.audition_dir, args.name, REPO_ROOT)
        except AuditionError as error:
            print(error)
            return 1
        print(f"已写入 {REPO_ROOT / 'voice.yaml'}：{voice}")
    return 0
