const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const env='6a55b49671e4f22eed327822'
for (const [n,s] of [['api','6a59dda7f947b6cb3450f7dc'],['web','6a59ddbef947b6cb3450f7e3']]) {
  const j=await gql(`query($s:ObjectID!,$e:ObjectID!){ deployments(serviceID:$s,environmentID:$e){ edges{ node{ _id status createdAt }}}}`,{s,e:env})
  console.log(n, j.data.deployments.edges.slice(0,3).map(e=>e.node))
}
