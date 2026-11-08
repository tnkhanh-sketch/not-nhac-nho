import { useEffect, useRef, useState } from 'react'
import { db, getLines, patchLine, Line, Song } from '../db'
import { Player, PlayerApi } from '../Player'
import { go } from '../App'
import { centerInParent } from '../scroll'

interface Seg { start: number; end: number; reps: () => number; onDone: () => void }
const GAP = 1500
const REPEATS = [1, 2, 3, 5, Infinity]
const STEPS = [
  { title: 'Bước 1: Nghe', sub: 'Con nghe thật kỹ nhé', rate: 1, reps: 2 },
  { title: 'Bước 2: Hát theo chậm', sub: 'Hát nhỏ theo, tốc độ chậm', rate: 0.75, reps: 2 },
  { title: 'Bước 3: Hát đúng tốc độ', sub: 'Hát theo cùng ca sĩ', rate: 1, reps: 3 },
  { title: 'Bước 4: Ghép câu', sub: 'Hát câu trước + câu này', rate: 1, reps: 2 },
]

export default function Learn({ songId, teach = false }: { songId: string; teach?: boolean }) {
  const [song, setSong] = useState<Song>()
  const [lines, setLines] = useState<Line[]>([])
  const [idx, setIdx] = useState(0)
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rates, setRates] = useState<number[]>([1])
  const [rate, setRate] = useState(1)
  const [repeat, setRepeat] = useState(1)
  const [rep, setRep] = useState(0)
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'run' | 'choose' | 'end'>('idle')

  const pl = useRef<PlayerApi>(null)
  const seg = useRef<Seg | null>(null)
  const repN = useRef(0)
  const timer = useRef<number>()
  const waiting = useRef(false)
  const L = useRef<Line[]>([]); L.current = lines
  const repeatRef = useRef(repeat); repeatRef.current = repeat
  const rateRef = useRef(rate); rateRef.current = rate
  const ratesRef = useRef(rates); ratesRef.current = rates
  const curRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    db.songs.get(songId).then(setSong)
    getLines(songId).then(ls => {
      const t = ls.filter(l => l.start != null && l.end != null)
      setLines(t)
      if (teach) { const f = t.findIndex(l => !l.learned); setIdx(f < 0 ? 0 : f) }
    })
  }, [songId])
  useEffect(() => { centerInParent(curRef.current) }, [idx])

  const clearWait = () => { clearTimeout(timer.current); waiting.current = false }
  const wait = (fn: () => void) => { clearWait(); waiting.current = true; timer.current = window.setTimeout(() => { waiting.current = false; fn() }, GAP) }
  const runSeg = (s: Seg, r: number, seek = true) => {
    clearWait(); seg.current = s; repN.current = 0; setRep(0)
    const p = pl.current!; p.setRate(r)
    if (seek) p.seek(s.start)
    p.play()
  }

  // Vòng đọc thời gian ~50ms
  useEffect(() => {
    const id = setInterval(() => {
      const p = pl.current; if (!p) return
      const t = p.time(); setNow(t)
      const s = seg.current
      if (!s || waiting.current || !p.playing() || t < s.end) return
      repN.current++; setRep(repN.current)
      if (repN.current < s.reps()) { p.pause(); wait(() => { p.seek(s.start); p.play() }) }
      else { seg.current = null; s.onDone() }
    }, 50)
    return () => { clearInterval(id); clearWait() }
  }, [])

  const pickRate = (r: number) => ratesRef.current.includes(r) ? r : 1

  // ---- Chế độ học thường ----
  const startLine = (i: number, seek = true) => {
    const l = L.current[i]; if (!l) return
    setIdx(i)
    runSeg({
      start: l.start!, end: l.end!, reps: () => repeatRef.current,
      onDone: () => {
        if (i + 1 >= L.current.length) { pl.current?.pause(); return }
        if (repeatRef.current > 1) { pl.current?.pause(); wait(() => startLine(i + 1)) }
        else startLine(i + 1, false) // phát liền mạch
      },
    }, rateRef.current, seek)
  }

  // ---- Chế độ cô giáo ----
  const runStep = (i: number, s: number) => {
    const ls = L.current
    if (s === 3 && i === 0) { setPhase('choose'); return }
    const st = STEPS[s]
    setIdx(i); setStep(s); setPhase('run')
    runSeg({
      start: s === 3 ? ls[i - 1].start! : ls[i].start!, end: ls[i].end!, reps: () => st.reps,
      onDone: () => {
        pl.current?.pause()
        wait(() => (s < 3 && !(s === 2 && i === 0)) ? runStep(i, s + 1) : setPhase('choose'))
      },
    }, pickRate(st.rate))
  }
  const learned = async (ok: boolean) => {
    if (!ok) return runStep(idx, 2)
    await patchLine(lines[idx].id, { learned: true })
    setLines(ls => ls.map((x, j) => j === idx ? { ...x, learned: true } : x))
    if (idx + 1 < lines.length) runStep(idx + 1, 0); else setPhase('end')
  }

  const jump = (i: number) => {
    if (i < 0 || i >= lines.length) return
    if (teach) runStep(i, 0); else startLine(i)
  }
  const toggle = () => {
    const p = pl.current!
    if (playing) { if (waiting.current && seg.current) p.seek(seg.current.start); clearWait(); p.pause(); return }
    if (seg.current) p.play()
    else if (teach) runStep(idx, phase === 'choose' ? 2 : step)
    else startLine(idx)
  }
  const changeRate = (r: number) => { setRate(r); rateRef.current = r; pl.current?.setRate(r) }
  const toggleHard = async () => {
    const l = lines[idx]; await patchLine(l.id, { hard: !l.hard })
    setLines(ls => ls.map((x, j) => j === idx ? { ...x, hard: !l.hard } : x))
  }

  if (!song) return null
  if (!lines.length) return (
    <div className="wrap"><div className="bar"><button onClick={() => go('/')}>← Về</button><h2>{song.title}</h2></div>
      <p>Bài này chưa chia câu.</p><button className="primary big" onClick={() => go('/mark/' + songId)}>⏱ Chia câu</button></div>
  )

  const cur = lines[idx]
  const showRates = [0.5, 0.75, 1].filter(r => rates.includes(r))
  const st = STEPS[step]
  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>{teach ? '👩‍🏫 ' : '🎤 '}{song.title}</h2>
        <button onClick={() => go(teach ? '/learn/' + songId : '/teach/' + songId)}>{teach ? '🎤 Học tự do' : '👩‍🏫 Cô giáo'}</button>
      </div>
      <div className="learn">
        <div>
          <Player ref={pl} videoId={song.videoId} onState={setPlaying} onReady={() => setRates(pl.current!.rates())} />
          {teach && <div className="prompt">
            {phase === 'idle' && <>Câu {idx + 1}: sẵn sàng chưa?<small>Bấm "Bắt đầu" để cô giáo dạy nhé</small></>}
            {phase === 'run' && <>{st.title}<small>{st.sub} — lần {Math.min(rep + 1, st.reps)}/{st.reps}</small></>}
            {phase === 'choose' && <>Con thấy câu này thế nào?</>}
            {phase === 'end' && <>🎉 Con đã học hết bài rồi!</>}
          </div>}
          {teach && phase === 'idle' && <div className="controls"><button className="primary big" onClick={() => runStep(idx, 0)}>▶ Bắt đầu</button></div>}
          {teach && phase === 'choose' && <div className="controls">
            <button className="primary big" onClick={() => learned(true)}>😊 Thuộc rồi</button>
            <button className="big" onClick={() => learned(false)}>😐 Cần tập thêm</button>
          </div>}
          <div className="controls">
            <button onClick={() => jump(idx - 1)} disabled={idx === 0}>⏮</button>
            <button className="primary" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
            <button onClick={() => jump(idx + 1)} disabled={idx >= lines.length - 1}>⏭</button>
            <button className={cur.hard ? 'on' : ''} onClick={toggleHard}>🔥 Câu khó</button>
          </div>
          {!teach && <>
            <div className="controls">
              <span>🔁</span>
              {REPEATS.map(r => <button key={r} className={repeat === r ? 'on' : ''} onClick={() => setRepeat(r)}>{r === Infinity ? '∞' : r}</button>)}
            </div>
            {showRates.length > 1 && <div className="controls">
              <span>🐢</span>
              {showRates.map(r => <button key={r} className={rate === r ? 'on' : ''} onClick={() => changeRate(r)}>{r}x</button>)}
            </div>}
          </>}
        </div>
        <div className="side lines">
          {lines.map((l, i) => {
            const p = i === idx ? Math.max(0, Math.min(1, (now - l.start!) / (l.end! - l.start!))) : 0
            return (
              <div key={l.id} ref={i === idx ? curRef : undefined} className={'line' + (i === idx ? ' cur' : '')} onClick={() => jump(i)}>
                <span className={i === idx ? 'fill' : ''} style={{ ['--p' as string]: (p * 100).toFixed(1) + '%' }}>{l.text}</span>
                {l.hard && <span className="tag">🔥</span>}
                {l.learned && <span className="tag">✅</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
