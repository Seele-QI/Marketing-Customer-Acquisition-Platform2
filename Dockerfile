# syntax=docker/dockerfile:1.7
# ────────────────────────────────────────────────────────────────
#  Zeabur 根目录探测占位（勿用作实际构建入口）
#  Zeabur 从仓库根目录构建时，请在服务配置或 zeabur.json 中指定：
#    - web → Dockerfile.web
#    - api → Dockerfile.api
#  若误用本文件构建，会快速失败（FROM scratch）——这是预期行为。
# ────────────────────────────────────────────────────────────────

FROM scratch

LABEL maintainer="Seele-QI <qizijun23@gmail.com>" \
      description="Stub Dockerfile - real builds use Dockerfile.web or Dockerfile.api" \
      zeabur.placeholder="true"