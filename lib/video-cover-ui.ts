export type CoverUiInput = {
  coverUrl: string
  coverStatus?: string
  coverError?: string
  videoStatus?: string
}

export type CoverUiState = {
  kind: "idle" | "running" | "success" | "failed"
  message: string
  allowRetry: boolean
}

export function getCoverUiState(input: CoverUiInput): CoverUiState {
  if (input.coverUrl) {
    return {
      kind: "success",
      message: "竖屏 3:4 封面图，可下载使用",
      allowRetry: false,
    }
  }

  if (input.coverStatus === "running") {
    return {
      kind: "running",
      message: "封面图自动生成中...",
      allowRetry: false,
    }
  }

  if (input.coverStatus === "failed") {
    return {
      kind: "failed",
      message: input.coverError || "封面生成失败，可重试",
      allowRetry: true,
    }
  }

  return {
    kind: "idle",
    message: "封面图尚未生成",
    allowRetry: false,
  }
}
