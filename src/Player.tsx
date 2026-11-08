import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { loadYT, EMBED_BLOCKED } from './yt'

export interface PlayerApi {
  play(): void; pause(): void; seek(t: number): void; time(): number
  setRate(r: number): void; rates(): number[]; playing(): boolean
}

interface Props { videoId: string; start?: number; onState?: (playing: boolean) => void; onReady?: () => void }

/** YouTube player có lớp phủ: không bấm được sang YouTube, che video khi dừng/hết. */
export const Player = forwardRef<PlayerApi, Props>(function Player({ videoId, start = 0, onState, onReady }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const p = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [err, setErr] = useState('')
  const cb = useRef({ onState, onReady }); cb.current = { onState, onReady }

  useEffect(() => {
    let dead = false
    const h = host.current
    loadYT().then(YT => {
      if (dead || !h) return
      const el = document.createElement('div')
      h.appendChild(el)
      p.current = new YT.Player(el, {
        videoId, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, start: Math.floor(start), origin: location.origin },
        events: {
          onReady: () => { if (!dead) { setReady(true); cb.current.onReady?.() } },
          onStateChange: (e: any) => {
            const s = e.data // -1 chưa chạy, 0 hết, 1 phát, 2 dừng, 3 đệm, 5 sẵn sàng
            if (s === 1) setStarted(true)
            const pl = s === 1 || s === 3
            setPlaying(pl); cb.current.onState?.(pl)
          },
          onError: (e: any) => setErr([100, 101, 150].includes(e.data) ? EMBED_BLOCKED : 'Không phát được video (lỗi ' + e.data + ')'),
        },
      })
    })
    return () => { dead = true; try { p.current?.destroy() } catch { /* */ } p.current = null; if (h) h.innerHTML = '' }
  }, [videoId])

  useImperativeHandle(ref, () => ({
    play: () => p.current?.playVideo?.(),
    pause: () => p.current?.pauseVideo?.(),
    seek: (t: number) => p.current?.seekTo?.(Math.max(0, t), true),
    time: () => p.current?.getCurrentTime?.() ?? 0,
    setRate: (r: number) => p.current?.setPlaybackRate?.(r),
    rates: () => p.current?.getAvailablePlaybackRates?.() ?? [1],
    playing: () => { const s = p.current?.getPlayerState?.(); return s === 1 || s === 3 },
  }), [])

  return (
    <div className="player">
      <div className="player-host" ref={host} />
      {err ? <div className="cover"><div className="cover-msg">{err}</div></div>
        : !started ? <>
          {/* Lần đầu: để trống giữa cho con chạm nút phát của video (iOS cần chạm thật) */}
          <div className="shield top" /><div className="shield bottom" />
          {ready && <button className="cover-play small" onClick={() => p.current?.playVideo()}>▶</button>}
        </>
        : playing ? <div className="shield full" />
        : <div className="cover"><button className="cover-play" onClick={() => p.current?.playVideo()}>▶</button></div>}
    </div>
  )
})
