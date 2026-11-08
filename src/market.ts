// Chợ bài hát: đăng bài đã chia câu để người khác lấy về học.
import { db, getLines, meta, Song } from './db'
import { getFamilyCode, newFamilyCode, rpc, syncConfigured } from './sync'

export interface MarketItem { id: string; title: string; artist: string; video_id: string; line_count: number; publisher: string; downloads: number; has_beat: boolean; updated_at: string }

/** Khoá người đăng: dùng mã gia đình nếu đã nối máy, không thì một khoá riêng của máy này */
function ownerKey(): string {
  const fam = getFamilyCode(); if (fam) return fam
  try {
    let k = localStorage.getItem('publishKey')
    if (!k) { k = newFamilyCode(); localStorage.setItem('publishKey', k) }
    return k
  } catch { return newFamilyCode() }
}
export const marketReady = syncConfigured
export const getPublisher = () => { try { return localStorage.getItem('publisherName') || '' } catch { return '' } }
export const setPublisher = (n: string) => { try { localStorage.setItem('publisherName', n) } catch { /* */ } }

export async function publishSong(s: Song, publisher: string) {
  const lines = (await getLines(s.id)).filter(l => l.start != null && l.end != null).map(l => ({ text: l.text, start: l.start, end: l.end }))
  if (lines.length < 2) throw new Error('Bài cần chia câu xong trước khi đăng')
  await rpc('nnn_market_publish', { code: ownerKey(), sid: s.id, p: {
    title: s.title, artist: s.artist, videoId: s.videoId, beatVideoId: s.beatVideoId || '', beatOffset: s.beatOffset ?? null,
    startAt: s.startAt ?? null, lines, publisher,
  } })
  await db.songs.update(s.id, { marketAt: Date.now(), updatedAt: Date.now() } as Partial<Song>)
}
export async function unpublishSong(s: Song) {
  await rpc('nnn_market_unpublish', { code: ownerKey(), sid: s.id })
  await db.songs.update(s.id, { marketAt: null, updatedAt: Date.now() } as Partial<Song>)
}
export const listMarket = (q: string): Promise<MarketItem[]> => rpc('nnn_market_list', { q })

/** Gói bài để đăng chợ / gửi bạn */
export async function songPayload(s: Song) {
  const lines = (await getLines(s.id)).filter(l => l.start != null && l.end != null).map(l => ({ text: l.text, start: l.start, end: l.end }))
  return { title: s.title, artist: s.artist, videoId: s.videoId, beatVideoId: s.beatVideoId || '', beatOffset: s.beatOffset ?? null, startAt: s.startAt ?? null, lines }
}

/** Lấy bài từ chợ về máy (tạo bài mới, giữ nguyên mốc thời gian) */
export async function importFromMarket(id: string): Promise<string> {
  const d = await rpc('nnn_market_get', { sid: id })
  if (!d) throw new Error('Bài này không còn trên chợ')
  return importPayload(d, id)
}
export async function importPayload(d: any, marketId?: string): Promise<string> {
  const s: Song = { ...meta(), videoId: d.videoId, title: d.title, artist: d.artist || '', beatVideoId: d.beatVideoId || null, beatOffset: d.beatOffset ?? null, startAt: d.startAt ?? 0, ...(marketId ? { fromMarket: marketId } : {}) } as Song
  await db.transaction('rw', db.songs, db.lines, async () => {
    await db.songs.put(s)
    for (const [idx, l] of (d.lines as { text: string; start: number; end: number }[]).entries())
      await db.lines.put({ ...meta(), songId: s.id, idx, text: l.text, start: l.start, end: l.end, hard: false, learned: false })
  })
  return s.id
}
