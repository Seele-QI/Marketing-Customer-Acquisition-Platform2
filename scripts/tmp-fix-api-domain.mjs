const token = process.env.ZB_TOKEN
async function gql(query, variables={}) {
  const r = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}
const env = '6a55b49671e4f22eed327822'
const api = '6a59dda7f947b6cb3450f7dc'
const rm = await gql(`mutation { removeDomain(domain: "preview.preview.aliyun-zeabur.cn") }`)
console.log('remove', JSON.stringify(rm))
const add = await gql(`mutation($s:ObjectID!,$e:ObjectID!){
  addDomain(serviceID:$s, environmentID:$e, domain:"mcap-full-api", isGenerated:true) { domain }
}`, { s: api, e: env })
console.log('add', JSON.stringify(add))
const cur = await gql(`query($id:ObjectID!){ service(_id:$id){ domains { domain } } }`, { id: api })
console.log('now', cur.data.service.domains)
