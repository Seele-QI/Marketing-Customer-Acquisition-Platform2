/**
 * 视频创作历史记录 + 共享视频库的 localStorage 存储
 *
 * 被 VideoHistory / VideoCreationWorkflow / ShareDistribute 及各视频工作流共用，
 * 集中管理可避免多个组件各自实现重复的读写逻辑。
 */
import type { HistoryRecord, ShareVideo } from "./types"
import { HISTORY_STORAGE_KEY, HISTORY_MAX_AGE_MS, shareVideosStorageKey } from "./types"
import { getCachedUserId } from "@/lib/auth-session"

/* ================================================================== */
/*  创作历史                                                            */
/* ================================================================== */

function loadHistory(): HistoryRecord[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const data: HistoryRecord[] = JSON.parse(raw)
    const cutoff = Date.now() - HISTORY_MAX_AGE_MS
    return data.filter((r) => r.createdAt > cutoff).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

function saveHistory(records: HistoryRecord[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records))
  } catch {
    /* quota exceeded — silently skip */
  }
}

export function addHistoryRecord(record: HistoryRecord) {
  const records = loadHistory()
  const idx = records.findIndex((r) => r.id === record.id)
  if (idx >= 0) {
    records[idx] = record
  } else {
    records.unshift(record)
  }
  saveHistory(records)
}

export function removeHistoryRecord(id: string) {
  const records = loadHistory().filter((r) => r.id !== id)
  saveHistory(records)
  return records
}

export function clearAllHistory(): HistoryRecord[] {
  saveHistory([])
  return []
}

export function getHistoryRecords(): HistoryRecord[] {
  return loadHistory()
}

/* ================================================================== */
/*  共享视频库（一键分发用）                                             */
/* ================================================================== */

function loadShareVideos(userId?: number | null): ShareVideo[] {
  if (typeof window === "undefined") return []
  if (userId == null || userId <= 0) return []
  try {
    const raw = localStorage.getItem(shareVideosStorageKey(userId))
    return raw ? (JSON.parse(raw) as ShareVideo[]) : []
  } catch {
    return []
  }
}

function saveShareVideos(videos: ShareVideo[], userId?: number | null) {
  if (typeof window === "undefined") return
  if (userId == null || userId <= 0) return
  localStorage.setItem(shareVideosStorageKey(userId), JSON.stringify(videos))
}

export function addShareVideo(video: ShareVideo, userId?: number | null) {
  const uid = userId ?? getCachedUserId()
  if (uid == null || uid <= 0) return
  const videos = loadShareVideos(uid)
  const idx = videos.findIndex((v) => v.id === video.id)
  if (idx >= 0) {
    videos[idx] = video
  } else {
    videos.unshift(video)
  }
  saveShareVideos(videos, uid)
}

export function getShareVideos(userId?: number | null): ShareVideo[] {
  const uid = userId ?? getCachedUserId()
  if (uid == null || uid <= 0) return []
  return loadShareVideos(uid)
}

export function removeShareVideo(videoId: string, userId?: number | null) {
  const uid = userId ?? getCachedUserId()
  if (uid == null || uid <= 0 || !videoId) return []
  const videos = loadShareVideos(uid).filter((v) => v.id !== videoId)
  saveShareVideos(videos, uid)
  return videos
}

export function clearShareVideos(userId?: number | null) {
  if (typeof window === "undefined") return
  if (userId != null && userId > 0) {
    localStorage.removeItem(shareVideosStorageKey(userId))
    return
  }
  // 登出：清当前用户未知时，移除所有 share-videos-u* 及旧全局 key
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith("share-videos-u") || k === "share-videos")) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}
