import wave

from pixelbook.audio import pad_wav, wav_seconds


def test_pad_wav_adds_silence_at_both_ends_and_keeps_format(tmp_path):
    src, dst = tmp_path / "src.wav", tmp_path / "dst.wav"
    with wave.open(str(src), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b"\x01\x02" * 24000)

    pad_wav(src, dst, 0.2, 0.6)

    assert wav_seconds(dst) == 1.8
    with wave.open(str(dst), "rb") as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (
            1,
            2,
            24000,
        )
        frames = wav.readframes(wav.getnframes())
    assert frames[: 4800 * 2] == b"\x00" * 4800 * 2
    assert frames[4800 * 2 : 4800 * 2 + 2] == b"\x01\x02"
    assert frames[-14400 * 2 :] == b"\x00" * 14400 * 2
