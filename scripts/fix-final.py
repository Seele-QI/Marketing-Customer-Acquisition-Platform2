"""Final comprehensive fix for chat-workspace.tsx corruption."""

import os

path = os.path.join('F:/A-项目/13-中台网站/components', 'chat-workspace.tsx')
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

fixes = {
    # Category headers
    '“短视频脚本文�?': '“短视频脚本”',
    '“电商带货话术�?': '“电商带货话术”',
    '“职场邮件优化�?': '“职场邮件优化”',
    '“朋友圈撰写文�?': '“朋友圈撰写文案”',
    'AI面试�?': 'AI面试题',

    # text entries
    '“写一�?0秒口播脚�?': '“写一段30秒口播脚本”',
    '“生成开�?秒钩子文�?': '“生成开头5秒钩子文案”',
}

# Actually let me use a different approach - read the raw bytes and fix them
with open(path, 'rb') as f:
    raw = f.read()

# Fix known binary patterns
# The corruption is: ef bf bd 3f (replacement char + question mark)
# Original was: [3-byte Chinese char] [1-byte ASCII char]

# Strategy: for lines with text: ..., fix the content by replacing the entire string
import re

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Binary approach - fix byte patterns
with open(path, 'rb') as f:
    raw = f.read()

# Create a list of all positions where ef bf bd 3f appears
pattern = b'\xef\xbf\xbd\x3f'
positions = []
pos = 0
while True:
    idx = raw.find(pattern, pos)
    if idx == -1:
        break
    positions.append(idx)
    pos = idx + 1

print(f"Found {len(positions)} corruption patterns")

# For each position, determine context and suggest fix
for idx in positions[:10]:
    # Get surrounding context (50 bytes before)
    start = max(0, idx - 50)
    context = raw[start:idx+4]
    print(f"\nPos {idx}:")
    print(f"  Hex: {context.hex(' ')}")
    try:
        text = context.decode('utf-8', errors='replace')
        print(f"  Text: {repr(text)}")
    except:
        print(f"  Text: <decode error>")

print(f"\nTotal patterns: {len(positions)}")
