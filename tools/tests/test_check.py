"""旁白稿检查：`pixelbook check <旁白稿>`（票 #8、#9）。

转换结果用夹具手写成 `books/demo/chapters/ch01.md`，格式和 `pixelbook convert` 的输出相同；
大纲是 `books/demo/ch01/outline.yaml`，旁白稿是 `books/demo/ch01/ep01/script.yaml`。
每个用例从 `script()`、`outline()` 出发改一处再写出。
"""

import pytest
import yaml

from pixelbook import cli

# 单元 1：¶001–¶003 是文字段（¶002 是引文），¶004、¶005 是图片段（¶005 带图题）；
# 单元 2：¶006；章末脚注 ¶007 不属于任何单元
CHAPTER = """\
# 第1章　示例

## 1　第一单元

ch01-¶001 第一段正文。

ch01-¶002 > 一段引文。

ch01-¶003 第三段：程序员要对自己的职业生涯负责，不害怕承认无知或错误。

ch01-¶004 [图 images/00001.jpeg]

ch01-¶005 [图 images/00002.jpeg] 图表 1——一张带图题的图

## 2　第二单元

ch01-¶006 另一个单元的正文。

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
                "segments": [
                    {"title": f"第 {n} 段", "minutes": 1} for n in range(1, 6)
                ],
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


@pytest.fixture
def check(tmp_path, capsys):
    """写出旁白稿并运行 `pixelbook check`，返回退出码和输出。"""
    chapters = tmp_path / "books" / "demo" / "chapters"
    chapters.mkdir(parents=True)
    (chapters / "ch01.md").write_text(CHAPTER)
    path = tmp_path / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    path.parent.mkdir(parents=True)
    outline_path = path.parent.parent / "outline.yaml"
    _dump(outline_path, outline())

    def run(data: dict, outline: dict | None = None) -> tuple[int, str]:
        """`outline` 给出时先改写大纲。"""
        if outline is not None:
            _dump(outline_path, outline)
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
        code = cli.main(["check", str(path)])
        return code, capsys.readouterr().out

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


def test_copying_is_only_compared_with_the_cited_paragraphs(check):
    data = script()
    _line(data, 3)["text"] = "对自己的职业生涯负责，不害"
    _line(data, 3)["cite"] = "ch01-¶001"

    assert "警告：无" in check(data)[1]
