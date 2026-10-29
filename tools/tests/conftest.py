"""测试共用的音色、旁白稿和期目录。

常量和辅助函数供测试文件 `from conftest import ...` 直接用（改写旁白稿、换音色时要以它们为底）。
"""

import pytest

from pixelbook.asr import FakeAsrEngine
from pixelbook.outro import OUTRO_LINES
from pixelbook.verification import Verifier
from pixelbook.voice import Voice

# 配音时接在每期旁白稿后面的固定片尾（票 #15）：TTS 收到的文字以它结尾
OUTRO = list(OUTRO_LINES)

# 用参考音频克隆的音色；配音用假引擎，参考音频只参与指纹
VOICE = Voice(
    model="base-model",
    ref_audio="voices/tianmei.wav",
    ref_text="你好。",
    params={"language": "chinese"},
)

# 两段、三句的旁白稿；第三句带手写的 `speech`
SCRIPT = """\
title: 程序员修炼之道
status: final
segments:
  - id: s01
    title: 开场
    scenes:
      - id: s01-c01
        description: 书的封面
        lines:
          - id: s01-l01
            text: 今天读一本书
            cite: ch01-¶001
          - id: s01-l02
            text: 它讲怎样写好代码
            cite: ch01-¶002
  - id: s02
    title: 原则
    scenes:
      - id: s02-c01
        description: 一个方块
        lines:
          - id: s02-l01
            text: 不要重复
            speech: 不要重复你自己
            cite: ch01-¶003
"""


def fake_asr_verifier(asr=None, max_retries=2):
    """复核：默认用原样"听见"朗读文本的假识别引擎，阈值 0.1，重试 2 次。"""
    return Verifier(asr or FakeAsrEngine(), max_diff_rate=0.1, max_retries=max_retries)


@pytest.fixture
def script_path(tmp_path):
    """临时目录里 `books/demo/ch01/ep01/script.yaml`，内容是 `SCRIPT`。"""
    path = tmp_path / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    path.parent.mkdir(parents=True)
    path.write_text(SCRIPT)
    return path
