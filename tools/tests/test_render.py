"""一键渲染：任何一步失败都停下，报出是哪一步、原因是什么（票 11）。

渲染本身慢，不在这里跑；真实渲染一次的是冒烟测试（`make smoke`）。
"""

import json
import shutil
import subprocess

import pytest
from conftest import SCRIPT, VOICE

from pixelbook import REPO_ROOT
from pixelbook.asr import FakeAsrEngine
from pixelbook.pipeline import SUBTITLE_FONT, VoicingSettings
from pixelbook.render import RenderError, check_frames, render_episode
from pixelbook.tts import FakeTtsEngine
from pixelbook.verification import Verifier
from pixelbook.voice import Voice


def render(script_path, tmp_path, voice=VOICE, revoice=False, **kwargs):
    settings = VoicingSettings(
        engine=FakeTtsEngine(),
        voice=voice,
        verifier=Verifier(FakeAsrEngine(), max_diff_rate=0, max_retries=0),
        pronunciation={},
        public_dir=tmp_path / "public",
        font=REPO_ROOT / "video" / "public" / SUBTITLE_FONT,
        revoice=revoice,
    )
    return render_episode(script_path, settings, out=tmp_path / "out.mp4", **kwargs)


def test_voicing_refusal_stops_at_the_voicing_step(tmp_path, script_path):
    script_path.write_text(SCRIPT.replace("今天读一本书", "今天读 KV Cache"))

    with pytest.raises(RenderError) as error:
        render(script_path, tmp_path)

    assert error.value.step == "配音"
    assert "KV Cache" in str(error.value)
    assert not (tmp_path / "out.mp4").exists()


def test_missing_glyphs_stop_at_the_voicing_step(tmp_path, script_path):
    script_path.write_text(SCRIPT.replace("今天读一本书", "今天读一本书𠀀"))

    with pytest.raises(RenderError) as error:
        render(script_path, tmp_path)

    assert error.value.step == "配音"
    assert "𠀀" in str(error.value)


def test_voice_lock_mismatch_is_a_voicing_failure_unless_revoice(tmp_path, script_path):
    # 分镜不合格：配音一步成功后在时间轴一步停下，不进入（慢的）渲染
    write_bad_storyboard(script_path.parent)
    with pytest.raises(RenderError) as error:
        render(script_path, tmp_path)
    assert error.value.step == "时间轴"
    other = Voice(model="other-model", ref_audio=VOICE.ref_audio, ref_text="你好。")

    with pytest.raises(RenderError) as error:
        render(script_path, tmp_path, voice=other)
    assert error.value.step == "配音"
    assert "--revoice" in str(error.value)

    with pytest.raises(RenderError) as error:
        render(script_path, tmp_path, voice=other, revoice=True)
    assert error.value.step == "时间轴"


def write_bad_storyboard(episode_dir):
    (episode_dir / "storyboard.json").write_text(
        json.dumps(
            {
                "scenes": [
                    {
                        "scene": "s01-c01",
                        "components": [
                            {
                                "id": "a",
                                "component": "PixelBlock",
                                "props": {
                                    "label": "A",
                                    "size": "small",
                                    "color": "orange",
                                },
                                "at": [0, 0],
                            }
                        ],
                        "triggers": [
                            {
                                "target": "a",
                                "line": "s09-l09",
                                "offset": 0,
                                "action": "enter",
                                "animation": "fade",
                            }
                        ],
                    }
                ],
                "music": "forgotten-path",
                "pauses": [],
            }
        )
    )


def test_invalid_storyboard_stops_at_the_timeline_step(tmp_path, script_path):
    write_bad_storyboard(script_path.parent)

    with pytest.raises(RenderError) as error:
        render(script_path, tmp_path)

    assert error.value.step == "时间轴"
    assert "s09-l09" in str(error.value)
    assert not (tmp_path / "out.mp4").exists()


def write_good_storyboard(episode_dir):
    scenes = [
        {
            "scene": scene,
            "components": [
                {
                    "id": scene,
                    "component": "PixelBlock",
                    # 显示文字要出自画面说明或旁白句
                    "props": {"label": label, "size": "small", "color": "orange"},
                    "at": [0, 0],
                }
            ],
            "triggers": [
                {
                    "target": scene,
                    "line": line,
                    "offset": 0,
                    "action": "enter",
                    "animation": "none",
                }
            ],
        }
        for scene, line, label in (
            ("s01-c01", "s01-l01", "封面"),
            ("s02-c01", "s02-l01", "方块"),
        )
    ]
    (episode_dir / "storyboard.json").write_text(
        json.dumps({"scenes": scenes, "music": "forgotten-path", "pauses": []})
    )


def test_missing_music_file_stops_before_rendering(tmp_path, script_path):
    # 曲子文件只留在本机（#53）：静态目录里没有分镜选的那首，在渲染一步停下并指向获取说明
    write_good_storyboard(script_path.parent)

    with pytest.raises(RenderError) as error:
        render(script_path, tmp_path)

    assert error.value.step == "渲染"
    assert "music/forgotten-path.ogg" in str(error.value)
    assert "video/public/music/README.md" in str(error.value)
    assert not (tmp_path / "out.mp4").exists()


def make_mp4(path, frames, fps=30):
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s=64x36:r={fps}",
            "-frames:v",
            str(frames),
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )


def write_timeline(path, total_frames):
    path.write_text(json.dumps({"fps": 30, "totalFrames": total_frames}))


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="需要 ffmpeg")
def test_frame_check_accepts_one_frame_of_difference(tmp_path):
    make_mp4(tmp_path / "a.mp4", 10)
    write_timeline(tmp_path / "timeline.json", 11)

    assert check_frames(tmp_path / "a.mp4", tmp_path / "timeline.json") == (10, 11)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="需要 ffmpeg")
def test_frame_check_fails_beyond_one_frame(tmp_path):
    make_mp4(tmp_path / "a.mp4", 10)
    write_timeline(tmp_path / "timeline.json", 12)

    with pytest.raises(RenderError) as error:
        check_frames(tmp_path / "a.mp4", tmp_path / "timeline.json")

    assert error.value.step == "核对时长"
    assert "10" in str(error.value) and "12" in str(error.value)
