const token = process.env.ZB_TOKEN
async function gql(query, variables={}) {
  const r = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

// create web if missing
const proj = '6a55b4960d3aedb1dbcf811f'
const p = await gql(`query($id:ObjectID!){ project(_id:$id){ services { _id name } } }`, { id: proj })
console.log('services', p.data.project.services)

let web = p.data.project.services.find(s => s.name === 'zhongtai-full-web')
if (!web) {
  const c = await gql(`mutation { createService(name:"zhongtai-full-web", template:GIT, projectID:"${proj}") { _id name } }`)
  console.log('create web', JSON.stringify(c))
  web = c.data.createService
}

const api = p.data.project.services.find(s => s.name === 'zhongtai-full-api') || { _id: '6a59dda7f947b6cb3450f7dc', name: 'zhongtai-full-api' }
console.log('api', api, 'web', web)

// ports schema
const portMut = await gql(`{ __type(name:"Mutation") { fields { name args { name type { name kind ofType { name } } } } } }`)
const ups = portMut.data.__type.fields.find(f => f.name === 'updateServicePorts')
console.log('updateServicePorts', JSON.stringify(ups, null, 2).slice(0,2000))

const pt = await gql(`{ __type(name:"ServicePortInput") { inputFields { name type { name kind ofType { name } } } } }`)
console.log('ServicePortInput', JSON.stringify(pt, null, 2))

const st = await gql(`query($id:ObjectID!){ service(_id:$id){ _id name status domains { domain } ports { id port type } dnsName } }`, { id: api._id })
console.log('api detail', JSON.stringify(st, null, 2))
