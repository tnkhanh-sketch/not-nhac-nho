import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { loadYT, EMBED_BLOCKED } from './yt'

export interface PlayerApi {
  play(): void; pause(): void; seek(t: number): void; time(): number
  setRate(r: number): void; rates(): number[]; playing(): boolean
  ended(): boolean; duration(): number
}

interface Props {
  videoId: string; start?: number; onState?: (playing: boolean) => void; onReady?: () => void
  /** Nút ▶ trên lớp che: để trang tự quyết phát từ đâu (vd. đang nghỉ giữa 2 lần lặp) */
  onCoverPlay?: () => void
  /** Hiện phụ đề có sẵn của video (ưu tiên tiếng Việt) */
  cc?: boolean
}

/** YouTube player có lớp phủ: không bấm được sang YouTube, che video khi dừng/hết. */
export const Player = forwardRef<PlayerApi, Props>(function Player({ videoId, start = 0, onState, onReady, onCoverPlay, cc = false }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const p = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [err, setErr] = useState('')
  const [slow, setSlow] = useState(false)
  const [tryN, setTryN] = useState(0)
  const cb = useRef({ onState, onReady }); cb.current = { onState, onReady }

  useEffect(() => {
    let dead = false
    const h = host.current
    setReady(false); setSlow(false); setErr('')
    // Quá 10 giây chưa sẵn sàng (mạng chậm, bị chặn quảng cáo...): cho bấm "Thử lại"
    // Lần đầu quá 12 giây: tự tạo lại trình phát 1 lần (host nocookie); sau đó mới hiện "Thử lại"
    const slowT = window.setTimeout(() => { if (!dead) { if (tryN === 0) setTryN(1); else setSlow(true) } }, 12000)
    loadYT(tryN > 0).then(YT => {
      if (dead || !h) return
      const el = document.createElement('div')
      h.appendChild(el)
      p.current = new YT.Player(el, {
        videoId, width: '100%', height: '100%',
        // lần thử lại dùng youtube-nocookie (ít bị trình chặn quảng cáo chặn hơn)
        host: tryN % 2 ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com',
        playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, start: Math.floor(start), origin: location.origin, cc_load_policy: cc ? 1 : 0, cc_lang_pref: 'vi', hl: 'vi' },
        events: {
          onReady: () => { if (import.meta.env.DEV) (window as any).__yt = p.current; if (!dead) { clearTimeout(slowT); setReady(true); setSlow(false); cb.current.onReady?.() } },
          onStateChange: (e: any) => {
            const s = e.data // -1 chưa chạy, 0 hết, 1 phát, 2 dừng, 3 đệm, 5 sẵn sàng
            if (s === 1) setStarted(true)
            const pl = s === 1 || s === 3
            setPlaying(pl); cb.current.onState?.(pl)
          },
          onError: (e: any) => setErr([100, 101, 150].includes(e.data) ? EMBED_BLOCKED : 'Không phát được video (lỗi ' + e.data + ')'),
        },
      })
    }).catch(() => { if (!dead) setSlow(true) })
    return () => { dead = true; clearTimeout(slowT); try { p.current?.destroy() } catch { /* */ } p.current = null; if (h) h.innerHTML = '' }
  }, [videoId, tryN, cc])

  useImperativeHandle(ref, () => ({
    play: () => p.current?.playVideo?.(),
    pause: () => p.current?.pauseVideo?.(),
    seek: (t: number) => p.current?.seekTo?.(Math.max(0, t), true),
    time: () => p.current?.getCurrentTime?.() ?? 0,
    setRate: (r: number) => p.current?.setPlaybackRate?.(r),
    rates: () => p.current?.getAvailablePlaybackRates?.() ?? [1],
    playing: () => { const s = p.current?.getPlayerState?.(); return s === 1 || s === 3 },
    ended: () => p.current?.getPlayerState?.() === 0,
    duration: () => p.current?.getDuration?.() ?? 0,
  }), [])

  return (
    <div className="player">
      <div className="player-host" ref={host} />
      {err ? <div className="cover"><div className="cover-msg">{err}</div></div>
        : !ready ? <div className="cover"><div className="cover-msg">
          {!slow ? 'Đang tải video…' : <>
            Video tải lâu quá 😕<br />
            <button className="primary" style={{ marginTop: 12 }} onClick={() => tryN >= 2 ? location.reload() : setTryN(n => n + 1)}>🔄 Thử lại</button>
            <div className="note" style={{ color: '#ddd', marginTop: 10, fontSize: 15 }}>Kiểm tra mạng. Nếu máy có chặn quảng cáo (Safari: Cài đặt → Safari → Tiện ích/Chặn nội dung) hãy tắt cho trang này.</div>
            <div style={{ color: '#aaa', marginTop: 6, fontSize: 12 }}>mã: YT{window.YT?.Player ? 1 : 0} · IF{host.current?.querySelector('iframe') ? 1 : 0} · L{tryN} · {navigator.onLine ? 'on' : 'off'}</div>
          </>}
        </div></div>
        : !started ? <>
          {/* Lần đầu: để trống giữa cho con chạm nút phát của video (iOS cần chạm thật) */}
          <div className="shield top" /><div className="shield bottom" />
          {ready && <button className="cover-play small" onClick={() => p.current?.playVideo()}>▶</button>}
        </>
        : playing ? <div className="shield full" />
        : <div className="cover"><button className="cover-play" onClick={() => onCoverPlay ? onCoverPlay() : p.current?.playVideo()}>▶</button></div>}
    </div>
  )
})
