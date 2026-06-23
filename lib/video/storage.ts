/**
 * 视频创作历史记录 + 共享视频库的 localStorage 存储
 *
 * 被 VideoHistory / VideoCreationWorkflow / BatchEdit / ShareDistribute 共用，
 * 集中管理可避免多个组件各自实现重复的读写逻辑。
 */
import type { HistoryRecord, ShareVideo } from "./types"
import { HISTORY_STORAGE_KEY, HISTORY_MAX_AGE_MS, SHARE_VIDEOS_KEY } from "./types"

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

function loadShareVideos(): ShareVideo[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(SHARE_VIDEOS_KEY)
    return raw ? (JSON.parse(raw) as ShareVideo[]) : []
  } catch {
    return []
  }
}

function saveShareVideos(videos: ShareVideo[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(SHARE_VIDEOS_KEY, JSON.stringify(videos))
}

export function addShareVideo(video: ShareVideo) {
  const videos = loadShareVideos()
  const idx = videos.findIndex((v) => v.id === video.id)
  if (idx >= 0) {
    videos[idx] = video
  } else {
    videos.unshift(video)
  }
  saveShareVideos(videos)
}

export function getShareVideos(): ShareVideo[] {
  return loadShareVideos()
}

export function clearShareVideos() {
  saveShareVideos([])
}
