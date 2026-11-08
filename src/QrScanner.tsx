import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/** Quét QR bằng camera sau (chạy được trong app đã cài ra màn hình chính). */
export default function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, dead = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const tick = () => {
      if (dead) return
      const v = video.current
      if (v && v.readyState >= 2 && v.videoWidth) {
        const w = 480, h = Math.round(v.videoHeight * w / v.videoWidth)
        canvas.width = w; canvas.height = h
        ctx.drawImage(v, 0, 0, w, h)
        const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)
        if (r?.data) { onCode(r.data); return }
      }
      raf = requestAnimationFrame(tick)
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => {
        stream = s
        if (dead) return s.getTracks().forEach(t => t.stop())
        const v = video.current!
        v.srcObject = s; v.setAttribute('playsinline', ''); v.muted = true
        v.play().then(tick)
      })
      .catch(() => setErr('Không mở được camera. Bố cho phép dùng camera hoặc gõ mã nhé.'))
    return () => { dead = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  return (
    <div className="scanner">
      {err ? <div className="err">{err}</div> : <video ref={video} playsInline muted />}
      <p className="note">Đưa mã QR trên máy kia vào khung hình</p>
      <button onClick={onClose}>Đóng</button>
    </div>
  )
}
