const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const env='6a55b49671e4f22eed327822'
const api='6a59dda7f947b6cb3450f7dc'
const web='6a59ddbef947b6cb3450f7e3'
const FORBIDDEN = new Set(['6a55b4970d3aedb1dbcf8121','6a55b4970d3aedb1dbcf8122','6a56032278e1cb936fb7356c'])

// Align with Zeabur convention: listen 8080 like cloud services
for (const [n,s,port] of [['api',api,8080],['web',web,8080]]) {
  if (FORBIDDEN.has(s)) throw new Error('blocked')
  const p = await gql(`mutation($s:ObjectID!,$e:ObjectID!,$ports:[ServiceSpecPortInput!]!){
    updateServicePorts(serviceID:$s, environmentID:$e, ports:$ports)
  }`, {s,e:env, ports:[{id:'web', port, type:'HTTP'}]})
  console.log('ports', n, JSON.stringify(p.data||p.errors))
  const e = await gql(`mutation($s:ObjectID!,$e:ObjectID!,$data:Map!){
    updateEnvironmentVariable(serviceID:$s, environmentID:$e, data:$data)
  }`, {s,e:env, data: n==='api'
    ? { PORT:'8080', HOST:'0.0.0.0' }
    : { PORT:'8080', HOSTNAME:'0.0.0.0', FASTAPI_URL:'http://zhongtai-full-api.zeabur.internal:8080' }
  })
  console.log('env', n, JSON.stringify(e.errors||'ok'))
}

// update web NEXT_PUBLIC still points to https://mcap-full-api... which is fine
// redeploy to pick up
for (const [n,s] of [['api',api],['web',web]]) {
  const j = await gql(`mutation($s:ObjectID!,$e:ObjectID!){ redeployService(serviceID:$s, environmentID:$e) }`, {s,e:env})
  console.log('redeploy', n, JSON.stringify(j))
}

// list all services status
const proj = await gql(`query($id:ObjectID!){ project(_id:$id){ services { _id name status } } }`, {id:'6a55b4960d3aedb1dbcf811f'})
console.log(JSON.stringify(proj.data.project.services,null,2))
