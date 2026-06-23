@echo off
chcp 65001 >nul
title 中台项目 — 安装与启动

echo.
echo ========================================
echo   中台项目 — 一键安装与启动
echo ========================================
echo.

:: ── 1) 检查 Docker ────────────────────────────
echo [1/3] 检查 Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   未检测到 Docker Desktop！
    echo.
    echo   请先安装 Docker Desktop：
    echo   https://www.docker.com/products/docker-desktop/
    echo.
    echo   安装后重启电脑，再运行本脚本。
    echo.
    pause
    exit /b 1
)
echo    Docker 已就绪

:: ── 2) 检查 .env 配置 ─────────────────────────
echo [2/3] 检查配置文件...
if not exist ".env" (
    if exist ".env.example" (
        echo    未找到 .env 文件，正在从模板创建...
        copy ".env.example" ".env" >nul
        echo.
        echo    !!! 重要：请先编辑 .env 文件，填入你的 API Key ！！！
        echo.
        echo    需要填写的 Key：
        echo      - DEEPSEEK_API_KEY      DeepSeek 大模型
        echo      - RUNNINGHUB_API_KEY    RunningHub 数字人
        echo      - ALIYUN_ACCESS_KEY_ID  阿里云语音识别
        echo      - ALIYUN_ACCESS_KEY_SECRET
        echo      - ALIYUN_ASR_APP_KEY
        echo      - RESEND_API_KEY        邮件登录
        echo      - EMAIL_HASH_SALT       安全盐值
        echo      - CREDIT_ADMIN_ACCESS_KEY  后台密码
        echo.
        echo    用记事本打开 .env 填好保存后，再重新运行本脚本。
        echo.
        start notepad ".env"
        pause
        exit /b 0
    ) else (
        echo    配置文件缺失，请从发布包中重新获取 .env.example
        pause
        exit /b 1
    )
)
echo    配置文件已就绪

:: ── 3) 构建并启动 ─────────────────────────────
echo [3/3] 构建并启动服务（首次需要几分钟下载镜像）...
echo.

docker compose up -d --build

if %errorlevel% neq 0 (
    echo.
    echo   启动失败，请检查上方错误信息。
    pause
    exit /b 1
)

:: ── 完成 ─────────────────────────────────────
echo.
echo ========================================
echo   启动成功！
echo ========================================
echo.
echo   前端：http://localhost:3000
echo   后端：http://localhost:8000
echo.
echo   管理命令：
echo     查看日志  docker compose logs -f
echo     停止服务  docker compose down
echo     重新启动  docker compose up -d
echo.
echo   按任意键在浏览器中打开...
pause >nul
start http://localhost:3000
