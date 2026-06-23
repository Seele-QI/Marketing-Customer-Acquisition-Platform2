#!/usr/bin/env python3
"""
临时样子活儿脚本 —— 不影响项目，运行10分钟后自动结束
"""

import time
import sys
from datetime import datetime

DURATION_MINUTES = 10
END_TIME = time.time() + DURATION_MINUTES * 60

print("=" * 50)
print(f"样子活儿开始: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"将运行 {DURATION_MINUTES} 分钟后自动结束")
print("=" * 50)

counter = 0
try:
    while time.time() < END_TIME:
        counter += 1
        remaining = int(END_TIME - time.time())
        mins, secs = divmod(remaining, 60)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 第 {counter} 轮循环 —— 剩余 {mins:02d}:{secs:02d}", flush=True)
        time.sleep(10)  # 每10秒打印一次，避免刷屏太快
except KeyboardInterrupt:
    print("\n用户中断，样子活儿提前结束")
    sys.exit(0)

print("\n" + "=" * 50)
print(f"样子活儿结束: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"共运行了 {counter} 轮循环")
print("=" * 50)
