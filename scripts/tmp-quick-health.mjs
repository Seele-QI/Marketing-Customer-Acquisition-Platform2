for (const [n,u] of [
  ['full-api', 'https://mcap-full-api.preview.aliyun-zeabur.cn/health'],
  ['full-web', 'https://mcap-full-web.preview.aliyun-zeabur.cn/'],
  ['cloud-api', 'https://mcap-cloud-api.preview.aliyun-zeabur.cn/health'],
]) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) })
    const t = await r.text()
    console.log(n, r.status, t.slice(0,90).replace(/\s+/g,' '))
  } catch (e) { console.log(n, 'ERR', e.message) }
}
