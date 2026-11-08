import { useState } from 'react'
import { getFamilyCode, normalizeCode, setFamilyCode, syncNow } from '../sync'
import { go } from '../App'

/** Mở từ link trong QR: hỏi xác nhận rồi mới nối máy. */
export default function Join({ raw }: { raw: string }) {
  const code = normalizeCode(decodeURIComponent(raw || ''))
  const cur = getFamilyCode()
  const [msg, setMsg] = useState('')
  const ok = async () => {
    setFamilyCode(code!); setMsg('Đang đồng bộ…')
    try { await syncNow(); go('/') } catch (e) { setMsg('Lỗi: ' + (e as Error).message.slice(0, 100)) }
  }
  return (
    <div className="wrap" style={{ maxWidth: 520 }}>
      <div className="bar"><button onClick={() => go('/')}>← Về</button><h2>🔗 Nối máy</h2></div>
      {!code ? <div className="err">Link nối máy không đúng.</div> : cur === code ? <p>Máy này đã nối với mã này rồi.</p> : <>
        <p>Nối máy này với gia đình mã <b>{code}</b>? Bài hát và tiến độ sẽ dùng chung giữa các máy.</p>
        {cur && <p className="note">Máy đang nối với mã khác; nối mã mới sẽ thay mã cũ.</p>}
        {/iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document && !matchMedia('(display-mode: standalone)').matches &&
          <p className="note">⚠️ Nếu đã cài app ra màn hình chính, hãy mở app rồi vào 👨 Bố → "📷 Quét mã QR" (trên iPad, app và Safari lưu dữ liệu riêng).</p>}
        <button className="primary big" onClick={ok}>✓ Nối máy</button>
      </>}
      {msg && <p className="note">{msg}</p>}
    </div>
  )
}
