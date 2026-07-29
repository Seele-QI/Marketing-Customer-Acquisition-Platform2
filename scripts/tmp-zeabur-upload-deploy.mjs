import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const ROOT = process.cwd()
const token = fs
  .readFileSync(path.join(os.homedir(), ".config/zeabur/cli.yaml"), "utf8")
  .match(/^token:\s*(.+)$/m)[1]
  .trim()

const envId = "6a55b49671e4f22eed327822"
const services = [
  { name: "api", id: "6a55b4970d3aedb1dbcf8122", dockerfilePath: "Dockerfile.api" },
  { name: "web", id: "6a55b4970d3aedb1dbcf8121", dockerfilePath: "Dockerfile.web" },
]

async function gql(query, variables) {
  const res = await fetch("https://api.zeabur.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

function makeServiceZip(dockerfilePath) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "zhongtai-svc-"))
  const tarPath = path.join(os.tmpdir(), `zhongtai-src-${Date.now()}.tar`)
  const zipPath = path.join(
    os.tmpdir(),
    `zhongtai-${path.basename(dockerfilePath)}-${Date.now()}.zip`,
  )

  // Prefer git archive so directory structure is preserved (PowerShell Compress-Archive flattens).
  const archive = spawnSync("git", ["archive", "--format=tar", "-o", tarPath, "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  })
  if (archive.status !== 0) {
    throw new Error(archive.stderr || archive.stdout || "git archive failed")
  }

  // Some non-ASCII paths may warn on Windows tar; still extract what we need.
  const extract = spawnSync("tar", ["-xf", tarPath, "-C", work], {
    encoding: "utf8",
  })
  // Do not hard-fail on non-zero: Chinese path warnings can set status=1 while files extract.

  // Zeabur builds the file named Dockerfile (override content also set via API)
  fs.copyFileSync(path.join(ROOT, dockerfilePath), path.join(work, "Dockerfile"))
  fs.copyFileSync(path.join(ROOT, dockerfilePath), path.join(work, dockerfilePath))

  // Verify critical paths exist before upload
  const required =
    dockerfilePath === "Dockerfile.api"
      ? ["scripts", "lib", "routes", "assets", "main.py", "requirements.txt"]
      : ["scripts", "package.json", "pnpm-lock.yaml", "app", "components", "lib"]
  for (const name of required) {
    const p = path.join(work, name)
    if (!fs.existsSync(p)) {
      throw new Error(
        `zip staging missing required path: ${name}` +
          (extract.status !== 0 ? `; tar extract status=${extract.status} stderr=${extract.stderr}` : ""),
      )
    }
  }

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
  const zip = spawnSync("tar", ["-a", "-cf", zipPath, "-C", work, "."], {
    encoding: "utf8",
  })
  if (zip.status !== 0) throw new Error(zip.stderr || zip.stdout || "tar zip failed")

  try {
    fs.unlinkSync(tarPath)
  } catch {
    // ignore
  }
  return zipPath
}

async function uploadZip(zipPath) {
  const buf = fs.readFileSync(zipPath)
  const hash = crypto.createHash("sha256").update(buf).digest("base64")
  console.log("zip bytes", buf.length)
  const createRes = await fetch("https://api.zeabur.com/v2/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content_hash: hash,
      content_hash_algorithm: "sha256",
      content_length: buf.length,
    }),
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error(`create upload failed: ${JSON.stringify(created)}`)
  const putRes = await fetch(created.presign_url, {
    method: created.presign_method || "PUT",
    headers: { ...(created.presign_header || {}) },
    body: buf,
  })
  if (!putRes.ok) {
    throw new Error(`presign put failed ${putRes.status}: ${await putRes.text()}`)
  }
  return created.upload_id
}

async function prepareExisting(uploadId, serviceId) {
  const res = await fetch(`https://api.zeabur.com/v2/upload/${uploadId}/prepare`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      upload_type: "existing_service",
      service_id: serviceId,
      environment_id: envId,
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`prepare failed: ${JSON.stringify(j)}`)
  return j
}

for (const s of services) {
  const content = fs.readFileSync(path.join(ROOT, s.dockerfilePath), "utf8")
  console.log(
    `=== ${s.name}: restore dockerfile content (${s.dockerfilePath}, ${content.length} chars) ===`,
  )
  const upd = await gql(
    `mutation($serviceID: ObjectID!, $dockerfile: String!) {
      updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
    }`,
    { serviceID: s.id, dockerfile: content },
  )
  console.log(JSON.stringify(upd.data || upd.errors))

  const q = await gql(
    `query($sid: ObjectID!, $eid: ObjectID!) {
      service(_id: $sid) { variables(environmentID: $eid) { key } }
    }`,
    { sid: s.id, eid: envId },
  )
  const has = (q.data?.service?.variables || []).some((v) => v.key === "ZBPACK_DOCKERFILE_PATH")
  if (has) {
    const r = await gql(
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $oldKey: String!, $newKey: String!, $value: String!) {
        updateSingleEnvironmentVariable(
          serviceID: $serviceID
          environmentID: $environmentID
          oldKey: $oldKey
          newKey: $newKey
          value: $value
        ) { key value }
      }`,
      {
        serviceID: s.id,
        environmentID: envId,
        oldKey: "ZBPACK_DOCKERFILE_PATH",
        newKey: "ZBPACK_DOCKERFILE_PATH",
        value: "Dockerfile",
      },
    )
    console.log("env ZBPACK_DOCKERFILE_PATH updated")
  } else {
    const r = await gql(
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $key: String!, $value: String!) {
        createEnvironmentVariable(
          serviceID: $serviceID
          environmentID: $environmentID
          key: $key
          value: $value
        ) { key value }
      }`,
      {
        serviceID: s.id,
        environmentID: envId,
        key: "ZBPACK_DOCKERFILE_PATH",
        value: "Dockerfile",
      },
    )
    if (r.errors) console.log("env create errors", JSON.stringify(r.errors))
    else console.log("env ZBPACK_DOCKERFILE_PATH created")
  }

  console.log(`=== ${s.name}: zip+upload ===`)
  const zipPath = makeServiceZip(s.dockerfilePath)
  const uploadId = await uploadZip(zipPath)
  console.log("upload_id", uploadId)
  console.log(JSON.stringify(await prepareExisting(uploadId, s.id)))
}

console.log("DONE")
