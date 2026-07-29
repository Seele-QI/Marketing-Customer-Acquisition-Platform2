async function probe() {
  const urls = [
    ['full-api', 'https://mcap-full-api.preview.aliyun-zeabur.cn/health'],
    ['full-web', 'https://mcap-full-web.preview.aliyun-zeabur.cn/'],
    ['cloud-api', 'https://mcap-cloud-api.preview.aliyun-zeabur.cn/health'],
    ['cloud-sync', 'https://mcap-cloud-api.preview.aliyun-zeabur.cn/api/config/sync'],
  ]
  for (let i = 0; i < 36; i++) {
    const parts = []
    let apiOk = false, webOk = false
    for (const [name, u] of urls) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15000) })
        const t = await r.text()
        parts.push(`${name}=${r.status}`)
        if (name === 'full-api' && r.ok && t.includes('"status"')) {
          apiOk = true
          parts.push(`(${t.slice(0,80).replace(/\s+/g,' ')})`)
        }
        if (name === 'full-web' && (r.status === 200 || r.status === 307 || r.status === 308)) webOk = true
        if (name === 'cloud-api') parts.push(t.includes('zhongtai-cloud-api') ? 'cloudOK' : 'cloudWeird')
        if (name === 'cloud-sync') parts.push(`sync=${r.status}`)
      } catch (e) {
        parts.push(`${name}=ERR`)
      }
    }
    console.log(`[${i}]`, parts.join(' '))
    if (apiOk && webOk) break
    await new Promise(r => setTimeout(r, 10000))
  }
}
probe()
