"""命令行入口：`uv run pixelbook <命令>`。"""

import argparse
import json
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.audition import AuditionError, choose_voice, run_audition
from pixelbook.check import check_script, check_unjudged, format_report
from pixelbook.convert import CHAPTERS_DIR, ConvertError, convert_book
from pixelbook.episode_path import OUT_DIR, EpisodePath, EpisodePathError
from pixelbook.judge import JudgeError, prompt, record
from pixelbook.mix import MixError, mix_timeline
from pixelbook.music_check import MusicSchedule, check_music
from pixelbook.outline import OutlineError, check_outline, format_warnings, unit_table
from pixelbook.pipeline import (
    SUBTITLE_FONT,
    AsrReportEntry,
    PipelineError,
    VoicingReport,
    VoicingSettings,
    stage_episode,
    voice_episode,
)
from pixelbook.pronunciation import (
    PRONUNCIATION_FILE,
    PronunciationError,
    load_pronunciation,
)
from pixelbook.render import RenderError, render_episode, render_music_stem
from pixelbook.script import ScriptError
from pixelbook.status import StatusError, episode_status
from pixelbook.sync_minutes import sync_minutes
from pixelbook.term_audition import audition_terms
from pixelbook.verification import (
    VerificationConfigError,
    Verifier,
    load_verification_config,
)
from pixelbook.voice import Voice, VoiceConfigError
from pixelbook.voice_lock import resolve_book_voice

AUDITION_PLAN = REPO_ROOT / "voices" / "audition.yaml"
AUDITION_OUT = REPO_ROOT / "voices" / "audition"
VIDEO_PUBLIC = REPO_ROOT / "video" / "public"
PRONUNCIATION = REPO_ROOT / PRONUNCIATION_FILE
VERIFICATION = REPO_ROOT / "verification.yaml"


def _print_audition_report(report: dict[str, Any], out_dir: Path) -> None:
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


def _print_asr_report(report: VoicingReport, report_path: Path) -> None:
    if passes := report.asr_pinyin_passes:
        print(f"\n{len(passes)} 句靠拼音通过（字不同、拼音相同，多半是同音字识别错）：")
        for item in passes:
            print(f"  {item.id}  {_rates(item)}\n{_texts(item)}")
    if not (failures := report.asr_failures):
        return
    print(
        f"\n{len(failures)} 句复核未通过（已用差异率最低的一版；详见 {report_path}）："
    )
    for item in failures:
        print(_asr_failure(item, indent="  "))
    print(
        "确实读错了，就删掉这句的缓存 wav（在书的目录下）再配音，或者改写这句；"
        "是识别错了就不用管。之后每次配音都会继续列出它。"
    )


def _asr_failure(item: AsrReportEntry, indent: str) -> str:
    """一句复核未通过的句子：ID 和差异率、字幕/朗读/识别、缓存位置。"""
    return f"{indent}{item.id}  {_rates(item)}\n{_texts(item)}\n    缓存：{item.cache}"


def _rates(item: AsrReportEntry) -> str:
    rates = f"字符差异率 {item.diff_rate:.0%}"
    # 两步复核之前缓存的句子没有算过拼音
    if item.pinyin_diff_rate is not None:
        rates += f"  拼音差异率 {item.pinyin_diff_rate:.0%}"
    return rates


def _texts(item: AsrReportEntry) -> str:
    return f"    字幕：{item.text}\n    朗读：{item.spoken}\n    识别：{item.heard}"


def _verifier() -> Verifier:
    from pixelbook import mlx_asr

    config = load_verification_config(VERIFICATION)
    return Verifier(
        mlx_asr.MlxAsrEngine(config.asr),
        max_diff_rate=config.max_diff_rate,
        max_retries=config.max_retries,
    )


def _print_render_summary(summary: dict[str, Any]) -> None:
    # 总时长的说明文字和分开写的各部分（片头、正文、片尾）由时间轴导出命令写进
    # timeline.json，这里原样打印（ADR-0004）
    duration = summary["duration"]
    print(
        f"\n成片 {summary['mp4']}\n"
        f"  帧数：视频流 {summary['frames']} 帧，时间轴 {summary['total_frames']} 帧"
        f"（{summary['fps']}fps，相差不超过一帧）\n"
        f"  总时长 {duration['text']}：{duration['verdictText']}{duration['partsText']}\n"
        f"  打点时间表 {summary['segments']}"
    )
    if passes := summary["asr_pinyin_passes"]:
        ids = "、".join(item.id for item in passes)
        print(
            f"  靠拼音通过（多半是同音字识别错，不用处理）：{len(passes)} 句（{ids}）"
        )
    if failures := summary["asr_failures"]:
        print(f"  复核未通过（请试听）：{len(failures)} 句")
        for item in failures:
            print(_asr_failure(item, indent="    "))
    else:
        print("  复核未通过：无")


def _book_voice(script: Path) -> Voice:
    return resolve_book_voice(EpisodePath.from_script(script).book_dir, REPO_ROOT)


def _voicing_settings(script: Path, revoice: bool) -> VoicingSettings:
    """`voice` 和 `render` 共用的配音配置：真实 TTS 和语音识别、书的音色、读音表。"""
    from pixelbook.qwen_tts import QwenTtsEngine

    return VoicingSettings(
        engine=QwenTtsEngine(),
        voice=_book_voice(script),
        verifier=_verifier(),
        pronunciation=load_pronunciation(PRONUNCIATION),
        public_dir=VIDEO_PUBLIC,
        font=VIDEO_PUBLIC / SUBTITLE_FONT,
        revoice=revoice,
    )


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
    voice.add_argument(
        "--draft",
        action="store_true",
        help="给 `status: draft`（没有定稿）的旁白稿配音",
    )

    render = commands.add_parser(
        "render",
        help="一键出片：配音 → 时间轴 → 渲染 MP4 → 核对时长，打印汇总报告",
    )
    render.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")
    render.add_argument(
        "--out", type=Path, help="MP4 写到哪里，默认期目录的 out/<书>-<章>-<期>.mp4"
    )
    render.add_argument(
        "--revoice",
        action="store_true",
        help="同 `voice --revoice`：确认整本书用新音色重新配音（更新锁定）",
    )
    render.add_argument(
        "--draft",
        action="store_true",
        help="同 `voice --draft`：给没有定稿的旁白稿出片",
    )

    trial = commands.add_parser(
        "music-trial",
        help="全长音频试验（#39、#52）：出片，再单独渲染配乐声轨，检查交叉淡化接缝、静音和淡出",
    )
    trial.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")
    trial.add_argument("--draft", action="store_true", help="同 `render --draft`")
    trial.add_argument(
        "--storyboard",
        type=Path,
        help="试验用的分镜：出片期间临时放成期目录里的 storyboard.json，结束后恢复原样",
    )

    terms = commands.add_parser(
        "terms", help="为一期旁白稿的每个新术语生成一段试听音频（书的音色）"
    )
    terms.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")
    terms.add_argument(
        "--out", type=Path, help="试听音频写到哪里，默认期目录的 out/terms/"
    )

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
        help="`npm run timeline` 导出的 timeline.json（通常在期目录的 out/ 里）",
    )
    mix.add_argument(
        "--out",
        type=Path,
        help="试听音轨写到哪里，默认期目录的 out/mix.wav",
    )

    convert = commands.add_parser(
        "convert",
        help="把书目录里的 source.epub 转成每章一份带段落编号的 Markdown（chapters/）",
    )
    convert.add_argument("book", type=Path, help="books/<书>/")

    outline = commands.add_parser(
        "outline",
        help="检查一章的大纲：格式、ID 唯一、段数、时长、出处（只检查，不生成）",
    )
    outline.add_argument("outline", type=Path, help="books/<书>/chNN/outline.yaml")

    units = commands.add_parser(
        "units",
        help="写大纲前看的单元表：每个单元的首尾段落编号、段数、正文字数、提示框和小标题",
    )
    units.add_argument("chapter", type=Path, help="books/<书>/chapters/chNN.md")

    check = commands.add_parser(
        "check",
        help="旁白稿的全部机械检查：格式、出处、估算时长……报错和警告分开列出",
    )
    check.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")
    check.add_argument(
        "--episode",
        type=Path,
        help="books/<书>/<章>/<期>/：script 是这一期旁白稿的草稿副本（放在别处），"
        "按这一期的大纲和原文检查，不查 factcheck.yaml",
    )

    minutes = commands.add_parser(
        "sync-minutes",
        help="把旁白稿每段的估算分钟数（取到 0.25）写回大纲里这一期的 segments[].minutes",
    )
    minutes.add_argument("script", type=Path, help="books/<书>/<章>/<期>/script.yaml")

    factcheck_prompt = commands.add_parser(
        "factcheck-prompt",
        help="打印给语义核对裁判的完整 prompt：说明、引用的原文段落、旁白句和校验码（旁白稿要先通过检查）",
    )
    factcheck_prompt.add_argument("episode", type=Path, help="books/<书>/<章>/<期>/")

    factcheck_record = commands.add_parser(
        "factcheck-record",
        help="把裁判的回答对照旁白稿记进 factcheck.yaml，算出第几轮，列出不支持和部分支持的句子",
    )
    factcheck_record.add_argument("episode", type=Path, help="books/<书>/<章>/<期>/")
    factcheck_record.add_argument(
        "answer",
        type=Path,
        help="裁判返回的 YAML（packet：校验码；lines：id、verdict、reason）",
    )
    factcheck_record.add_argument(
        "--user-edited",
        action="store_true",
        help="和上一轮相比不只是拆句（改写、新增、删除），而且是用户改的或用户同意的；"
        "只有用户能授权",
    )

    status = commands.add_parser(
        "status",
        help="只看文件判断一期做到哪一步、对应哪个人工关口、下一步跑什么（阶段见 docs/reference/status.md）",
    )
    status.add_argument("episode", type=Path, help="books/<书>/<章>/<期>/")
    status.add_argument("--json", action="store_true", help="输出机器可读的 JSON")

    args = parser.parse_args(argv)
    try:
        if args.command == "audition":
            from pixelbook.qwen_tts import QwenTtsEngine

            report = run_audition(args.plan, QwenTtsEngine(), args.out)
            _print_audition_report(report, args.out)
        elif args.command == "choose-voice":
            chosen = choose_voice(args.audition_dir, args.name, REPO_ROOT)
            print(f"已写入 {REPO_ROOT / 'voice.yaml'}：{chosen}")
        elif args.command == "convert":
            book = args.book.resolve()
            written = convert_book(book)
            names = "、".join(path.stem for path in written)
            print(f"{len(written)} 章（{names}），写到 {book / CHAPTERS_DIR}")
        elif args.command == "outline":
            checked, warnings = check_outline(args.outline.resolve())
            if warnings:
                print(format_warnings(warnings))
            ids = "、".join(episode.id for episode in checked.episodes)
            print(f"大纲检查通过：{len(checked.episodes)} 期（{ids}）")
        elif args.command == "units":
            print(unit_table(args.chapter.resolve()))
        elif args.command == "check":
            script = args.script.resolve()
            report = (
                check_unjudged(script, EpisodePath(args.episode.resolve()))
                if args.episode
                else check_script(script)
            )
            print(format_report(script, report))
            return 0 if report.passed else 1
        elif args.command == "sync-minutes":
            print(sync_minutes(args.script.resolve()))
        elif args.command == "factcheck-prompt":
            print(prompt(EpisodePath(args.episode.resolve())).text, end="")
        elif args.command == "factcheck-record":
            print(
                record(
                    EpisodePath(args.episode.resolve()),
                    args.answer.resolve(),
                    user_edited=args.user_edited,
                )
            )
        elif args.command == "status":
            result = episode_status(args.episode.resolve())
            if args.json:
                print(json.dumps(result.to_json(), ensure_ascii=False, indent=2))
            else:
                print(result.to_text())
        elif args.command == "render":
            return _render(args.script.resolve(), args.out, args.revoice, args.draft)
        elif args.command == "music-trial":
            return _music_trial(args.script.resolve(), args.draft, args.storyboard)
        elif args.command == "voice":
            script = args.script.resolve()
            voiced = voice_episode(
                script, _voicing_settings(script, args.revoice), draft=args.draft
            )
            episode = EpisodePath.from_script(script)
            manifest = voiced.manifest
            total = sum(line["seconds"] for line in manifest["lines"])
            print(
                f"{len(manifest['lines'])} 句，配音共 {total:.1f} 秒（不含停顿）；"
                f"合成清单 {episode.manifest}，"
                f"已复制到 {VIDEO_PUBLIC / 'episode'}"
            )
            _print_asr_report(voiced.report, episode.report)
        elif args.command == "terms":
            table = load_pronunciation(PRONUNCIATION)
            script = args.script.resolve()
            # 试听不经过守卫，也不写锁定音色
            book_voice = _book_voice(script)
            from pixelbook.qwen_tts import QwenTtsEngine

            out = args.out or EpisodePath.from_script(script).terms_dir
            results = audition_terms(script, table, QwenTtsEngine(), book_voice, out)
            if not results:
                print("没有新术语，可以直接 `pixelbook voice`")
            else:
                print(f"{len(results)} 个新术语，试听音频在 {out}：")
                for item in results:
                    print(
                        f"  {item['file'].name:<24} {item['term']}"
                        f"（{'、'.join(item['lines'])}）"
                    )
                print(f"听完把读法写进 {PRONUNCIATION}（读法不变就写成 `术语: 术语`）")
        elif args.command == "mix":
            timeline = args.timeline.resolve()
            out = (args.out or _default_mix(timeline)).resolve()
            seconds = mix_timeline(timeline, VIDEO_PUBLIC, out)
            print(f"试听音轨 {out}：{seconds:.2f} 秒")
        else:
            stage_episode(args.episode.resolve(), VIDEO_PUBLIC)
            print(f"已复制到 {VIDEO_PUBLIC / 'episode'}")
    except (
        AuditionError,
        ConvertError,
        EpisodePathError,
        JudgeError,
        MixError,
        OutlineError,
        ScriptError,
        StatusError,
        PipelineError,
        PronunciationError,
        VerificationConfigError,
        VoiceConfigError,
    ) as error:
        print(error)
        return 1
    return 0


def _default_mix(timeline: Path) -> Path:
    """时间轴在期目录或它的 out/ 里时，试听音轨默认写到这一期的 out/mix.wav。"""
    episode_dir = timeline.parent
    if episode_dir.name == OUT_DIR:
        episode_dir = episode_dir.parent
    try:
        return EpisodePath(episode_dir).mix
    except EpisodePathError:
        raise MixError(
            f"{timeline} 不在期目录 books/<书>/<章>/<期>/ 或它的 out/ 里，"
            "推不出试听音轨写到哪里：用 --out 指定"
        ) from None


def _music_trial(script: Path, draft: bool, storyboard: Path | None) -> int:
    """出片到期目录的 out/<书>-<章>-<期>.mp4，配乐声轨到同一目录的
    <书>-<章>-<期>-music.wav，然后检查配乐（参照写在它旁边的 -music-reference.wav）。

    给了 `storyboard` 时，出片期间临时换上这份分镜，结束后把期目录里的分镜恢复原样
    （原来没有就删掉）。
    """
    if storyboard is None:
        return _run_music_trial(script, draft)
    target = EpisodePath.from_script(script).storyboard
    original = target.read_bytes() if target.exists() else None
    target.write_bytes(storyboard.read_bytes())
    try:
        return _run_music_trial(script, draft)
    finally:
        if original is None:
            target.unlink()
        else:
            target.write_bytes(original)


def _run_music_trial(script: Path, draft: bool) -> int:
    episode = EpisodePath.from_script(script)
    mp4, stem = episode.video, episode.music_stem
    if _render(script, mp4, revoice=False, draft=draft) != 0:
        return 1
    try:
        render_music_stem(stem, VIDEO_PUBLIC)
    except RenderError as error:
        print(error)
        return 1
    timeline = json.loads(episode.timeline.read_text())
    if timeline.get("music") is None:
        print("这一期没有分镜（或分镜没写 music），没有配乐可查")
        return 1
    report = check_music(mp4, stem, timeline, VIDEO_PUBLIC)
    music = MusicSchedule.from_json(timeline["music"])
    crossfade = music.crossfade_frames / timeline["fps"]
    print(
        f"\n配乐 {music.track}：曲长 {music.track_frames} 帧，放 {len(music.plays)} 次"
        f"（每个接缝交叉淡化 {crossfade:g} 秒），第 {music.fade_from} 帧起淡出，"
        f"到第 {music.end_frame} 帧（片尾开始）放完；配乐声轨 {stem}，参照 {report.reference}"
    )
    for line in report.seams:
        print(f"  {line}")
    if report.problems:
        print(f"配乐检查未通过：{len(report.problems)} 处")
        for problem in report.problems:
            print(f"  {problem}")
        return 1
    print(
        "配乐检查通过：音频流和视频流一样长，配乐声轨和参照逐帧一致"
        "（交叉淡化处不掉音、不爆音，淡出照排期），接缝附近没有多出来的静音"
    )
    return 0


def _render(script: Path, out: Path | None, revoice: bool, draft: bool) -> int:
    out = (out or EpisodePath.from_script(script).video).resolve()
    try:
        try:
            settings = _voicing_settings(script, revoice)
        except (
            PronunciationError,
            VerificationConfigError,
            VoiceConfigError,
        ) as error:
            raise RenderError("配音", str(error)) from error
        summary = render_episode(script, settings, out=out, draft=draft, log=print)
    except RenderError as error:
        print(error)
        return 1
    _print_render_summary(summary)
    return 0
