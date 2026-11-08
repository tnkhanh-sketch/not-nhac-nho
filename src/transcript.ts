// Bản chép lời có thời gian (dán từ YouTube "Hiện bản chép lời", hoặc file .srt/.vtt)
// → đặt mốc bắt đầu/kết thúc cho từng câu hát.
import { noAccent } from './lyrics'

export interface Seg { start: number; text: string }
export interface Timed { text: string; start: number; end: number }

const toSec = (h: string | undefined, m: string, s: string, ms?: string) =>
  (+(h || 0)) * 3600 + +m * 60 + +s + (ms ? +('0.' + ms) : 0)

/** Đọc các kiểu: "0:33\nlời", "0:33 lời", "[00:33.20] lời", SRT/VTT "00:00:33,200 --> 00:00:36,000" */
export function parseTranscript(raw: string): Seg[] {
  const lines = raw.replace(/\r/g, '').split('\n').map(s => s.trim())
  const segs: Seg[] = []
  let pending: number | null = null
  const push = (t: number, text: string) => {
    text = text.replace(/<[^>]+>/g, '').replace(/\[(âm nhạc|nhạc|music|vỗ tay|applause)\]/gi, '').replace(/♪/g, '').trim()
    if (text) segs.push({ start: t, text })
  }
  for (const l of lines) {
    if (!l || /^\d+$/.test(l) || /^WEBVTT/i.test(l)) continue
    let m = l.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d+))?\s*-->/) // SRT/VTT
    if (m) { pending = toSec(m[1], m[2], m[3], m[4]); continue }
    m = l.match(/^\[?(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d+))?\]?\s*(.*)$/) // 0:33 lời / [00:33.20] lời / 0:33
    if (m) {
      const t = toSec(m[1], m[2], m[3], m[4])
      if (m[5]) { push(t, m[5]); pending = null } else pending = t
      continue
    }
    if (/^\d+\s*(giây|phút|seconds?|minutes?)/i.test(l)) continue // nhãn đọc màn hình của YouTube
    if (pending != null) { push(pending, l); pending = null }
    else if (segs.length) segs[segs.length - 1].text += ' ' + l
  }
  return segs.sort((a, b) => a.start - b.start)
}

const toks = (s: string) => noAccent(s.toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

/** Không có lời sẵn: mỗi đoạn bản chép lời là một câu */
export function segsToLines(segs: Seg[]): Timed[] {
  return segs.map((s, i) => ({ text: s.text, start: s.start, end: Math.min(segs[i + 1]?.start ?? s.start + 5, s.start + 12) }))
}

/**
 * Có lời sẵn: rải từng chữ của bản chép lời theo thời gian, so khớp chuỗi chữ với lời bài hát
 * (dò chuỗi con chung dài nhất), rồi lấy thời điểm chữ đầu/cuối khớp được của mỗi câu.
 */
export function alignLyrics(lyrics: string[], segs: Seg[]): { lines: Timed[]; matched: number } {
  // dòng thời gian từng chữ của bản chép lời
  const tw: { w: string; t: number }[] = []
  segs.forEach((s, i) => {
    const ws = toks(s.text), dur = Math.max(0.5, Math.min((segs[i + 1]?.start ?? s.start + 4) - s.start, 10))
    ws.forEach((w, j) => tw.push({ w, t: s.start + dur * j / ws.length }))
  })
  // chữ của lời bài hát, nhớ thuộc câu nào
  const lw: { w: string; line: number }[] = []
  lyrics.forEach((l, i) => toks(l).forEach(w => lw.push({ w, line: i })))
  const n = lw.length, m = tw.length
  // LCS (bảng 2 chiều gọn bằng Uint16Array)
  const W = m + 1, dp = new Uint16Array((n + 1) * W)
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i * W + j] = lw[i].w === tw[j].w ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1])
  const tOf: (number | null)[] = new Array(n).fill(null)
  for (let i = 0, j = 0; i < n && j < m;) {
    if (lw[i].w === tw[j].w) { tOf[i] = tw[j].t; i++; j++ }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++
    else j++
  }
  // mốc mỗi câu = chữ khớp đầu tiên; câu không khớp chữ nào thì nội suy giữa 2 câu bên cạnh
  const starts: (number | null)[] = lyrics.map((_, li) => {
    const k = lw.findIndex((x, i) => x.line === li && tOf[i] != null)
    if (k < 0) return null
    // lùi về chữ đầu câu theo tốc độ trung bình nếu chữ đầu chưa khớp
    const first = lw.findIndex(x => x.line === li)
    return Math.max(0, tOf[k]! - (k - first) * 0.35)
  })
  const ends: (number | null)[] = lyrics.map((_, li) => {
    let last: number | null = null
    lw.forEach((x, i) => { if (x.line === li && tOf[i] != null) last = tOf[i] })
    return last
  })
  const matched = starts.filter(x => x != null).length
  const known = starts.map((s, i) => s == null ? -1 : i).filter(i => i >= 0)
  const st = starts.map((s, i) => {
    if (s != null) return s
    const a = known.filter(k => k < i).pop(), b = known.find(k => k > i)
    if (a != null && b != null) return starts[a]! + (starts[b]! - starts[a]!) * (i - a) / (b - a)
    if (a != null) return starts[a]! + (i - a) * 4
    if (b != null) return Math.max(0, starts[b]! - (b - i) * 4)
    return i * 4
  })
  // giữ thứ tự tăng dần
  for (let i = 1; i < st.length; i++) if (st[i] <= st[i - 1]) st[i] = st[i - 1] + 0.5
  const lines = lyrics.map((text, i) => {
    const next = st[i + 1] ?? st[i] + 5
    const e = ends[i] != null ? Math.min(next, Math.max(ends[i]! + 0.8, st[i] + 1)) : next
    return { text, start: Math.round(st[i] * 10) / 10, end: Math.round(Math.max(e, st[i] + 0.8) * 10) / 10 }
  })
  return { lines, matched }
}
