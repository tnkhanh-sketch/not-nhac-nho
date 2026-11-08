import Dexie, { Table } from 'dexie'

export interface Meta { id: string; ownerId: string; createdAt: number; updatedAt: number; deletedAt: number | null }
export interface Song extends Meta { videoId: string; title: string; artist: string }
export interface Line extends Meta {
  songId: string; idx: number; text: string
  start: number | null; end: number | null; hard: boolean; learned: boolean
}

export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function ownerId(): string {
  try {
    let o = localStorage.getItem('ownerId')
    if (!o) { o = uuid(); localStorage.setItem('ownerId', o) }
    return o
  } catch { return 'local' }
}

export function meta(): Meta {
  const now = Date.now()
  return { id: uuid(), ownerId: ownerId(), createdAt: now, updatedAt: now, deletedAt: null }
}

class DB extends Dexie {
  songs!: Table<Song, string>
  lines!: Table<Line, string>
  constructor() {
    super('notnhacnho')
    this.version(1).stores({ songs: 'id, updatedAt', lines: 'id, songId, updatedAt' })
  }
}
export const db = new DB()

export async function getLines(songId: string): Promise<Line[]> {
  const l = await db.lines.where('songId').equals(songId).toArray()
  return l.filter(x => !x.deletedAt).sort((a, b) => a.idx - b.idx)
}

export async function patchLine(id: string, p: Partial<Line>) {
  await db.lines.update(id, { ...p, updatedAt: Date.now() })
}
