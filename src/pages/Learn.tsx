import { useEffect, useMemo, useRef, useState } from 'react'
import { db, getLines, patchLine, logEvent, meta, Line, Song } from '../db'
import { canRecord, getMic, releaseMic, startRec, Recording } from '../recorder'
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
  const [raw, setLines] = useState<Line[]>([])
  // Bản beat: dời mốc thời gian các câu theo beatOffset
  const [beatMode, setBeatMode] = useState(false)
  const off = beatMode ? (song?.beatOffset ?? 0) : 0
  const lines = useMemo(() => off ? raw.map(l => ({ ...l, start: l.start! + off, end: l.end! + off })) : raw, [raw, off])
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
  const armed = useRef(false)
  const seekAt = useRef(0) // lúc tua gần nhất (trạng thái 'hết video' cũ còn sót vài nhịp)
  const L = useRef<Line[]>([]); L.current = lines
  const repeatRef = useRef(repeat); repeatRef.current = repeat
  const rateRef = useRef(rate); rateRef.current = rate
  const ratesRef = useRef(rates); ratesRef.current = rates
  const curRef = useRef<HTMLDivElement>(null)

  // ---- Lời khen bật lên ----
  const [toast, setToast] = useState<{ big: string; small?: string } | null>(null)
  const toastT = useRef<number>()
  const showToast = (big: string, small?: string) => {
    setToast({ big, small }); clearTimeout(toastT.current)
    toastT.current = window.setTimeout(() => setToast(null), 2200)
  }

  // ---- Ghi thời gian tập (chỉ tính lúc video đang phát) ----
  const practice = useRef({ sec: 0, last: 0 })
  const flush = () => {
    const s = Math.round(practice.current.sec)
    if (s >= 1) { practice.current.sec -= s; logEvent({ songId, lineId: null, type: 'practice', seconds: s }) }
  }
  useEffect(() => {
    const iv = setInterval(flush, 15000)
    const vis = () => { if (document.hidden) flush() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); flush(); releaseMic(); audio.current?.pause() }
  }, [])

  // ---- Thu âm ----
  const [recOn, setRecOn] = useState(false)
  const [recUrl, setRecUrl] = useState<string | null>(null)
  const recRef = useRef<{ stop: () => Promise<Recording> } | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    const l = lines[idx]; let dead = false
    setRecUrl(u => { if (u) URL.revokeObjectURL(u); return null })
    if (!l) return
    db.recordings.where('lineId').equals(l.id).toArray().then(rs => {
      if (dead) return
      const r = rs.filter(x => !x.deletedAt).sort((a, b) => b.createdAt - a.createdAt)[0]
      if (r) setRecUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(r.blob) })
    })
    return () => { dead = true }
  }, [idx, lines.length])

  useEffect(() => {
    db.songs.get(songId).then(setSong)
    getLines(songId).then(ls => {
      const t = ls.filter(l => l.start != null && l.end != null)
      setLines(t)
      if (teach) { const f = t.findIndex(l => !l.learned); setIdx(f < 0 ? 0 : f) }
    })
  }, [songId])
  // ---- A-B + câu đang hát theo thời gian video ----
  const [abPick, setAbPick] = useState<0 | 1 | 2>(0)
  const [ab, setAb] = useState<[number, number] | null>(null)
  const segRange = useRef<[number, number] | null>(null)
  let timeIdx = -1
  for (let i = 0; i < lines.length; i++) { if (lines[i].start! <= now + 0.05) timeIdx = i; else break }
  let hl = now > 0 && timeIdx >= 0 ? timeIdx : idx
  const rg = segRange.current
  if (rg && now > 0 && (seg.current || waiting.current || teach)) hl = Math.min(Math.max(hl, rg[0]), rg[1])
  useEffect(() => { centerInParent(curRef.current) }, [hl])
  useEffect(() => { if (!teach && now > 0 && hl !== idx && lines[hl]) setIdx(hl) }, [hl])

  const clearWait = () => { clearTimeout(timer.current); waiting.current = false }
  const wait = (fn: () => void) => { clearWait(); waiting.current = true; timer.current = window.setTimeout(() => { waiting.current = false; fn() }, GAP) }
  const runSeg = (s: Seg, r: number, seek = true) => {
    clearWait(); seg.current = s; repN.current = 0; setRep(0); armed.current = !seek
    const p = pl.current!; p.setRate(r)
    if (seek) { p.seek(s.start); seekAt.current = Date.now() }
    p.play()
  }

  // Vòng đọc thời gian ~50ms
  useEffect(() => {
    const id = setInterval(() => {
      const p = pl.current; if (!p) return
      const t = p.time(); setNow(t)
      const nowMs = Date.now()
      if (p.playing() && practice.current.last) practice.current.sec += Math.min(1, (nowMs - practice.current.last) / 1000)
      practice.current.last = nowMs
      const s = seg.current
      if (!s || waiting.current) return
      const ended = p.ended()
      if (!p.playing() && !ended) return
      // video ngắn hơn điểm cuối (vd. bản beat ngắn hơn): coi cuối video là điểm cuối
      const dur = p.duration(), end = dur > 0 ? Math.min(s.end, dur - 0.15) : s.end
      // Sau khi tua, YouTube có thể báo thời gian cũ thêm một nhịp: chỉ đếm khi đã vào trong đoạn
      if (!armed.current) { if (t >= s.start - 0.3 && t < end) armed.current = true; else if (!ended || Date.now() - seekAt.current < 1500) return }
      if (t < end && !ended) return
      repN.current++; setRep(repN.current)
      if (repN.current < s.reps()) { p.pause(); wait(() => { armed.current = false; seekAt.current = Date.now(); p.seek(s.start); p.play() }) }
      else { seg.current = null; s.onDone() }
    }, 50)
    return () => { clearInterval(id); clearWait() }
  }, [])

  const pickRate = (r: number) => ratesRef.current.includes(r) ? r : 1

  // ---- Chế độ học thường ----
  const startLine = (i: number, seek = true) => {
    const l = L.current[i]; if (!l) return
    setIdx(i); segRange.current = [i, i]
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
    setIdx(i); setStep(s); setPhase('run'); segRange.current = [s === 3 ? i - 1 : i, i]
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
    const first = !lines[idx].learned
    await patchLine(lines[idx].id, { learned: true })
    if (first) await logEvent({ songId, lineId: lines[idx].id, type: 'learned', seconds: 0 })
    const next = lines.map((x, j) => j === idx ? { ...x, learned: true } : x)
    setLines(rs => rs.map((x, j) => j === idx ? { ...x, learned: true } : x))
    if (next.every(l => l.learned)) { showToast('🏆', 'Con đã thuộc cả bài!'); setPhase('end'); return }
    if (first) showToast('⭐ +1', 'Giỏi quá!')
    const after = next.findIndex((l, j) => j > idx && !l.learned)
    runStep(after >= 0 ? after : next.findIndex(l => !l.learned), 0)
  }

  const recLine = useRef<string | null>(null)
  const finishRec = async () => {
    const r = recRef.current; if (!r) return
    recRef.current = null; setRecOn(false)
    const rec = await r.stop()
    releaseMic() // tắt micro ngay để iPad không giảm tiếng video
    const lineId = recLine.current; recLine.current = null
    if (!lineId || rec.blob.size < 500) return showToast('😕', 'Chưa thu được tiếng, con thử lại nhé')
    try {
      await db.recordings.put({ ...meta(), songId, lineId, blob: rec.blob, mime: rec.mime, seconds: Math.round(rec.seconds) })
      await logEvent({ songId, lineId, type: 'record', seconds: Math.round(rec.seconds) })
    } catch { return showToast('💾', 'Máy hết chỗ trống, chưa lưu được bản thu') }
    if (lines[idx]?.id === lineId) setRecUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(rec.blob) })
    showToast('🎙️', 'Thu xong rồi! Bấm "Nghe giọng con" nhé')
  }
  const record = async () => {
    if (recRef.current) { pl.current?.pause(); clearWait(); seg.current = null; return finishRec() }
    audio.current?.pause()
    let s: MediaStream
    try { s = await getMic() } catch { return showToast('🎤', 'Chưa mở được micro. Bố cho phép dùng micro nhé') }
    recRef.current = startRec(s); setRecOn(true)
    const l = lines[idx]; segRange.current = [idx, idx]; recLine.current = l.id
    runSeg({ start: l.start!, end: l.end! + 0.3, reps: () => 1, onDone: () => { pl.current?.pause(); finishRec() } }, 1)
  }
  const playRec = () => {
    if (!recUrl) return
    pl.current?.pause(); clearWait(); seg.current = null
    audio.current?.pause()
    audio.current = new Audio(recUrl); audio.current.play()
  }

  // ---- Lặp A-B: chạm câu A rồi câu B, lặp đoạn A→B theo số lần đã chọn ----
  const startAB = (a: number, b: number) => {
    const ls = L.current
    setIdx(a); segRange.current = [a, b]
    runSeg({
      start: ls[a].start!, end: ls[b].end!, reps: () => repeatRef.current,
      onDone: () => { pl.current?.pause(); showToast('👏', 'Xong đoạn A-B rồi!') },
    }, rateRef.current)
  }
  const onLine = (i: number) => {
    if (recRef.current) return showToast('🎙️', 'Đang thu, bấm dừng trước nhé')
    if (abPick === 1) { setAb([i, i]); setAbPick(2); return }
    if (abPick === 2 && ab) {
      const a = Math.min(ab[0], i), b = Math.max(ab[0], i)
      setAb([a, b]); setAbPick(0); startAB(a, b); return
    }
    setAb(null); jump(i)
  }

  const jump = (i: number) => {
    if (i < 0 || i >= lines.length || recRef.current) return
    if (teach) runStep(i, 0); else startLine(i)
  }
  const toggle = () => {
    const p = pl.current!
    if (recRef.current) { record(); return }
    if (playing) { if (waiting.current && seg.current) p.seek(seg.current.start); clearWait(); p.pause(); return }
    if (waiting.current && seg.current) { const s = seg.current; clearWait(); armed.current = false; seekAt.current = Date.now(); p.seek(s.start); p.play(); return }
    if (seg.current) p.play()
    else if (teach) runStep(idx, phase === 'choose' ? 2 : step)
    else if (ab) startAB(ab[0], ab[1])
    else startLine(idx)
  }
  // ---- Bản beat ----
  const switchBeat = () => {
    if (recRef.current) return
    clearWait(); seg.current = null; segRange.current = null; setNow(0); setPlaying(false)
    setBeatMode(b => !b)
  }
  const saveBeat = async (v: number | null) => {
    const r = v == null ? null : Math.round(v * 10) / 10
    await db.songs.update(songId, { beatOffset: r, updatedAt: Date.now() })
    setSong(s => s && { ...s, beatOffset: r })
  }
  const calibrate = () => saveBeat(pl.current!.time() - 0.2 - raw[0].start!)
  const nudgeBeat = (d: number) => saveBeat((song?.beatOffset ?? 0) + d)

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
  const looping = !!seg.current || waiting.current
  const repTotal = repeat
  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>{teach ? '👩‍🏫 ' : '🎤 '}{song.title}</h2>
        {song.beatVideoId && <button className={beatMode ? 'on' : ''} onClick={switchBeat}>{beatMode ? '🎵 Beat' : '🎤 Có lời'}</button>}
        <button onClick={() => go(teach ? '/learn/' + songId : '/teach/' + songId)}>{teach ? '🎤 Học tự do' : '👩‍🏫 Cô giáo'}</button>
      </div>
      <div className="learn">
        <div>
          <Player key={beatMode ? 'beat' : 'orig'} ref={pl} videoId={beatMode && song.beatVideoId ? song.beatVideoId : song.videoId} onState={setPlaying} onCoverPlay={toggle} onReady={() => setRates(pl.current!.rates())} />
          {beatMode && song.beatOffset == null && <div className="prompt">
            🎯 Căn bản beat<small>Bấm ▶ trên video. Đúng lúc tới chỗ hát câu 1 thì bấm nút bên dưới.</small>
            <button className="big" style={{ marginTop: 10 }} disabled={!playing} onClick={calibrate}>Câu 1 bắt đầu ở đây!</button>
          </div>}
          {beatMode && song.beatOffset != null && <div className="controls">
            <span className="hint">🎵 Lệch beat</span>
            <button onClick={() => nudgeBeat(-0.1)}>−0,1s</button>
            <span className="mono">{song.beatOffset >= 0 ? '+' : ''}{song.beatOffset.toFixed(1)}s</span>
            <button onClick={() => nudgeBeat(0.1)}>+0,1s</button>
            <button onClick={() => saveBeat(null)}>Căn lại</button>
          </div>}
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
            <button onClick={() => { setAb(null); jump(idx - 1) }} disabled={idx === 0}>⏮</button>
            <button className="primary" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
            <button onClick={() => { setAb(null); jump(idx + 1) }} disabled={idx >= lines.length - 1}>⏭</button>
            <button className={cur.hard ? 'on' : ''} onClick={toggleHard}>🔥 Câu khó</button>
          </div>
          {canRecord() && (!teach || phase !== 'run') && <div className="rec">
            <button className={recOn ? 'recording' : ''} onClick={record}>{recOn ? '⏹ Đang thu… bấm để dừng' : '🎙️ Thu câu này'}</button>
            {recUrl && !recOn && <button onClick={playRec}>🔈 Nghe giọng con</button>}
          </div>}
          {!teach && <>
            <div className="controls ab">
              {abPick === 0 && !ab && <button onClick={() => { setAbPick(1); setAb(null) }}>🅰️➜🅱️ Lặp A-B</button>}
              {abPick === 1 && <><span className="hint">👆 Chạm câu <b>bắt đầu</b> (A)</span><button onClick={() => setAbPick(0)}>Huỷ</button></>}
              {abPick === 2 && ab && <><span className="hint">👆 Chạm câu <b>kết thúc</b> (B) — chạm lại câu {ab[0] + 1} nếu chỉ lặp 1 câu</span><button onClick={() => { setAbPick(0); setAb(null) }}>Huỷ</button></>}
              {abPick === 0 && ab && <><span className="hint">🔁 Đang lặp câu {ab[0] + 1}{ab[1] > ab[0] ? ` → ${ab[1] + 1}` : ''}</span><button onClick={() => setAb(null)}>✖ Bỏ A-B</button></>}
            </div>
            <div className="controls">
              <span>🔁 Số lần</span>
              {REPEATS.map(r => <button key={r} className={repeat === r ? 'on' : ''} onClick={() => setRepeat(r)}>{r === Infinity ? '∞' : r}</button>)}
              {looping && repTotal > 1 && <span className="hint">Lần {Math.min(rep + 1, repTotal)}{repTotal === Infinity ? '' : '/' + repTotal}</span>}
            </div>
            {showRates.length > 1 && <div className="controls">
              <span>🐢</span>
              {showRates.map(r => <button key={r} className={rate === r ? 'on' : ''} onClick={() => changeRate(r)}>{r}x</button>)}
            </div>}
          </>}
        </div>
        <div className="side lines">
          {lines.map((l, i) => {
            const p = i === hl ? Math.max(0, Math.min(1, (now - l.start!) / (l.end! - l.start!))) : 0
            const inAB = ab && i >= ab[0] && i <= ab[1]
            return (
              <div key={l.id} ref={i === hl ? curRef : undefined} className={'line' + (i === hl ? ' cur' : '') + (inAB ? ' inab' : '') + (abPick ? ' picking' : '')} onClick={() => onLine(i)}>
                {ab && i === ab[0] && <span className="abtag">A</span>}
                {ab && abPick === 0 && i === ab[1] && <span className="abtag">B</span>}
                <span className={i === hl ? 'fill' : ''} style={{ ['--p' as string]: (p * 100).toFixed(1) + '%' }}>{l.text}</span>
                {l.hard && <span className="tag">🔥</span>}
                {l.learned && <span className="tag">✅</span>}
              </div>
            )
          })}
        </div>
      </div>
      {toast && <div className="toast">{toast.big}{toast.small && <small>{toast.small}</small>}</div>}
    </div>
  )
}
