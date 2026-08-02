const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const env='6a55b49671e4f22eed327822'
const api='6a59dda7f947b6cb3450f7dc'
const web='6a59ddbef947b6cb3450f7e3'

const mut = await gql(`{ __type(name:"Mutation") { fields { name } } }`)
console.log(mut.data.__type.fields.map(f=>f.name).filter(n=>/suspend|resume|restart|redeploy|unsuspend/i.test(n)).join('\n'))

// try restart both
for (const [n,s] of [['api',api],['web',web]]) {
  const j = await gql(`mutation($s:ObjectID!,$e:ObjectID!){ restartService(serviceID:$s, environmentID:$e) }`, {s,e:env})
  console.log('restart', n, JSON.stringify(j))
}

// check resource limits
const lim = await gql(`query($id:ObjectID!){ service(_id:$id){ name status resourceLimit { cpu memory } } }`, {id:api})
console.log('api limit', JSON.stringify(lim))

await new Promise(r=>setTimeout(r,8000))
const s = await gql(`query($id:ObjectID!){ service(_id:$id){ name status } }`, {id:api})
console.log('api after', s.data)
const s2 = await gql(`query($id:ObjectID!){ service(_id:$id){ name status } }`, {id:web})
console.log('web after', s2.data)

// runtime logs
const rt = await gql(`query($s:ObjectID!,$e:ObjectID!){ runtimeLogs(serviceID:$s, environmentID:$e){ message timestamp } }`, {s:web,e:env})
console.log('web runtime schema try', JSON.stringify(rt).slice(0,800))
