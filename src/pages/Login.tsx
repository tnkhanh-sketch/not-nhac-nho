import { useState } from 'react'
import { login, register, Account } from '../account'

export default function Login({ onDone }: { onDone: (a: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'new'>('new')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(''); setBusy(true)
    try { onDone(mode === 'new' ? await register(name, phone, pin) : await login(phone, pin)) }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="wrap" style={{ maxWidth: 460 }}>
      <h1 style={{ textAlign: 'center', marginTop: 24 }}>🎵 Nốt Nhạc Nhỏ</h1>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className={mode === 'new' ? 'on' : ''} onClick={() => { setMode('new'); setErr('') }}>Tạo tài khoản</button>
        <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setErr('') }}>Đăng nhập</button>
      </div>
      <div className="panel">
        {mode === 'new' && <>
          <label>Tên của con / bố mẹ</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="vd. Bé Na" autoComplete="name" />
        </>}
        <label>Số điện thoại</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09xx xxx xxx" inputMode="tel" autoComplete="tel" />
        <label>Mã PIN (4–6 số){mode === 'new' ? ' — nhớ mã này để đăng nhập trên máy khác' : ''}</label>
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="••••" />
        {err && <div className="err">{err}</div>}
        <button className="primary big" style={{ width: '100%', marginTop: 14 }} disabled={busy} onClick={submit}>
          {busy ? 'Đang xử lý…' : mode === 'new' ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>
        <p className="note">Đăng nhập cùng số điện thoại trên iPhone, iPad, máy tính thì bài hát và tiến độ tự đồng bộ. Bài đang có trên máy này được giữ nguyên.</p>
      </div>
    </div>
  )
}
