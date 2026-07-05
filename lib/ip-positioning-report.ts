/**
 * IP 定位报告生成器（客户端）
 * 将结构化诊断结果聚合为可打印的 HTML 报告，通过浏览器打印导出 PDF
 */

import type { IpPositioningReport } from "@/lib/ip-positioning-schema"

export type IPReportSection = {
  title: string
  icon: string
  content: string
}

export type IPReportData = {
  generatedAt: string
  stageName: string
  oneLiner?: string
  sections: IPReportSection[]
}

export function buildIpPositioningReportData(input: {
  report: IpPositioningReport
  stageName: string
  generatedAt: string
}): IPReportData {
  const { report, stageName, generatedAt } = input

  const platformText = [...report.platformPlans]
    .sort((a, b) => a.priority - b.priority)
    .map(
      (p) =>
        `**${p.priority}. ${p.platform}**\n${p.reason}\n内容打法：${p.contentStrategy}`,
    )
    .join("\n\n")

  const monetizationText = report.monetizationLadder
    .map(
      (m) =>
        `**${m.stage} · ${m.offer}（${m.priceRange}）**\n${m.whyNow}`,
    )
    .join("\n\n")

  const actionText = report.thirtyDayPlan
    .map((w) => `**${w.week}**\n${w.actions.map((a) => `- ${a}`).join("\n")}`)
    .join("\n\n")

  return {
    generatedAt,
    stageName,
    oneLiner: report.oneLiner,
    sections: [
      {
        title: "一针见血诊断",
        icon: "🎯",
        content: report.sharpDiagnosis,
      },
      {
        title: "你最该占据的认知位置",
        icon: "📍",
        content: report.cognitivePosition,
      },
      {
        title: "为什么是你，不是别人",
        icon: "✨",
        content: report.whyYouNotOthers,
      },
      {
        title: "差异化杠杆",
        icon: "⚡",
        content: `${report.differentiationLever}\n\n**反共识观点：** ${report.contrarianBelief}\n\n**专属方法论：** ${report.uniqueMechanism}`,
      },
      {
        title: "核心受众与痛点欲望",
        icon: "👥",
        content: `**受众画像：** ${report.audienceProfile}\n\n**痛点与欲望：** ${report.corePainAndDesire}`,
      },
      {
        title: "你不该做的方向",
        icon: "🚫",
        content: report.avoidDirections.map((d) => `- ${d}`).join("\n"),
      },
      {
        title: "平台优先级与内容打法",
        icon: "📈",
        content: platformText,
      },
      {
        title: "内容支柱与首批选题",
        icon: "💡",
        content: `**内容支柱：**\n${report.contentPillars.map((p) => `- ${p}`).join("\n")}\n\n**首批选题：**\n${report.starterTopics.map((t) => `- ${t}`).join("\n")}`,
      },
      {
        title: "变现路径阶梯",
        icon: "💰",
        content: monetizationText,
      },
      {
        title: "30 天行动路线",
        icon: "🗓️",
        content: actionText,
      },
    ],
  }
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
      text-align: center; padding: 2rem 0 1.5rem; border-bottom: 2px solid #f59e0b; margin-bottom: 2rem;
    }
    .report-header h1 { font-size: 24px; color: #92400e; margin-bottom: 0.5rem; }
    .report-header .one-liner {
      font-size: 18px; font-weight: 700; color: #1e293b; margin: 1rem 0 0.5rem;
    }
    .report-header .meta { font-size: 12px; color: #64748b; }
    .report-section { margin-bottom: 2rem; }
    .report-section h2 { font-size: 16px; color: #92400e; border-left: 4px solid #f59e0b; padding-left: 0.75rem; margin-bottom: 0.75rem; }
    .report-content h3 { font-size: 14px; color: #334155; margin: 0.75rem 0 0.25rem; }
    .report-content p { margin-bottom: 0.5rem; }
    .report-content ul, .report-content ol { padding-left: 1.25rem; margin-bottom: 0.5rem; }
    .report-content li { margin-bottom: 0.2rem; }
    .report-content strong { color: #92400e; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .report-section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>🚀 IP 定位诊断报告</h1>
    ${data.oneLiner ? `<p class="one-liner">${escapeHtml(data.oneLiner)}</p>` : ""}
    <p class="meta">阶段：${escapeHtml(data.stageName || "未选择")} ｜ 生成时间：${escapeHtml(data.generatedAt)}</p>
  </div>
  ${sectionsHTML}
  <footer style="text-align:center;padding:1.5rem 0;border-top:1px solid #e2e8f0;margin-top:2rem;color:#94a3b8;font-size:11px;">
    AgentHub · AI 多智能体营销平台 ｜ 本报告由 AI 生成，仅供参考
  </footer>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 简易 Markdown → HTML（仅支持常用语法） */
function markdownToHTML(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")

  html = "<p>" + html + "</p>"
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
  win.addEventListener("load", () => {
    win.print()
  })
  if (win.document.readyState === "complete") {
    win.print()
  }
}

/** 获取当前日期字符串 */
export function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
