"""大纲检查：`pixelbook outline <大纲>`（票 #7）。

转换结果用夹具手写成 `books/demo/chapters/ch01.md`，格式和 `pixelbook convert` 的输出相同；
大纲是 `books/demo/ch01/outline.yaml`，每个用例从 `outline()` 出发改一处再写出。
"""

import pytest
import yaml

from pixelbook import cli

# 两个单元：单元 1 是 ¶002–¶005（含引文和图片），单元 2 是 ¶006–¶009；
# ¶001 是章首导语，¶010 是章末脚注，都不属于任何单元
CHAPTER = """\
# 第1章　示例

ch01-¶001 本章导语。

## 1　第一单元

ch01-¶002 第一段正文。

### 提示1　一条提示

ch01-¶003 > 一段引文。

ch01-¶004 [图 images/00001.jpeg]

#### 小标题

ch01-¶005 第一单元最后一段。

## 2　第二单元

ch01-¶006 第二单元第一段。

ch01-¶007 第二单元第二段。

ch01-¶008 第二单元第三段。

ch01-¶009 第二单元最后一段。

---

ch01-¶010 [1]一条脚注。
"""


def outline():
    """一份能通过检查的大纲：ep01 覆盖单元 1，ep02 覆盖单元 2 的前半部分。"""
    return {
        "chapter": 1,
        "episodes": [
            {
                "id": "ep01",
                "topic": "第一单元",
                "units": [1],
                "segments": [
                    {"title": "开场", "minutes": 1},
                    {"title": "引文", "minutes": 1},
                    {"title": "图", "minutes": 1.5},
                    {"title": "收尾", "minutes": 1},
                ],
                "points": [
                    {"id": "p01", "text": "第一个观点", "cite": "ch01-¶002"},
                    {
                        "id": "p02",
                        "text": "第二个观点",
                        "cite": ["ch01-¶003", "ch01-¶004"],
                    },
                ],
            },
            {
                "id": "ep02",
                "topic": "第二单元（上）",
                "units": [{"unit": 2, "from": "ch01-¶006", "to": "ch01-¶007"}],
                "segments": [
                    {"title": "开场", "minutes": 1},
                    {"title": "一", "minutes": 1},
                    {"title": "二", "minutes": 1},
                    {"title": "三", "minutes": 1},
                    {"title": "收尾", "minutes": 1},
                ],
                "points": [
                    {"id": "p03", "text": "第三个观点", "cite": "ch01-¶006"},
                ],
            },
        ],
    }


@pytest.fixture
def book(tmp_path):
    """临时仓库里的书目录 `books/demo/`，转换结果 `chapters/ch01.md` 是 `CHAPTER`。"""
    book = tmp_path / "books" / "demo"
    (book / "chapters").mkdir(parents=True)
    (book / "chapters" / "ch01.md").write_text(CHAPTER)
    return book


@pytest.fixture
def check(book, monkeypatch, capsys):
    """写出大纲，跑 `pixelbook outline`，返回 (退出码, 输出)。"""
    monkeypatch.setattr(cli, "REPO_ROOT", book.parent.parent)

    def run(data, path=book / "ch01" / "outline.yaml"):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
        code = cli.main(["outline", str(path)])
        return code, capsys.readouterr().out

    return run


def test_a_valid_outline_passes(check):
    code, out = check(outline())
    assert code == 0
    assert "通过" in out


def _ep(data, n):
    return data["episodes"][n - 1]


@pytest.mark.parametrize(
    ("change", "episode", "field"),
    [
        (lambda d: _ep(d, 1).pop("topic"), "ep01", "topic"),
        (lambda d: _ep(d, 1).update(summary="多写的字段"), "ep01", "summary"),
        (lambda d: _ep(d, 2).update(id="2"), "第 2 期（2）", "id"),
        (lambda d: _ep(d, 1).update(units=["一"]), "ep01", "units"),
        (lambda d: _ep(d, 2)["units"][0].pop("to"), "ep02", "to"),
        (
            lambda d: _ep(d, 1)["segments"][1].update(minutes="一分钟"),
            "ep01",
            "minutes",
        ),
        (lambda d: _ep(d, 2).update(points=[]), "ep02", "points"),
        # 出处不支持范围
        (
            lambda d: _ep(d, 2)["points"][0].update(cite="ch01-¶006–¶007"),
            "ep02",
            "cite",
        ),
    ],
)
def test_a_malformed_outline_names_the_episode_and_field(check, change, episode, field):
    data = outline()
    change(data)
    code, out = check(data)
    assert code == 1
    assert episode in out
    assert f"`{field}`" in out


def test_the_chapter_number_must_match_the_chapter_dir(check):
    data = outline()
    data["chapter"] = 2
    code, out = check(data)
    assert code == 1
    assert "`chapter`" in out
    assert "ch01" in out


def test_episode_ids_must_be_unique(check):
    data = outline()
    _ep(data, 2)["id"] = "ep01"
    code, out = check(data)
    assert code == 1
    assert "第 2 期（ep01）" in out
    assert "`id`" in out


def test_segment_titles_must_be_unique_within_an_episode(check):
    data = outline()
    _ep(data, 2)["segments"][4]["title"] = "开场"
    code, out = check(data)
    assert code == 1
    assert "ep02" in out
    assert "`segments`" in out
    assert "开场" in out


def test_point_ids_must_be_unique_across_the_outline(check):
    data = outline()
    _ep(data, 2)["points"][0]["id"] = "p01"
    code, out = check(data)
    assert code == 1
    assert "ep02" in out
    assert "`points`" in out
    assert "p01" in out


@pytest.mark.parametrize("count", [3, 7])
def test_an_episode_has_four_to_six_segments(check, count):
    data = outline()
    # 段数不对，但总时长仍是 5 分钟
    _ep(data, 2)["segments"] = [
        {"title": f"段{n}", "minutes": 5 / count} for n in range(count)
    ]
    code, out = check(data)
    assert code == 1
    assert "ep02" in out
    assert "`segments`" in out
    assert f"{count} 段" in out


# ep01 的四段是 1、1、x、1 分钟
@pytest.mark.parametrize(("minutes", "total"), [(0.5, "3:30"), (3.5, "6:30")])
def test_segment_minutes_must_sum_to_four_to_six(check, minutes, total):
    data = outline()
    _ep(data, 1)["segments"][2]["minutes"] = minutes
    code, out = check(data)
    assert code == 1
    assert "ep01" in out
    assert "`minutes`" in out
    assert total in out


@pytest.mark.parametrize("minutes", [1, 3])
def test_segment_minutes_may_sum_to_exactly_four_or_six(check, minutes):
    data = outline()
    _ep(data, 1)["segments"][2]["minutes"] = minutes
    code, out = check(data)
    assert code == 0, out


def test_every_cite_must_exist_in_the_converted_chapter(check):
    data = outline()
    # 列表里只要有一个编号不存在就报错；ch02 的编号也不在 ch01.md 里
    _ep(data, 1)["points"][1]["cite"] = ["ch01-¶003", "ch01-¶011", "ch02-¶003"]
    code, out = check(data)
    assert code == 1
    assert "第 1 期（ep01）第 2 条观点（p02）" in out
    assert "`cite`" in out
    assert "ch01-¶011、ch02-¶003" in out
    assert "ch01-¶003、" not in out


def test_a_covered_unit_must_exist_in_the_chapter(check):
    data = outline()
    _ep(data, 1)["units"] = [1, 3]
    code, out = check(data)
    assert code == 1
    assert "ep01" in out
    assert "`units`" in out
    assert "单元 3" in out


@pytest.mark.parametrize(
    ("start", "end", "problem"),
    [
        # 范围的两端都要在这个单元里（¶005 在单元 1、¶010 是脚注）
        ("ch01-¶005", "ch01-¶007", "ch01-¶005"),
        ("ch01-¶006", "ch01-¶010", "ch01-¶010"),
        ("ch01-¶008", "ch01-¶007", "前面"),
    ],
)
def test_a_unit_range_must_lie_within_the_unit(check, start, end, problem):
    data = outline()
    _ep(data, 2)["units"] = [{"unit": 2, "from": start, "to": end}]
    code, out = check(data)
    assert code == 1
    assert "ep02" in out
    assert "`units`" in out
    assert problem in out


def test_all_problems_are_listed_at_once(check):
    data = outline()
    _ep(data, 1)["points"][0]["cite"] = "ch01-¶099"
    _ep(data, 2)["segments"].pop()
    _ep(data, 2)["segments"].pop()
    code, out = check(data)
    assert code == 1
    assert "ch01-¶099" in out
    assert "3 段" in out


def test_the_outline_must_sit_in_a_chapter_dir(check, book):
    code, out = check(outline(), path=book / "outline.yaml")
    assert code == 1
    assert "chNN/outline.yaml" in out


def test_the_chapter_must_be_converted_first(check, book):
    (book / "chapters" / "ch01.md").unlink()
    code, out = check(outline())
    assert code == 1
    assert "pixelbook convert" in out
