// Tìm lời bài hát tự động qua LRCLIB (miễn phí, mở; nhiều bài có cả mốc thời gian từng câu).

export interface LyricHit {
  id: number; track: string; artist: string; duration: number
  plain: string; synced: string | null
}
export interface TimedLine { text: string; start: number; end: number }

/** Bỏ dấu tiếng Việt: LRCLIB tìm chữ không dấu tốt hơn */
export const noAccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')

/** Lấy tên bài từ tiêu đề video: bỏ phần sau "|", trong ngoặc, các chữ Official/MV/Lyrics... */
export function guessTrack(title: string): { track: string; artist: string } {
  let t = title.split(/[|｜]/)[0]
  t = t.replace(/[([【][^)\]】]*[)\]】]/g, ' ')
  t = t.replace(/\b(official|music video|mv|lyrics?|lyric video|audio|karaoke|beat|cover|live|4k|hd|ost)\b/gi, ' ')
  const parts = t.split(/\s[-–—]\s/).map(x => x.trim()).filter(Boolean)
  return { track: (parts[0] || t).replace(/\s+/g, ' ').trim(), artist: (parts[1] || '').trim() }
}

async function search(q: string): Promise<LyricHit[]> {
  const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q))
  if (!r.ok) return []
  const a: any[] = await r.json()
  return a.filter(x => x.plainLyrics || x.syncedLyrics).map(x => ({
    id: x.id, track: x.trackName, artist: x.artistName, duration: Math.round(x.duration || 0),
    plain: x.plainLyrics || '', synced: x.syncedLyrics || null,
  }))
}

/** Thử vài cách tìm (có tên ca sĩ, chỉ tên bài, có/không dấu), gộp kết quả, bài có mốc giờ lên trước */
export async function findLyrics(title: string, artist: string): Promise<LyricHit[]> {
  const g = guessTrack(title)
  const qs = [
    g.track + ' ' + (g.artist || artist), g.track, title.split(/[|｜]/)[0],
  ].map(q => noAccent(q).replace(/\s+/g, ' ').trim()).filter((q, i, a) => q && a.indexOf(q) === i)
  const seen = new Set<number>(), out: LyricHit[] = []
  for (const q of qs) {
    for (const h of await search(q)) if (!seen.has(h.id)) { seen.add(h.id); out.push(h) }
    if (out.length >= 6) break
  }
  return out.sort((a, b) => Number(!!b.synced) - Number(!!a.synced)).slice(0, 10)
}

/** "[01:23.45] lời" → các câu có mốc; câu trống (đoạn nhạc) chỉ dùng làm điểm kết thúc câu trước */
export function parseLrc(lrc: string): TimedLine[] {
  const pts: { t: number; text: string }[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!tags.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of tags) pts.push({ t: +m[1] * 60 + +m[2], text })
  }
  pts.sort((a, b) => a.t - b.t)
  const out: TimedLine[] = []
  pts.forEach((p, i) => {
    if (!p.text) return
    const next = pts[i + 1]?.t ?? p.t + 5
    out.push({ text: p.text, start: Math.max(0, p.t - 0.1), end: Math.min(next, p.t + 12) })
  })
  return out
}

export const plainLines = (plain: string) => plain.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
