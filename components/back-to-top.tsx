"use client"

import * as React from "react"
import { ArrowUp } from "lucide-react"

export function BackToTop() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 240)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <button
      type="button"
      aria-label="回到顶部"
      onClick={handleClick}
      className={`fixed bottom-6 right-6 z-30 flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card/90 text-foreground backdrop-blur-md soft-shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  )
}
