const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const env='6a55b49671e4f22eed327822'
const api='6a59dda7f947b6cb3450f7dc'
const web='6a59ddbef947b6cb3450f7e3'

const t = await gql(`{ __type(name:"Query") { fields { name args { name type { name kind ofType { name } } } } } }`)
const f = t.data.__type.fields.find(x=>x.name==='runtimeLogs')
console.log(JSON.stringify(f,null,2))

const rtType = await gql(`{ __type(name:"RuntimeLog") { fields { name type { name kind ofType { name } } } } }`)
console.log('RuntimeLog', JSON.stringify(rtType,null,2))

for (const [n,s] of [['api',api],['web',web]]) {
  const j = await gql(`query($s:ObjectID!,$e:ObjectID!){
    runtimeLogs(serviceID:$s, environmentID:$e, limit:40){ message timestamp }
  }`, {s,e:env})
  if (j.errors) {
    console.log(n, 'err', JSON.stringify(j.errors).slice(0,500))
    const j2 = await gql(`query($s:ObjectID!,$e:ObjectID!){
      runtimeLogs(serviceID:$s, environmentID:$e){ message }
    }`, {s,e:env})
    console.log(n, JSON.stringify(j2).slice(0,2000))
  } else {
    const items = j.data.runtimeLogs||[]
    console.log('\n==', n, items.length)
    console.log(items.slice(-30).map(x=>x.message).join('\n').slice(-2500))
  }
}
