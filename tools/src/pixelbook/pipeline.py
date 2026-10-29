"""配音流水线：一期旁白稿 → 每句 wav → 合成清单（ADR-0004）。

对外只有 `voice_episode` 一个入口，TTS 引擎作为适配器传入。
"""

import hashlib
import json
import shutil
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from pixelbook.audio import wav_seconds
from pixelbook.episode_path import EpisodePath
from pixelbook.glyphs import missing_glyphs
from pixelbook.outro import OutroError, with_outro
from pixelbook.pronunciation import find_new_terms, spoken_text
from pixelbook.script import DRAFT, Script, load_script
from pixelbook.tts import TtsEngine
from pixelbook.tts_cache import TtsCache
from pixelbook.verification import PassedBy, Verifier
from pixelbook.voice import Voice
from pixelbook.voice_lock import LOCK_NAME, lock_mismatch, lock_record, write_lock

MANIFEST_NAME = "episode.json"
# 分镜：Claude 手写、提交到 git，`stage` 原样复制给 Remotion（不由 Python 解析）
STORYBOARD_NAME = "storyboard.json"
# 检查报告：需要人看的问题（复核未通过的句子……），每次配音重写
REPORT_NAME = "report.json"
# Remotion 静态目录（video/public/）里存放本期文件的子目录
STAGE_DIR = "episode"
# 字幕用的像素字体，相对 Remotion 静态目录；和 video/src/style/style.ts 的 FONT.file 是同一个文件
SUBTITLE_FONT = "fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2"


class PipelineError(Exception):
    pass


@dataclass(frozen=True)
class AsrReportEntry:
    """检查报告里的一句：复核没通过（`asr_failures`），或靠拼音通过（`asr_pinyin_passes`）。

    `cache` 是这句配音的缓存文件，相对书的目录；想重新生成就删掉它。
    """

    id: str
    text: str
    spoken: str
    heard: str
    diff_rate: float
    # 两步复核之前缓存的句子没有算过拼音
    pinyin_diff_rate: float | None
    cache: str


@dataclass(frozen=True)
class VoicingSettings:
    """配音要用的引擎和配置，`voice_episode`、`render_episode` 和 CLI 之间统一传。

    `voice` 是这本书解析出的音色（`voice_lock.resolve_book_voice`）；`verifier`
    用语音识别复核每句配音；朗读文本按读音表 `pronunciation` 生成。`public_dir`
    是 Remotion 的静态目录。给了字幕字体 `font` 才做缺字检查。`revoice` 确认
    整本书用新音色重新配音（音色和锁定不一致时不拒绝，配音后更新锁定）。
    """

    engine: TtsEngine
    voice: Voice
    verifier: Verifier
    pronunciation: dict[str, str]
    public_dir: Path
    font: Path | None = None
    revoice: bool = False


@dataclass(frozen=True)
class VoicingReport:
    """检查报告：需要人看的问题，每次配音重写进期目录里的 `report.json`。

    `missing_glyphs` 是字体里没有字形的字（旁白句 ID 或 `title`，和字）；
    没给字体、不做缺字检查时是 `None`，`report.json` 里也没有这一项。
    """

    asr_failures: list[AsrReportEntry]
    asr_pinyin_passes: list[AsrReportEntry]
    missing_glyphs: list[dict[str, str]] | None = None

    def to_json(self) -> dict[str, Any]:
        report: dict[str, Any] = {
            "asr_failures": [asdict(entry) for entry in self.asr_failures],
            "asr_pinyin_passes": [asdict(entry) for entry in self.asr_pinyin_passes],
        }
        if self.missing_glyphs is not None:
            report["missing_glyphs"] = self.missing_glyphs
        return report


@dataclass(frozen=True)
class VoicedEpisode:
    """配音的结果：写进期目录的合成清单（`episode.json` 的内容）和检查报告。"""

    manifest: dict[str, Any]
    report: VoicingReport


@dataclass
class _Voiced:
    """逐句配音的中间结果：合成清单的三张表、要复制上屏的 wav、复核报告条目。"""

    segments: list[dict[str, Any]] = field(default_factory=list)
    scenes: list[dict[str, Any]] = field(default_factory=list)
    lines: list[dict[str, Any]] = field(default_factory=list)
    # 静态目录里的相对路径 → 缓存里的 wav
    wavs: dict[str, Path] = field(default_factory=dict)
    failures: list[AsrReportEntry] = field(default_factory=list)
    pinyin_passes: list[AsrReportEntry] = field(default_factory=list)


def voice_episode(
    script_path: Path, settings: VoicingSettings, draft: bool = False
) -> VoicedEpisode:
    """为 `script_path` 这一期逐句配音，写出期目录里的合成清单和检查报告并返回。

    旁白稿后面接上固定片尾（`outro.with_outro`）：合成清单的最后一段是片尾。

    配音前守卫比较书的音色 `settings.voice` 和书的锁定音色，不一致就拒绝，除非
    `settings.revoice`；配音完成后写入锁定。朗读文本按读音表生成（手写的
    `speech` 优先）。旁白稿是 `status: draft`（还没定稿）时拒绝配音，除非 `draft`。

    每句配音经语音识别复核，和朗读文本对比；重试后仍不通过的句子照常使用，
    并列进检查报告 `report.json`（每次运行都列出）；字符对比不通过、靠拼音
    对比通过的句子（多半是同音字）也列进报告，单独一项。

    给了字幕字体时，配音前先做缺字检查：字幕文本和主题 `title` 里字体没有
    字形的字列进报告的 `missing_glyphs`。有缺字就抛出 `PipelineError`，报告里
    只有这一项；不配音，也不碰合成清单、Remotion 静态目录和锁定音色。
    """
    episode = EpisodePath.from_script(script_path)
    script = _guarded_script(script_path, settings.pronunciation, draft)
    # 配音缓存和锁定音色放在书的目录下
    book_dir = episode.book_dir
    try:
        locked = lock_record(settings.voice)
        cache = TtsCache(
            book_dir / "cache" / "tts",
            settings.engine,
            settings.voice,
            settings.verifier,
        )
    except FileNotFoundError as error:
        raise PipelineError(f"参考音频 {error.filename} 不存在，无法配音") from error
    if not settings.revoice and (differences := lock_mismatch(book_dir, locked)):
        raise PipelineError(voice_lock_message(script_path, book_dir, differences))
    glyphs = _check_glyphs(script_path, script, settings.font, episode.dir)

    voiced = _voice_lines(script, settings.pronunciation, cache, book_dir)
    manifest = {
        "voice_fingerprint": cache.voice_fingerprint,
        "title": script.title,
        "segments": voiced.segments,
        "scenes": voiced.scenes,
        "lines": voiced.lines,
    }
    (episode.dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    report = VoicingReport(voiced.failures, voiced.pinyin_passes, glyphs)
    _write_report(episode.dir, report.to_json())
    _stage_audio(settings.public_dir, voiced.wavs)
    stage_episode(episode.dir, settings.public_dir)
    write_lock(book_dir, locked)
    return VoicedEpisode(manifest, report)


def _guarded_script(
    script_path: Path, pronunciation: dict[str, str], draft: bool
) -> Script:
    """读旁白稿并接上片尾；草稿（除非 `draft`）、有新术语时拒绝配音。"""
    script = load_script(script_path)
    if script.status == DRAFT and not draft:
        raise PipelineError(
            f"{script_path}: 旁白稿还是 `status: {DRAFT}`（没有定稿），不配音；"
            "确实要给草稿配音，加 `--draft`"
        )
    # 固定片尾接在旁白稿后面，和正文一样缺字检查、配音、复核，进合成清单（ADR-0010）
    try:
        script = with_outro(script)
    except OutroError as error:
        raise PipelineError(f"{script_path}: {error}") from error
    if terms := find_new_terms(script, pronunciation):
        raise PipelineError(new_terms_message(script_path, terms))
    return script


def _check_glyphs(
    script_path: Path, script: Script, font: Path | None, episode_dir: Path
) -> list[dict[str, str]] | None:
    """缺字检查：返回缺字列表；不给字体返回 `None`。有缺字时写报告并拒绝配音。"""
    if font is None:
        return None
    if not font.is_file():
        raise PipelineError(f"字幕字体 {font} 不存在，无法做缺字检查")
    # 左上角的主题也用像素字体显示，报告里的 ID 记作 `title`
    missing = missing_glyphs(
        [("title", script.title)] + [(line.id, line.text) for line in script.lines],
        font,
    )
    if missing:
        _write_report(episode_dir, {"missing_glyphs": missing})
        raise PipelineError(missing_glyphs_message(script_path, missing, font))
    return missing


def _voice_lines(
    script: Script, pronunciation: dict[str, str], cache: TtsCache, book_dir: Path
) -> _Voiced:
    """逐句配音（缓存命中就不重新生成），把复核没按字通过的句子分进报告。"""
    voiced = _Voiced()
    for segment in script.segments:
        voiced.segments.append({"id": segment.id, "title": segment.title})
        for scene in segment.scenes:
            voiced.scenes.append({"id": scene.id, "segment": segment.id})
            for line in scene.lines:
                spoken = spoken_text(line, pronunciation)
                cached = cache.line(spoken)
                wav = cached.wav
                chosen = cached.verification.chosen_attempt
                if chosen.passed_by != PassedBy.CHARS:
                    entry = AsrReportEntry(
                        id=line.id,
                        text=line.text,
                        spoken=spoken,
                        heard=chosen.heard,
                        diff_rate=chosen.diff_rate,
                        pinyin_diff_rate=chosen.pinyin_diff_rate,
                        cache=wav.relative_to(book_dir).as_posix(),
                    )
                    if chosen.passed_by == PassedBy.PINYIN:
                        voiced.pinyin_passes.append(entry)
                    else:
                        voiced.failures.append(entry)
                # 文件名带内容哈希：内容变了，Studio 就不会播放浏览器缓存里的旧音频
                digest = hashlib.sha256(wav.read_bytes()).hexdigest()[:8]
                audio = f"{STAGE_DIR}/{line.id}-{digest}.wav"
                voiced.wavs[audio] = wav
                voiced.lines.append(
                    {
                        "id": line.id,
                        "scene": scene.id,
                        "text": line.text,
                        "audio": audio,
                        "seconds": wav_seconds(wav),
                    }
                )
    return voiced


def _stage_audio(public_dir: Path, wavs: dict[str, Path]) -> None:
    """清空静态目录里上一期的文件，放进这一期的 wav。"""
    stage = public_dir / STAGE_DIR
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for audio, wav in wavs.items():
        shutil.copyfile(wav, public_dir / audio)


def _write_report(episode_dir: Path, report: dict[str, Any]) -> None:
    (episode_dir / REPORT_NAME).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    )


def missing_glyphs_message(
    script_path: Path, missing: list[dict[str, str]], font: Path
) -> str:
    listing = "\n".join(
        f"  {item['id']}  「{item['char']}」（U+{ord(item['char']):04X}）"
        for item in missing
    )
    return (
        f"{script_path}: 字幕里有 {len(missing)} 个字在像素字体里没有字形"
        f"（会显示成系统字体），拒绝配音：\n{listing}\n"
        "改写这些旁白句的字幕（`title` 是左上角的主题），"
        f"或换一款有这些字的字体（{font.name}）。"
    )


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
    """把期目录里的合成清单和分镜复制到 Remotion 静态目录。

    分镜可以没有（只渲染字幕）；没有时删掉静态目录里上一期留下的分镜。
    """
    manifest = episode_dir / MANIFEST_NAME
    if not manifest.is_file():
        raise PipelineError(f"{manifest} 不存在：先运行 `pixelbook voice` 配音")
    stage = public_dir / STAGE_DIR
    stage.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(manifest, stage / MANIFEST_NAME)
    storyboard = episode_dir / STORYBOARD_NAME
    if storyboard.is_file():
        shutil.copyfile(storyboard, stage / STORYBOARD_NAME)
    else:
        (stage / STORYBOARD_NAME).unlink(missing_ok=True)
