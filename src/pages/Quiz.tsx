import { useEffect, useRef, useState } from 'react'
import { db, getLines, logEvent, Line, Song } from '../db'
import { Player, PlayerApi } from '../Player'
import { go } from '../App'

interface Q { kind: 'next' | 'word'; prompt: string; lineIdx: number; options: string[]; answer: number }
const N = 10
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
const words = (t: string) => t.split(/\s+/).filter(w => w.replace(/[^\p{L}]/gu, '').length >= 2)

function makeQuestions(lines: Line[]): Q[] {
  const texts = lines.map(l => l.text)
  const allWords = [...new Set(texts.flatMap(words).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(w => w.length >= 2))]
  const qs: Q[] = []
  const order = shuffle(lines.map((_, i) => i))
  for (const i of order) {
    if (qs.length >= N) break
    if (qs.length % 2 === 0 && i < lines.length - 1) {
      // Câu tiếp theo là gì?
      const right = texts[i + 1]
      const wrong = shuffle(texts.filter(t => t !== right && t !== texts[i])).slice(0, 2)
      if (wrong.length < 2) continue
      const opts = shuffle([right, ...wrong])
      qs.push({ kind: 'next', prompt: texts[i], lineIdx: i, options: opts, answer: opts.indexOf(right) })
    } else {
      // Điền từ còn thiếu
      const ws = texts[i].split(/(\s+)/)
      const cand = ws.map((w, k) => ({ w: w.replace(/[^\p{L}\p{N}]/gu, ''), k })).filter(x => x.w.length >= 2)
      if (!cand.length) continue
      const pick = cand[Math.floor(Math.random() * cand.length)]
      const wrong = shuffle(allWords.filter(w => w.toLowerCase() !== pick.w.toLowerCase())).slice(0, 2)
      if (wrong.length < 2) continue
      const prompt = ws.map((w, k) => k === pick.k ? w.replace(pick.w, '＿＿＿') : w).join('')
      const opts = shuffle([pick.w, ...wrong])
      qs.push({ kind: 'word', prompt, lineIdx: i, options: opts, answer: opts.indexOf(pick.w) })
    }
  }
  return qs
}

export default function Quiz({ songId }: { songId: string }) {
  const [song, setSong] = useState<Song>()
  const [lines, setLines] = useState<Line[]>([])
  const [qs, setQs] = useState<Q[]>([])
  const [n, setN] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const pl = useRef<PlayerApi>(null)
  const stopAt = useRef<number | null>(null)

  const restart = (ls = lines) => { setQs(makeQuestions(ls)); setN(0); setPicked(null); setScore(0) }
  useEffect(() => {
    db.songs.get(songId).then(setSong)
    getLines(songId).then(ls => { setLines(ls); restart(ls) })
  }, [songId])
  useEffect(() => {
    const iv = setInterval(() => { if (stopAt.current != null && pl.current && pl.current.time() >= stopAt.current) { pl.current.pause(); stopAt.current = null } }, 50)
    return () => clearInterval(iv)
  }, [])

  if (!song) return null
  if (lines.length < 4) return <div className="wrap"><div className="bar"><button onClick={() => go('/')}>← Về</button><h2>🎲 Đố vui</h2></div><p>Bài cần ít nhất 4 câu để chơi đố vui.</p></div>

  const q = qs[n]
  const done = n >= qs.length
  const timed = lines.every(l => l.start != null && l.end != null)
  const listen = () => {
    const l = lines[q.lineIdx]; if (!pl.current || l.start == null || l.end == null) return
    pl.current.setRate(1); pl.current.seek(l.start); pl.current.play(); stopAt.current = l.end
  }
  const choose = (k: number) => {
    if (picked != null) return
    setPicked(k)
    if (k === q.answer) setScore(s => s + 1)
  }
  const next = async () => {
    const last = n + 1 >= qs.length
    setPicked(null); setN(n + 1)
    if (last) await logEvent({ songId, lineId: null, type: 'practice', seconds: 60 })
  }

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>🎲 Đố vui: {song.title}</h2>
      </div>
      {timed && <div style={{ maxWidth: 420, margin: '0 auto 10px' }}><Player ref={pl} videoId={song.videoId} /></div>}
      {!done && q ? <div className="panel quiz">
        <div className="note">Câu hỏi {n + 1}/{qs.length} · ⭐ {score}</div>
        <h3>{q.kind === 'next' ? 'Câu hát tiếp theo là gì?' : 'Từ nào còn thiếu?'}</h3>
        <div className="q-prompt">«{q.prompt}»</div>
        {timed && <button onClick={listen}>▶ Nghe đoạn này</button>}
        <div className="q-opts">
          {q.options.map((o, k) => <button key={k} onClick={() => choose(k)}
            className={picked == null ? '' : k === q.answer ? 'right' : k === picked ? 'wrong' : ''}>{o}</button>)}
        </div>
        {picked != null && <div className="q-result">
          {picked === q.answer ? '🎉 Đúng rồi! +1 ⭐' : '😅 Chưa đúng, đáp án là ô màu xanh'}
          <button className="primary" onClick={next}>{n + 1 >= qs.length ? 'Xem kết quả' : 'Câu tiếp →'}</button>
        </div>}
      </div> : <div className="panel quiz" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>{score >= qs.length * 0.8 ? '🏆' : score >= qs.length / 2 ? '🌟' : '💪'}</div>
        <h3>Con được {score}/{qs.length} ⭐</h3>
        <p>{score >= qs.length * 0.8 ? 'Giỏi quá! Con thuộc lời rồi đó!' : score >= qs.length / 2 ? 'Khá lắm! Ôn thêm chút nữa nhé.' : 'Mình học thêm rồi chơi lại nhé!'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary big" onClick={() => restart()}>🔄 Chơi lại</button>
          <button className="big" onClick={() => go('/learn/' + songId)}>🎤 Đi học tiếp</button>
        </div>
      </div>}
    </div>
  )
}
