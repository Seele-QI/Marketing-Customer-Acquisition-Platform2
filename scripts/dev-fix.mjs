/**
 * Workaround: patch fs.renameSync to use copy+unlink when EXDEV occurs.
 * This fixes Next.js on Windows builds where AppData/Roaming is on a
 * different filesystem mount.
 */
import fs from "node:fs"

const origRenameSync = fs.renameSync
fs.renameSync = (src, dest) => {
  try {
    origRenameSync(src, dest)
  } catch (e) {
    if (e.code === "EXDEV") {
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
    } else {
      throw e
    }
  }
}

const origRename = fs.rename
fs.rename = (src, dest, cb) => {
  origRename(src, dest, (e) => {
    if (e && e.code === "EXDEV") {
      fs.copyFile(src, dest, (err) => {
        if (err) return cb(err)
        fs.unlink(src, cb)
      })
    } else {
      cb(e)
    }
  })
}
