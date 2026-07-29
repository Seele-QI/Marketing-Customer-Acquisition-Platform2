const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
for (const id of ['6a59df789cfc4cd5e6888d51','6a59dfaab33bf4df98a4bf14']) {
  const logs = await gql(`query($d:ObjectID!){ buildLogs(deploymentID:$d){ message } }`, {d:id})
  const items = logs.data?.buildLogs||[]
  const err = items.filter(x=>/ERROR|error|FAIL/i.test(x.message)).slice(-5)
  console.log('\n', id, 'logs', items.length, 'errs', err.length)
  console.log(items.slice(-8).map(x=>x.message.replace(/\x1b\[[0-9;]*m/g,'')).join('\n').slice(-1500))
}
