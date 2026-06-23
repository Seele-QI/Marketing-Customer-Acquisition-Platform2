/**
 * IP 定位报告生成器（客户端）
 * 将分析结果聚合为可打印的 HTML 报告，通过浏览器打印导出 PDF
 */

export type IPReportSection = {
  title: string
  icon: string
  content: string
}

export type IPReportData = {
  generatedAt: string
  stageName: string
  sections: IPReportSection[]
}

function buildReportHTML(data: IPReportData): string {
  const sectionsHTML = data.sections
    .map(
      (sec) => `
    <section class="report-section">
      <h2>${sec.icon} ${sec.title}</h2>
      <div class="report-content">${markdownToHTML(sec.content)}</div>
    </section>`,
    )
    .join("\n")

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>IP 定位诊断报告 — ${data.generatedAt}</title>
  <style>
    @page { margin: 1.5cm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
      font-size: 13px; line-height: 1.7; color: #1e293b; max-width: 800px; margin: 0 auto;
    }
    .report-header {
      text-align: center; padding: 2rem 0 1.5rem; border-bottom: 2px solid #3b82f6; margin-bottom: 2rem;
    }
    .report-header h1 { font-size: 24px; color: #1e40af; margin-bottom: 0.25rem; }
    .report-header .meta { font-size: 12px; color: #64748b; }
    .report-section { margin-bottom: 2rem; }
    .report-section h2 { font-size: 16px; color: #1e40af; border-left: 4px solid #3b82f6; padding-left: 0.75rem; margin-bottom: 0.75rem; }
    .report-content h3 { font-size: 14px; color: #334155; margin: 0.75rem 0 0.25rem; }
    .report-content p { margin-bottom: 0.5rem; }
    .report-content ul, .report-content ol { padding-left: 1.25rem; margin-bottom: 0.5rem; }
    .report-content li { margin-bottom: 0.2rem; }
    .report-content table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; }
    .report-content th { background: #f1f5f9; padding: 0.4rem 0.6rem; text-align: left; font-weight: 600; font-size: 12px; border: 1px solid #e2e8f0; }
    .report-content td { padding: 0.35rem 0.6rem; border: 1px solid #e2e8f0; font-size: 12px; }
    .report-content code { background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 3px; font-size: 12px; }
    .report-content pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem; overflow-x: auto; font-size: 12px; }
    .report-content strong { color: #1e40af; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .report-section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>🚀 IP 定位诊断报告</h1>
    <p class="meta">阶段：${data.stageName || "未选择"} ｜ 生成时间：${data.generatedAt}</p>
  </div>
  ${sectionsHTML}
  <footer style="text-align:center;padding:1.5rem 0;border-top:1px solid #e2e8f0;margin-top:2rem;color:#94a3b8;font-size:11px;">
    AgentHub · AI 多智能体营销平台 ｜ 本报告由 AI 生成，仅供参考
  </footer>
</body>
</html>`
}

/** 简易 Markdown → HTML（仅支持常用语法） */
function markdownToHTML(md: string): string {
  let html = md
    // 转义
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // 标题
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    // 粗体/斜体
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // 行内代码
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // 无序列表
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // 段落
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")

  // 包裹段落
  html = "<p>" + html + "</p>"
  // 清理空段落
  html = html.replace(/<p><\/p>/g, "")
  html = html.replace(/<p><br><\/p>/g, "")

  return html
}

/** 打开浏览器打印对话框导出报告 */
export function exportReportPDF(data: IPReportData): void {
  const win = window.open("", "_blank", "width=900,height=700")
  if (!win) {
    alert("请允许弹出窗口以导出报告")
    return
  }
  win.document.write(buildReportHTML(data))
  win.document.close()
  // 等渲染完成后触发打印
  win.addEventListener("load", () => {
    win.print()
  })
  // 如果 load 事件已触发（同步写入的情况）
  if (win.document.readyState === "complete") {
    win.print()
  }
}

/** 获取当前日期字符串 */
export function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
