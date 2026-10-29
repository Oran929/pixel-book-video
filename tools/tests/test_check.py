"""旁白稿检查：`pixelbook check <旁白稿>`（票 #8、#9、#11）。

转换结果用夹具手写成 `books/demo/chapters/ch01.md`，格式和 `pixelbook convert` 的输出相同；
大纲是 `books/demo/ch01/outline.yaml`，旁白稿是 `books/demo/ch01/ep01/script.yaml`，
语义核对结果是同一期目录里的 `factcheck.yaml`（给出时才写）。
每个用例从 `script()`、`outline()`、`factcheck()` 出发改一处再写出。
"""

import re

import pytest
import yaml

from pixelbook import cli

# 单元 1：¶001–¶003 是文字段（¶002 是引文），¶004、¶005 是图片段（¶005 带图题）；
# 单元 2：提示框标题后面是 ¶006；章末脚注 ¶007 不属于任何单元（它的标记在 ¶006 里）
CHAPTER = """\
# 第1章　示例

## 1　第一单元

ch01-¶001 第一段正文。

ch01-¶002 > 一段引文。

ch01-¶003 第三段：程序员要对自己的职业生涯负责，不害怕承认无知或错误。

ch01-¶004 [图 images/00001.jpeg]

ch01-¶005 [图 images/00002.jpeg] 图表 1——一张带图题的图

## 2　第二单元

### 提示1　程序员要为自己的职业生涯负责

ch01-¶006 另一个单元的正文[1]。

---

ch01-¶007 [1]一条脚注。
"""

# 每句字幕 20 个字；按 250 字/分钟，60 句是 1200 字、估算 4:48
LINE_TEXT = "一二三四五六七八九十" * 2


def outline() -> dict:
    """和 `script()` 对应的大纲：ep01 覆盖单元 1，有一条观点 p01。"""
    return {
        "chapter": 1,
        "episodes": [
            {
                "id": "ep01",
                "topic": "第一单元",
                "units": [1],
                # `check` 只读大纲的格式，不管段数；段标题要和旁白稿的段一致
                "segments": [{"title": "开场", "minutes": 5}],
                "points": [{"id": "p01", "text": "第一条观点", "cite": "ch01-¶001"}],
            }
        ],
    }


def script(lines: int = 60) -> dict:
    """一份能通过检查的旁白稿：一段一个画面，`lines` 句，出处轮流写成字符串和列表。"""
    return {
        "title": "第一单元",
        "status": "final",
        "segments": [
            {
                "id": "s01",
                "title": "开场",
                "scenes": [
                    {
                        "id": "s01-c01",
                        "description": "一个方块",
                        "points": ["p01"],
                        "lines": [
                            {
                                "id": f"s01-l{n:02d}",
                                "text": LINE_TEXT,
                                "cite": "ch01-¶001"
                                if n % 2
                                else ["ch01-¶002", "ch01-¶004"],
                            }
                            for n in range(1, lines + 1)
                        ],
                    }
                ],
            }
        ],
    }


def factcheck(data: dict) -> dict:
    """对 `data` 这份旁白稿的一份完整的核对结果：第 1 轮，每句都判定为支持。"""
    return {
        "round": 1,
        "lines": [
            {
                "id": line["id"],
                "text": line["text"],
                "cite": line["cite"],
                "verdict": "supported",
                "reason": "原文这样说",
            }
            for segment in data["segments"]
            for scene in segment["scenes"]
            for line in scene["lines"]
        ],
    }


@pytest.fixture
def episode(tmp_path):
    """写出转换结果和大纲，返回期目录 `books/demo/ch01/ep01/`（已建好，旁白稿未写）。"""
    chapters = tmp_path / "books" / "demo" / "chapters"
    chapters.mkdir(parents=True)
    (chapters / "ch01.md").write_text(CHAPTER)
    directory = tmp_path / "books" / "demo" / "ch01" / "ep01"
    directory.mkdir(parents=True)
    _dump(directory.parent / "outline.yaml", outline())
    return directory


@pytest.fixture
def pixelbook(episode, capsys):
    """写出旁白稿（和可选的大纲、核对结果）后运行一条 `pixelbook` 命令，返回退出码和输出。"""

    def run(
        argv: list[str],
        data: dict,
        outline: dict | None = None,
        factcheck: dict | None = None,
    ) -> tuple[int, str]:
        """`outline` 给出时先改写大纲；`factcheck` 给出时写出 `factcheck.yaml`。"""
        if outline is not None:
            _dump(episode.parent / "outline.yaml", outline)
        if factcheck is not None:
            _dump(episode / "factcheck.yaml", factcheck)
        _dump(episode / "script.yaml", data)
        code = cli.main(argv)
        return code, capsys.readouterr().out

    return run


@pytest.fixture
def check(pixelbook, episode):
    """写出旁白稿并运行 `pixelbook check`。"""

    def run(data: dict, outline: dict | None = None, factcheck: dict | None = None):
        argv = ["check", str(episode / "script.yaml")]
        return pixelbook(argv, data, outline, factcheck)

    return run


def _dump(path, data: dict) -> None:
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))


def _errors(out: str) -> str:
    """输出里的报错块（警告块之前的部分）。"""
    return out.split("警告")[0]


def _line(data: dict, n: int) -> dict:
    return data["segments"][0]["scenes"][0]["lines"][n - 1]


def test_a_good_script_passes_with_empty_error_and_warning_blocks(check):
    code, out = check(script())

    assert code == 0
    assert "报错：无" in out
    assert "警告：无" in out
    assert "旁白稿检查通过" in out


@pytest.mark.parametrize(
    ("cite", "missing"),
    [
        ("ch01-¶099", "ch01-¶099"),
        (["ch01-¶001", "ch01-¶098", "ch02-¶001"], "ch01-¶098、ch02-¶001"),
    ],
)
def test_a_cite_that_does_not_exist_is_an_error_naming_the_line(check, cite, missing):
    data = script()
    _line(data, 3)["cite"] = cite

    code, out = check(data)

    assert code == 1
    errors = _errors(out)
    assert f"s01-l03：`cite` 里的 {missing} 在 ch01.md 里不存在" in errors
    assert "旁白稿检查没有通过" in out


@pytest.mark.parametrize(
    "cite",
    ["ch01-¶004", ["ch01-¶004", "ch01-¶005"]],
    ids=["one image", "images only, one with a caption"],
)
def test_citing_only_image_paragraphs_is_an_error(check, cite):
    data = script()
    _line(data, 5)["cite"] = cite

    code, out = check(data)

    assert code == 1
    assert "s01-l05：`cite` 只引用了图片段" in _errors(out)


@pytest.mark.parametrize(
    ("lines", "estimate"),
    [(49, "3:55"), (76, "6:05")],
    ids=["too short", "too long"],
)
def test_an_estimated_duration_outside_4_to_6_minutes_is_an_error(
    check, lines, estimate
):
    # 每句 20 字，250 字/分钟：49 句 980 字是 3:55，76 句 1520 字是 6:05
    code, out = check(script(lines))

    assert code == 1
    assert f"旁白稿：估算时长 {estimate}" in _errors(out)
    assert "4:00–6:00" in out


@pytest.mark.parametrize("lines", [50, 75], ids=["4:00", "6:00"])
def test_an_estimated_duration_of_exactly_4_or_6_minutes_passes(check, lines):
    assert check(script(lines))[0] == 0


def test_the_estimate_counts_characters_like_the_subtitle_limit(check):
    # 空白不算字：每句加上空格后仍是 20 字，50 句正好 4:00
    data = script(50)
    for n in range(1, 51):
        _line(data, n)["text"] = "一二三四五 六七八九十 一二三四五六七八九十"
        _line(data, n)["speech"] = "朗读文本不算字"

    assert check(data)[0] == 0


def test_a_missing_status_is_an_error(check):
    data = script()
    del data["status"]

    code, out = check(data)

    assert code == 1
    assert "`status` 缺失" in _errors(out)


@pytest.mark.parametrize(
    ("field", "value", "problem"),
    [
        ("status", "done", "必须是 `draft` 或 `final`"),
        ("cite", "ch01-¶001–¶003", "必须是一个段落编号"),
        ("cite", [], "必须是一个段落编号"),
    ],
)
def test_format_errors_are_reported_in_the_error_block(check, field, value, problem):
    data = script()
    if field == "status":
        data["status"] = value
    else:
        _line(data, 2)["cite"] = value

    code, out = check(data)

    assert code == 1
    errors = _errors(out)
    assert f"`{field}` {problem}" in errors
    if field == "cite":
        assert "（s01-l02）" in errors


def test_the_subtitle_length_limit_is_checked_too(check):
    data = script()
    _line(data, 7)["text"] = LINE_TEXT + "一"

    code, out = check(data)

    assert code == 1
    assert "（s01-l07）：`text` 超过 20 个字符" in _errors(out)


def test_a_chapter_that_has_not_been_converted_is_reported(check, tmp_path):
    (tmp_path / "books" / "demo" / "chapters" / "ch01.md").unlink()

    code, out = check(script())

    assert code == 1
    assert "pixelbook convert" in out


def test_a_missing_outline_is_an_error(check, tmp_path):
    (tmp_path / "books" / "demo" / "ch01" / "outline.yaml").unlink()

    code, out = check(script())

    assert code == 1
    assert "旁白稿：找不到大纲" in _errors(out)


def test_an_outline_without_this_episode_is_an_error(check):
    data = outline()
    data["episodes"][0]["id"] = "ep02"

    code, out = check(script(), data)

    assert code == 1
    assert "旁白稿：大纲" in _errors(out)
    assert "里没有 ep01 这一期" in _errors(out)


def test_a_malformed_outline_is_an_error(check):
    data = outline()
    del data["episodes"][0]["topic"]

    code, out = check(script(), data)

    assert code == 1
    assert "旁白稿：大纲格式不对，先跑 `pixelbook outline`" in _errors(out)
    assert "`topic` 缺失" in _errors(out)


def test_a_title_that_differs_from_the_outline_topic_is_an_error(check):
    data = script()
    data["title"] = "第二单元"

    code, out = check(data)

    assert code == 1
    assert (
        "旁白稿：`title` 是「第二单元」，但大纲里 ep01 的主题 `topic` 是「第一单元」"
        in _errors(out)
    )


def test_an_outline_point_that_no_scene_covers_is_an_error(check):
    data = outline()
    data["episodes"][0]["points"].append(
        {"id": "p02", "text": "第二条观点", "cite": "ch01-¶003"}
    )

    code, out = check(script(), data)

    assert code == 1
    assert "旁白稿：大纲里 ep01 的观点 p02 没有被任何画面的 `points` 讲到" in _errors(
        out
    )


def test_a_scene_citing_a_point_not_in_this_episode_is_an_error(check):
    # p02 是另一期的观点，p09 根本不存在：对这一期都算不存在
    data = outline()
    data["episodes"].append({**data["episodes"][0], "id": "ep02", "points": []})
    data["episodes"][1]["points"] = [
        {"id": "p02", "text": "另一期的观点", "cite": "ch01-¶003"}
    ]
    lines = script()
    lines["segments"][0]["scenes"][0]["points"] = ["p01", "p02", "p09"]

    code, out = check(lines, data)

    assert code == 1
    assert "s01-c01：`points` 里的 p02、p09 不是大纲里 ep01 的观点" in _errors(out)


def test_scene_points_must_be_a_list_of_ids(check):
    data = script()
    data["segments"][0]["scenes"][0]["points"] = "p01"

    code, out = check(data)

    assert code == 1
    assert "（s01-c01）：`points` 必须是" in _errors(out)


def _warnings(out: str) -> str:
    """输出里的警告块。"""
    return out.split("警告")[1]


@pytest.mark.parametrize(
    ("units", "cite", "outside"),
    [
        ([1], ["ch01-¶001", "ch01-¶006"], "ch01-¶006"),
        ([1], "ch01-¶007", "ch01-¶007"),
        (
            [{"unit": 1, "from": "ch01-¶001", "to": "ch01-¶002"}],
            "ch01-¶003",
            "ch01-¶003",
        ),
    ],
    ids=["another unit", "a footnote", "outside the paragraph range"],
)
def test_a_cite_outside_the_episode_units_is_only_a_warning(
    check, units, cite, outside
):
    data = outline()
    data["episodes"][0]["units"] = units
    lines = script()
    _line(lines, 3)["cite"] = cite

    code, out = check(lines, data)

    assert code == 0
    assert "报错：无" in out
    assert (
        f"s01-l03：`cite` 里的 {outside} 不在本期覆盖的单元或段落范围里"
        in _warnings(out)
    )
    assert "旁白稿检查通过" in out


def test_a_footnote_marked_inside_the_episode_is_not_a_warning(check):
    data = outline()
    data["episodes"][0]["units"] = [1, 2]
    lines = script()
    _line(lines, 3)["cite"] = ["ch01-¶006", "ch01-¶007"]

    assert "警告：无" in check(lines, data)[1]


def test_a_cite_inside_a_listed_range_or_unit_is_not_a_warning(check):
    data = outline()
    data["episodes"][0]["units"] = [
        {"unit": 1, "from": "ch01-¶001", "to": "ch01-¶004"},
        2,
    ]
    lines = script()
    _line(lines, 3)["cite"] = ["ch01-¶003", "ch01-¶006"]

    assert "警告：无" in check(lines, data)[1]


@pytest.mark.parametrize(
    "text",
    [
        "对自己的职业生涯负责，不害",
        "对自己的职业生涯负责 不害",
        "对自己的“职业生涯”负责不害",
        "它说：对自己的职业生涯负责。不害",
    ],
    ids=["same punctuation", "space for comma", "added quotes", "different period"],
)
def test_twelve_characters_copied_from_a_cited_paragraph_is_a_warning(check, text):
    # 去掉空白和标点后，「对自己的职业生涯负责不害」12 个字和 ¶003 相同
    data = script()
    _line(data, 3)["text"] = text
    _line(data, 3)["cite"] = ["ch01-¶001", "ch01-¶003"]

    code, out = check(data)

    assert code == 0
    assert (
        "s01-l03：和 ch01-¶003 有 12 个字连续相同（对自己的职业生涯负责不害），"
        "疑似照搬原文" in _warnings(out)
    )


def test_eleven_characters_copied_is_not_a_warning(check):
    data = script()
    _line(data, 3)["text"] = "对自己的职业生涯负责，不"
    _line(data, 3)["cite"] = "ch01-¶003"

    assert "警告：无" in check(data)[1]


def test_quoting_the_tip_box_title_next_to_a_cited_paragraph_is_not_copying(
    check, episode
):
    # 提示框标题可以照用；正文复述了标题时，照用标题不算照搬那一段
    chapter = episode.parent.parent / "chapters" / "ch01.md"
    chapter.write_text(
        CHAPTER.replace(
            "另一个单元的正文[1]。",
            "所以说，程序员要为自己的职业生涯负责，这是第一条[1]。",
        )
    )
    data = outline()
    data["episodes"][0]["units"] = [1, 2]
    lines = script()
    _line(lines, 3)["text"] = "提示1：程序员要为自己的职业生涯负责"
    _line(lines, 3)["cite"] = "ch01-¶006"

    code, out = check(lines, data)

    assert code == 0, out
    assert "警告：无" in out


def test_copying_is_only_compared_with_the_cited_paragraphs(check):
    data = script()
    _line(data, 3)["text"] = "对自己的职业生涯负责，不害"
    _line(data, 3)["cite"] = "ch01-¶001"

    assert "警告：无" in check(data)[1]


def test_a_factcheck_missing_a_line_is_an_error_naming_that_line(check):
    data = script()
    report = factcheck(data)
    del report["lines"][2]

    code, out = check(data, factcheck=report)

    assert code == 1
    assert "s01-l03：`factcheck.yaml` 里没有这一句的判定" in _errors(out)


def test_a_factcheck_judging_a_line_not_in_the_script_is_an_error(check):
    data = script()
    report = factcheck(data)
    report["lines"].append(
        {
            "id": "s09-l01",
            "text": "旧句",
            "cite": "ch01-¶001",
            "verdict": "partial",
            "reason": "旧句",
        }
    )

    code, out = check(data, factcheck=report)

    assert code == 1
    assert "s09-l01：`factcheck.yaml` 里有这一句的判定，但旁白稿里没有这一句" in (
        _errors(out)
    )


def _bad_verdict(report: dict) -> None:
    report["lines"][0]["verdict"] = "maybe"


def _no_reason(report: dict) -> None:
    del report["lines"][1]["reason"]


def _no_round(report: dict) -> None:
    del report["round"]


def _round_zero(report: dict) -> None:
    report["round"] = 0


def _duplicate(report: dict) -> None:
    report["lines"].append(dict(report["lines"][0]))


@pytest.mark.parametrize(
    ("damage", "problem"),
    [
        (
            _bad_verdict,
            "第 1 条（s01-l01）：`verdict` 必须是 supported / partial / unsupported 之一",
        ),
        (_no_reason, "第 2 条：`reason` 缺失"),
        (_no_round, "核对结果：`round` 缺失"),
        (_round_zero, "核对结果：`round` 必须是正整数"),
        (_duplicate, "第 61 条（s01-l01）：`id` 重复"),
    ],
    ids=["unknown verdict", "missing reason", "missing round", "round 0", "repeat"],
)
def test_a_malformed_factcheck_is_an_error(check, damage, problem):
    data = script()
    report = factcheck(data)
    damage(report)

    code, out = check(data, factcheck=report)

    assert code == 1
    assert f"旁白稿：`factcheck.yaml` 格式不对：{problem}" in _errors(out)


def test_a_complete_factcheck_passes_whatever_the_verdicts(check):
    data = script()
    report = factcheck(data)
    report["round"] = 3
    report["lines"][0]["verdict"] = "unsupported"
    report["lines"][1]["verdict"] = "partial"

    code, out = check(data, factcheck=report)

    assert code == 0
    assert "报错：无" in out


@pytest.mark.parametrize(
    ("field", "value"),
    [("text", "核对之后改过的字幕"), ("cite", ["ch01-¶001", "ch01-¶003"])],
)
def test_a_line_changed_after_the_factcheck_is_an_error(check, field, value):
    data = script()
    report = factcheck(data)
    _line(data, 4)[field] = value

    code, out = check(data, factcheck=report)

    assert code == 1
    assert (
        "s01-l04：字幕或出处和 `factcheck.yaml` 里核对过的不同，核对之后改过这一句"
        in _errors(out)
    )


def test_segment_titles_that_differ_from_the_outline_are_an_error(check):
    data = script()
    data["segments"][0]["title"] = "开头"
    plan = outline()
    plan["episodes"][0]["segments"].append({"title": "收尾", "minutes": 1})

    code, out = check(data, plan)

    assert code == 1
    assert (
        "旁白稿：段标题依次是「开头」，但大纲里 ep01 的段依次是「开场」「收尾」"
        in _errors(out)
    )


def _prompt(pixelbook, episode, data, outline=None, factcheck=None):
    return pixelbook(["factcheck-prompt", str(episode)], data, outline, factcheck)


def _token(prompt: str) -> str:
    return re.search(r"校验码：(\S+)\s*$", prompt)[1]


def test_the_prompt_lists_each_cited_paragraph_once_and_lines_refer_to_ids(
    pixelbook, episode
):
    code, out = _prompt(pixelbook, episode, script())

    assert code == 0
    # 说明在前：裁判只按每句出处列出的段落判断，回答先抄回校验码
    assert out.startswith("你是一份中文讲解视频旁白的事实核对员。")
    assert "packet: <校验码>" in out
    # 没有主题、段标题、画面说明和观点
    for hidden in ("第一单元", "开场", "一个方块", "p01"):
        assert hidden not in out
    # 原文段落按原文顺序各列一次；中间没引用的段落用「……」隔开
    sources = out.split("--- 原文段落 ---\n\n")[1].split("\n\n--- 旁白句 ---")[0]
    assert sources == (
        "ch01-¶001 第一段正文。\n"
        "ch01-¶002 > 一段引文。\n"
        "……\n"
        "ch01-¶004 [图 images/00001.jpeg]"
    )
    # 旁白句只写出处编号，不重复原文
    lines = out.split("--- 旁白句 ---\n\n")[1].split("\n\n--- 校验码 ---")[0]
    assert lines.startswith(
        f"s01-l01（出处：ch01-¶001）\n旁白：{LINE_TEXT}\n\n"
        f"s01-l02（出处：ch01-¶002、ch01-¶004）\n旁白：{LINE_TEXT}\n\n"
    )
    assert lines.count("旁白：") == 60
    assert re.search(r"\n--- 校验码 ---\n\n校验码：fc-[0-9a-f]{12}\n$", out)


def test_the_prompt_shows_tip_boxes_and_subheadings_next_to_cited_paragraphs(
    pixelbook, episode
):
    # 提示框标题和小标题都不是编号段落，引用不到；引用紧挨着它们的段落时，材料里带上它们
    chapter = episode.parent.parent / "chapters" / "ch01.md"
    chapter.write_text(
        CHAPTER.replace(
            "ch01-¶003 第三段", "### 提示0　一条在前面的提示\n\nch01-¶003 第三段"
        ).replace("ch01-¶002 >", "#### 一个小标题[1]\n\nch01-¶002 >")
    )
    data = outline()
    data["episodes"][0]["units"] = [1, 2]
    lines = script()
    _line(lines, 1)["cite"] = ["ch01-¶002", "ch01-¶003"]
    _line(lines, 3)["cite"] = ["ch01-¶006", "ch01-¶003"]

    code, out = _prompt(pixelbook, episode, lines, data)

    assert code == 0, out
    # ¶002 和 ¶003 共用一个提示框，只列一次；¶003 只列一次，虽然两句都引用它
    sources = out.split("--- 原文段落 ---\n\n")[1].split("\n\n--- 旁白句 ---")[0]
    assert sources == (
        "ch01-¶001 第一段正文。\n"
        "小标题：一个小标题\n"
        "ch01-¶002 > 一段引文。\n"
        "提示框：提示0　一条在前面的提示\n"
        "ch01-¶003 第三段：程序员要对自己的职业生涯负责，不害怕承认无知或错误。\n"
        "ch01-¶004 [图 images/00001.jpeg]\n"
        "……\n"
        "提示框：提示1　程序员要为自己的职业生涯负责\n"
        "ch01-¶006 另一个单元的正文[1]。"
    )


def test_the_prompt_is_refused_while_the_script_has_errors(pixelbook, episode):
    data = script()
    _line(data, 3)["cite"] = "ch01-¶099"

    code, out = _prompt(pixelbook, episode, data)

    assert code == 1
    assert "s01-l03：`cite` 里的 ch01-¶099 在 ch01.md 里不存在" in out
    assert "旁白：" not in out


def test_the_prompt_ignores_a_factcheck_from_an_earlier_version(pixelbook, episode):
    data = script()
    report = factcheck(data)
    _line(data, 1)["text"] = "改过的字幕"

    code, out = _prompt(pixelbook, episode, data, factcheck=report)

    assert code == 0
    assert "s01-l01（出处：ch01-¶001）\n旁白：改过的字幕\n" in out


def test_the_token_changes_with_the_script(pixelbook, episode):
    data = script()
    first = _token(_prompt(pixelbook, episode, data)[1])
    _line(data, 1)["text"] = "改过的字幕"

    assert _token(_prompt(pixelbook, episode, data)[1]) != first


def verdicts(data: dict) -> dict:
    """裁判对 `data` 的回答：每句一条，全部支持（校验码由 `record` 补上）。"""
    return {
        "lines": [
            {"id": line["id"], "verdict": "supported", "reason": "原文这样说"}
            for line in data["segments"][0]["scenes"][0]["lines"]
        ]
    }


@pytest.fixture
def record(pixelbook, episode, tmp_path):
    """先为旁白稿生成给裁判的 prompt，再写出裁判的回答，运行 `pixelbook factcheck-record`。

    回答里没有 `packet` 时补上 prompt 的校验码，就像裁判照做了一样；`sign=False` 时不补。
    """

    def run(data: dict, answer: dict, factcheck: dict | None = None, sign: bool = True):
        if sign and "packet" not in answer:
            token = _token(_prompt(pixelbook, episode, data, factcheck=factcheck)[1])
            answer = {"packet": token, **answer}
        answer_path = tmp_path / "verdicts.yaml"
        _dump(answer_path, answer)
        argv = ["factcheck-record", str(episode), str(answer_path)]
        return pixelbook(argv, data, factcheck=factcheck)

    return run


def test_an_answer_with_a_wrong_token_is_refused(record, episode):
    data = script()

    code, out = record(data, {"packet": "fc-0123456789ab", **verdicts(data)})

    assert code == 1
    assert "回答里的校验码 fc-0123456789ab 和当前旁白稿生成的 prompt 的校验码" in out
    assert not (episode / "factcheck.yaml").exists()


def test_an_answer_without_a_token_is_refused(record, episode):
    data = script()

    code, out = record(data, verdicts(data), sign=False)

    assert code == 1
    assert "`packet` 缺失" in out
    assert not (episode / "factcheck.yaml").exists()


def test_an_answer_to_a_prompt_from_before_an_edit_is_refused(
    pixelbook, record, episode
):
    data = script()
    stale = _token(_prompt(pixelbook, episode, data)[1])
    _line(data, 1)["text"] = "出题之后改过的字幕"

    code, out = record(data, {"packet": stale, **verdicts(data)})

    assert code == 1
    assert "校验码" in out
    assert not (episode / "factcheck.yaml").exists()


def test_recording_the_first_round_writes_a_factcheck_that_passes_check(
    record, check, episode
):
    data = script()

    code, _ = record(data, verdicts(data))

    assert code == 0
    written = yaml.safe_load((episode / "factcheck.yaml").read_text())
    assert written["round"] == 1
    assert written["lines"][1] == {
        "id": "s01-l02",
        "text": LINE_TEXT,
        "cite": ["ch01-¶002", "ch01-¶004"],
        "verdict": "supported",
        "reason": "原文这样说",
    }
    assert check(data)[0] == 0


def test_recording_again_counts_the_next_round(record, episode):
    data = script()
    earlier = factcheck(data)
    earlier["round"] = 2

    record(data, verdicts(data), factcheck=earlier)

    assert yaml.safe_load((episode / "factcheck.yaml").read_text())["round"] == 3


def _drop_second(answer: dict) -> None:
    del answer["lines"][1]


def _add_unknown(answer: dict) -> None:
    answer["lines"].append({"id": "s09-l01", "verdict": "supported", "reason": "无"})


def _swap(answer: dict) -> None:
    lines = answer["lines"]
    lines[0], lines[1] = lines[1], lines[0]


def _bad_verdict(answer: dict) -> None:
    answer["lines"][0]["verdict"] = "yes"


@pytest.mark.parametrize(
    ("damage", "problem"),
    [
        (_drop_second, "第 2 条应该是 s01-l02，实际是 s01-l03"),
        (_add_unknown, "第 61 条应该没有（旁白稿只有 60 句），实际是 s09-l01"),
        (_swap, "第 1 条应该是 s01-l01，实际是 s01-l02"),
        (
            _bad_verdict,
            "第 1 条（s01-l01）：`verdict` 必须是 supported / partial / unsupported",
        ),
    ],
    ids=["missing", "extra", "out of order", "unknown verdict"],
)
def test_an_answer_that_does_not_match_the_script_is_refused(
    record, episode, damage, problem
):
    data = script()
    answer = verdicts(data)
    damage(answer)

    code, out = record(data, answer)

    assert code == 1
    assert problem in out
    assert not (episode / "factcheck.yaml").exists()


def test_the_summary_pins_unsupported_lines_above_partial_ones(record):
    data = script()
    _line(data, 5)["text"] = "这句原文里没有"
    answer = verdicts(data)
    answer["lines"][1]["verdict"] = "partial"
    answer["lines"][1]["reason"] = "多了一个例子"
    answer["lines"][4]["verdict"] = "unsupported"
    answer["lines"][4]["reason"] = "原文没有这个结论"

    code, out = record(data, answer)

    assert code == 0
    assert out.index("不支持（1 句）") < out.index("部分支持（1 句）")
    assert "  s01-l05「这句原文里没有」：原文没有这个结论" in out
    assert f"  s01-l02「{LINE_TEXT}」：多了一个例子" in out
    assert "第 1 轮：支持 58 句，部分支持 1 句，不支持 1 句" in out
    assert "还可以改写后再核对 2 轮" in out


def test_the_summary_says_when_the_rounds_are_used_up(record):
    data = script()
    earlier = factcheck(data)
    earlier["round"] = 2
    answer = verdicts(data)
    answer["lines"][0]["verdict"] = "unsupported"

    code, out = record(data, answer, factcheck=earlier)

    assert code == 0
    assert "已核对 3 轮，轮次用完" in out


def test_check_always_prints_the_estimate_and_each_segment_against_the_outline(check):
    # 60 句 × 20 字 = 1200 字，4:48；大纲给这一段 5 分钟
    code, out = check(script())

    assert code == 0
    assert "估算时长：4:48（1200 字，按 250 字/分钟，应该在 4:00–6:00 内）" in out
    assert "  s01 开场：1200 字，估算 4:48，大纲 5:00（5 分钟）" in out
    assert out.index("估算时长") < out.index("报错")


def _two_segments(first: int, second: int) -> tuple[dict, dict]:
    """两段的旁白稿（各 `first`、`second` 句，每句 20 字）和各给 2.5 分钟的大纲。"""
    data = script(first + second)
    lines = data["segments"][0]["scenes"][0]["lines"]
    data["segments"].append(
        {
            "id": "s02",
            "title": "收尾",
            "scenes": [
                {"id": "s02-c01", "description": "一个方块", "lines": lines[first:]}
            ],
        }
    )
    del lines[first:]
    for n, line in enumerate(data["segments"][1]["scenes"][0]["lines"], start=1):
        line["id"] = f"s02-l{n:02d}"
    plan = outline()
    plan["episodes"][0]["segments"] = [
        {"title": "开场", "minutes": 2.5},
        {"title": "收尾", "minutes": 2.5},
    ]
    return data, plan


@pytest.mark.parametrize(
    ("first", "second", "warned"),
    [
        # 2.5 分钟 = 150 秒，25% 是 37.5 秒：每句 20 字 4.8 秒
        (31, 31, []),  # 148.8 秒，各差 1 秒
        (39, 23, ["s02"]),  # 187 秒（多 37 秒，不到 37.5）与 110 秒（少 40 秒）
        (40, 22, ["s01", "s02"]),  # 192 秒、106 秒
    ],
    ids=["close", "s02 short", "both off"],
)
def test_a_segment_far_from_its_outline_minutes_is_a_warning(
    check, first, second, warned
):
    data, plan = _two_segments(first, second)

    code, out = check(data, plan)

    assert code == 0, out
    for segment in ("s01", "s02"):
        flagged = f"  {segment}：估算" in out.split("警告")[1]
        assert flagged == (segment in warned), out


@pytest.mark.parametrize(
    "where",
    ["ch01-¶003 第三段", "ch01-¶004 [图"],
    ids=["heading before the paragraph", "heading after the paragraph"],
)
def test_quoting_the_subheading_next_to_a_cited_paragraph_is_not_copying(
    check, episode, where
):
    # 和提示框标题一样，紧挨着这一段的 `####` 小标题可以照用
    chapter = episode.parent.parent / "chapters" / "ch01.md"
    chapter.write_text(
        CHAPTER.replace(where, f"#### 程序员要对自己的职业生涯负责\n\n{where}")
    )
    data = script()
    _line(data, 3)["text"] = "小标题说程序员要对自己的职业生涯负责"
    _line(data, 3)["cite"] = "ch01-¶003"

    code, out = check(data)

    assert code == 0, out
    assert "警告：无" in out


def test_a_subheading_not_next_to_the_cited_paragraph_does_not_excuse_copying(
    check, episode
):
    chapter = episode.parent.parent / "chapters" / "ch01.md"
    chapter.write_text(
        CHAPTER.replace(
            "ch01-¶002 >", "#### 程序员要对自己的职业生涯负责\n\nch01-¶002 >"
        )
    )
    data = script()
    _line(data, 3)["text"] = "小标题说程序员要对自己的职业生涯负责"
    _line(data, 3)["cite"] = "ch01-¶003"

    assert "s01-l03：和 ch01-¶003 有 14 个字连续相同" in check(data)[1]


def _described(description: str) -> dict:
    data = script()
    data["segments"][0]["scenes"][0]["description"] = description
    return data


@pytest.mark.parametrize(
    "description",
    [
        "一个写着 DRY 的方块",
        "一个写着 dry 的方块",  # 拉丁字母不分大小写
        "“职业生涯负责”几个字",  # 引号里的词语，去掉空白和标点后比较
        "「程序员要为自己的职业生涯负责」的牌子",  # 标题里的也算
        "提示1 的牌子亮起",
        "一个方块落下",  # 没有能机械提取的词语
    ],
)
def test_description_terms_found_in_the_chapter_pass(check, episode, description):
    chapter = episode.parent.parent / "chapters" / "ch01.md"
    chapter.write_text(CHAPTER.replace("第一段正文。", "第一段正文，讲 DRY 原则。"))

    code, out = check(_described(description))

    assert code == 0, out
    assert "警告：无" in out


@pytest.mark.parametrize(
    ("description", "term"),
    [
        ("一个 Bug 方块", "Bug"),
        ("一张 jpeg 图", "jpeg"),  # 图片占位符里的文件名不算原文
        ("「不存在的说法」的牌子", "不存在的说法"),
        ("“职业 生涯 负责人”", "职业 生涯 负责人"),
        ("提示9 的牌子", "提示9"),
        ("一个 DRYER 方块", "DRYER"),  # 按整词比较
    ],
)
def test_a_description_term_not_in_the_chapter_is_a_warning(
    check, episode, description, term
):
    chapter = episode.parent.parent / "chapters" / "ch01.md"
    chapter.write_text(CHAPTER.replace("第一段正文。", "第一段正文，讲 DRY 原则。"))

    code, out = check(_described(description))

    assert code == 0
    assert (
        f"s01-c01：画面说明里的「{term}」在 ch01.md 里没有出现" in out.split("警告")[1]
    )
