"""语义核对（ADR-0008）里由代码做的两步，夹在 `/factcheck` skill 启动的裁判 subagent 前后。

- `prompt`：给裁判的完整 prompt：判定说明、核对材料和校验码。材料先按原文顺序把旁白稿引用到的
  段落各列一次（连同紧挨着它们的提示框标题和小标题），再按顺序列出每个旁白句的字幕、手写的
  `speech`（配音实际念的）和出处编号；不含主题、段标题、画面说明和观点，裁判看不到写稿的思路。skill 原样转交，不手抄材料。
- `record`：把裁判返回的判定对照旁白稿记进 `factcheck.yaml`：有上一轮时先和上一轮记下的字幕、
  `speech`、出处比较（`changes`），写稿者只能拆句，别的改动要用户授权（`user_edited`）；再核对回答抄回的
  校验码和当前旁白稿生成的 prompt 相同，再逐句对应，抄下核对时的字幕、`speech` 和出处，算出第几轮，
  汇报改动清单、不支持和部分支持的句子。
"""

import difflib
import hashlib
import re
from dataclasses import dataclass, field
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
    Factcheck,
    FactcheckError,
    Verdict,
    load_answer,
    load_factcheck,
)
from pixelbook.script import Line, load_script

# 核对材料里提示框标题、小标题那一行的开头
TIP = "提示框："
SUBHEADING = "小标题："
# 旁白句手写了 `speech` 时，字幕那一行下面多写一行配音实际念的
SPEECH = "朗读："
# 两个引用到的段落在原文里不相邻时，中间写这一行
GAP = "……"
# 有上一轮核对时，没有用户授权（`--user-edited`）就只接受拆句的命令行开关
USER_EDITED_FLAG = "--user-edited"
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

有的旁白句下面多一行「朗读：」，是配音实际念出来的说法（比如把英文缩写拆成字母），字幕仍显示\
「旁白：」那一行；这样的句子两行说出的内容都要有依据。

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
        + (f"\n{SPEECH}{line.speech}" if line.speech else "")
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


@dataclass(frozen=True)
class Split:
    """上一轮的一句 `old`，拆成了当前旁白稿里连续的几句 `new`：字幕依次接起来（去掉空白后）
    和原句相同，出处都和原句相同。"""

    old: Verdict
    new: list[Line]


@dataclass
class Changes:
    """当前旁白稿和上一轮核对时的字幕、`speech`、出处相比的改动。"""

    splits: list[Split] = field(default_factory=list)
    # 字幕、`speech` 或出处改了的句子：(上一轮, 现在)
    reworded: list[tuple[Verdict, Line]] = field(default_factory=list)
    added: list[Line] = field(default_factory=list)
    deleted: list[Verdict] = field(default_factory=list)
    # 字幕、`speech`、出处都没变、只改了 ID 的句子，按顺序：(上一轮的位置和 ID, 现在的位置和 ID)
    renumbered: list[tuple[tuple[int, str], tuple[int, str]]] = field(
        default_factory=list
    )

    @property
    def only_splits(self) -> bool:
        """只拆了句（和随之改的编号）：写稿者在核对之后能做的改动只有这些。"""
        return not (self.reworded or self.added or self.deleted)

    def listing(self) -> list[str]:
        rows = [
            f"  拆分：{s.old.id} → {'、'.join(n.id for n in s.new)}"
            for s in self.splits
        ]
        rows += [f"  改写：{_reworded(old, new)}" for old, new in self.reworded]
        rows += [f"  新增：{line.id}「{line.text}」" for line in self.added]
        rows += [f"  删除：{old.id}「{old.text}」" for old in self.deleted]
        rows += [f"  改了编号：{run}" for run in _renumbered_runs(self.renumbered)]
        return rows


def changes(previous: list[Verdict], lines: list[Line]) -> Changes:
    """逐句比较上一轮记下的字幕、`speech`、出处和当前旁白稿。

    三者都相同的句子按顺序对齐（ID 不同就是改了编号）；其余的部分里，上一轮的一句
    能由当前连续的两句以上（去掉空白后）依次接成、出处都相同时是拆分，否则依次配成改写，
    多出来的是新增或删除。
    """
    found = Changes()
    old_keys = [(v.text, tuple(v.cite or []), v.speech) for v in previous]
    new_keys = [(line.text, tuple(line.cite), line.speech) for line in lines]
    matcher = difflib.SequenceMatcher(None, old_keys, new_keys, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            found.renumbered += [
                ((i, previous[i].id), (j, lines[j].id))
                for i, j in zip(range(i1, i2), range(j1, j2), strict=True)
                if previous[i].id != lines[j].id
            ]
            continue
        i, j = i1, j1
        while i < i2 and j < j2:
            if pieces := _split(previous[i], lines[j:j2]):
                found.splits.append(Split(previous[i], pieces))
                j += len(pieces)
            else:
                found.reworded.append((previous[i], lines[j]))
                j += 1
            i += 1
        found.deleted += previous[i:i2]
        found.added += lines[j:j2]
    return found


def _bare(text: str) -> str:
    return re.sub(r"\s", "", text)


def _split(old: Verdict, candidates: list[Line]) -> list[Line] | None:
    """`candidates` 开头连续的、出处和 `old` 相同的两句以上，接起来正好是 `old` 的字幕时返回它们。

    念的内容（有 `speech` 时是它，否则是字幕）也要跟着拆：几句念的依次接起来等于 `old` 念的。
    """
    target, joined = _bare(old.text), ""
    for n, line in enumerate(candidates, start=1):
        if line.cite != old.cite:
            return None
        joined += _bare(line.text)
        if not target.startswith(joined):
            return None
        if joined == target:
            pieces = candidates[:n]
            said = "".join(_bare(piece.speech or piece.text) for piece in pieces)
            return pieces if n > 1 and said == _bare(old.speech or old.text) else None
    return None


def _reworded(old: Verdict, new: Line) -> str:
    out = old.id if old.id == new.id else f"{old.id} → {new.id}"
    parts = []
    if old.text != new.text:
        parts.append(f"「{old.text}」→「{new.text}」")
    if old.speech != new.speech:
        parts.append(f"朗读{_said(old.speech)}→{_said(new.speech)}")
    if old.cite != new.cite:
        parts.append(f"出处 {'、'.join(old.cite or [])} → {'、'.join(new.cite)}")
    joined = "，".join(parts)
    return out + (joined if joined.startswith("「") else f" {joined}")


def _said(speech: str | None) -> str:
    return f"「{speech}」" if speech else "（无）"


def _renumbered_runs(pairs) -> list[str]:
    """连续的改号合成一段：`s01-l02–s01-l60 → s01-l03–s01-l61`。"""
    runs: list[list] = []
    for pair in pairs:
        (i, _), (j, _) = pair
        if runs and runs[-1][-1][0][0] + 1 == i and runs[-1][-1][1][0] + 1 == j:
            runs[-1].append(pair)
        else:
            runs.append([pair])
    return [
        f"{run[0][0][1]} → {run[0][1][1]}"
        if len(run) == 1
        else f"{run[0][0][1]}–{run[-1][0][1]} → {run[0][1][1]}–{run[-1][1][1]}"
        for run in runs
    ]


def record(episode: EpisodePath, answer: Path, user_edited: bool = False) -> str:
    """把裁判的回答 `answer` 记进期目录的 `factcheck.yaml`，返回给写稿者的汇报。

    已经核对过（有上一轮的 `factcheck.yaml`）时，当前旁白稿和上一轮记下的字幕、`speech`、出处相比只能是
    拆句（`Changes.only_splits`）；改写、新增、删除要用户授权，`user_edited` 为真才记。
    回答抄回的校验码要和当前旁白稿生成的 prompt 相同（裁判收到的是完整的、最新的 prompt），
    并且和旁白稿逐句对应（同样的句子、同样的顺序），否则抛出错误、不写文件：
    缺了、多了或乱了的回答说明裁判没按要求做，要重新交给新的裁判。
    """
    previous = _previous(episode.factcheck)
    lines = load_script(episode.script).lines
    found = changes(previous.lines, lines) if previous else None
    if found and not found.only_splits and not user_edited:
        raise JudgeError(
            f"{episode.script}: 和第 {previous.round} 轮核对时相比，写稿者只能拆句，"
            "但这一份还有下面的改动。改写、新增、删除要交给用户决定；用户改过稿或明确"
            f"同意这些改动后，才加 `{USER_EDITED_FLAG}` 重新记录：\n"
            + "\n".join(found.listing())
        )
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
    round_ = previous.round + 1 if previous else 1
    data = {
        "round": round_,
        "lines": [
            {
                "id": line.id,
                "text": line.text,
                "cite": line.cite,
                **({"speech": line.speech} if line.speech else {}),
                "verdict": verdict.verdict,
                "reason": verdict.reason,
            }
            for line, verdict in zip(lines, verdicts, strict=True)
        ],
    }
    episode.factcheck.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000)
    )
    return _summary(episode.factcheck, round_, lines, verdicts, found, user_edited)


def _previous(path: Path) -> Factcheck | None:
    """上一轮的核对结果；还没核对过时为 None。"""
    if not path.is_file():
        return None
    try:
        return load_factcheck(path)
    except FactcheckError as error:
        raise JudgeError(
            f"{path} 格式不对，算不出这是第几轮：{error}。从头核对就删掉它，否则先修好"
        ) from error


def _summary(
    path: Path,
    round_: int,
    lines: list[Line],
    verdicts: list[Verdict],
    found: Changes | None,
    user_edited: bool,
) -> str:
    text = {line.id: line.text for line in lines}
    counts = {v: sum(x.verdict == v for x in verdicts) for v in VERDICTS}
    out = [
        f"已写入 {path}",
        (
            f"第 {round_} 轮：支持 {counts[SUPPORTED]} 句，部分支持 {counts[PARTIAL]} 句，"
            f"不支持 {counts[UNSUPPORTED]} 句"
        ),
    ]
    if found is None:
        out.append("改动：第 1 轮，没有上一轮可比")
    else:
        compared = f"和第 {round_ - 1} 轮相比{'（用户改过稿）' if user_edited else ''}"
        listing = found.listing()
        out += [f"{compared}：", *listing] if listing else [f"{compared}：没有改动"]
    for verdict, title in ((UNSUPPORTED, "不支持"), (PARTIAL, "部分支持")):
        if picked := [v for v in verdicts if v.verdict == verdict]:
            out.append(f"{title}（{len(picked)} 句）：")
            out += [f"  {v.id}「{text[v.id]}」：{v.reason}" for v in picked]
    return "\n".join(out)
