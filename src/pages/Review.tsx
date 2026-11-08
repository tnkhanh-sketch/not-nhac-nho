import { useEffect, useRef, useState } from 'react'
import { db, getLines, patchLine, Line, Song } from '../db'
import { Player, PlayerApi } from '../Player'
import { go } from '../App'

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
  const alignFirst = () => { const t = pl.current?.time() ?? 0; if (lines[0]?.start != null) shiftAll(Math.max(0, t - 0.2) - lines[0].start) }

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
        <button className="primary" onClick={() => go('/learn/' + songId)}>Xong → Học bài</button>
      </div>
      <div className="learn">
        <div>
          <Player ref={pl} videoId={song.videoId} start={song.startAt || 0} onState={setPlayingV} />
          <div className="panel">
            <b>Dời cả bài cho khớp video</b>
            <p className="note">Bấm ▶ trên video, đúng lúc ca sĩ hát câu 1 thì bấm nút hồng. Hoặc dời từng chút bằng các nút bên dưới.</p>
            <button className="primary big" disabled={!playingV} onClick={alignFirst}>🎯 Câu 1 bắt đầu ở đây</button>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={() => shiftAll(-2)}>−2s</button><button onClick={() => shiftAll(-0.5)}>−0,5s</button>
              <button onClick={() => shiftAll(0.5)}>+0,5s</button><button onClick={() => shiftAll(2)}>+2s</button>
            </div>
          </div>
        </div>
        <div className="side">
          {lines.map((l, i) => (
            <div className="rev" key={l.id} style={playingIdx === i ? { outline: '3px solid var(--pink)' } : undefined}>
              <div className="t">{i + 1}. {l.text}</div>
              <div className="row">
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
