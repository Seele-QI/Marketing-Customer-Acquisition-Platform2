"""端到端剪辑模板测试（用户提供的素材）。

输入：
- 测试/ComfyUI_00001_bqvnu_1781771178.mp3   (参考音色，46.99s)
- 测试/INF_00001_p80-audio_qocpo_1781772746.mp4  (数字人视频，44.36s / 768x1024 / 含音频)
- 公转私文案（一句一段，~200 字）
- BGM: assets/bgm/ (17 首 mp3)

流程：
1. ffprobe shim 探针（不依赖 ffprobe）
2. split_script_segments：验证一句话一字幕
3. _auto_wrap：验证 24 字内不强制折行（文案最长句子可能就 16-20 字）
4. render_video_with_template：跑实际 ffmpeg 命令（dry-run：拼命令但不执行）

输出：
- 字幕分段数量
- 每个 segment 字符数
- 是否触发 _auto_wrap（行内折行）
- 拼出的 ffmpeg 命令
- 选中的 BGM
- BGM 是否需要截断
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# 把项目根加进 sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# 在 import 之前 patch _FFPROBE_EXE
import lib.video_postprocess as vp  # noqa: E402
from tools.run_template_test import ffprobe_like  # noqa: E402

# 把 _FFMPEG_EXE / _FFPROBE_EXE 指向我们系统里找到的 ffmpeg
vp._FFMPEG_EXE = r"D:\Keyshot\bin\ffmpeg.exe"

# 把所有 probe 函数替换为 shim
vp.probe_duration = lambda path: ffprobe_like(path)["duration"]
vp.probe_audio_duration = lambda path: ffprobe_like(path)["duration"]
vp.probe_resolution = lambda path: (
    ffprobe_like(path)["width"],
    ffprobe_like(path)["height"],
)
vp.has_audio_stream = lambda path: ffprobe_like(path)["has_audio"]

# === 用户提供的素材 ===
VIDEO_PATH = ROOT / "测试" / "INF_00001_p80-audio_qocpo_1781772746.mp4"
BGM_DIR = ROOT / "assets" / "bgm"
OUTPUT_DIR = ROOT / "测试" / "_template_output"

SCRIPT = """公转私三个字，
多少老板踩过坑，
我做了十五年财税，
服务的装修公司少说有三百家，
见过太多老板，
直接从对公账户往自己卡里打钱，
以为公司就是自己的，
转就转了，
结果税务一查一个准，
补税 罚款 滞纳金，
一套组合拳下来，
几十万就这么没了，
其实公转私至少有八种合规方法，
比如发工资 报销 备用金，
股东分红 房租 借款，
还有向自然人采购，
或者是支付违约金赔偿金，
这些都有明确的税务依据，
做好合同和凭证，
税只有一点点 甚至不用交，
别再傻傻承担百分之四十的个税风险了，
如果你想看完整的八种方法，
评论区扣"公转私"，
我把清单发给你，
省下的都是实实在在的利润，"""

# === Step 1: 探针 ===
print("=" * 60)
print("Step 1: 探针用户素材元数据")
print("=" * 60)
info = ffprobe_like(str(VIDEO_PATH))
print(f"视频时长: {info['duration']:.2f}s")
print(f"分辨率: {info['width']}x{info['height']}")
print(f"含音频流: {info['has_audio']}")

# === Step 2: 字幕分段（语义化）===
print()
print("=" * 60)
print("Step 2: 字幕语义化分段（一句话一字幕）")
print("=" * 60)
segments = vp.split_script_segments(SCRIPT)
print(f"段落数: {len(segments)}")
for i, seg in enumerate(segments, 1):
    wrapped = vp._auto_wrap(seg)
    line_count = wrapped.count("\\N") + 1
    marker = " [行内折行]" if "\\N" in wrapped else ""
    print(f"  [{i:2d}] {len(seg):3d}字 / {line_count}行{marker}: {wrapped}")

# === Step 3: 时间轴分配 ===
print()
print("=" * 60)
print("Step 3: 时间轴分配")
print("=" * 60)
duration = vp.resolve_target_duration(str(VIDEO_PATH))
print(f"目标时长: {duration:.2f}s（min(视频, 音频)）")
timeline = vp.create_timeline_by_chars(SCRIPT, duration)
print(f"时间轴段数: {len(timeline)}")
for i, row in enumerate(timeline, 1):
    print(f"  [{i:2d}] {row['start']:6.2f}s ~ {row['end']:6.2f}s ({row['duration']:.2f}s): {row['text']}")

# === Step 4: BGM 选取（注意：_pick_bgm_for_duration 还未实现） ===
print()
print("=" * 60)
print("Step 4: BGM 选取（沿用当前 _pick_bgm 随机选择）")
print("=" * 60)
bgm_path = vp._pick_bgm(str(BGM_DIR))
print(f"选中 BGM: {bgm_path}")
print(f"当前实现是 random.choice，BGM 时长匹配 refactor 尚未激活")

# === Step 5: 拼 ffmpeg 命令 ===
print()
print("=" * 60)
print("Step 5: 拼 ffmpeg 命令")
print("=" * 60)
OUTPUT_DIR.mkdir(exist_ok=True, parents=True)
ass_path = OUTPUT_DIR / "test.ass"
output_path = OUTPUT_DIR / "test_final.mp4"

# 写 ASS 字幕
vp.build_ass_subtitles(SCRIPT, str(ass_path), duration, info["width"], info["height"])
print(f"字幕文件: {ass_path}")
print(f"字幕字节数: {ass_path.stat().st_size}")

# 拼命令（实际不执行）
cmd = vp._build_ffmpeg_command(
    input_video_path=str(VIDEO_PATH),
    bgm_path=str(bgm_path),
    ass_path=str(ass_path),
    output_path=str(output_path),
    duration=duration,
    bgm_volume=0.52,  # 默认 +20%（前端 handleApplyEditing 已 hardcode）
    business_card_lines=None,
)
print()
print("FFmpeg 命令（dry-run，未执行）：")
print(" ".join(f'"{c}"' if " " in c else c for c in cmd))

# === Step 6: 试跑一次 ffmpeg（实际生成） ===
print()
print("=" * 60)
print("Step 6: 实际跑 ffmpeg")
print("=" * 60)
print(f"开始时间: {__import__('datetime').datetime.now().isoformat()}")
try:
    res = vp._run_ffmpeg(cmd, timeout=600)
    print(f"returncode: {res.returncode}")
    if res.returncode == 0:
        size_kb = output_path.stat().st_size / 1024
        print(f"[OK] 输出成功: {output_path} ({size_kb:.1f}KB)")
    else:
        print(f"[FAIL] ffmpeg 失败")
        err = (res.stderr or "")[-2000:]
        print(f"stderr (尾部 2000 字符):")
        print(err)
except subprocess.TimeoutExpired:
    print("[TIMEOUT] ffmpeg 超时 (> 600s)")
except Exception as e:
    print(f"[ERROR] 异常: {e}")

# === Step 7: 输出文件验证 ===
print()
print("=" * 60)
print("Step 7: 输出验证")
print("=" * 60)
out_info = ffprobe_like(str(output_path)) if output_path.exists() else None
if out_info:
    print(f"输出时长: {out_info['duration']:.2f}s")
    print(f"分辨率: {out_info['width']}x{out_info['height']}")
    print(f"含音频: {out_info['has_audio']}")
    print(f"时长差异（输出 vs 目标）: {abs(out_info['duration'] - duration):.2f}s")
    print(f"[OK] 成片已生成: {output_path}")
else:
    print("[FAIL] 输出文件未生成")
