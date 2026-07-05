/**
 * 工作流大文件素材 — IndexedDB 持久化（跨刷新恢复）
 */
import type { DraftKind } from "@/lib/workflow-draft-store"

const DB_NAME = "agenthub-workflow-assets"
const DB_VERSION = 1
const STORE_NAME = "assets"

/** 单工作流素材配额上限（字节） */
export const WORKFLOW_ASSET_QUOTA_BYTES = 200 * 1024 * 1024

export type StoredAsset = {
  id: string
  workflow: DraftKind
  name: string
  mime: string
  size: number
  kind: "image" | "audio" | "video"
  meta?: string
  blob: Blob
  updatedAt: number
}

type AssetMetaRow = Omit<StoredAsset, "blob">

let dbPromise: Promise<IDBDatabase> | null = null

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB unavailable"))
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => reject(req.error ?? new Error("IDB open failed"))
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
          store.createIndex("workflow", "workflow", { unique: false })
        }
      }
    })
  }
  return dbPromise
}

function txStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        tx.onerror = () => reject(tx.error ?? new Error("IDB tx failed"))
        resolve(store)
      }),
  )
}

export async function getWorkflowAssetBytes(workflow: DraftKind): Promise<number> {
  const all = await listWorkflowAssetMeta(workflow)
  return all.reduce((sum, a) => sum + a.size, 0)
}

export async function listWorkflowAssetMeta(workflow: DraftKind): Promise<AssetMetaRow[]> {
  if (!isBrowser()) return []
  const store = await txStore("readonly")
  return new Promise((resolve, reject) => {
    const idx = store.index("workflow")
    const req = idx.getAll(workflow)
    req.onsuccess = () => {
      const rows = (req.result as StoredAsset[]).map(({ blob: _b, ...meta }) => meta)
      resolve(rows)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getWorkflowAsset(id: string): Promise<StoredAsset | null> {
  if (!isBrowser()) return null
  const store = await txStore("readonly")
  return new Promise((resolve, reject) => {
    const req = store.get(id)
    req.onsuccess = () => resolve((req.result as StoredAsset) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function putWorkflowAsset(input: {
  id: string
  workflow: DraftKind
  name: string
  mime: string
  kind: "image" | "audio" | "video"
  meta?: string
  blob: Blob
}): Promise<{ ok: true } | { ok: false; reason: "quota" | "error" }> {
  if (!isBrowser()) return { ok: false, reason: "error" }
  try {
    const existing = await getWorkflowAsset(input.id)
    const currentBytes = await getWorkflowAssetBytes(input.workflow)
    const delta = input.blob.size - (existing?.size ?? 0)
    if (currentBytes + delta > WORKFLOW_ASSET_QUOTA_BYTES) {
      return { ok: false, reason: "quota" }
    }
    const row: StoredAsset = {
      id: input.id,
      workflow: input.workflow,
      name: input.name,
      mime: input.mime,
      size: input.blob.size,
      kind: input.kind,
      meta: input.meta,
      blob: input.blob,
      updatedAt: Date.now(),
    }
    const store = await txStore("readwrite")
    await new Promise<void>((resolve, reject) => {
      const req = store.put(row)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    return { ok: true }
  } catch {
    return { ok: false, reason: "error" }
  }
}

export async function deleteWorkflowAsset(id: string): Promise<void> {
  if (!isBrowser()) return
  const store = await txStore("readwrite")
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function clearWorkflowAssets(workflow: DraftKind): Promise<void> {
  const metas = await listWorkflowAssetMeta(workflow)
  await Promise.all(metas.map((m) => deleteWorkflowAsset(m.id)))
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob)
  const comma = dataUrl.indexOf(",")
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

export function fileToBlob(file: File): Blob {
  return file
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(",")
  const mimeMatch = header?.match(/data:([^;]+)/)
  const mime = mimeMatch?.[1] ?? "application/octet-stream"
  const binary = atob(body ?? "")
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function newAssetId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 测试用：重置 DB 连接 */
export function resetAssetStoreForTests(): void {
  dbPromise = null
}
