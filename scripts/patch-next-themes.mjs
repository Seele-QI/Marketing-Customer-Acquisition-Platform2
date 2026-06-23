/**
 * next-themes 在 ThemeProvider 內用 React.createElement('script') 注入阻塞腳本，
 * React 19 會報「Encountered a script tag while rendering」。
 * 專案改由 app/layout.tsx 的 next/script beforeInteractive 注入同等邏輯（見 lib/theme-init-script.ts），
 * 此處將 dist 內的 ThemeScript 元件改為 no-op。
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const OLD_MJS =
  '_=t.memo(({forcedTheme:e,storageKey:i,attribute:s,enableSystem:u,enableColorScheme:m,defaultTheme:a,value:l,themes:h,nonce:d,scriptProps:w})=>{let p=JSON.stringify([s,i,a,e,h,l,u,m]).slice(1,-1);return t.createElement("script",{...w,suppressHydrationWarning:!0,nonce:typeof window=="undefined"?d:"",dangerouslySetInnerHTML:{__html:`(${M.toString()})(${p})`}})})'
const NEW_MJS = "_=t.memo(()=>null)"

const OLD_JS =
  'Y=t.memo(({forcedTheme:e,storageKey:s,attribute:n,enableSystem:l,enableColorScheme:o,defaultTheme:d,value:u,themes:h,nonce:m,scriptProps:w})=>{let p=JSON.stringify([n,s,d,e,h,u,l,o]).slice(1,-1);return t.createElement("script",{...w,suppressHydrationWarning:!0,nonce:typeof window=="undefined"?m:"",dangerouslySetInnerHTML:{__html:`(${I.toString()})(${p})`}})})'
const NEW_JS = "Y=t.memo(()=>null)"

function patch(rel, from, to) {
  const fp = path.join(root, rel)
  if (!fs.existsSync(fp)) {
    console.warn(`patch-next-themes: missing ${rel}`)
    return
  }
  const s = fs.readFileSync(fp, "utf8")
  if (s.includes(to) && !s.includes(from.substring(0, 50))) {
    return
  }
  if (!s.includes(from)) {
    if (s.includes(to)) return
    console.warn(`patch-next-themes: pattern not found in ${rel} (next-themes version changed?)`)
    return
  }
  fs.writeFileSync(fp, s.replace(from, to), "utf8")
  console.log(`patch-next-themes: patched ${rel}`)
}

patch("node_modules/next-themes/dist/index.mjs", OLD_MJS, NEW_MJS)
patch("node_modules/next-themes/dist/index.js", OLD_JS, NEW_JS)
