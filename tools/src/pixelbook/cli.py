"""命令行入口：`uv run pixelbook <命令>`。"""

import argparse
import json
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.audition import AuditionError, choose_voice, run_audition
from pixelbook.mix import MixError, mix_timeline
from pixelbook.pipeline import (
    REPORT_NAME,
    SUBTITLE_FONT,
    PipelineError,
    stage_episode,
    voice_episode,
)
from pixelbook.pronunciation import PronunciationError, load_pronunciation
from pixelbook.render import RenderError, render_episode
from pixelbook.script import ScriptError
from pixelbook.term_audition import audition_terms
from pixelbook.verification import (
    VerificationConfigError,
    Verifier,
    load_verification_config,
)
from pixelbook.voice import Voice, VoiceConfigError
from pixelbook.voice_lock import resolve_book_voice

AUDITION_PLAN = REPO_ROOT / "voices" / "audition.yaml"
AUDITION_OUT = REPO_ROOT / "out" / "audition"
VIDEO_PUBLIC = REPO_ROOT / "video" / "public"
PRONUNCIATION = REPO_ROOT / "pronunciation.yaml"
TERMS_OUT = REPO_ROOT / "out" / "terms"
VERIFICATION = REPO_ROOT / "verification.yaml"


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


def _print_asr_report(report_path: Path) -> None:
    report = json.loads(report_path.read_text())
    if passes := report["asr_pinyin_passes"]:
        print(f"\n{len(passes)} 句靠拼音通过（字不同、拼音相同，多半是同音字识别错）：")
        for item in passes:
            print(f"  {item['id']}  {_rates(item)}\n{_texts(item)}")
    if not (failures := report["asr_failures"]):
        return
    print(
        f"\n{len(failures)} 句复核未通过（已用差异率最低的一版；详见 {report_path}）："
    )
    for item in failures:
        print(
            f"  {item['id']}  {_rates(item)}\n{_texts(item)}\n    缓存：{item['cache']}"
        )
    print(
        "确实读错了，就删掉这句的缓存 wav（在书的目录下）再配音，或者改写这句；"
        "是识别错了就不用管。之后每次配音都会继续列出它。"
    )


def _print_missing_glyphs(report_path: Path) -> bool:
    """打印缺字；没有缺字返回 True。"""
    if not (missing := json.loads(report_path.read_text())["missing_glyphs"]):
        return True
    print(
        f"\n错误：字幕里有 {len(missing)} 个字在像素字体里没有字形（会显示成系统字体）："
    )
    for item in missing:
        print(f"  {item['id']}  「{item['char']}」（U+{ord(item['char']):04X}）")
    print(
        f"改写这些旁白句的字幕（`title` 是左上角的书名/主题名），或换一款有这些字的字体（{SUBTITLE_FONT}）。"
    )
    return False


def _rates(item: dict) -> str:
    rates = f"字符差异率 {item['diff_rate']:.0%}"
    # 两步复核之前缓存的句子没有算过拼音
    if item["pinyin_diff_rate"] is not None:
        rates += f"  拼音差异率 {item['pinyin_diff_rate']:.0%}"
    return rates


def _texts(item: dict) -> str:
    return (
        f"    字幕：{item['text']}\n    朗读：{item['spoken']}\n"
        f"    识别：{item['heard']}"
    )


def _verifier() -> Verifier:
    from pixelbook import mlx_asr

    config = load_verification_config(VERIFICATION)
    return Verifier(
        mlx_asr.MlxAsrEngine(config.asr),
        max_diff_rate=config.max_diff_rate,
        max_retries=config.max_retries,
    )


def _print_render_summary(summary: dict[str, Any]) -> None:
    duration = summary["duration"]
    verdict = {
        "within": "在目标范围之内",
        "too-short": "太短（低于目标范围，只报告）",
        "too-long": "太长（超出目标范围，只报告）",
    }[duration["verdict"]]
    print(
        f"\n成片 {summary['mp4']}\n"
        f"  帧数：视频流 {summary['frames']} 帧，时间轴 {summary['total_frames']} 帧"
        f"（{summary['fps']}fps，相差不超过一帧）\n"
        f"  总时长 {duration['text']}：{verdict}\n"
        f"  打点时间表 {summary['segments']}"
    )
    if passes := summary["asr_pinyin_passes"]:
        ids = "、".join(item["id"] for item in passes)
        print(
            f"  靠拼音通过（多半是同音字识别错，不用处理）：{len(passes)} 句（{ids}）"
        )
    if failures := summary["asr_failures"]:
        print(f"  复核未通过（请试听）：{len(failures)} 句")
        for item in failures:
            print(f"    {item['id']}  {_rates(item)}\n{_texts(item)}")
            print(f"    缓存：{item['cache']}")
    else:
        print("  复核未通过：无")


def _book_voice(script: Path) -> Voice:
    # 旁白稿在 books/<书>/<章>/<期>/script.yaml
    return resolve_book_voice(script.parents[2], REPO_ROOT)


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

    voice = commands.add_parser(
        "voice", help="为一期旁白稿逐句配音，生成合成清单并复制到 video/public/"
    )
    voice.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")
    voice.add_argument(
        "--revoice",
        action="store_true",
        help="音色和书的锁定音色不一致时，确认整本书用新音色重新配音（更新锁定）",
    )

    render = commands.add_parser(
        "render",
        help="一键出片：配音 → 时间轴 → 渲染 MP4 → 核对时长，打印汇总报告",
    )
    render.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")
    render.add_argument(
        "--out", type=Path, help="MP4 写到哪里，默认 out/<书>-<章>-<期>.mp4"
    )
    render.add_argument(
        "--revoice",
        action="store_true",
        help="同 `voice --revoice`：确认整本书用新音色重新配音（更新锁定）",
    )

    terms = commands.add_parser(
        "terms", help="为一期旁白稿的每个新术语生成一段试听音频（书的音色）"
    )
    terms.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")
    terms.add_argument("--out", type=Path, default=TERMS_OUT)

    stage = commands.add_parser(
        "stage", help="只把期目录里的合成清单和分镜复制到 video/public/（不重新配音）"
    )
    stage.add_argument("episode", type=Path, help="books/<书>/<章>/<期>/")

    mix = commands.add_parser(
        "mix",
        help="按 timeline.json 把一期的逐句配音拼成一条试听音轨（不是正式产物）",
    )
    mix.add_argument(
        "timeline",
        type=Path,
        help="`npm run timeline` 导出的 timeline.json（通常在期目录里）",
    )
    mix.add_argument(
        "--out",
        type=Path,
        help="试听音轨写到哪里，默认 out/mix/<书>-<章>-<期>.wav",
    )

    args = parser.parse_args(argv)
    try:
        if args.command == "audition":
            from pixelbook.qwen_tts import QwenTtsEngine

            report = run_audition(args.plan, QwenTtsEngine(), args.out)
            _print_report(report, args.out)
        elif args.command == "choose-voice":
            chosen = choose_voice(args.audition_dir, args.name, REPO_ROOT)
            print(f"已写入 {REPO_ROOT / 'voice.yaml'}：{chosen}")
        elif args.command == "render":
            return _render(args.script.resolve(), args.out, args.revoice)
        elif args.command == "voice":
            from pixelbook.qwen_tts import QwenTtsEngine

            script = args.script.resolve()
            manifest = voice_episode(
                script,
                QwenTtsEngine(),
                _book_voice(script),
                VIDEO_PUBLIC,
                load_pronunciation(PRONUNCIATION),
                _verifier(),
                revoice=args.revoice,
                font=VIDEO_PUBLIC / SUBTITLE_FONT,
            )
            total = sum(line["seconds"] for line in manifest["lines"])
            print(
                f"{len(manifest['lines'])} 句，配音共 {total:.1f} 秒（不含停顿）；"
                f"合成清单 {args.script.parent / 'episode.json'}，"
                f"已复制到 {VIDEO_PUBLIC / 'episode'}"
            )
            _print_asr_report(script.parent / REPORT_NAME)
            if not _print_missing_glyphs(script.parent / REPORT_NAME):
                return 1
        elif args.command == "terms":
            table = load_pronunciation(PRONUNCIATION)
            script = args.script.resolve()
            # 试听不经过守卫，也不写锁定音色
            book_voice = _book_voice(script)
            from pixelbook.qwen_tts import QwenTtsEngine

            results = audition_terms(
                script, table, QwenTtsEngine(), book_voice, args.out
            )
            if not results:
                print("没有新术语，可以直接 `pixelbook voice`")
            else:
                print(f"{len(results)} 个新术语，试听音频在 {args.out}：")
                for item in results:
                    print(
                        f"  {item['file'].name:<24} {item['term']}"
                        f"（{'、'.join(item['lines'])}）"
                    )
                print(f"听完把读法写进 {PRONUNCIATION}（读法不变就写成 `术语: 术语`）")
        elif args.command == "mix":
            timeline = args.timeline.resolve()
            # timeline.json 默认在期目录 books/<书>/<章>/<期>/ 里
            out = (
                args.out
                or REPO_ROOT
                / "out"
                / "mix"
                / ("-".join(timeline.parent.parts[-3:]) + ".wav")
            ).resolve()
            seconds = mix_timeline(timeline, VIDEO_PUBLIC, out)
            print(f"试听音轨 {out}：{seconds:.2f} 秒")
        else:
            stage_episode(args.episode.resolve(), VIDEO_PUBLIC)
            print(f"已复制到 {VIDEO_PUBLIC / 'episode'}")
    except (
        AuditionError,
        MixError,
        ScriptError,
        PipelineError,
        PronunciationError,
        VerificationConfigError,
        VoiceConfigError,
    ) as error:
        print(error)
        return 1
    return 0


def _render(script: Path, out: Path | None, revoice: bool) -> int:
    # 旁白稿在 books/<书>/<章>/<期>/script.yaml
    out = (
        out or REPO_ROOT / "out" / ("-".join(script.parent.parts[-3:]) + ".mp4")
    ).resolve()
    try:
        try:
            from pixelbook.qwen_tts import QwenTtsEngine

            engine = QwenTtsEngine()
            voice = _book_voice(script)
            verifier = _verifier()
            pronunciation = load_pronunciation(PRONUNCIATION)
        except (
            PronunciationError,
            VerificationConfigError,
            VoiceConfigError,
        ) as error:
            raise RenderError("配音", str(error)) from error
        summary = render_episode(
            script,
            engine,
            voice,
            verifier,
            pronunciation,
            out=out,
            public_dir=VIDEO_PUBLIC,
            font=VIDEO_PUBLIC / SUBTITLE_FONT,
            revoice=revoice,
            log=print,
        )
    except RenderError as error:
        print(error)
        return 1
    _print_render_summary(summary)
    return 0
