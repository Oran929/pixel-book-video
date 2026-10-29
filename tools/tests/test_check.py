"""旁白稿检查：`pixelbook check <旁白稿>`（票 #8、#9、#11）。

转换结果用夹具手写成 `books/demo/chapters/ch01.md`，格式和 `pixelbook convert` 的输出相同；
大纲是 `books/demo/ch01/outline.yaml`，旁白稿是 `books/demo/ch01/ep01/script.yaml`，
语义核对结果是同一期目录里的 `factcheck.yaml`（给出时才写）。
每个用例从 `script()`、`outline()`、`factcheck()` 出发改一处再写出。
"""

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


def test_the_packet_gives_each_line_with_only_its_cited_paragraphs(pixelbook, episode):
    code, out = pixelbook(["factcheck-packet", str(episode)], script())

    # 没有主题、段标题、画面说明和观点，只有旁白句和原文
    assert code == 0
    assert out.count("## ") == 60
    assert "第一单元" not in out
    assert "开场" not in out
    assert "一个方块" not in out
    assert "p01" not in out
    assert out.startswith(
        f"## s01-l01\n\n旁白：{LINE_TEXT}\n\n原文：\n\nch01-¶001 第一段正文。\n\n"
        f"## s01-l02\n\n旁白：{LINE_TEXT}\n\n原文：\n\n"
        "ch01-¶002 > 一段引文。\nch01-¶004 [图 images/00001.jpeg]\n\n"
    )


def test_the_packet_shows_the_tip_box_next_to_a_cited_paragraph(pixelbook, episode):
    # 提示框标题不是编号段落，引用不到；引用它紧挨着的段落时，材料里带上它
    chapter = episode.parent.parent / "chapters" / "ch01.md"
    chapter.write_text(
        CHAPTER.replace(
            "ch01-¶003 第三段", "### 提示0　一条在前面的提示\n\nch01-¶003 第三段"
        )
    )
    data = outline()
    data["episodes"][0]["units"] = [1, 2]
    lines = script()
    _line(lines, 1)["cite"] = ["ch01-¶002", "ch01-¶003"]
    _line(lines, 3)["cite"] = ["ch01-¶006"]

    code, out = pixelbook(["factcheck-packet", str(episode)], lines, data)

    assert code == 0, out
    # ¶002 和 ¶003 共用一个提示框，只列一次，按原文顺序放在两段之间
    assert (
        "原文：\n\nch01-¶002 > 一段引文。\n提示框：提示0　一条在前面的提示\n"
        "ch01-¶003 第三段" in out
    )
    assert (
        "## s01-l03\n\n旁白：一二三四五六七八九十一二三四五六七八九十\n\n原文：\n\n"
        "提示框：提示1　程序员要为自己的职业生涯负责\nch01-¶006 另一个单元的正文[1]。\n\n"
        in out
    )


def test_the_packet_is_refused_while_the_script_has_errors(pixelbook, episode):
    data = script()
    _line(data, 3)["cite"] = "ch01-¶099"

    code, out = pixelbook(["factcheck-packet", str(episode)], data)

    assert code == 1
    assert "s01-l03：`cite` 里的 ch01-¶099 在 ch01.md 里不存在" in out
    assert "旁白：" not in out


def test_the_packet_ignores_a_factcheck_from_an_earlier_version(pixelbook, episode):
    data = script()
    report = factcheck(data)
    _line(data, 1)["text"] = "改过的字幕"

    code, out = pixelbook(["factcheck-packet", str(episode)], data, factcheck=report)

    assert code == 0
    assert out.startswith("## s01-l01\n\n旁白：改过的字幕\n")


def verdicts(data: dict) -> dict:
    """裁判对 `data` 的回答：每句一条，全部支持。"""
    return {
        "lines": [
            {"id": line["id"], "verdict": "supported", "reason": "原文这样说"}
            for line in data["segments"][0]["scenes"][0]["lines"]
        ]
    }


@pytest.fixture
def record(pixelbook, episode, tmp_path):
    """写出旁白稿和裁判的回答，运行 `pixelbook factcheck-record`。"""

    def run(data: dict, answer: dict, factcheck: dict | None = None):
        answer_path = tmp_path / "verdicts.yaml"
        _dump(answer_path, answer)
        argv = ["factcheck-record", str(episode), str(answer_path)]
        return pixelbook(argv, data, factcheck=factcheck)

    return run


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
