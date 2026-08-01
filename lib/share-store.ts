/**
 * 一键分发分享链接内存存储（Next.js 侧，无需 FastAPI 即可生成分享页）
 */
import { randomBytes } from "node:crypto"

export type ShareRecord = {
  videoUrl: string
  title: string
  description: string
  tags: string[]
  createdAt: number
}

const SHARE_TTL_MS = 24 * 60 * 60 * 1000
const SHARE_STORE_MAX = 500

const globalStore = globalThis as typeof globalThis & {
  __shareStore?: Map<string, ShareRecord>
}

function getStore(): Map<string, ShareRecord> {
  if (!globalStore.__shareStore) {
    globalStore.__shareStore = new Map()
  }
  return globalStore.__shareStore
}

function cleanupExpired(now = Date.now()) {
  const store = getStore()
  for (const [token, record] of store.entries()) {
    if (now - record.createdAt > SHARE_TTL_MS) {
      store.delete(token)
    }
  }
}

function enforceCapacity() {
  const store = getStore()
  while (store.size > SHARE_STORE_MAX) {
    const oldest = store.keys().next().value
    if (!oldest) break
    store.delete(oldest)
  }
}

export function makeShareToken(): string {
  return randomBytes(16).toString("hex")
}

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const s = String(raw ?? "").trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s.slice(0, 30))
    if (out.length >= 5) break
  }
  return out
}

export function saveShareRecord(record: Omit<ShareRecord, "createdAt">): string {
  cleanupExpired()
  const store = getStore()
  let token = makeShareToken()
  while (store.has(token)) token = makeShareToken()
  store.set(token, { ...record, createdAt: Date.now() })
  enforceCapacity()
  return token
}

export function getShareRecord(token: string): ShareRecord | null {
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  cleanupExpired()
  const record = getStore().get(token)
  if (!record) return null
  if (Date.now() - record.createdAt > SHARE_TTL_MS) {
    getStore().delete(token)
    return null
  }
  return record
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function renderShareLandingPage(record: ShareRecord): string {
  const title = escapeHtml(record.title || "未命名标题")
  const description = escapeHtml(record.description || "（无描述）")
  const tags = record.tags.map((t) => escapeHtml(t))
  const tagsHtml =
    tags.length > 0
      ? tags
          .map(
            (t) =>
              `<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#f4f4f5;color:#18181b;font-size:12px;line-height:1;">#${t}</span>`,
          )
          .join("")
      : '<span style="font-size:12px;color:#6b7280;">（无标签）</span>'

  let copyText = `${record.title}\n\n${record.description}`.trim()
  if (record.tags.length > 0) {
    copyText = `${copyText}\n\n${record.tags.map((t) => `#${t}`).join(" ")}`
  }
  const copyTextJs = JSON.stringify(copyText).replace(/</g, "\\u003c")

  const videoUrlRaw = (record.videoUrl || "").trim()
  const videoUrlHtml = escapeHtml(videoUrlRaw)
  const videoBlock = videoUrlRaw
    ? `
          <div style="margin-top:4px;">
            <div style="font-size:13px;font-weight:600;color:#6b7280;margin-bottom:8px;">视频素材</div>
            <video src="${videoUrlHtml}" controls playsinline style="width:100%;max-height:360px;border-radius:12px;background:#000;" preload="metadata"></video>
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:10px;">
              <a href="${videoUrlHtml}" download style="text-decoration:none;border:1px solid #e5e7eb;background:#ffffff;color:#111827;padding:10px 14px;border-radius:12px;font-size:14px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">
                下载视频
              </a>
            </div>
          </div>`
    : ""

  const creatorUrl = "https://creator.douyin.com/creator-micro/content/upload"

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title || "一键分发"}</title>
  </head>
  <body style="margin:0;background:#fafafa;color:#111827;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
    <div style="max-width:920px;margin:0 auto;padding:28px 16px 40px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:20px 18px;box-shadow:0 1px 2px rgba(16,24,40,0.06);">
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:18px;font-weight:700;line-height:1.35;color:#111827;word-break:break-word;">${title}</div>
            <div style="font-size:14px;line-height:1.65;color:#374151;white-space:pre-wrap;word-break:break-word;">${description}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">${tagsHtml}</div>
          ${videoBlock}
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;">
            <button id="copyBtn" type="button" style="appearance:none;border:1px solid #e5e7eb;background:#111827;color:#ffffff;padding:10px 14px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">
              复制文案
            </button>
            <a href="${creatorUrl}" style="text-decoration:none;border:1px solid #e5e7eb;background:#ffffff;color:#111827;padding:10px 14px;border-radius:12px;font-size:14px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">
              打开抖音创作者中心
            </a>
            <span id="copyHint" style="align-self:center;font-size:12px;color:#6b7280;"></span>
          </div>
        </div>
      </div>
    </div>
    <script>
      const copyText = ${copyTextJs};
      const btn = document.getElementById('copyBtn');
      const hint = document.getElementById('copyHint');
      function setHint(text) { if (hint) hint.textContent = text || ''; }
      async function doCopy() {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(copyText);
          } else {
            const ta = document.createElement('textarea');
            ta.value = copyText;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          setHint('已复制');
          setTimeout(() => setHint(''), 1200);
        } catch (e) {
          setHint('复制失败，请手动复制');
        }
      }
      if (btn) btn.addEventListener('click', doCopy);
    </script>
  </body>
</html>`
}
