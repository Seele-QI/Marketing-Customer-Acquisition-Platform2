(() => {
  const progress = document.querySelector(".progress")
  const links = [...document.querySelectorAll(".toc a[href^='#']")]
  const sections = links
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean)

  function onScroll() {
    const scrollTop = window.scrollY
    const docH = document.documentElement.scrollHeight - window.innerHeight
    if (progress && docH > 0) {
      progress.style.width = `${Math.min(100, (scrollTop / docH) * 100)}%`
    }

    let current = sections[0]
    for (const sec of sections) {
      if (sec.offsetTop - 120 <= scrollTop) current = sec
    }
    links.forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === `#${current?.id}`)
    })
  }

  window.addEventListener("scroll", onScroll, { passive: true })
  onScroll()

  const printBtn = document.getElementById("btn-export-pdf")
  if (printBtn) {
    printBtn.addEventListener("click", () => window.print())
  }

  const tocToggle = document.getElementById("btn-toc-top")
  if (tocToggle) {
    tocToggle.addEventListener("click", () => {
      document.getElementById("toc-root")?.scrollIntoView({ behavior: "smooth" })
    })
  }
})()
