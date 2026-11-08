import { useEffect, useRef, useState } from 'react'
import { db, getLines, Line, Song } from '../db'
import { Player, PlayerApi } from '../Player'
import { go } from '../App'
import { maskLine, MASK_LEVELS } from '../mask'

/** Chế độ TV: video lớn, lời karaoke chữ to, điều khiển bằng phím (Space, ←, →, B, F). */
export default function TV({ songId }: { songId: string }) {
  const [song, setSong] = useState<Song>()
  const [raw, setRaw] = useState<Line[]>([])
  const [useBeat, setUseBeat] = useState(false)
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showUi, setShowUi] = useState(true)
  const [mask, setMaskS] = useState(() => { try { return Number(localStorage.getItem('maskLevel')) || 0 } catch { return 0 } })
  const setMask = (m: number) => { setMaskS(m); try { localStorage.setItem('maskLevel', String(m)) } catch { /* */ } }
  const pl = useRef<PlayerApi>(null)
  const hideT = useRef<number>()

  useEffect(() => {
    db.songs.get(songId).then(s => { setSong(s); if (s?.beatVideoId && s.beatOffset != null) setUseBeat(false) })
    getLines(songId).then(ls => setRaw(ls.filter(l => l.start != null && l.end != null)))
  }, [songId])
  useEffect(() => { const iv = setInterval(() => setNow(pl.current?.time() ?? 0), 50); return () => clearInterval(iv) }, [])

  const beatReady = !!song?.beatVideoId && song.beatOffset != null
  const off = useBeat && beatReady ? song!.beatOffset! : 0
  const lines = raw.map(l => ({ ...l, start: l.start! + off, end: l.end! + off }))
  let cur = -1
  for (let i = 0; i < lines.length; i++) { if (lines[i].start <= now + 0.05) cur = i; else break }

  const seekLine = (i: number) => { const l = lines[Math.max(0, Math.min(lines.length - 1, i))]; if (l) { pl.current?.seek(l.start); pl.current?.play() } }
  const toggle = () => playing ? pl.current?.pause() : pl.current?.play()
  const full = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {})
  const poke = () => { setShowUi(true); clearTimeout(hideT.current); hideT.current = window.setTimeout(() => setShowUi(false), 3500) }

  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e: KeyboardEvent) => {
    poke()
    if (e.code === 'Space' || e.key === 'MediaPlayPause' || e.key === 'Enter') { e.preventDefault(); toggle() }
    else if (e.key === 'ArrowRight') seekLine(cur + 1)
    else if (e.key === 'ArrowLeft') seekLine(cur <= 0 ? 0 : (now - lines[cur].start > 1.5 ? cur : cur - 1))
    else if (e.key.toLowerCase() === 'b' && beatReady) setUseBeat(b => !b)
    else if (e.key.toLowerCase() === 'f') full()
    else if (e.key.toLowerCase() === 'h') setMask((mask + 1) % MASK_LEVELS.length)
    else if (e.key === 'Escape' && !document.fullscreenElement) go('/')
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => keys.current(e)
    addEventListener('keydown', f); poke()
    return () => removeEventListener('keydown', f)
  }, [])

  if (!song) return null
  const curL = lines[cur], nextL = lines[cur + 1] ?? (cur < 0 ? lines[0] : undefined)
  const p = curL ? Math.max(0, Math.min(1, (now - curL.start) / (curL.end - curL.start))) : 0

  return (
    <div className="tv" onMouseMove={poke} onTouchStart={poke}>
      <div className="tv-video">
        <Player key={useBeat && beatReady ? 'b' : 'o'} ref={pl} videoId={useBeat && beatReady ? song.beatVideoId! : song.videoId} onState={setPlaying} />
      </div>
      <div className="tv-lyrics">
        <div className="tv-cur"><span className="fill" style={{ ['--p' as string]: (p * 100).toFixed(1) + '%' }}>{curL ? maskLine(curL.text, mask, cur) : '🎵 ' + song.title}</span></div>
        <div className="tv-next">{nextL && nextL !== curL ? maskLine(nextL.text, mask, cur + 1) : ''}</div>
      </div>
      <div className={'tv-ui' + (showUi ? '' : ' hide')}>
        <button onClick={() => go('/')}>← Về</button>
        <button onClick={() => seekLine(cur - 1)}>⏮</button>
        <button className="primary" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
        <button onClick={() => seekLine(cur + 1)}>⏭</button>
        {beatReady && <button className={useBeat ? 'on' : ''} onClick={() => setUseBeat(!useBeat)}>{useBeat ? '🎵 Beat' : '🎤 Có lời'}</button>}
        <button onClick={() => setMask((mask + 1) % MASK_LEVELS.length)}>🙈 Ẩn chữ: {MASK_LEVELS[mask]}</button>
        <button onClick={full}>⛶ Toàn màn hình</button>
        <span className="tv-help">Phím: Space phát/dừng · ←/→ đổi câu · B beat · H ẩn chữ · F toàn màn hình</span>
      </div>
    </div>
  )
}
