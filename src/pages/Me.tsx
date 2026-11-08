import { getAccount, logout } from '../account'
import { lastSyncAt } from '../sync'
import { db } from '../db'
import { go } from '../App'

export default function Me({ onLogout }: { onLogout: () => void }) {
  const a = getAccount()
  const at = lastSyncAt()
  return (
    <div className="wrap" style={{ maxWidth: 520 }}>
      <div className="bar"><button onClick={() => go('/')}>← Về</button><h2>👤 Tài khoản</h2></div>
      <div className="panel">
        <p style={{ fontSize: 22 }}><b>{a?.name}</b></p>
        <p>📱 {a?.phone}</p>
        <p className="note">Đồng bộ gần nhất: {at ? new Date(at).toLocaleString('vi-VN') : 'chưa có'}. Đăng nhập cùng số này trên máy khác là có cùng bài hát và tiến độ.</p>
        <div className="row">
          <button onClick={() => go('/bo')}>👨 Chế độ bố</button>
          <button onClick={() => { if (confirm('Đăng xuất khỏi máy này? Bài hát trên máy vẫn giữ nguyên.')) { logout(); go('/'); onLogout() } }}>Đăng xuất</button>
          <button onClick={async () => {
            if (!confirm('Đăng xuất và XOÁ toàn bộ bài hát, bản thu trên máy này? (Dữ liệu đã đồng bộ vẫn còn trong tài khoản)')) return
            logout(); await db.delete(); try { localStorage.clear() } catch { /* */ } location.hash = '#/'; location.reload()
          }}>Đăng xuất & xoá dữ liệu trên máy</button>
        </div>
      </div>
    </div>
  )
}
