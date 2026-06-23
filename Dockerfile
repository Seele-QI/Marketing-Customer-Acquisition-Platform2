# syntax=docker/dockerfile:1.7
# ────────────────────────────────────────────────────────────────
#  Zeabur 默认 Dockerfile 入口（占位）
#  实际部署走 Dockerfile.web / Dockerfile.api（在 zeabur.json 里显式指定）。
#  本文件存在仅为满足 Zeabur "仓库根目录存在 Dockerfile" 的探测检查。
#  如被用作构建入口，会因 FROM 指向不存在的镜像而快速失败——这是预期行为。
# ────────────────────────────────────────────────────────────────

FROM scratch

LABEL maintainer="Seele-QI <qizijun23@gmail.com>" \
      description="Stub Dockerfile - real builds use Dockerfile.web or Dockerfile.api" \
      zeabur.placeholder="true"