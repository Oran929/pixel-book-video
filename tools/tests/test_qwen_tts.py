"""真实引擎只测不加载模型的部分。"""

from pixelbook.qwen_tts import QwenTtsEngine


def test_reference_padding_is_part_of_the_engine_settings(monkeypatch):
    # 补静音会改变生成结果，它变了，音色指纹（也就是缓存）必须跟着变
    before = QwenTtsEngine().settings
    monkeypatch.setattr(QwenTtsEngine, "REF_PAD_SECONDS", (0.3, 0.6))

    assert QwenTtsEngine().settings != before
    assert QwenTtsEngine().settings["ref_pad_seconds"] == [0.3, 0.6]
