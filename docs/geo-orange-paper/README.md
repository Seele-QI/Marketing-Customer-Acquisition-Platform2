# GEO 优化橙皮书（静态站 → PDF）

《GEO 优化橙皮书》· **中国实践标准 · 招财猫** · v1.0

仿 OpenClaw「橙皮书」体例：单页静态 HTML + 屏幕/印刷双样式，浏览器一键导出 PDF。用于宣传 GEO，并沉淀可验收的 `GEO-CN-xx` 实践条款。

## 本地预览

在仓库根目录或本目录执行：

```bash
# 任选其一
npx --yes serve docs/geo-orange-paper -p 4173
python -m http.server 4173 --directory docs/geo-orange-paper
```

浏览器打开：`http://127.0.0.1:4173/`

也可直接用浏览器打开本目录下的 `index.html`（部分环境对本地字体 CDN 有限制，推荐用本地 HTTP 服务）。

## 导出 PDF

1. 预览页右上角点击 **「导出 PDF」**，或 `Ctrl+P` / `Cmd+P`
2. 目标打印机选 **「另存为 PDF」**
3. **务必勾选「背景图形」**（保留橙色建议框与表头底色）
4. 纸张：**A4**；边距可用默认或「默认」即可（样式已设 `@page` 约 16mm）
5. 建议关闭页眉页脚网址（可选）

## 目录结构

```
docs/geo-orange-paper/
├── index.html              # 全文（封面 → 附录）
├── README.md               # 本说明
└── assets/
    ├── css/screen.css      # 屏幕：暖橙编辑刊
    ├── css/print.css       # 打印：A4 断页
    └── js/toc.js           # TOC 高亮 + 进度条 + 导出
```

## 内容来源（蒸馏，非整页粘贴）

| 来源 | 用途 |
|------|------|
| `skills/geo/README.md` | A/B/C 分层 |
| `skills/geo/research/SOURCES.md` | 证据与引用 |
| `skills/geo/creation-guidelines/*` | 矩阵硬规则、四维写作、探测协议 |
| `skills/geo/model-weights/*` · `platform-viral/*` | 引擎/平台摘要 |
| `docs/superpowers/specs/2026-07-02-geo-optimization-design.md` | 产品附录 |

## 版本与勘误

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-07 | 首发完整可印版 |

勘误：修改 `index.html` 对应章节，并在本表追加一行；调研侧同步 `skills/geo/research/LOOP.md` 心跳。

## 免责

国内引擎不公开完整引用公式。文中 A 层策略为**实践参考，非官方公式**；产品内 AI 可见度探测多为代理模拟，不作引擎官方结论。
