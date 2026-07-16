/** Node test 环境下替代 next/headers，供 withAuth 读取 session_id */
let sessionId = "test-session-id"

export function __setTestSessionId(value) {
  sessionId = value || "test-session-id"
}

export async function cookies() {
  return {
    get(name) {
      if (name === "session_id") {
        return { name: "session_id", value: sessionId }
      }
      return undefined
    },
  }
}
