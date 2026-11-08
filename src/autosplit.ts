// ⚡ Chia tự động: tìm mốc giờ có sẵn (LRCLIB) rồi khớp với lời bài đang có, đặt mốc cho cả bài.
import { db, getLines, Song } from './db'
import { findLyrics, parseLrc } from './lyrics'
import { alignLyrics } from './transcript'

export interface AutoResult { matched: number; total: number; source: string }

export async function autoSplit(song: Song): Promise<AutoResult> {
  const lines = await getLines(song.id)
  if (lines.length < 2) throw new Error('Bài chưa có lời. Thêm lời (🔎 Tìm lời tự động) trước nhé.')
  const hits = (await findLyrics(song.title, song.artist)).filter(h => h.synced)
  if (!hits.length) throw new Error('Không tìm thấy mốc giờ có sẵn cho bài này. Dùng 📋 bản chép lời YouTube hoặc ⏱ bấm theo nhạc nhé.')
  let best: (ReturnType<typeof alignLyrics> & { source: string }) | null = null
  for (const h of hits.slice(0, 6)) {
    const segs = parseLrc(h.synced!).map(x => ({ start: x.start, text: x.text }))
    if (segs.length < 3) continue
    const r = alignLyrics(lines.map(l => l.text), segs)
    if (!best || r.matched > best.matched) best = { ...r, source: `${h.track} – ${h.artist}` }
  }
  if (!best || best.matched < Math.max(2, lines.length * 0.4))
    throw new Error('Mốc giờ tìm được không khớp với lời bài này. Dùng 📋 bản chép lời YouTube hoặc ⏱ bấm theo nhạc nhé.')
  const now = Date.now()
  await db.lines.bulkPut(lines.map((l, i) => ({ ...l, start: best!.lines[i].start, end: best!.lines[i].end, updatedAt: now })))
  await db.songs.update(song.id, { updatedAt: now })
  try { localStorage.removeItem('pins:' + song.id); localStorage.setItem('autoNote:' + song.id, best.source) } catch { /* */ }
  return { matched: best.matched, total: lines.length, source: best.source }
}
