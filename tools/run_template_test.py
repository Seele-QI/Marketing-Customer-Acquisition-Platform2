"""ffprobe 仿真：基于 ffmpeg -i 解析时长、分辨率、音频流。

不依赖 ffprobe 二进制。
"""
import subprocess
import re

FFMPEG_EXE = r"D:\Keyshot\bin\ffmpeg.exe"

_DUR_RE = re.compile(r"Duration:\s+(\d+):(\d+):([\d.]+)")
_WH_RE = re.compile(r"Video:.*?(\d{2,4})x(\d{2,4})")
_AUDIO_RE = re.compile(r"Stream #\d+:\d+.*Audio:")


def ffprobe_like(path: str) -> dict:
    """仿 ffprobe 的最小输出：duration / width / height / has_audio。"""
    r = subprocess.run(
        [FFMPEG_EXE, "-i", path],
        capture_output=True,
        timeout=30,
    )
    out = r.stderr.decode("utf-8", errors="replace")

    duration = 0.0
    width = height = 0
    has_audio = False

    m = _DUR_RE.search(out)
    if m:
        h, mn, s = m.groups()
        duration = int(h) * 3600 + int(mn) * 60 + float(s)

    m = _WH_RE.search(out)
    if m:
        width, height = int(m.group(1)), int(m.group(2))

    if _AUDIO_RE.search(out):
        has_audio = True

    return {
        "duration": duration,
        "width": width,
        "height": height,
        "has_audio": has_audio,
    }


if __name__ == "__main__":
    import sys
    from pathlib import Path

    if len(sys.argv) < 2:
        print("Usage: ffprobe_shim.py <media_file>")
        sys.exit(1)

    print(ffprobe_like(sys.argv[1]))
