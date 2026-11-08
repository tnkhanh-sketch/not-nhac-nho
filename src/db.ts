import Dexie, { Table } from 'dexie'

export interface Meta { id: string; ownerId: string; createdAt: number; updatedAt: number; deletedAt: number | null }
export interface Song extends Meta {
  videoId: string; title: string; artist: string
  /** Bản beat/karaoke (không bắt buộc); beatOffset = thời điểm trên beat - thời điểm trên bản gốc */
  beatVideoId?: string | null; beatOffset?: number | null
  /** Mốc ?t= trong link: trang Chia câu phát từ đây */
  startAt?: number
  /** Đã đăng lên Chợ bài hát lúc nào (null: chưa/đã gỡ); fromMarket: lấy từ bài nào trên chợ */
  marketAt?: number | null; fromMarket?: string
}
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

/** Nhật ký tập: practice = số giây tập, learned = thuộc 1 câu, record = 1 lần thu âm */
export interface Ev extends Meta { songId: string; lineId: string | null; type: 'practice' | 'learned' | 'record'; seconds: number; day: string }
export interface Rec extends Meta { songId: string; lineId: string; blob: Blob; mime: string; seconds: number }

/** Video biểu diễn (chỉ lưu trên máy, không đồng bộ vì nặng) */
export interface Perf extends Meta { songId: string; blob: Blob; mime: string; seconds: number; beat: boolean }

class DB extends Dexie {
  songs!: Table<Song, string>
  lines!: Table<Line, string>
  events!: Table<Ev, string>
  recordings!: Table<Rec, string>
  performances!: Table<Perf, string>
  constructor() {
    super('notnhacnho')
    this.version(1).stores({ songs: 'id, updatedAt', lines: 'id, songId, updatedAt' })
    this.version(2).stores({ events: 'id, songId, day, updatedAt', recordings: 'id, songId, lineId, updatedAt' })
    this.version(3).stores({ performances: 'id, songId, updatedAt' })
  }
}

export const today = (d = new Date()) => d.toLocaleDateString('sv') // YYYY-MM-DD theo giờ máy

export async function logEvent(e: Pick<Ev, 'songId' | 'lineId' | 'type' | 'seconds'>) {
  await db.events.put({ ...meta(), ...e, day: today() })
}
export const db = new DB()

export async function getLines(songId: string): Promise<Line[]> {
  const l = await db.lines.where('songId').equals(songId).toArray()
  return l.filter(x => !x.deletedAt).sort((a, b) => a.idx - b.idx)
}

export async function patchLine(id: string, p: Partial<Line>) {
  await db.lines.update(id, { ...p, updatedAt: Date.now() })
}
