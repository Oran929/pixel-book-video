"""固定片尾（票 #15，ADR-0010）：每期末尾统一的收尾旁白，所有期、所有书都一样。

片尾不写进旁白稿 `script.yaml`，没有出处，不参加 `pixelbook check` 和语义核对；
配音时由 `with_outro` 接在旁白稿后面，作为保留的一段、一个画面进入合成清单，
之后的时间轴、渲染、帧数核对都把它当普通的段处理。

**改片尾的措辞只改 `OUTRO_LINES`。** 每项是一条字幕（不超过 20 字），在自然停顿处断开；
措辞由用户定。
"""

from dataclasses import replace

from pixelbook.script import Line, Scene, Script, Segment

OUTRO_LINES = (
    "本期先讲到这里，",
    "欢迎大家阅读原著了解更原汁原味的内容，",
    "我们下一期见",
)

# 保留的 ID：合成清单里片尾的段、画面，旁白句是 `outro-l01`……；
# 和 video/src/episode/manifest.ts 的 OUTRO_SEGMENT 一致
OUTRO_SEGMENT = "outro"
OUTRO_SCENE = f"{OUTRO_SEGMENT}-c01"
OUTRO_TITLE = "片尾"


class OutroError(Exception):
    pass


def with_outro(script: Script) -> Script:
    """`script` 后面接上片尾这一段。旁白稿里的 ID 占用了片尾的保留 ID 时抛出 `OutroError`。"""
    lines = [
        Line(id=f"{OUTRO_SEGMENT}-l{n:02d}", text=text, cite=[])
        for n, text in enumerate(OUTRO_LINES, start=1)
    ]
    reserved = {OUTRO_SEGMENT, OUTRO_SCENE, *(line.id for line in lines)}
    used = {
        item.id
        for segment in script.segments
        for item in [
            segment,
            *segment.scenes,
            *(l for s in segment.scenes for l in s.lines),
        ]
    }
    if taken := sorted(reserved & used):
        raise OutroError(f"旁白稿里的 ID {'、'.join(taken)} 是片尾保留的，换一个 ID")
    outro = Segment(
        id=OUTRO_SEGMENT,
        title=OUTRO_TITLE,
        scenes=[Scene(id=OUTRO_SCENE, description=OUTRO_TITLE, lines=lines)],
    )
    return replace(script, segments=[*script.segments, outro])
