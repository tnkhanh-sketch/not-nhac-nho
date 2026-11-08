import { db, today } from './db'

export interface Badge { icon: string; name: string; got: boolean }
export interface Stats {
  stars: number; songsDone: number; streak: number; bestStreak: number
  minutesToday: number; minutesTotal: number; secToday: number; secTotal: number; records: number
  perDay: { day: string; minutes: number }[]; badges: Badge[]
}

const prevDay = (d: string) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - 1); return today(x) }

export async function getStats(): Promise<Stats> {
  const [songs, lines, events, recs] = await Promise.all([
    db.songs.toArray(), db.lines.toArray(), db.events.toArray(), db.recordings.toArray(),
  ])
  const live = new Set(songs.filter(s => !s.deletedAt).map(s => s.id))
  const ls = lines.filter(l => !l.deletedAt && live.has(l.songId))
  const ev = events.filter(e => !e.deletedAt)
  const records = recs.filter(r => !r.deletedAt && live.has(r.songId)).length
  const stars = ls.filter(l => l.learned).length
  const songsDone = [...live].filter(id => { const x = ls.filter(l => l.songId === id); return x.length > 0 && x.every(l => l.learned) }).length

  const secByDay = new Map<string, number>()
  for (const e of ev) secByDay.set(e.day, (secByDay.get(e.day) || 0) + (e.type === 'practice' ? e.seconds : 0))
  const days = new Set(ev.map(e => e.day))
  // chuỗi hiện tại: tính từ hôm nay (hoặc hôm qua nếu hôm nay chưa tập)
  let d = days.has(today()) ? today() : prevDay(today()), streak = 0
  while (days.has(d)) { streak++; d = prevDay(d) }
  let bestStreak = 0
  for (const x of days) {
    if (days.has(prevDay(x))) continue
    let n = 0, y = x
    while (days.has(y)) { n++; const t = new Date(y + 'T12:00:00'); t.setDate(t.getDate() + 1); y = today(t) }
    bestStreak = Math.max(bestStreak, n)
  }
  const secTotal = [...secByDay.values()].reduce((a, b) => a + b, 0)
  const minutesTotal = Math.round(secTotal / 60)
  const secToday = secByDay.get(today()) || 0
  const perDay: Stats['perDay'] = []
  for (let i = 6, x = today(); i >= 0; i--) { perDay.unshift({ day: x, minutes: Math.round((secByDay.get(x) || 0) / 60) }); x = prevDay(x) }

  const badges: Badge[] = [
    { icon: '🌱', name: 'Câu đầu tiên', got: stars >= 1 },
    { icon: '⭐', name: '10 câu', got: stars >= 10 },
    { icon: '🌟', name: '50 câu', got: stars >= 50 },
    { icon: '🏆', name: 'Thuộc trọn 1 bài', got: songsDone >= 1 },
    { icon: '👑', name: 'Thuộc 5 bài', got: songsDone >= 5 },
    { icon: '🔥', name: '3 ngày liền', got: bestStreak >= 3 },
    { icon: '💪', name: '7 ngày liền', got: bestStreak >= 7 },
    { icon: '🎙️', name: 'Lần thu đầu tiên', got: records >= 1 },
    { icon: '⏱️', name: 'Tập 60 phút', got: minutesTotal >= 60 },
  ]
  return { stars, songsDone, streak, bestStreak, minutesToday: Math.round(secToday / 60), minutesTotal, secToday, secTotal, records, perDay, badges }
}

/** 45 giây · 3 phút · 1 giờ 20 phút */
export function fmtDur(sec: number) {
  if (sec < 60) return `${Math.round(sec)} giây`
  const m = Math.round(sec / 60)
  return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`
}
