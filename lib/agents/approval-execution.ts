export type ApprovalExecutionResult = {
  status: "completed" | "failed" | "partial" | "rejected" | "needs_configuration" | "already_executed"
  code?: string
  evidence?: Record<string, unknown>
}

type Approval = {
  id: string
  status: string
  action_type: string
  expires_at: number
  parameters: Record<string, unknown>
}

function isVerifiedAccount(value: unknown, platform: string): boolean {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  if (row.platform !== platform) return false
  const identityVerified = row.verified === true || typeof row.verified_at === "number"
  const loginValid = row.login_status === "valid" || row.login_status === "verified" || row.connected === true
  return identityVerified && loginValid
}

export async function executeApprovedTool(input: {
  baseUrl: string
  meteredKey: string
  cookieHeader: string
  approvalId: string
  idempotencyKey: string
  fetchImpl?: typeof fetch
}): Promise<ApprovalExecutionResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const base = input.baseUrl.replace(/\/$/, "")
  let approvalBody: { approval?: Approval; executionEvidence?: unknown }
  try {
    const response = await fetchImpl(
      `${base}/api/agent-team/approvals/${encodeURIComponent(input.approvalId)}`,
      { headers: { Cookie: input.cookieHeader }, cache: "no-store" },
    )
    if (!response.ok) return { status: "rejected", code: "APPROVAL_NOT_FOUND" }
    approvalBody = (await response.json()) as typeof approvalBody
  } catch {
    return { status: "failed", code: "APPROVAL_SERVICE_UNAVAILABLE" }
  }
  const approval = approvalBody.approval
  if (!approval) return { status: "rejected", code: "APPROVAL_NOT_FOUND" }
  if (approvalBody.executionEvidence) return { status: "already_executed", code: "ALREADY_EXECUTED" }
  if (approval.status !== "approved") return { status: "rejected", code: "APPROVAL_NOT_GRANTED" }
  if (approval.expires_at < Math.floor(Date.now() / 1000)) {
    return { status: "rejected", code: "APPROVAL_EXPIRED" }
  }
  if (approval.action_type !== "content_publish" && approval.action_type !== "publish_content") {
    return { status: "needs_configuration", code: "TOOL_NEEDS_CONFIGURATION" }
  }

  const platform = typeof approval.parameters.platform === "string" ? approval.parameters.platform : ""
  const videoUrl = typeof approval.parameters.videoUrl === "string" ? approval.parameters.videoUrl : ""
  const title = typeof approval.parameters.title === "string" ? approval.parameters.title : ""
  if (!platform || !videoUrl || !title) return { status: "rejected", code: "APPROVED_PARAMETERS_INVALID" }
  try {
    const accountsResponse = await fetchImpl(`${base}/api/publish/accounts`, {
      headers: { Cookie: input.cookieHeader },
      cache: "no-store",
    })
    const accountsBody = (await accountsResponse.json().catch(() => ({}))) as { accounts?: unknown[] }
    if (!accountsResponse.ok || !accountsBody.accounts?.some((item) => isVerifiedAccount(item, platform))) {
      return { status: "needs_configuration", code: "VERIFIED_PUBLISH_ACCOUNT_REQUIRED" }
    }

    const publishResponse = await fetchImpl(`${base}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: input.cookieHeader },
      body: JSON.stringify(approval.parameters),
      signal: AbortSignal.timeout(900_000),
      cache: "no-store",
    })
    const publishBody = (await publishResponse.json().catch(() => ({}))) as Record<string, unknown>
    const completed =
      publishResponse.ok &&
      (publishBody.success === true || ["completed", "published", "success"].includes(String(publishBody.status)))
    const executionStatus = completed ? "completed" : publishResponse.ok ? "uncertain" : "failed"
    const evidence = {
      idempotencyKey: input.idempotencyKey.slice(0, 160),
      httpStatus: publishResponse.status,
      externalStatus: typeof publishBody.status === "string" ? publishBody.status.slice(0, 80) : undefined,
      publishId:
        typeof publishBody.publish_id === "string"
          ? publishBody.publish_id.slice(0, 200)
          : typeof publishBody.id === "string"
            ? publishBody.id.slice(0, 200)
            : undefined,
    }
    const recordResponse = await fetchImpl(
      `${base}/api/agent-team/approvals/${encodeURIComponent(approval.id)}/execution-evidence`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: input.cookieHeader,
          "X-Metered-Key": input.meteredKey,
        },
        body: JSON.stringify({ parameters: approval.parameters, status: executionStatus, evidence }),
        cache: "no-store",
      },
    )
    if (!recordResponse.ok) return { status: "partial", code: "EVIDENCE_PERSIST_FAILED", evidence }
    return { status: completed ? "completed" : executionStatus === "failed" ? "failed" : "partial", evidence }
  } catch {
    return { status: "failed", code: "TOOL_EXECUTION_FAILED" }
  }
}

