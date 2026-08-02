const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const env='6a55b49671e4f22eed327822'
const api='6a59dda7f947b6cb3450f7dc'
const st = await gql(`query($id:ObjectID!,$e:ObjectID!){ service(_id:$id){
  variables(environmentID:$e, exposed:true){ key }
} }`, {id:api, e:env})
console.log('all keys', (st.data.service.variables||[]).map(v=>v.key).sort().join(', '))
console.log('count', st.data.service.variables.length)
