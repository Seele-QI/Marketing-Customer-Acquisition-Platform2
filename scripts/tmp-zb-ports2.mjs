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
const pe = await gql(`{ __type(name:"ServiceSpecPortType") { enumValues { name } } }`)
console.log(pe.data.__type.enumValues)

const j = await gql(`query($id:ObjectID!,$e:ObjectID!){ service(_id:$id){
  name dnsName
  domains { domain }
  ports(environmentID:$e) { id port type }
} }`, { id: '6a55b4970d3aedb1dbcf8122', e: env })
console.log(JSON.stringify(j.data, null, 2))

const j2 = await gql(`query($id:ObjectID!,$e:ObjectID!){ service(_id:$id){
  name dnsName
  domains { domain }
  ports(environmentID:$e) { id port type }
} }`, { id: '6a55b4970d3aedb1dbcf8121', e: env })
console.log(JSON.stringify(j2.data, null, 2))
