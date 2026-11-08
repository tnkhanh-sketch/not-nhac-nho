import { useCallback, useEffect, useRef, useState } from 'react'
import { db, getLines, patchLine, Line, Song } from '../db'
import { Player, PlayerApi } from '../Player'
import { go } from '../App'
import { centerInParent } from '../scroll'

const REACT = 0.2

export default function Mark({ songId }: { songId: string }) {
  const [song, setSong] = useState<Song>()
  const [lines, setLines] = useState<Line[]>([])
  const [taps, setTaps] = useState<number[]>([])
  const [playing, setPlaying] = useState(false)
  const [slow, setSlow] = useState(false)
  const [react, setReact] = useState(true)
  const [canSlow, setCanSlow] = useState(false)
  const pl = useRef<PlayerApi>(null)
  const curRef = useRef<HTMLDivElement>(null)

  useEffect(() => { db.songs.get(songId).then(setSong); getLines(songId).then(setLines) }, [songId])
  useEffect(() => { centerInParent(curRef.current) }, [taps.length])

  const n = lines.length
  const done = n > 0 && taps.length > n

  const tap = useCallback(() => {
    if (!pl.current || !pl.current.playing() || taps.length > n) return
    const t = Math.max(0, pl.current.time() - (react ? REACT : 0))
    const last = taps[taps.length - 1] ?? -1
    setTaps([...taps, Math.max(t, last + 0.05)])
  }, [taps, n, react])

  const undo = () => {
    if (!taps.length) return
    const last = taps[taps.length - 1]
    setTaps(taps.slice(0, -1))
    pl.current?.seek(last - 3)
  }

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); tap() }
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [tap])

  useEffect(() => { pl.current?.setRate(slow ? 0.75 : 1) }, [slow])

  const save = async () => {
    for (let i = 0; i < n; i++) await patchLine(lines[i].id, { start: taps[i], end: taps[i + 1] })
    await db.songs.update(songId, { updatedAt: Date.now() })
    go('/review/' + songId)
  }
  useEffect(() => { if (done) { pl.current?.pause(); save() } }, [done])

  if (!song) return null
  const cur = Math.min(taps.length, n - 1)
  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>⏱ Chia câu: {song.title}</h2>
      </div>
      <div className="learn">
        <div>
          <Player ref={pl} videoId={song.videoId} cc start={song.startAt || 0} onState={setPlaying}
            onReady={() => setCanSlow(pl.current!.rates().includes(0.75))} />
          <p className="note">Bấm ▶ cho video chạy. Khi ca sĩ <b>bắt đầu hát</b> câu được tô hồng thì bấm nút to (hoặc phím cách). Nếu video có phụ đề, chữ sẽ hiện trên video để dễ canh.</p>
          <div className="controls">
            <button className="primary big" style={{ flex: '1 1 100%' }} disabled={!playing || done} onClick={tap}>
              {taps.length < n ? `▶ Bắt đầu câu này (${taps.length + 1}/${n})` : '🏁 Hết bài'}
            </button>
            <button onClick={undo} disabled={!taps.length}>↩ Hoàn tác</button>
            <button onClick={() => playing ? pl.current?.pause() : pl.current?.play()}>{playing ? '⏸' : '▶'}</button>
            {canSlow && <button className={slow ? 'on' : ''} onClick={() => setSlow(!slow)}>🐢 0.75x</button>}
            <button className={react ? 'on' : ''} onClick={() => setReact(!react)}>Trừ 0,2s phản xạ</button>
            <button onClick={() => { setTaps([]); pl.current?.seek(song.startAt || 0) }}>⟲ Làm lại từ đầu</button>
          </div>
        </div>
        <div className="side lines">
          {lines.map((l, i) => (
            <div key={l.id} ref={i === cur ? curRef : undefined}
              className={'line' + (i === cur && !done ? ' cur' : '') + (i < taps.length && i !== cur ? ' done' : '')}>
              {l.text}
              {taps[i] != null && <span className="tag note"> {taps[i].toFixed(1)}s</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
