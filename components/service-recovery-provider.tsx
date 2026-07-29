"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  CUSTOMER_ERROR_MESSAGES,
  createRecoveryIncidentDeduper,
  getRecoveryIncidentKey,
  installFetchErrorGuard,
  shouldShowGlobalNetworkErrorToast,
  type FriendlyNetworkError,
} from "@/lib/api/customer-network-error"
import type { ServiceRuntimeStatus } from "@/types/electron"

type RecoveryIncident = {
  key: string
  message: string
}

const INITIAL_STATUS: ServiceRuntimeStatus = {
  state: "idle",
  updatedAt: new Date(0).toISOString(),
}

export function ServiceRecoveryProvider({ children }: { children: ReactNode }) {
  const [runtimeStatus, setRuntimeStatus] = useState<ServiceRuntimeStatus>(INITIAL_STATUS)
  const runtimeStateRef = useRef<ServiceRuntimeStatus["state"]>("idle")
  const runtimeVersionRef = useRef<string | undefined>(undefined)
  const latestAcceptedAt = useRef(0)
  const seenRecoveryIncidents = useRef(createRecoveryIncidentDeduper())
  const lastToast = useRef({ key: "", at: 0 })
  const restartRequested = useRef(false)
  const [recoveryIncident, setRecoveryIncident] = useState<RecoveryIncident | null>(null)
  const [restarting, setRestarting] = useState(false)
  const electronAPI = typeof window !== "undefined" ? window.electronAPI : undefined

  const showRecoveryOnce = useCallback((incident: RecoveryIncident) => {
    if (!seenRecoveryIncidents.current.markIfNew(incident.key)) return
    setRecoveryIncident(incident)
  }, [])

  const showToastOnce = useCallback((key: string, message: string) => {
    const now = Date.now()
    if (lastToast.current.key === key && now - lastToast.current.at < 5_000) return
    lastToast.current = { key, at: now }
    toast.error(message)
  }, [])

  useEffect(() => {
    if (runtimeStatus.state === "failed") {
      const key = getRecoveryIncidentKey(
        "update_failed",
        runtimeStatus.configVersion ?? runtimeStatus.updatedAt,
      )!
      showRecoveryOnce({ key, message: CUSTOMER_ERROR_MESSAGES.updateFailed })
    }
    if (runtimeStatus.state === "ready") {
      setRecoveryIncident(null)
      seenRecoveryIncidents.current.clear("recovery:local_service")
    }
  }, [runtimeStatus, showRecoveryOnce])

  useEffect(() => {
    if (!electronAPI) return
    let disposed = false
    let eventSeen = false
    const acceptStatus = (status: ServiceRuntimeStatus) => {
      if (disposed || !status || typeof status.state !== "string") return
      const incomingTime = Date.parse(status.updatedAt)
      if (!Number.isNaN(incomingTime) && incomingTime < latestAcceptedAt.current) return
      if (!Number.isNaN(incomingTime)) latestAcceptedAt.current = incomingTime
      runtimeStateRef.current = status.state
      runtimeVersionRef.current = status.configVersion ?? status.updatedAt
      setRuntimeStatus(status)
    }
    const unsubscribe = electronAPI.onServiceRuntimeStatus((status) => {
      eventSeen = true
      acceptStatus(status)
    })
    void electronAPI.getServiceRuntimeStatus().then((status) => {
      if (!eventSeen) acceptStatus(status)
    }).catch(() => undefined)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [electronAPI])

  useLayoutEffect(() => {
    return installFetchErrorGuard({
      target: window,
      origin: window.location.origin,
      isDesktop: Boolean(electronAPI),
      localServiceOrigins: electronAPI ? [electronAPI.localFastapiBase] : undefined,
      getRuntimeState: () => runtimeStateRef.current,
      report: electronAPI
        ? (payload) => electronAPI.reportClientError(payload)
        : undefined,
      onFriendlyError: (error: FriendlyNetworkError) => {
        const toastKey = error.category
        if (shouldShowGlobalNetworkErrorToast(error)) showToastOnce(toastKey, error.message)
        if (error.category === "update_failed" || error.category === "local_service") {
          const key = getRecoveryIncidentKey(error.category, runtimeVersionRef.current)
          if (key) showRecoveryOnce({ key, message: error.message })
        }
      },
      onLocalRecovery: () => {
        seenRecoveryIncidents.current.clear("recovery:local_service")
        setRecoveryIncident((current) => (
          current?.key === "recovery:local_service" ? null : current
        ))
      },
    })
  }, [electronAPI, showRecoveryOnce, showToastOnce])

  const restartApp = useCallback(() => {
    if (!electronAPI || restartRequested.current) return
    restartRequested.current = true
    setRestarting(true)
    void electronAPI.restartApp().catch(() => {
      restartRequested.current = false
      setRestarting(false)
      setRecoveryIncident((current) => current ?? {
        key: "restart-failed",
        message: CUSTOMER_ERROR_MESSAGES.updateFailed,
      })
      toast.error(CUSTOMER_ERROR_MESSAGES.generic)
    })
  }, [electronAPI])

  return (
    <>
      {runtimeStatus.state === "updating" ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4"
        >
          <div className="flex max-w-2xl items-center gap-2 rounded-lg border bg-background/95 px-4 py-2 text-sm text-foreground shadow-sm backdrop-blur">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            <span>{CUSTOMER_ERROR_MESSAGES.updating}</span>
          </div>
        </div>
      ) : null}

      {children}

      <AlertDialog
        open={recoveryIncident !== null}
        onOpenChange={(open) => {
          if (!open && !restarting) setRecoveryIncident(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>客户端服务需要恢复</AlertDialogTitle>
            <AlertDialogDescription>
              {electronAPI
                ? recoveryIncident?.message
                : "客户端服务暂时无法连接，请稍后重试；若持续失败，请刷新页面。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restarting}>
              {electronAPI ? "暂不重启" : "稍后重试"}
            </AlertDialogCancel>
            {electronAPI ? (
              <AlertDialogAction disabled={restarting} onClick={restartApp}>
                {restarting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                一键重启程序
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
