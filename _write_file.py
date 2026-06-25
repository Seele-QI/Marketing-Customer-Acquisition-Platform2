import sys
sys.stdout.reconfigure(encoding="utf-8")
content = sys.stdin.read()
with open(sys.argv[1], "w", encoding="utf-8") as f:
    f.write(content)
print("done")
