const token = process.env.ZB_TOKEN
async function gql(query, variables={}) {
  const r = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

const en = await gql(`{ __type(name:"ServiceTemplate") { enumValues { name } } }`)
console.log('ServiceTemplate', en.data.__type.enumValues.map(v=>v.name))

// createService full args truncated - get return type
const mut = await gql(`{ __type(name:"Mutation") { fields { name type { name kind ofType { name } } } } }`)
console.log('createService return', mut.data.__type.fields.find(f=>f.name==='createService'))

// try create empty GITLESS / UPLOAD service
const create = await gql(`mutation {
  createService(
    name: "zhongtai-full-api"
    template: GIT
    projectID: "6a55b4960d3aedb1dbcf811f"
  ) { _id name }
}`)
console.log('create try', JSON.stringify(create, null, 2).slice(0,1500))
