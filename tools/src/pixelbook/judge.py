"""语义核对（ADR-0008）里由代码做的两步，夹在 `/factcheck` skill 启动的裁判 subagent 前后。

- `prompt`：给裁判的完整 prompt：判定说明、核对材料和校验码。材料先按原文顺序把旁白稿引用到的
  段落各列一次（连同紧挨着它们的提示框标题和小标题），再按顺序列出每个旁白句的字幕和出处编号；
  不含主题、段标题、画面说明、观点和朗读文本，裁判看不到写稿的思路。skill 原样转交，不手抄材料。
- `record`：把裁判返回的判定对照旁白稿记进 `factcheck.yaml`：先核对回答抄回的校验码和当前
  旁白稿生成的 prompt 相同，再逐句对应，抄下核对时的字幕和出处，算出第几轮，汇报不支持和
  部分支持的句子，以及还剩几轮。
"""

import hashlib
from pathlib import Path

import yaml

from pixelbook.check import RULES, check_script, factcheck_matches, format_report
from pixelbook.convert import Chapter, read_chapter
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

# 核对材料里提示框标题、小标题那一行的开头
TIP = "提示框："
SUBHEADING = "小标题："
# 两个引用到的段落在原文里不相邻时，中间写这一行
GAP = "……"
# `/script` 最多核对这么多轮：不支持的句子改写后重新核对，用完后置顶交给用户
MAX_ROUNDS = 3
# 校验码：`fc-` 加上 prompt 校验码行之前全部文字的 SHA-256 的前几位十六进制。
# 有字母前缀，YAML 不会把它读成数字（全是数字或像 `1e5` 的十六进制会被读成数）
TOKEN_PREFIX = "fc-"
TOKEN_LENGTH = 12
TOKEN_LINE = "校验码："

INSTRUCTIONS = """\
你是一份中文讲解视频旁白的事实核对员。下面先列出旁白引用到的原文段落（一本书的中文译本），\
再按播出顺序列出全部旁白句，每句后面的括号里是它的出处：它引用的段落编号。

原文段落按书里的顺序排列，每段以编号开头。以「提示框：」「小标题：」开头的行是书里紧挨着\
前后那一段的提示框标题和小标题，也是原文；「……」表示中间隔着没有列出的段落。

每句只根据它出处里的段落，以及紧挨着这些段落的提示框标题和小标题判断，不用别的句子引用的段落，\
不读任何文件、不搜索，也不用你对这本书或这个领域的其他了解：这些原文推不出的内容，即使在现实中\
是对的，也算没有依据。

旁白按字幕切成短句，一句话可能跨几行；用前后句理解指代和省略，但每句只判它自己说出的内容。

逐句给出判定：
- supported：这句说的每一点都能从它的原文段落得出。改写、压缩、换说法、概括都可以；不含实质主张\
的过渡句（如「先看第一点」）也算 supported。
- partial：主干有依据，但多出了原文没有的细节、例子、数字、因果或评价，或者把原文说得更绝对、\
更宽泛、更弱，或者漏掉了改变意思的限定。
- unsupported：主干在原文段落里找不到，或者和原文相反。

每句的 reason 用一句中文说明依据：supported 时指出对应的段落编号；partial 和 unsupported 时\
指出具体是哪部分没有依据。

只输出下面这个 YAML，不加其他文字。packet 抄这份材料最后一行的校验码；lines 按材料里的顺序，\
每个旁白句一条，不多不少：

packet: <校验码>
lines:
  - id: <旁白句 ID>
    verdict: supported | partial | unsupported
    reason: <一句话>
"""


class JudgeError(Exception):
    pass


def prompt(episode: EpisodePath) -> str:
    """旁白稿除核对结果外的机械检查都没有报错时，返回给裁判的完整 prompt；否则抛出带检查报告的错误。

    旧的 `factcheck.yaml` 和改过的稿对不上是预期的（这一轮就是要重新核对），不拦。
    """
    rules = [rule for rule in RULES if rule is not factcheck_matches]
    report = check_script(episode.script, rules)
    if not report.passed:
        raise JudgeError(
            "旁白稿还有报错，修好后再核对：\n" + format_report(episode.script, report)
        )
    lines = load_script(episode.script).lines
    chapter = read_chapter(episode.chapter.converted)
    sources = "\n".join(_sources([i for line in lines for i in line.cite], chapter))
    narration = "\n\n".join(
        f"{line.id}（出处：{'、'.join(line.cite)}）\n旁白：{line.text}"
        for line in lines
    )
    body = (
        f"{INSTRUCTIONS}\n--- 原文段落 ---\n\n{sources}\n\n"
        f"--- 旁白句 ---\n\n{narration}\n\n--- 校验码 ---\n\n"
    )
    return f"{body}{TOKEN_LINE}{_token(body)}\n"


def _token(body: str) -> str:
    return TOKEN_PREFIX + hashlib.sha256(body.encode()).hexdigest()[:TOKEN_LENGTH]


def _sources(cited: list[str], chapter: Chapter) -> list[str]:
    """引用到的段落按原文顺序各列一次，带上紧挨着它的提示框标题和小标题；
    相邻两段共用的标题只列一次，不相邻的段落之间写 `GAP`。"""
    order = list(chapter.paragraphs)
    rows: list[str] = []
    previous = None
    for i in sorted(set(cited), key=order.index):
        paragraph = chapter.paragraphs[i]
        if previous is not None and order.index(i) != order.index(previous) + 1:
            rows.append(GAP)
        before = [
            f"{TIP}{paragraph.tip_before}" if paragraph.tip_before else None,
            f"{SUBHEADING}{paragraph.heading_before}"
            if paragraph.heading_before
            else None,
        ]
        after = [
            f"{TIP}{paragraph.tip_after}" if paragraph.tip_after else None,
            f"{SUBHEADING}{paragraph.heading_after}"
            if paragraph.heading_after
            else None,
        ]
        for row in [*before, f"{i} {paragraph.text}", *after]:
            if row and row not in rows[-1:]:
                rows.append(row)
        previous = i
    return rows


def record(episode: EpisodePath, answer: Path) -> str:
    """把裁判的回答 `answer` 记进期目录的 `factcheck.yaml`，返回给写稿者的汇报。

    回答抄回的校验码要和当前旁白稿生成的 prompt 相同（裁判收到的是完整的、最新的 prompt），
    并且和旁白稿逐句对应（同样的句子、同样的顺序），否则抛出错误、不写文件：
    缺了、多了或乱了的回答说明裁判没按要求做，要重新交给新的裁判。
    """
    try:
        token, verdicts = load_answer(answer)
    except FactcheckError as error:
        raise JudgeError(f"{answer}: 裁判的回答格式不对：{error}") from error
    expected_token = prompt(episode).rsplit(TOKEN_LINE, 1)[1].strip()
    if token != expected_token:
        raise JudgeError(
            f"{answer}: 回答里的校验码 {token} 和当前旁白稿生成的 prompt 的校验码 "
            f"{expected_token} 不同：裁判没有原样抄回校验码，或出题之后改过旁白稿或原文。"
            "重新生成 prompt，交给新的裁判"
        )
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
