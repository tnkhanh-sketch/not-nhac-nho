import { useRef, useState } from 'react'
import { exportBackup, importBackup } from '../backup'

export default function BackupPanel({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const save = async () => {
    setMsg('Đang tạo file…')
    const blob = await exportBackup()
    const name = `not-nhac-nho-${new Date().toLocaleDateString('sv')}.json`
    const f = new File([blob], name, { type: 'application/json' })
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); setMsg('Đã gửi file sao lưu.'); return } catch { /* huỷ: tải về */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = name; a.click()
    setMsg(`Đã lưu ${name} (${Math.round(blob.size / 1024)} KB).`)
  }
  const load = async (f?: File) => {
    if (!f) return
    try { const n = await importBackup(f); setMsg(`Khôi phục xong: ${n} mục mới.`); onDone() }
    catch (e) { setMsg('Lỗi: ' + (e as Error).message) }
    if (file.current) file.current.value = ''
  }
  return (
    <div className="panel">
      <h3>💾 Sao lưu</h3>
      <p className="note">Lưu bài hát, tiến độ và bản thu giọng ra 1 file (video biểu diễn không gồm vì quá nặng). Khôi phục sẽ gộp với dữ liệu đang có, không xoá gì.</p>
      <div className="row">
        <button className="primary" onClick={save}>💾 Sao lưu ra file</button>
        <button onClick={() => file.current?.click()}>📂 Khôi phục từ file</button>
        <input ref={file} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={e => load(e.target.files?.[0])} />
      </div>
      {msg && <p className="note">{msg}</p>}
    </div>
  )
}
