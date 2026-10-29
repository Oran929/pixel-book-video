"""`pixelbook sync-minutes <旁白稿>`：大纲的 `minutes` 跟着旁白稿走。

把这一期每段的估算分钟数（取到 `check.MINUTES_STEP`）写回同一章大纲里这一期的
`segments[].minutes`。只改这几个数，大纲里的注释、别的期和其他写法原样保留。定稿的旁白稿
由 `pixelbook check` 核对两边一致（`check.minutes_follow_script`）。
"""

from pathlib import Path

import yaml

from pixelbook.check import estimate, outline_episode
from pixelbook.episode_path import EpisodePath
from pixelbook.outline import SECONDS, clock
from pixelbook.script import ScriptError, load_script


def sync_minutes(path: Path) -> str:
    """改写大纲，返回每段改了什么；段和大纲对不上、取整后总时长不在范围内时抛出错误、不写文件。"""
    episode = EpisodePath.from_script(path)
    script = load_script(path)
    outline, problem = outline_episode(episode)
    if problem:
        raise ScriptError(f"{path}: {problem}")
    ours = [segment.title for segment in script.segments]
    planned = [segment.title for segment in outline.segments]
    if ours != planned:
        raise ScriptError(
            f"{path}: 段标题和大纲里 {outline.id} 的段不一致，先让段和大纲一一对应"
        )
    timing = estimate(script, outline)
    minutes = [segment.estimated_minutes for segment in timing.segments]
    seconds = round(sum(minutes) * 60)
    low, high = SECONDS
    if not low <= seconds <= high or not all(minutes):
        raise ScriptError(
            f"{path}: 取整后各段 `minutes` 是 {'、'.join(f'{m:g}' for m in minutes)}，"
            f"总和 {clock(seconds)}，应该在 {clock(low)}–{clock(high)} 内且每段大于 0；"
            "改稿后再写回"
        )
    text = episode.outline.read_text()
    nodes = _minutes_nodes(text, outline.id)
    # 从后往前替换，前面的位置不受影响
    for node, value in sorted(
        zip(nodes, minutes, strict=True), key=lambda pair: -pair[0].start_mark.index
    ):
        start, end = node.start_mark.index, node.end_mark.index
        text = text[:start] + repr(float(value)) + text[end:]
    episode.outline.write_text(text)
    rows = [f"已写入 {episode.outline}（{outline.id}）："]
    rows += [
        f"  {segment.id} {segment.title}：{old.minutes:g} → {value:g}"
        for segment, old, value in zip(
            timing.segments, outline.segments, minutes, strict=True
        )
    ]
    return "\n".join(rows)


def _minutes_nodes(text: str, episode_id: str) -> list[yaml.ScalarNode]:
    """大纲里 `episode_id` 这一期各段 `minutes` 的标量节点（带在文本里的位置）。"""
    root = yaml.compose(text)
    for item in _value(root, "episodes").value:
        if _value(item, "id").value == episode_id:
            return [_value(seg, "minutes") for seg in _value(item, "segments").value]
    raise ScriptError(f"大纲里没有 {episode_id}")


def _value(node: yaml.Node, key: str) -> yaml.Node:
    return next(v for k, v in node.value if k.value == key)
