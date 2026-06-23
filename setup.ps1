# -*- coding: utf-8 -*-
# 中台项目 — 一键环境配置脚本
# 用法：右键 → "使用 PowerShell 运行"，或在终端输入：powershell -ExecutionPolicy Bypass -File setup.ps1
# 首次使用：管理员 PowerShell 执行 → Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  中台项目 — 环境依赖一键安装" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1) 检查 Node.js ──────────────────────────────────
Write-Host "[1/5] 检查 Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node -v 2>$null
    Write-Host "  已安装 Node.js $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "   未找到 Node.js，请先安装：https://nodejs.org（推荐 LTS 版）" -ForegroundColor Red
    pause
    exit 1
}

# ── 2) 启用 pnpm（若未安装则自动装）──────────────
Write-Host "[2/5] 检查 pnpm..." -ForegroundColor Yellow
$pnpmCheck = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmCheck) {
    Write-Host "   未安装 pnpm，正在通过 npm 安装…" -ForegroundColor Yellow
    npm install -g pnpm
    Write-Host "   pnpm 安装完成" -ForegroundColor Green
} else {
    Write-Host "   已安装 pnpm $((pnpm -v 2>$null) -replace '\s','')" -ForegroundColor Green
}

# ── 3) 安装前端依赖 ──────────────────────────────────
Write-Host "[3/5] 安装前端依赖 (pnpm install)..." -ForegroundColor Yellow
pnpm install
Write-Host "   前端依赖安装完成" -ForegroundColor Green

# ── 4) 检查/安装 Python 依赖 ──────────────────────────
Write-Host "[4/5] 安装 Python 依赖..." -ForegroundColor Yellow
try {
    $pyVer = python -c "import sys; print(sys.version.split()[0])" 2>$null
    Write-Host "   Python $pyVer" -ForegroundColor Green
} catch {
    Write-Host "   未找到 Python，请先安装 Python 3.11+ 并勾选「Add to PATH」" -ForegroundColor Red
    pause
    exit 1
}
pip install -r requirements.txt --quiet
Write-Host "   Python 依赖安装完成" -ForegroundColor Green

# ── 5) 验证 ffmpeg ───────────────────────────────────
Write-Host "[5/5] 验证 ffmpeg..." -ForegroundColor Yellow
$ffmpegExe = Join-Path $ProjectRoot "tools\ffmpeg\bin\ffmpeg.exe"
$ffprobeExe = Join-Path $ProjectRoot "tools\ffmpeg\bin\ffprobe.exe"
if ((Test-Path $ffmpegExe) -and (Test-Path $ffprobeExe)) {
    Write-Host "   ffmpeg 已内置在 tools\ffmpeg\bin\" -ForegroundColor Green
} else {
    Write-Host "   ffmpeg 未找到！请从 https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip 下载并解压 ffmpeg.exe / ffprobe.exe 到 tools\ffmpeg\bin\" -ForegroundColor Red
}

# ── 完成 ─────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  配置完成！启动方式：" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  后端 (FastAPI)： " -NoNewline -ForegroundColor White
Write-Host "python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload" -ForegroundColor Magenta
Write-Host "  前端 (Next.js)：  " -NoNewline -ForegroundColor White
Write-Host "pnpm dev" -ForegroundColor Magenta
Write-Host ""
Write-Host "  两条命令在两个终端分别运行即可。访问 http://localhost:3000" -ForegroundColor Gray
Write-Host ""
pause
