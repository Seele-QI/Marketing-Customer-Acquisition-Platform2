import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const out = path.dirname(fileURLToPath(import.meta.url))
const font = "Microsoft YaHei,Noto Sans SC,sans-serif"
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const save = (name, svg) => fs.writeFileSync(path.join(out, name), svg, "utf8")

function stageChart({ file, title, subtitle, steps, principle }) {
  const cardW = 250, gap = 42, startX = 80
  const cards = steps.map((step, i) => {
    const x = startX + i * (cardW + gap)
    const ai = step.type === "ai", end = step.type === "end"
    const fill = end ? "#178759" : ai ? "#FFF8E8" : "#FFFFFF"
    const stroke = end ? "#178759" : ai ? "#F0C96B" : "#D3DFF2"
    const head = end ? "#AEE6CA" : ai ? "#D99B21" : "#2563EB"
    const main = end ? "#FFFFFF" : ai ? "#6B4400" : "#17305C"
    const muted = end ? "#D8F2E5" : ai ? "#8C682A" : "#657C9E"
    const bullets = step.lines.map((line, j) => `<text x="${x + 32}" y="${510 + j * 40}" font-size="17" fill="${muted}">${esc(line)}</text>`).join("")
    const arrow = i < steps.length - 1 ? `<path d="M${x + cardW + 7} 500H${x + cardW + gap - 10}" stroke="#7192C9" stroke-width="5" marker-end="url(#arrow)"/>` : ""
    return `<rect x="${x}" y="315" width="${cardW}" height="390" rx="28" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${x + 32}" y="380" font-size="55" font-weight="800" fill="${head}">0${i + 1}</text><text x="${x + 32}" y="438" font-size="25" font-weight="700" fill="${main}">${esc(step.label)}</text>${bullets}${arrow}`
  }).join("")
  save(file, `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F6F9FF"/><stop offset="1" stop-color="#E8F1FF"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#153B74" flood-opacity=".12"/></filter><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0L12 6 0 12Z" fill="#7192C9"/></marker></defs><rect width="1920" height="1080" fill="url(#bg)"/><circle cx="1810" cy="70" r="240" fill="#2563EB" opacity=".05"/><text x="80" y="90" font-family="${font}" font-size="23" font-weight="700" fill="#2563EB" letter-spacing="4">招财猫 AI 中台 · 完整工作流</text><text x="80" y="165" font-family="${font}" font-size="52" font-weight="800" fill="#102A56">${esc(title)}</text><text x="80" y="210" font-family="${font}" font-size="21" fill="#607899">${esc(subtitle)}</text><g font-family="${font}" filter="url(#shadow)">${cards}</g><rect x="80" y="800" width="1740" height="135" rx="24" fill="#DDE9FA"/><text x="120" y="853" font-family="${font}" font-size="22" font-weight="700" fill="#244A7D">关键原则</text><text x="120" y="898" font-family="${font}" font-size="20" fill="#506D94">${esc(principle)}</text></svg>`)
}

function dualChart({ file, title, subtitle, leftA, leftB, prepare, ai, final }) {
  const lines = (x, y, items, color) => items.map((line, i) => `<text x="${x}" y="${y + i * 38}" font-size="18" fill="${color}">${esc(line)}</text>`).join("")
  save(file, `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#183B49" flood-opacity=".12"/></filter><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0L12 6 0 12Z" fill="#4D7C89"/></marker></defs><rect width="1920" height="1080" fill="#F3F8F7"/><text x="80" y="90" font-family="${font}" font-size="23" font-weight="700" fill="#167A70" letter-spacing="4">招财猫 AI 中台 · 双入口工作流</text><text x="80" y="165" font-family="${font}" font-size="52" font-weight="800" fill="#173D48">${esc(title)}</text><text x="80" y="210" font-family="${font}" font-size="21" fill="#607D84">${esc(subtitle)}</text><g font-family="${font}" filter="url(#shadow)">
  <rect x="80" y="300" width="390" height="220" rx="28" fill="#E5F0FF"/><text x="120" y="355" font-size="21" font-weight="700" fill="#24609B">${esc(leftA.eyebrow)}</text><text x="120" y="405" font-size="25" font-weight="800" fill="#173D48">${esc(leftA.title)}</text>${lines(120, 455, leftA.lines, "#617D8B")}
  <rect x="80" y="565" width="390" height="220" rx="28" fill="#FFF0DE"/><text x="120" y="620" font-size="21" font-weight="700" fill="#C56B22">${esc(leftB.eyebrow)}</text><text x="120" y="670" font-size="25" font-weight="800" fill="#173D48">${esc(leftB.title)}</text>${lines(120, 720, leftB.lines, "#617D8B")}
  <path d="M470 410H600V545H680" fill="none" stroke="#4D7C89" stroke-width="5" marker-end="url(#arrow)"/><path d="M470 675H600V545H680" fill="none" stroke="#4D7C89" stroke-width="5" marker-end="url(#arrow)"/>
  <rect x="695" y="405" width="305" height="280" rx="28" fill="white"/><text x="847" y="465" text-anchor="middle" font-size="25" font-weight="800" fill="#173D48">${esc(prepare.title)}</text>${lines(742, 520, prepare.lines, "#617D8B")}
  <path d="M1000 545H1070" stroke="#4D7C89" stroke-width="5" marker-end="url(#arrow)"/><rect x="1085" y="405" width="305" height="280" rx="28" fill="#FFF2C9"/><text x="1237" y="465" text-anchor="middle" font-size="25" font-weight="800" fill="#73520D">${esc(ai.title)}</text>${lines(1130, 520, ai.lines, "#7D672E")}
  <path d="M1390 545H1460" stroke="#4D7C89" stroke-width="5" marker-end="url(#arrow)"/><rect x="1475" y="300" width="365" height="485" rx="32" fill="#195F55"/><text x="1518" y="370" font-size="24" font-weight="700" fill="#9CE1CE">人工把关 + 最终成果</text><text x="1518" y="425" font-size="28" font-weight="800" fill="white">${esc(final.title)}</text>${lines(1518, 485, final.lines, "#D9F0E9")}
  </g></svg>`)
}

stageChart({ file: "01-positioning-content.svg", title: "账号定位与内容方向", subtitle: "从业务资料到定位、内容方向、选题和口播文案", steps: [
  { label: "填写业务资料", lines: ["个人或企业信息", "目标客户与痛点", "产品与差异化优势"] },
  { label: "生成身份定位", lines: ["明确我是谁", "服务谁、解决什么", "检查并补充事实"], type: "ai" },
  { label: "分析内容机会", lines: ["扫描竞品方向", "拆解爆款结构", "诊断现有账号"] },
  { label: "确定内容支柱", lines: ["筛选 3～5 个方向", "覆盖知识、案例", "产品与行业观点"] },
  { label: "批量创作选题", lines: ["说明行业身份", "生成 10 个选题", "选择高价值方向"], type: "ai" },
  { label: "形成口播文案", lines: ["围绕选题创作", "人工核对事实", "进入视频工作流"], type: "end" }], principle: "定位不是终点，要继续转化为内容方向、候选选题和可直接制作视频的口播文案。" })

dualChart({ file: "02-digital-human.svg", title: "数字人口播视频创作", subtitle: "原创选题或参考视频，都可以汇入同一条数字人生产线", leftA: { eyebrow: "入口一 · 原创内容", title: "AI 批量策划选题", lines: ["选择喜欢的选题", "围绕选题创作口播文案"] }, leftB: { eyebrow: "入口二 · 参考内容", title: "提取视频文案", lines: ["校对品牌名与数字", "使用 AI 完成二次改写"] }, prepare: { title: "准备三项素材", lines: ["数字人形象图", "2～15 秒参考音色", "最终口播文案"] }, ai: { title: "AI 自动生成分镜", lines: ["估算时长并拆段", "生成每段分镜提示词", "长文案自动规划片段"] }, final: { title: "优化分镜并生成成片", lines: ["检查人物、场景、动作和镜头", "确认后生成多个视频片段", "失败片段支持单独重试", "合成并预览完整视频", "下载视频和封面", "按需进入视频一键分发"] } })

stageChart({ file: "03-image-video.svg", title: "图文视频创作", subtitle: "把口播文案、图片和参考音色组合成完整短视频", steps: [
  { label: "准备口播内容", lines: ["AI 生成选题", "或提取参考文案", "改写并确认文案"] },
  { label: "整理图片素材", lines: ["按文案段落配图", "统一比例与风格", "调整正确顺序"] },
  { label: "上传三类素材", lines: ["图片素材", "清晰参考音色", "最终口播文案"] },
  { label: "AI 生成配音", lines: ["克隆参考音色", "按文案自动断句", "匹配图片时序"], type: "ai" },
  { label: "自动合成视频", lines: ["生成字幕", "添加 BGM 与转场", "完成图文成片"], type: "ai" },
  { label: "检查下载发布", lines: ["检查顺序和断句", "下载最终视频", "按需一键分发"], type: "end" }], principle: "每张图片都应服务于对应文案段落；统一画面比例和视觉风格，成片会更连贯。" })

stageChart({ file: "04-mashup-video.svg", title: "视频混剪创作", subtitle: "利用已有视频片段、口播文案和音色快速生成新成片", steps: [
  { label: "确定选题文案", lines: ["AI 策划选题", "或提取参考文案", "完成原创改写"] },
  { label: "整理视频素材", lines: ["准备多段视频", "删除模糊重复片段", "覆盖不同场景景别"] },
  { label: "上传创作素材", lines: ["视频片段", "参考音色和文案", "可选封面参考图"] },
  { label: "AI 生成配音", lines: ["克隆参考音色", "根据文案自动断句", "准备合成时间轴"], type: "ai" },
  { label: "模板自动混剪", lines: ["组合视频片段", "添加字幕、BGM", "生成转场与封面"], type: "ai" },
  { label: "预览下载发布", lines: ["检查内容与节奏", "下载成片和封面", "按需一键分发"], type: "end" }], principle: "素材质量决定混剪上限；先删除无关、模糊和重复片段，再让系统完成配音与模板合成。" })

dualChart({ file: "05-promo-video.svg", title: "产品宣传视频创作", subtitle: "根据素材情况选择图生图或文生图，汇入统一分镜与成片流程", leftA: { eyebrow: "模式一 · 图生图", title: "上传清晰产品图片", lines: ["保持产品主体明确", "适合强调真实产品外观"] }, leftB: { eyebrow: "模式二 · 文生图", title: "描述产品与使用场景", lines: ["无需上传产品图片", "适合概念化宣传画面"] }, prepare: { title: "准备宣传内容", lines: ["筛选核心产品卖点", "创作宣传文案", "按需上传参考音色"] }, ai: { title: "生成并筛选分镜", lines: ["配置宫格与分辨率", "检查产品、人物和场景", "选择分镜并优化提示词"] }, final: { title: "生成宣传成片", lines: ["设置镜头运动与转场节奏", "并发生成约 15 秒片段", "检查产品外观与卖点表达", "下载视频和分镜素材", "按需进入视频一键分发"] } })

save("06-geo-growth.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="10" flood-color="#203B62" flood-opacity=".1"/></filter><marker id="arrow" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto"><path d="M0 0L11 5.5 0 11Z" fill="#7187AA"/></marker></defs><rect width="1920" height="1080" fill="#F7F5F1"/><text x="80" y="85" font-family="${font}" font-size="23" font-weight="700" fill="#D06C38" letter-spacing="4">招财猫 AI 中台 · 人机协作工作流</text><text x="80" y="155" font-family="${font}" font-size="52" font-weight="800" fill="#27364F">GEO 内容增长</text><text x="80" y="200" font-family="${font}" font-size="21" fill="#6C7788">企业提供真实知识，AI 规划与创作，人工负责事实核验和最终发布</text><g font-family="${font}"><rect x="70" y="260" width="1780" height="205" rx="24" fill="#E7F0FF"/><rect x="70" y="485" width="1780" height="205" rx="24" fill="#FFF1D8"/><rect x="70" y="710" width="1780" height="205" rx="24" fill="#E6F3EA"/><text x="105" y="320" font-size="24" font-weight="800" fill="#2E67A2">企业与运营人员</text><text x="105" y="545" font-size="24" font-weight="800" fill="#A46A16">AI 中台</text><text x="105" y="770" font-size="24" font-weight="800" fill="#2E7850">人工确认与输出</text><line x1="275" y1="260" x2="275" y2="915" stroke="#C9CEC9" stroke-width="2"/><g filter="url(#shadow)">
<rect x="325" y="315" width="270" height="100" rx="20" fill="white"/><text x="460" y="354" text-anchor="middle" font-size="21" font-weight="700" fill="#27364F">完善企业实体信息</text><text x="460" y="387" text-anchor="middle" font-size="16" fill="#6C7788">上传介绍、产品、案例和 FAQ</text><path d="M460 415V530" stroke="#7187AA" stroke-width="4" marker-end="url(#arrow)"/>
<rect x="325" y="545" width="270" height="100" rx="20" fill="#FFE3A9"/><text x="460" y="584" text-anchor="middle" font-size="21" font-weight="700" fill="#6D4A0B">生成企业 GEO Skill</text><text x="460" y="617" text-anchor="middle" font-size="16" fill="#82662C">整理企业知识与表达规范</text><path d="M595 595H685" stroke="#7187AA" stroke-width="4" marker-end="url(#arrow)"/>
<rect x="700" y="765" width="280" height="100" rx="20" fill="white"/><text x="840" y="804" text-anchor="middle" font-size="21" font-weight="700" fill="#285F40">核对知识库事实</text><text x="840" y="837" text-anchor="middle" font-size="16" fill="#4F755E">修正并设为默认 Skill</text><path d="M840 765V650" stroke="#7187AA" stroke-width="4" marker-end="url(#arrow)"/>
<rect x="700" y="545" width="280" height="100" rx="20" fill="#FFE3A9"/><text x="840" y="584" text-anchor="middle" font-size="21" font-weight="700" fill="#6D4A0B">生成两周内容矩阵</text><text x="840" y="617" text-anchor="middle" font-size="16" fill="#82662C">规划平台、主题和日期</text><path d="M980 595H1070" stroke="#7187AA" stroke-width="4" marker-end="url(#arrow)"/>
<rect x="1085" y="315" width="280" height="100" rx="20" fill="white"/><text x="1225" y="354" text-anchor="middle" font-size="21" font-weight="700" fill="#27364F">筛选高价值选题</text><text x="1225" y="387" text-anchor="middle" font-size="16" fill="#6C7788">删除重复并调整内容方向</text><path d="M1225 415V530" stroke="#7187AA" stroke-width="4" marker-end="url(#arrow)"/>
<rect x="1085" y="545" width="280" height="100" rx="20" fill="#FFE3A9"/><text x="1225" y="584" text-anchor="middle" font-size="21" font-weight="700" fill="#6D4A0B">创作并执行 GEO 评分</text><text x="1225" y="617" text-anchor="middle" font-size="16" fill="#82662C">语义、对话、证据、FAQ</text><path d="M1365 595H1460" stroke="#7187AA" stroke-width="4" marker-end="url(#arrow)"/>
<rect x="1475" y="765" width="290" height="100" rx="20" fill="#1F7552"/><text x="1620" y="804" text-anchor="middle" font-size="21" font-weight="700" fill="white">核验、优化并导出</text><text x="1620" y="837" text-anchor="middle" font-size="16" fill="#D9F0E3">导出 Markdown 后人工发布</text><path d="M1620 765V650" stroke="#7187AA" stroke-width="4" marker-end="url(#arrow)"/>
<rect x="1475" y="545" width="290" height="100" rx="20" fill="#FFE3A9"/><text x="1620" y="584" text-anchor="middle" font-size="21" font-weight="700" fill="#6D4A0B">根据建议优化文章</text><text x="1620" y="617" text-anchor="middle" font-size="16" fill="#82662C">补充事实、案例和结构化问答</text></g></g></svg>`)

console.log("Generated 6 workflow flowcharts")
