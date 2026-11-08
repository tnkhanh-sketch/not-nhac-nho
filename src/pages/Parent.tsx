import { useEffect, useState } from 'react'
import { db, Line, Rec, Song } from '../db'
import { getStats, Stats } from '../stats'
import { go } from '../App'

const PIN_KEY = 'parentPin'
const getPin = () => { try { return localStorage.getItem(PIN_KEY) } catch { return null } }
const setPinLS = (p: string) => { try { localStorage.setItem(PIN_KEY, p) } catch { /* */ } }

function PinGate({ onOk }: { onOk: () => void }) {
  const saved = getPin()
  const [v, setV] = useState('')
  const [first, setFirst] = useState('')
  const [err, setErr] = useState('')
  const press = (d: string) => {
    const n = (v + d).slice(0, 4); setV(n); setErr('')
    if (n.length < 4) return
    if (saved) { if (n === saved) onOk(); else { setErr('Sai mã rồi'); setV('') } return }
    if (!first) { setFirst(n); setV(''); return }
    if (n === first) { setPinLS(n); onOk() } else { setErr('Hai lần không khớp, đặt lại nhé'); setFirst(''); setV('') }
  }
  return (
    <div className="wrap" style={{ maxWidth: 420, textAlign: 'center' }}>
      <div className="bar"><button onClick={() => go('/')}>← Về</button><h2>👨 Chế độ bố</h2></div>
      <p>{saved ? 'Nhập mã 4 số' : first ? 'Nhập lại mã để xác nhận' : 'Đặt mã 4 số cho bố (con không biết nhé)'}</p>
      <div style={{ fontSize: 40, letterSpacing: 12, minHeight: 56 }}>{'●'.repeat(v.length)}{'○'.repeat(4 - v.length)}</div>
      {err && <div className="err">{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k === '' ? <span key="e" /> :
          <button key={k} className="big" onClick={() => k === '⌫' ? setV(v.slice(0, -1)) : press(k)}>{k}</button>)}
      </div>
    </div>
  )
}

interface SongRow { s: Song; lines: Line[]; minutes: number; last: string | null; recs: Rec[] }

export default function Parent() {
  const [ok, setOk] = useState(false)
  const [st, setSt] = useState<Stats>()
  const [rows, setRows] = useState<SongRow[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [playing, setPlaying] = useState<HTMLAudioElement | null>(null)

  const load = async () => {
    setSt(await getStats())
    const [songs, lines, ev, recs] = await Promise.all([db.songs.toArray(), db.lines.toArray(), db.events.toArray(), db.recordings.toArray()])
    setRows(songs.filter(s => !s.deletedAt).map(s => {
      const e = ev.filter(x => x.songId === s.id && !x.deletedAt)
      return {
        s, lines: lines.filter(l => l.songId === s.id && !l.deletedAt).sort((a, b) => a.idx - b.idx),
        minutes: Math.round(e.filter(x => x.type === 'practice').reduce((a, x) => a + x.seconds, 0) / 60),
        last: e.map(x => x.day).sort().pop() || null,
        recs: recs.filter(r => r.songId === s.id && !r.deletedAt).sort((a, b) => b.createdAt - a.createdAt),
      }
    }).sort((a, b) => (b.last || '').localeCompare(a.last || '')))
  }
  useEffect(() => { if (ok) load() }, [ok])
  useEffect(() => () => playing?.pause(), [playing])

  if (!ok) return <PinGate onOk={() => setOk(true)} />

  const play = (r: Rec) => {
    playing?.pause()
    const a = new Audio(URL.createObjectURL(r.blob)); a.play(); setPlaying(a)
  }
  const delRec = async (r: Rec) => {
    if (!confirm('Xoá bản thu này?')) return
    await db.recordings.update(r.id, { deletedAt: Date.now(), updatedAt: Date.now() }); load()
  }
  const resetLearned = async (l: Line) => {
    await db.lines.update(l.id, { learned: false, updatedAt: Date.now() }); load()
  }
  const changePin = () => { try { localStorage.removeItem(PIN_KEY) } catch { /* */ } setOk(false) }
  const max = Math.max(1, ...(st?.perDay.map(d => d.minutes) || [1]))
  const fmtDay = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)

  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>👨 Chế độ bố</h2>
        <button onClick={changePin}>Đổi mã</button>
      </div>
      {st && <>
        <div className="stats">
          <div className="stat"><b>⭐ {st.stars}</b><span>câu đã thuộc</span></div>
          <div className="stat"><b>🏆 {st.songsDone}</b><span>bài thuộc trọn</span></div>
          <div className="stat"><b>🔥 {st.streak}</b><span>ngày liền (kỷ lục {st.bestStreak})</span></div>
          <div className="stat"><b>⏱️ {st.minutesTotal}</b><span>phút đã tập</span></div>
          <div className="stat"><b>🎙️ {st.records}</b><span>lần thu âm</span></div>
        </div>
        <div className="panel">
          <h3>Số phút tập 7 ngày qua</h3>
          <div className="bars">
            {st.perDay.map(d => <div key={d.day}><span>{d.minutes}</span><i style={{ height: (d.minutes / max * 80) + '%' }} />{fmtDay(d.day)}</div>)}
          </div>
        </div>
      </>}
      {rows.map(r => {
        const learned = r.lines.filter(l => l.learned).length
        const hard = r.lines.filter(l => l.hard)
        return (
          <div className="panel" key={r.s.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>{r.s.title}</h3>
              <button onClick={() => setOpen(open === r.s.id ? null : r.s.id)}>{open === r.s.id ? 'Thu gọn' : 'Chi tiết'}</button>
            </div>
            <div className="note">
              Thuộc {learned}/{r.lines.length} câu · {r.minutes} phút · {r.recs.length} bản thu · Lần tập cuối: {r.last ? fmtDay(r.last) : 'chưa tập'}
              {hard.length > 0 && <> · 🔥 {hard.length} câu khó</>}
            </div>
            {open === r.s.id && <div style={{ marginTop: 10 }}>
              {r.lines.map((l, i) => {
                const recs = r.recs.filter(x => x.lineId === l.id)
                return (
                  <div className="rev" key={l.id}>
                    <div className="t">{i + 1}. {l.text} {l.learned && '✅'} {l.hard && '🔥'}</div>
                    <div className="row">
                      {recs.slice(0, 3).map((x, j) => <span key={x.id} className="row">
                        <button onClick={() => play(x)}>▶ Bản thu {j === 0 ? 'mới nhất' : j + 1} ({x.seconds}s)</button>
                        <button onClick={() => delRec(x)}>🗑</button>
                      </span>)}
                      {!recs.length && <span className="note">Chưa có bản thu</span>}
                      {l.learned && <button onClick={() => resetLearned(l)}>Bỏ "đã thuộc"</button>}
                    </div>
                  </div>
                )
              })}
            </div>}
          </div>
        )
      })}
    </div>
  )
}
