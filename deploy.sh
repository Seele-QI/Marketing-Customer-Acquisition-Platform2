#!/bin/bash
# ──────────────────────────────────────────────────────────────────
#  阿里云 ECS 一键部署脚本
#  在你的服务器上执行：
#    chmod +x deploy.sh && ./deploy.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== 1/5 安装 Docker（如未安装）==="
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
fi

echo "=== 2/5 克隆仓库 ==="
if [ ! -d "13-zhongtai" ]; then
  git clone https://github.com/你的用户名/你的仓库.git 13-zhongtai
fi
cd 13-zhongtai

echo "=== 3/5 创建环境变量文件 ==="
if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  echo "⚠️  请编辑 .env.production 填入真实 API Key，然后重新运行本脚本"
  echo "    vi $(pwd)/.env.production"
  exit 1
fi

echo "=== 4/5 构建 + 启动（首次约 5-10 分钟）==="
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d

echo "=== 5/5 检查状态 ==="
sleep 5
docker compose ps
echo ""
echo "✅ 部署完成！"
echo "   前端：http://$(curl -s ifconfig.me):3000"
echo "   后端：http://$(curl -s ifconfig.me):8000"
echo "   查看日志：docker compose logs -f"
