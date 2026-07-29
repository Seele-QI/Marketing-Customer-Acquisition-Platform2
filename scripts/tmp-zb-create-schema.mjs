const token = process.env.ZB_TOKEN
async function gql(query, variables={}) {
  const r = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

const mut = await gql(`{ __type(name:"Mutation") { fields { name args { name type { name kind ofType { name kind ofType { name } } } } } } }`)
const fields = mut.data.__type.fields.filter(f => /createService|createPrebuilt|addDomain|mountVolume|addVariable|createVariable|updateEnv|setVariable/i.test(f.name))
for (const f of fields) {
  console.log('\n##', f.name)
  console.log(JSON.stringify(f.args, null, 2).slice(0, 1200))
}

// list current beijing project services
const proj = '6a55b4960d3aedb1dbcf811f'
const env = '6a55b49671e4f22eed327822'
const p = await gql(`query($id:ObjectID!){ project(_id:$id){ name services { _id name } } }`, { id: proj })
console.log('\nproject', JSON.stringify(p.data, null, 2))
