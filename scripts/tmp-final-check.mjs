const summary = {
  at: new Date().toISOString(),
  fullApi: {
    id: '6a59dda7f947b6cb3450f7dc',
    name: 'zhongtai-full-api',
    domain: 'https://mcap-full-api.preview.aliyun-zeabur.cn',
  },
  fullWeb: {
    id: '6a59ddbef947b6cb3450f7e3',
    name: 'zhongtai-full-web',
    domain: 'https://mcap-full-web.preview.aliyun-zeabur.cn',
  },
  cloudUntouched: {
    api: 'https://mcap-cloud-api.preview.aliyun-zeabur.cn',
    web: 'https://mcap-cloud-web.preview.aliyun-zeabur.cn',
  },
}
const checks = {}
for (const [k,u] of [
  ['fullApiHealth', summary.fullApi.domain + '/health'],
  ['fullWeb', summary.fullWeb.domain + '/'],
  ['cloudHealth', summary.cloudUntouched.api + '/health'],
  ['cloudSync', summary.cloudUntouched.api + '/api/config/sync'],
]) {
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) })
  const t = await r.text()
  checks[k] = { status: r.status, body: t.slice(0,120).replace(/\s+/g,' ') }
}
console.log(JSON.stringify({ summary, checks }, null, 2))
await import('node:fs').then(fs => fs.writeFileSync('F:/A-xiangmu/21-zhongtai/zhongtai-main/.tmp-full-site-deploy.json', JSON.stringify({ summary, checks }, null, 2)))
