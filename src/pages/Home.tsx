import { useEffect, useState } from 'react'
import { db, Song } from '../db'
import { thumb } from '../yt'
import { go } from '../App'
import { getStats, Stats } from '../stats'

interface Item { s: Song; learned: number; total: number; timed: boolean }

export default function Home() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [st, setSt] = useState<Stats>()
  const load = async () => {
    getStats().then(setSt)
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

  const del = async (s: Song) => {
    if (!confirm(`Xoá bài "${s.title}"?`)) return
    const now = Date.now()
    await db.songs.update(s.id, { deletedAt: now, updatedAt: now })
    await db.lines.where('songId').equals(s.id).modify({ deletedAt: now, updatedAt: now })
    load()
  }

  return (
    <div className="wrap">
      <div className="bar">
        <h1>🎵 Nốt Nhạc Nhỏ</h1>
        <button onClick={() => go('/bo')}>👨 Bố</button>
        <button className="primary big" onClick={() => go('/add')}>+ Thêm bài</button>
      </div>
      {st && <div className="stats">
        <div className="stat"><b>⭐ {st.stars}</b><span>câu đã thuộc</span></div>
        <div className="stat"><b>🔥 {st.streak}</b><span>ngày liền</span></div>
        <div className="stat"><b>⏱️ {st.minutesToday}</b><span>phút hôm nay</span></div>
        <div className="badges">
          {st.badges.map(b => <span key={b.name} className={'badge' + (b.got ? ' got' : '')} title={b.name}>{b.icon}<small>{b.name}</small></span>)}
        </div>
      </div>}
      {items && items.length === 0 && <p className="note">Chưa có bài nào. Bấm "+ Thêm bài" để bắt đầu nhé!</p>}
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
                </> : <button className="primary" onClick={() => go('/mark/' + s.id)}>⏱ Chia câu</button>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {timed && <button onClick={() => go('/mark/' + s.id)}>⏱ Chia lại</button>}
                {timed && <button onClick={() => go('/show/' + s.id)}>🎬 Biểu diễn</button>}
                {timed && <button onClick={() => go('/tv/' + s.id)}>📺 TV</button>}
                {timed && <button onClick={() => go('/review/' + s.id)}>🔧 Rà soát</button>}
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
