const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const env='6a55b49671e4f22eed327822'
const api='6a59dda7f947b6cb3450f7dc'
const web='6a59ddbef947b6cb3450f7e3'

const s = await gql(`query($id:ObjectID!){ service(_id:$id){ name status } }`, {id:api})
console.log('api service', s.data)
const s2 = await gql(`query($id:ObjectID!){ service(_id:$id){ name status } }`, {id:web})
console.log('web service', s2.data)

const j=await gql(`query($s:ObjectID!,$e:ObjectID!){ deployments(serviceID:$s,environmentID:$e){ edges{ node{ _id status createdAt finishedAt }}}}`,{s:api,e:env})
console.log('api deps', JSON.stringify(j.data?.deployments?.edges,null,2))

const dep='6a59df789cfc4cd5e6888d51'
const d=await gql(`query($id:ObjectID!){ deployment(_id:$id){ _id status createdAt finishedAt } }`,{id:dep})
console.log('dep detail', JSON.stringify(d,null,2))

const logs = await gql(`query($d:ObjectID!){ buildLogs(deploymentID:$d){ message } }`, {d:dep})
const items = logs.data?.buildLogs||[]
const interesting = items.filter(x=>/ERROR|error|FAIL|DONE|exporting|pushing|successfully/i.test(x.message))
console.log('interesting count', interesting.length)
console.log(interesting.slice(-20).map(x=>x.message.replace(/\x1b\[[0-9;]*m/g,'')).join('\n').slice(-2500))

for (const u of [
  'https://mcap-full-api.preview.aliyun-zeabur.cn/health',
  'https://mcap-full-web.preview.aliyun-zeabur.cn/',
  'https://mcap-cloud-api.preview.aliyun-zeabur.cn/health',
]) {
  try {
    const r = await fetch(u, {signal:AbortSignal.timeout(12000)})
    console.log(u, r.status, (await r.text()).slice(0,100).replace(/\s+/g,' '))
  } catch(e) { console.log(u, e.message) }
}
