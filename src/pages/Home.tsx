import { useEffect, useState } from 'react'
import { db, Song } from '../db'
import { thumb } from '../yt'
import { go } from '../App'
import { fmtDur, getGoal, getStats, Stats } from '../stats'
import { importPayload, publishSong, songPayload, unpublishSong } from '../market'
import { getAccount, inbox, InboxItem, sendSong, takeInbox } from '../account'
import { autoSplit } from '../autosplit'

interface Item { s: Song; learned: number; total: number; timed: boolean }

export default function Home() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [st, setSt] = useState<Stats>()
  const [help, setHelp] = useState(false)
  const [mail, setMail] = useState<InboxItem[]>([])
  const [autoBusy, setAutoBusy] = useState('')
  const acc = getAccount()
  const goal = getGoal()
  const load = async () => {
    getStats().then(setSt)
    inbox().then(setMail).catch(() => {})
    const songs = (await db.songs.toArray()).filter(s => !s.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt)
    const all = (await db.lines.toArray()).filter(l => !l.deletedAt)
    setItems(songs.map(s => {
      const ls = all.filter(l => l.songId === s.id)
      return { s, learned: ls.filter(l => l.learned).length, total: ls.length, timed: ls.length > 0 && ls.every(l => l.start != null && l.end != null) }
    }))
  }
  useEffect(() => {
    load()
    addEventListener('nnn-synced', load)
    return () => removeEventListener('nnn-synced', load)
  }, [])

  const share = async (s: Song) => {
    try {
      if (s.marketAt) {
        if (!confirm(`Gỡ bài "${s.title}" khỏi Chợ bài hát?`)) return
        await unpublishSong(s); alert('Đã gỡ khỏi chợ.')
      } else {
        if (!confirm(`Đăng "${s.title}" lên Chợ bài hát với tên "${acc?.name}"?
Chỉ đăng tên bài, link YouTube và lời đã chia câu.`)) return
        await publishSong(s, acc?.name || ''); alert('🎉 Đã đăng lên Chợ bài hát!')
      }
      load()
    } catch (e) { alert('Chưa đăng được: ' + (e as Error).message.slice(0, 120)) }
  }

  const auto = async (s: Song) => {
    setAutoBusy(s.id)
    try { await autoSplit(s); go('/review/' + s.id) }
    catch (e) { alert((e as Error).message); setAutoBusy('') }
  }
  const send = async (s: Song) => {
    const to = prompt(`Gửi bài "${s.title}" cho bạn.
Nhập số điện thoại của bạn (bạn cần có tài khoản Nốt Nhạc Nhỏ):`)
    if (!to) return
    try {
      const p = await songPayload(s)
      if (p.lines.length < 2) return alert('Bài cần chia câu xong trước khi gửi')
      const who = await sendSong(to, s.title, p); alert(`📨 Đã gửi cho ${who}!`)
    } catch (e) { alert((e as Error).message) }
  }
  const receive = async (m: InboxItem, keep: boolean) => {
    try {
      const d = await takeInbox(m.id, keep)
      if (keep && d) { const sid = await importPayload(d); go('/learn/' + sid); return }
      load()
    } catch { alert('Chưa nhận được, thử lại nhé') }
  }

  const del = async (s: Song) => {
    if (!confirm(`Xoá bài "${s.title}"?`)) return
    const now = Date.now()
    await db.songs.update(s.id, { deletedAt: now, updatedAt: now })
    await db.lines.where('songId').equals(s.id).modify({ deletedAt: now, updatedAt: now })
    // dọn bản thu (đánh dấu xoá để đồng bộ) và xoá hẳn video biểu diễn cho nhẹ máy
    await db.recordings.where('songId').equals(s.id).modify({ deletedAt: now, updatedAt: now })
    await db.performances.where('songId').equals(s.id).delete()
    load()
  }

  return (
    <div className="wrap">
      <div className="bar">
        <h1>🎵 Nốt Nhạc Nhỏ</h1>
        <button onClick={() => go('/me')}>👤 {acc?.name}</button>
        <button onClick={() => go('/cho')}>🛒 Chợ</button>
        <button onClick={() => setHelp(!help)}>❓</button>
        <button onClick={() => go('/bo')}>👨 Bố</button>
        <button className="primary big" onClick={() => go('/add')}>+ Thêm bài</button>
      </div>
      {st && <div className="stats">
        <div className="stat"><b>⭐ {st.stars}</b><span>câu đã thuộc</span></div>
        <div className="stat"><b>🔥 {st.streak}</b><span>ngày liền</span></div>
        <div className="stat"><b>⏱️ {fmtDur(st.secToday)}</b><span>tập hôm nay</span></div>
        <div className="badges">
          {st.badges.map(b => <span key={b.name} className={'badge' + (b.got ? ' got' : '')} title={b.name}>{b.icon}<small>{b.name}</small></span>)}
        </div>
      </div>}
      {mail.length > 0 && <div className="panel">
        <h3>📬 Có {mail.length} bài được gửi cho con</h3>
        {mail.map(m => <div key={m.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid #f3dbe6', padding: '8px 0' }}>
          <span><b>{m.title}</b> · từ {m.from_name}</span>
          <span className="row"><button className="primary" onClick={() => receive(m, true)}>⬇️ Nhận</button><button onClick={() => receive(m, false)}>Bỏ</button></span>
        </div>)}
      </div>}
      {st && <div className="goal">
        <span>🎯 Hôm nay: {fmtDur(st.secToday)} / {goal} phút</span>
        <div className="goal-bar"><i style={{ width: Math.min(100, st.secToday / (goal * 60) * 100) + '%' }} /></div>
        {st.secToday >= goal * 60 && <b>🎉 Đạt mục tiêu rồi!</b>}
      </div>}
      {(help || (items && items.length === 0)) && <div className="panel">
        <h3>Cách học một bài mới</h3>
        <ol className="steps">
          <li><b>+ Thêm bài</b>: dán link YouTube, dán lời (mỗi dòng một câu).</li>
          <li><b>⏱ Chia câu</b>: cho video chạy, mỗi khi ca sĩ bắt đầu hát câu được tô hồng thì bấm nút to.</li>
          <li><b>🎤 Học</b>: chạm câu để nghe lại, chọn số lần lặp, Lặp A-B, 🐢 chậm, 🎙️ thu giọng.</li>
          <li><b>👩‍🏫 Cô giáo</b>: cô dạy từng câu 4 bước, thuộc câu nào được ⭐ câu đó.</li>
          <li><b>🎬 Biểu diễn</b> hoặc <b>📺 TV</b> khi đã thuộc cả bài!</li>
        </ol>
      </div>}
      <div className="songs">
        {items?.map(({ s, learned, total, timed }) => (
          <div className="card" key={s.id}>
            <img src={thumb(s.videoId)} alt="" onClick={() => go((timed ? '/learn/' : '/mark/') + s.id)} />
            <div className="in">
              <h3>{s.title}</h3>
              <div className="note">{s.artist} · Đã thuộc {learned}/{total} câu</div>
              <div className="row" style={{ marginTop: 10 }}>
                {timed ? <>
                  <button className="primary" onClick={() => go('/learn/' + s.id)}>🎤 Học</button>
                  <button className="primary" onClick={() => go('/teach/' + s.id)}>👩‍🏫 Cô giáo</button>
                </> : <>
                  <button className="primary" onClick={() => go('/learn/' + s.id)}>🎤 Nghe & lặp</button>
                  <button className="primary" onClick={() => go('/mark/' + s.id)}>⏱ Chia câu</button>
                </>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {timed && <button onClick={() => go('/mark/' + s.id)}>⏱ Chia lại</button>}
                {timed && <button onClick={() => go('/show/' + s.id)}>🎬 Biểu diễn</button>}
                {timed && <button onClick={() => go('/tv/' + s.id)}>📺 TV</button>}
                {total >= 4 && <button onClick={() => go('/quiz/' + s.id)}>🎲 Đố vui</button>}
                {timed && <button onClick={() => go('/review/' + s.id)}>🔧 Rà soát</button>}
                <button disabled={autoBusy === s.id} onClick={() => auto(s)}>{autoBusy === s.id ? '⚡ Đang chia…' : '⚡ Chia tự động'}</button>
                {timed && <button onClick={() => send(s)}>📨 Gửi bạn</button>}
                {timed && !s.fromMarket && <button className={s.marketAt ? 'on' : ''} onClick={() => share(s)}>{s.marketAt ? '📤 Đã đăng' : '📤 Đăng chợ'}</button>}
                <button onClick={() => go('/edit/' + s.id)}>✏️ Sửa</button>
                <button onClick={() => del(s)}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
