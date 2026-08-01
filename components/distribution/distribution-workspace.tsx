"use client"

import * as React from "react"

import { ShareDistribute } from "@/components/share-distribute"
import { GeoArticleDistribute } from "@/components/distribution/geo-article-distribute"
import { PlatformAccountRail } from "@/components/distribution/platform-account-rail"
import { DISTRIBUTION_VIEWS, type DistributionView } from "@/lib/distribution/workspace"
import type { MainView } from "@/components/dashboard-sidebar"

export function DistributionWorkspace({ activeView, onNavigate }: {
  activeView: DistributionView
  onNavigate: (view: MainView) => void
}) {
  const [openBindingRequest, setOpenBindingRequest] = React.useState(0)

  if (activeView === DISTRIBUTION_VIEWS.GEO_ARTICLE) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fafaf8] lg:flex-row dark:bg-slate-950">
        <PlatformAccountRail capability="geo_article" openRequest={openBindingRequest} />
        <div className="min-h-0 min-w-0 flex-1">
          <GeoArticleDistribute onNavigate={onNavigate} onNavigateToBinding={() => setOpenBindingRequest((value) => value + 1)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fafaf8] lg:flex-row dark:bg-slate-950">
      <PlatformAccountRail capability="video" openRequest={openBindingRequest} />
      <div className="min-h-0 min-w-0 flex-1"><ShareDistribute onNavigateToBinding={() => setOpenBindingRequest((value) => value + 1)} /></div>
    </div>
  )
}
