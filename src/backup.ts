// Sao lưu / khôi phục toàn bộ dữ liệu ra 1 file JSON (trừ video biểu diễn vì quá nặng).
import { db, Rec } from './db'
import { fromB64, toB64 } from './sync'

const TABLES = ['songs', 'lines', 'events', 'recordings'] as const

export async function exportBackup(): Promise<Blob> {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    const rows = await db.table(t).toArray()
    out[t] = t === 'recordings'
      ? await Promise.all((rows as Rec[]).map(async ({ blob, ...m }) => ({ ...m, b64: await toB64(blob) })))
      : rows
  }
  return new Blob([JSON.stringify({ app: 'not-nhac-nho', version: 1, at: Date.now(), data: out })], { type: 'application/json' })
}

/** Gộp vào dữ liệu đang có: bản ghi nào mới hơn (updatedAt) thì giữ. */
export async function importBackup(file: File): Promise<number> {
  const j = JSON.parse(await file.text())
  if (j?.app !== 'not-nhac-nho' || !j.data) throw new Error('File không phải bản sao lưu Nốt Nhạc Nhỏ')
  let n = 0
  for (const t of TABLES) {
    for (const r of (j.data[t] || []) as any[]) {
      if (!r?.id || typeof r.updatedAt !== 'number') continue
      const cur = await db.table(t).get(r.id)
      if (cur && cur.updatedAt >= r.updatedAt) continue
      if (t === 'recordings') { const { b64, ...m } = r; await db.table(t).put({ ...m, blob: fromB64(b64, m.mime) }) }
      else await db.table(t).put(r)
      n++
    }
  }
  return n
}
