"""语义核对（ADR-0008）里由代码做的两步，夹在 `/factcheck` skill 启动的裁判 subagent 前后。

- `packet`：给裁判的核对材料。按顺序列出每个旁白句的字幕和它 `cite` 引用的全部原文段落，
  不含主题、段标题、画面说明、观点和朗读文本，裁判看不到写稿的思路。
- `record`：把裁判返回的判定对照旁白稿记进 `factcheck.yaml`：逐句对应，抄下核对时的字幕和
  出处，算出第几轮，汇报不支持和部分支持的句子，以及还剩几轮。
"""

from pathlib import Path

import yaml

from pixelbook.check import RULES, check_script, factcheck_matches, format_report
from pixelbook.convert import Paragraph, read_chapter
from pixelbook.episode_path import EpisodePath
from pixelbook.factcheck import (
    PARTIAL,
    SUPPORTED,
    UNSUPPORTED,
    VERDICTS,
    FactcheckError,
    Verdict,
    load_answer,
    load_factcheck,
)
from pixelbook.script import Line, load_script

# 核对材料里提示框标题那一行的开头
TIP = "提示框："
# `/script` 最多核对这么多轮：不支持的句子改写后重新核对，用完后置顶交给用户
MAX_ROUNDS = 3


class JudgeError(Exception):
    pass


def packet(episode: EpisodePath) -> str:
    """旁白稿除核对结果外的机械检查都没有报错时，返回核对材料；否则抛出带检查报告的错误。

    旧的 `factcheck.yaml` 和改过的稿对不上是预期的（这一轮就是要重新核对），不拦。
    """
    rules = [rule for rule in RULES if rule is not factcheck_matches]
    report = check_script(episode.script, rules)
    if not report.passed:
        raise JudgeError(
            "旁白稿还有报错，修好后再核对：\n" + format_report(episode.script, report)
        )
    script = load_script(episode.script)
    paragraphs = read_chapter(episode.chapter.converted).paragraphs
    blocks = []
    for line in script.lines:
        cited = "\n".join(_cited(line.cite, paragraphs))
        blocks.append(f"## {line.id}\n\n旁白：{line.text}\n\n原文：\n\n{cited}\n\n")
    return "".join(blocks)


def _cited(cite: list[str], paragraphs: dict[str, Paragraph]) -> list[str]:
    """引用的段落，按原文位置带上紧挨着它的提示框标题；相邻两段共用的只列一次。"""
    rows: list[str] = []
    for i in cite:
        paragraph = paragraphs[i]
        before, after = paragraph.tip_before, paragraph.tip_after
        for row in (
            *([f"{TIP}{before}"] if before else []),
            f"{i} {paragraph.text}",
            *([f"{TIP}{after}"] if after else []),
        ):
            if row not in rows[-1:]:
                rows.append(row)
    return rows


def record(episode: EpisodePath, answer: Path) -> str:
    """把裁判的回答 `answer` 记进期目录的 `factcheck.yaml`，返回给写稿者的汇报。

    回答要和旁白稿逐句对应（同样的句子、同样的顺序），否则抛出错误、不写文件：
    缺了、多了或乱了的回答说明裁判没按要求做，要重新交给新的裁判。
    """
    try:
        verdicts = load_answer(answer)
    except FactcheckError as error:
        raise JudgeError(f"{answer}: 裁判的回答格式不对：{error}") from error
    lines = load_script(episode.script).lines
    for n in range(1, max(len(lines), len(verdicts)) + 1):
        expected = lines[n - 1].id if n <= len(lines) else None
        actual = verdicts[n - 1].id if n <= len(verdicts) else None
        if expected != actual:
            should = (
                f"应该是 {expected}"
                if expected
                else f"应该没有（旁白稿只有 {len(lines)} 句）"
            )
            raise JudgeError(
                f"{answer}: 裁判的回答和旁白稿对不上：第 {n} 条{should}，"
                f"实际是 {actual or '没有'}。把同一份材料交给新的裁判重新判定"
            )
    round_ = _previous_round(episode.factcheck) + 1
    data = {
        "round": round_,
        "lines": [
            {
                "id": line.id,
                "text": line.text,
                "cite": line.cite,
                "verdict": verdict.verdict,
                "reason": verdict.reason,
            }
            for line, verdict in zip(lines, verdicts, strict=True)
        ],
    }
    episode.factcheck.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000)
    )
    return _summary(episode.factcheck, round_, lines, verdicts)


def _previous_round(path: Path) -> int:
    """上一轮的轮次；还没核对过时为 0。"""
    if not path.is_file():
        return 0
    try:
        return load_factcheck(path).round
    except FactcheckError as error:
        raise JudgeError(
            f"{path} 格式不对，算不出这是第几轮：{error}。从头核对就删掉它，否则先修好"
        ) from error


def _summary(path: Path, round_: int, lines: list[Line], verdicts: list[Verdict]):
    text = {line.id: line.text for line in lines}
    counts = {v: sum(x.verdict == v for x in verdicts) for v in VERDICTS}
    out = [
        f"已写入 {path}",
        (
            f"第 {round_} 轮：支持 {counts[SUPPORTED]} 句，部分支持 {counts[PARTIAL]} 句，"
            f"不支持 {counts[UNSUPPORTED]} 句"
        ),
    ]
    for verdict, title in ((UNSUPPORTED, "不支持"), (PARTIAL, "部分支持")):
        if picked := [v for v in verdicts if v.verdict == verdict]:
            out.append(f"{title}（{len(picked)} 句）：")
            out += [f"  {v.id}「{text[v.id]}」：{v.reason}" for v in picked]
    if counts[UNSUPPORTED]:
        if round_ < MAX_ROUNDS:
            out.append(f"还可以改写后再核对 {MAX_ROUNDS - round_} 轮")
        else:
            out.append(f"已核对 {round_} 轮，轮次用完：不支持的句子置顶交给用户")
    return "\n".join(out)
