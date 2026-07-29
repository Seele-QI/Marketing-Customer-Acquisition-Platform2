"use client"

import { AccountBinding } from "@/components/distribution/account-binding"
import type { DistributionCapability } from "@/lib/distribution/platforms"

export function PlatformAccountRail({ capability, openRequest }: { capability: DistributionCapability; openRequest?: number }) {
  return <AccountBinding variant="rail" capability={capability} openRequest={openRequest} />
}
