const token = process.env.ZB_TOKEN
async function gql(query, variables={}) {
  const r = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}
const mut = await gql(`{ __type(name:"Mutation") { fields { name args { name type { name kind ofType { name } } } } } }`)
const f = mut.data.__type.fields.filter(x => /domain/i.test(x.name))
console.log(JSON.stringify(f, null, 2))

const env = '6a55b49671e4f22eed327822'
const api = '6a59dda7f947b6cb3450f7dc'

// try deleteDomain
const del = await gql(`mutation {
  deleteDomain(domain: "preview.preview.aliyun-zeabur.cn") 
}`)
console.log('delete try1', JSON.stringify(del))

const del2 = await gql(`mutation($s:ObjectID!,$d:String!){
  deleteDomain(serviceID:$s, domain:$d)
}`, { s: api, d: 'preview.preview.aliyun-zeabur.cn' })
console.log('delete try2', JSON.stringify(del2))
