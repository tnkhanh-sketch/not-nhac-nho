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
        <div><Player ref={pl} videoId={song.videoId} onState={p => { if (!p) stopAt.current = null }} /></div>
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
