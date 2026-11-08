import { useEffect, useRef, useState } from 'react'
import { db, getLines, patchLine, Line, Song } from '../db'
import { Player, PlayerApi } from '../Player'
import { go } from '../App'
import TranscriptPanel from './TranscriptPanel'

const r1 = (x: number) => Math.round(x * 10) / 10

export default function Review({ songId }: { songId: string }) {
  const [song, setSong] = useState<Song>()
  const [lines, setLines] = useState<Line[]>([])
  const [playingIdx, setPlayingIdx] = useState(-1)
  const pl = useRef<PlayerApi>(null)
  const stopAt = useRef<number | null>(null)

  useEffect(() => { db.songs.get(songId).then(setSong); getLines(songId).then(setLines) }, [songId])

  useEffect(() => {
    const id = setInterval(() => {
      if (stopAt.current != null && pl.current && pl.current.time() >= stopAt.current) {
        pl.current.pause(); stopAt.current = null; setPlayingIdx(-1)
      }
    }, 50)
    return () => clearInterval(id)
  }, [])

  const playLine = (i: number) => {
    const l = lines[i]
    if (l.start == null || l.end == null || !pl.current) return
    pl.current.setRate(1); pl.current.seek(l.start); pl.current.play()
    stopAt.current = l.end; setPlayingIdx(i)
  }

  // Dời cả bài (dùng khi lời tự động có mốc theo bản thu gốc, lệch so với video)
  const [playingV, setPlayingV] = useState(false)
  const shiftAll = async (d: number) => {
    if (!lines.length) return
    d = Math.max(d, -(lines[0].start ?? 0))
    const now = Date.now()
    const next = lines.map(l => ({ ...l, start: l.start == null ? null : r1(l.start + d), end: l.end == null ? null : r1(l.end + d), updatedAt: now }))
    await db.lines.bulkPut(next)
    setLines(next)
  }

  // ---- Ghim câu: nghe tới câu nào bấm 📍 câu đó; các câu ở giữa co giãn theo, câu sau dời theo ----
  const PK = 'pins:' + songId
  const [pins, setPins] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(PK) || '[]') } catch { return [] } })
  const [msg, setMsg] = useState('')
  const savePins = (p: number[]) => { setPins(p); try { localStorage.setItem(PK, JSON.stringify(p)) } catch { /* */ } }
  const pin = async (k: number) => {
    const T = Math.max(0, (pl.current?.time() ?? 0) - 0.2)
    const old = lines[k].start; if (old == null) return
    const keep = pins.filter(p => p !== k && lines[p]?.start != null)
    const pairs = [...keep.map(p => [lines[p].start!, lines[p].start!] as [number, number]), [old, T] as [number, number]].sort((a, b) => a[0] - b[0])
    for (let i = 1; i < pairs.length; i++) if (pairs[i][1] <= pairs[i - 1][1] + 0.3 || pairs[i][0] <= pairs[i - 1][0]) {
      setMsg('⚠️ Câu ' + (k + 1) + ' không khớp thứ tự với các câu đã ghim. Bấm "Bỏ ghim" rồi ghim lại từ đầu bài.'); return
    }
    const map = (x: number) => {
      const a = pairs[0], z = pairs[pairs.length - 1]
      if (x <= a[0]) return x + (a[1] - a[0])
      if (x >= z[0]) return x + (z[1] - z[0])
      const j = pairs.findIndex((p, i) => i < pairs.length - 1 && x >= p[0] && x <= pairs[i + 1][0])
      const [o1, n1] = pairs[j], [o2, n2] = pairs[j + 1]
      return n1 + (x - o1) * (n2 - n1) / (o2 - o1)
    }
    const now = Date.now()
    const next = lines.map(l => {
      if (l.start == null || l.end == null) return l
      const st = r1(Math.max(0, map(l.start)))
      return { ...l, start: st, end: Math.max(st + 0.3, r1(map(l.end))), updatedAt: now }
    })
    await db.lines.bulkPut(next)
    setLines(next); savePins([...keep.filter(p => p !== k), k]); setMsg('📌 Đã ghim câu ' + (k + 1) + '. Nghe tiếp và ghim thêm vài câu nữa cho khớp cả bài.')
  }

  const nudge = async (i: number, k: 'start' | 'end', d: number) => {
    const l = lines[i]
    let v = r1(Math.max(0, (l[k] ?? 0) + d))
    if (k === 'start' && l.end != null) v = Math.min(v, l.end - 0.2)
    if (k === 'end' && l.start != null) v = Math.max(v, l.start + 0.2)
    await patchLine(l.id, { [k]: v })
    setLines(ls => ls.map((x, j) => j === i ? { ...x, [k]: v } : x))
  }

  if (!song) return null
  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>🔧 Rà soát: {song.title}</h2>
        <button onClick={() => go('/mark/' + songId)}>⏱ Chia lại theo video</button>
        <button className="primary" onClick={() => go('/learn/' + songId)}>Xong → Học bài</button>
      </div>
      <div className="learn">
        <div>
          <Player ref={pl} videoId={song.videoId} start={song.startAt || 0} onState={setPlayingV} />
          <div className="panel">
            <b>Cho chữ khớp với video</b>
            <p className="note">Bấm ▶ trên video. Khi ca sĩ <b>bắt đầu hát</b> câu nào thì bấm <b>📍</b> ở câu đó (bên danh sách). Ghim khoảng 4–6 câu rải khắp bài là cả bài khớp. Nếu vẫn lệch nhiều, dùng "⏱ Chia lại theo video".</p>
            <button className="primary big" disabled={!playingV} onClick={() => pin(0)}>📍 Câu 1 bắt đầu ở đây</button>
            {msg && <p className="note" style={{ fontWeight: 600 }}>{msg}</p>}
            {pins.length > 0 && <button onClick={() => { savePins([]); setMsg('Đã bỏ các ghim.') }}>Bỏ ghim ({pins.length})</button>}
            <p className="note" style={{ marginTop: 10 }}>Dời cả bài:</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={() => shiftAll(-2)}>−2s</button><button onClick={() => shiftAll(-0.5)}>−0,5s</button>
              <button onClick={() => shiftAll(0.5)}>+0,5s</button><button onClick={() => shiftAll(2)}>+2s</button>
            </div>
          </div>
        </div>
        <div className="side">
          <TranscriptPanel lyrics={lines.map(l => l.text)} onApply={async ts => {
            const now = Date.now()
            const next = lines.map((l, i) => ({ ...l, start: ts[i]?.start ?? l.start, end: ts[i]?.end ?? l.end, updatedAt: now }))
            await db.lines.bulkPut(next); setLines(next); savePins([])
          }} />
          {lines.map((l, i) => (
            <div className="rev" key={l.id} style={playingIdx === i ? { outline: '3px solid var(--pink)' } : undefined}>
              <div className="t">{i + 1}. {l.text} {pins.includes(i) && '📌'}</div>
              <div className="row">
                <button className={pins.includes(i) ? 'on' : ''} disabled={!playingV || playingIdx >= 0} onClick={() => pin(i)} title="Ca sĩ bắt đầu hát câu này ngay lúc này">📍</button>
                <button className="primary" onClick={() => playLine(i)}>▶</button>
                <span className="note">Đầu</span>
                <button onClick={() => nudge(i, 'start', -0.1)}>−0,1</button>
                <span className="mono">{l.start?.toFixed(1)}</span>
                <button onClick={() => nudge(i, 'start', 0.1)}>+0,1</button>
                <span className="note">Cuối</span>
                <button onClick={() => nudge(i, 'end', -0.1)}>−0,1</button>
                <span className="mono">{l.end?.toFixed(1)}</span>
                <button onClick={() => nudge(i, 'end', 0.1)}>+0,1</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
