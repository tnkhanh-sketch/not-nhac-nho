import { useEffect, useState } from 'react'
import { db } from '../db'
import { importFromMarket, listMarket, marketReady, MarketItem } from '../market'
import { thumb } from '../yt'
import { go } from '../App'

export default function Market() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<MarketItem[] | null>(null)
  const [mine, setMine] = useState<Record<string, string>>({}) // id trên chợ → id bài trên máy
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = async (text = q) => {
    setErr('')
    try { setItems(await listMarket(text.trim())) } catch { setErr('Chưa tải được chợ, kiểm tra mạng nhé'); setItems([]) }
  }
  useEffect(() => {
    load('')
    db.songs.toArray().then(ss => setMine(Object.fromEntries(ss.filter(s => !s.deletedAt).flatMap(s => [s.fromMarket ? [s.fromMarket, s.id] : [s.id, s.id]]))))
  }, [])

  const take = async (it: MarketItem) => {
    setBusy(it.id)
    try { const sid = await importFromMarket(it.id); go('/learn/' + sid) }
    catch (e) { setErr((e as Error).message); setBusy('') }
  }

  if (!marketReady()) return <div className="wrap"><p>Chợ chưa sẵn sàng.</p></div>
  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>🛒 Chợ bài hát</h2>
      </div>
      <p className="note">Bài do các bạn khác chia câu sẵn. Bấm "Lấy bài này" là học được ngay. Muốn đăng bài của mình: ở trang chủ bấm 📤 trên thẻ bài đã chia câu.</p>
      <div className="row">
        <input style={{ flex: 1, minWidth: 200 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Tìm tên bài, ca sĩ…" />
        <button className="primary" onClick={() => load()}>🔎 Tìm</button>
      </div>
      {err && <div className="err">{err}</div>}
      {items && !items.length && !err && <p className="note">Chưa có bài nào{q ? ' khớp' : ''}. Hãy là người đầu tiên đăng bài nhé!</p>}
      <div className="songs">
        {items?.map(it => (
          <div className="card" key={it.id}>
            <img src={thumb(it.video_id)} alt="" />
            <div className="in">
              <h3>{it.title}</h3>
              <div className="note">{it.artist} · {it.line_count} câu{it.has_beat ? ' · 🎵 có beat' : ''} · ⬇️ {it.downloads}</div>
              {it.publisher && <div className="note">Đăng bởi {it.publisher}</div>}
              <div className="row" style={{ marginTop: 10 }}>
                {mine[it.id]
                  ? <button className="primary" onClick={() => go('/learn/' + mine[it.id])}>✅ Đã có · Học</button>
                  : <button className="primary" disabled={busy === it.id} onClick={() => take(it)}>{busy === it.id ? 'Đang lấy…' : '⬇️ Lấy bài này'}</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
