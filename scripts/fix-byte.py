"""Fix byte-level corruption in chat-workspace.tsx."""
import os

path = os.path.join('F:/A-项目/13-中台网站/components/chat-workspace.tsx')

with open(path, 'rb') as f:
    raw = f.read()

# Fix line 467: 改成"个 -> 改成3个 (0x22 -> 0x33)
count = raw.count(b'\xe6\x94\xb9\xe6\x88\x90\x22\xe4\xb8\xaa')
raw = raw.replace(b'\xe6\x94\xb9\xe6\x88\x90\x22\xe4\xb8\xaa',
                   b'\xe6\x94\xb9\xe6\x88\x903\xe4\xb8\xaa')
print(f"Fixed {count} occurrences of 改成\"个 -> 改成3个")

with open(path, 'wb') as f:
    f.write(raw)

print("Done")
