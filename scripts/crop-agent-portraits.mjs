import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const [source, destination] = process.argv.slice(2)
if (!source || !destination) {
  throw new Error("usage: node scripts/crop-agent-portraits.mjs <contact-sheet.png> <output-dir>")
}

const names = [
  "chief-coordinator",
  "strategy-management",
  "legal-compliance",
  "finance-control",
  "people-operations",
  "product-management",
  "technology-data",
  "brand-marketing",
  "sales-business",
  "public-affairs",
  "operations-service",
  "content-strategy",
  "video-production",
  "geo-growth",
  "channel-distribution",
]

const image = sharp(source)
const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true })

function nonWhiteAt(x, y) {
  const offset = (y * info.width + x) * info.channels
  return data[offset] < 238 || data[offset + 1] < 238 || data[offset + 2] < 238
}

function intervals(length, occupancy) {
  const output = []
  let start = -1
  for (let index = 0; index < length; index += 1) {
    if (occupancy(index) > 0.45 && start < 0) start = index
    if ((occupancy(index) <= 0.45 || index === length - 1) && start >= 0) {
      const end = occupancy(index) <= 0.45 ? index : index + 1
      if (end - start > 100) output.push({ start, end })
      start = -1
    }
  }
  return output
}

const columns = intervals(info.width, (x) => {
  let count = 0
  for (let y = 0; y < info.height; y += 3) if (nonWhiteAt(x, y)) count += 1
  return count / Math.ceil(info.height / 3)
})
const rows = intervals(info.height, (y) => {
  let count = 0
  for (let x = 0; x < info.width; x += 3) if (nonWhiteAt(x, y)) count += 1
  return count / Math.ceil(info.width / 3)
})

if (columns.length !== 5 || rows.length !== 3) {
  throw new Error(`contact sheet grid detection failed: ${columns.length} columns, ${rows.length} rows`)
}

await fs.mkdir(destination, { recursive: true })
for (let row = 0; row < rows.length; row += 1) {
  for (let column = 0; column < columns.length; column += 1) {
    const index = row * columns.length + column
    const cellWidth = columns[column].end - columns[column].start
    const cellHeight = rows[row].end - rows[row].start
    const size = Math.min(cellWidth, cellHeight)
    const left = columns[column].start + Math.floor((cellWidth - size) / 2)
    const top = rows[row].start + Math.floor((cellHeight - size) / 2)
    await sharp(source)
      .extract({ left, top, width: size, height: size })
      .resize(512, 512, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(destination, `${names[index]}.png`))
  }
}

console.log(JSON.stringify({ source, destination, columns, rows, count: names.length }))
