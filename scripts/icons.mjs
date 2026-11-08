// Tạo icon PNG đơn giản (nền hồng, nốt nhạc trắng) không cần thư viện.
import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }

function png(S) {
  const raw = Buffer.alloc(S * (S * 3 + 1))
  const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
  for (let y = 0; y < S; y++) {
    raw[y * (S * 3 + 1)] = 0
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S
      const white = inE(u, v, 0.38, 0.70, 0.13, 0.10) || inE(u, v, 0.66, 0.62, 0.13, 0.10)
        || (u > 0.47 && u < 0.51 && v > 0.25 && v < 0.70) || (u > 0.75 && u < 0.79 && v > 0.17 && v < 0.62)
        || (u > 0.47 && u < 0.79 && v > 0.17 + (u - 0.47) * -0.25 && v < 0.27 + (u - 0.47) * -0.25)
      const o = y * (S * 3 + 1) + 1 + x * 3
      if (white) raw.fill(255, o, o + 3)
      else { raw[o] = 255; raw[o + 1] = 111; raw[o + 2] = 163 }
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(S, 0); ih.writeUInt32BE(S, 4); ih[8] = 8; ih[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s))
