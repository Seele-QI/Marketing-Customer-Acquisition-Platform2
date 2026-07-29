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
const web = '6a59ddbef947b6cb3450f7e3'

for (const [name, id, domain] of [
  ['api', api, 'mcap-full-api'],
  ['web', web, 'mcap-full-web'],
]) {
  const cur = await gql(`query($id:ObjectID!){ service(_id:$id){ domains { domain } } }`, { id })
  console.log(name, 'current', cur.data.service.domains)
  if ((cur.data.service.domains||[]).length) continue
  const j = await gql(`mutation($s:ObjectID!,$e:ObjectID!,$d:String!){
    addDomain(serviceID:$s, environmentID:$e, domain:$d, isGenerated:true) { domain }
  }`, { s: id, e: env, d: domain })
  console.log(name, JSON.stringify(j))
}
