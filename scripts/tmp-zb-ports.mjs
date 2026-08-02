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
const cloudApi = '6a55b4970d3aedb1dbcf8122'
const j = await gql(`query($id:ObjectID!,$e:ObjectID!){ service(_id:$id){
  name dnsName
  domains { domain }
  ports(environmentID:$e) { id name port type }
} }`, { id: cloudApi, e: env })
console.log(JSON.stringify(j, null, 2))

const types = await gql(`{ __type(name:"ServicePort") { fields { name type { name kind ofType { name } } } } }`)
console.log('ServicePort', JSON.stringify(types,null,2))
const pe = await gql(`{ __type(name:"PortType") { enumValues { name } } }`)
console.log('PortType', pe.data?.__type?.enumValues)

// also check ServicePortInput via schema search
const mut = await gql(`{ __schema { types { name kind inputFields { name type { name kind ofType { name } } } } } }`)
const hits = mut.data.__schema.types.filter(t => /Port/i.test(t.name) && t.kind==='INPUT_OBJECT')
console.log(JSON.stringify(hits, null, 2))
