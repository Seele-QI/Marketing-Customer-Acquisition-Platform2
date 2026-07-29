const token = process.env.ZB_TOKEN
async function gql(q,v={}){const r=await fetch('https://api.zeabur.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const env='6a55b49671e4f22eed327822'
const api='6a59dda7f947b6cb3450f7dc'

const st = await gql(`query($id:ObjectID!,$e:ObjectID!){ service(_id:$id){
  name status
  ports(environmentID:$e){ id port type }
  variables(environmentID:$e, exposed:true){ key value }
} }`, {id:api, e:env})
const vars = (st.data.service.variables||[]).filter(v=>/PORT|HOST|CREDIT_DB|DATA_DIR|EMAIL_HASH/i.test(v.key))
console.log('status', st.data.service.status, 'ports', st.data.service.ports)
console.log('vars', vars)

// try exec
const ex = await gql(`mutation($s:ObjectID!,$e:ObjectID!,$c:[String!]!){
  executeCommand(serviceID:$s, environmentID:$e, command:$c){ exitCode output }
}`, {s:api, e:env, c:['sh','-c','echo PORT=$PORT; ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null; ps aux | head -20; curl -sS http://127.0.0.1:8080/health; echo; curl -sS http://127.0.0.1:8000/health; echo']})
console.log(JSON.stringify(ex, null, 2).slice(0,3000))
