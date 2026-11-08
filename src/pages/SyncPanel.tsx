import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { getFamilyCode, lastSyncAt, newFamilyCode, normalizeCode, setFamilyCode, syncConfigured, syncNow } from '../sync'
import QrScanner from '../QrScanner'

/** Link trong QR: quét bằng camera thường cũng mở được trang nối máy. */
export const joinLink = (code: string) => `${location.origin}${location.pathname}#/join/${code}`
export const codeFromText = (t: string) => normalizeCode(t.includes('#/join/') ? t.split('#/join/')[1] : t)

export default function SyncPanel({ onSynced }: { onSynced: () => void }) {
  const [code, setCode] = useState(getFamilyCode())
  const [qr, setQr] = useState('')
  const [scan, setScan] = useState(false)
  useEffect(() => { if (code) QRCode.toDataURL(joinLink(code), { width: 240, margin: 1 }).then(setQr); else setQr('') }, [code])
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (!syncConfigured()) return <div className="panel"><h3>🔄 Đồng bộ giữa các máy</h3><p className="note">Chưa cấu hình máy chủ.</p></div>

  const run = async () => {
    setBusy(true); setMsg('Đang đồng bộ…')
    try {
      const r = await syncNow()
      setMsg(r ? `Xong: gửi ${r.pushed}, nhận ${r.pulled} mục.` : 'Chưa kết nối mạng.')
      onSynced()
    } catch (e) { setMsg('Lỗi đồng bộ: ' + (e as Error).message.slice(0, 120)) }
    setBusy(false)
  }
  const connect = (c: string) => { setFamilyCode(c); setCode(c); setInput(''); run() }
  const join = () => {
    const c = normalizeCode(input)
    if (!c) return setMsg('Mã gồm 16 ký tự, ví dụ ABCD-EFGH-JKMN-PQRS')
    connect(c)
  }
  const leave = () => {
    if (!confirm('Ngắt đồng bộ trên máy này? Dữ liệu trên máy vẫn giữ nguyên.')) return
    setFamilyCode(null); setCode(null); setMsg('')
  }
  const at = lastSyncAt()

  return (
    <div className="panel">
      <h3>🔄 Đồng bộ giữa các máy</h3>
      {code ? <>
        <p>Mã gia đình (nhập mã này trên máy kia để dùng chung bài hát và tiến độ):</p>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 2, userSelect: 'all' }}>{code}</div>
        {qr && <img src={qr} alt="Mã QR gia đình" style={{ width: 200, height: 200, display: 'block', margin: '8px 0' }} />}
        <p className="note">Máy kia: vào 👨 Bố → "📷 Quét mã QR" rồi đưa camera vào mã này.</p>
        <p className="note">Giữ bí mật mã này. Lần đồng bộ gần nhất: {at ? new Date(at).toLocaleString('vi-VN') : 'chưa có'}</p>
        <div className="row">
          <button className="primary" disabled={busy} onClick={run}>🔄 Đồng bộ ngay</button>
          <button onClick={leave}>Ngắt kết nối</button>
        </div>
      </> : <>
        <p className="note">Máy đầu tiên: bấm "Tạo mã gia đình". Máy thứ hai: nhập mã đó vào ô bên dưới.</p>
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => connect(newFamilyCode())}>Tạo mã gia đình</button>
          <button disabled={busy} onClick={() => setScan(true)}>📷 Quét mã QR</button>
        </div>
        {scan && <QrScanner onClose={() => setScan(false)} onCode={t => {
          setScan(false)
          const c = codeFromText(t)
          if (c) connect(c); else setMsg('Mã QR này không phải mã gia đình Nốt Nhạc Nhỏ')
        }} />}
        <label>Đã có mã từ máy kia?</label>
        <div className="row">
          <input style={{ flex: 1, minWidth: 220, textTransform: 'uppercase' }} value={input} onChange={e => setInput(e.target.value)} placeholder="ABCD-EFGH-JKMN-PQRS" />
          <button className="primary" disabled={busy} onClick={join}>Kết nối</button>
        </div>
      </>}
      {msg && <p className="note">{msg}</p>}
    </div>
  )
}
