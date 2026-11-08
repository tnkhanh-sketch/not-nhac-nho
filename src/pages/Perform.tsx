import { useEffect, useRef, useState } from 'react'
import { db, getLines, logEvent, meta, Line, Perf, Song } from '../db'
import { Player, PlayerApi } from '../Player'
import { startRec, Recording } from '../recorder'
import { go } from '../App'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export default function Perform({ songId }: { songId: string }) {
  const [song, setSong] = useState<Song>()
  const [raw, setRaw] = useState<Line[]>([])
  const [useBeat, setUseBeat] = useState(false)
  const [cam, setCam] = useState<MediaStream | null>(null)
  const [err, setErr] = useState('')
  const [recOn, setRecOn] = useState(false)
  const [now, setNow] = useState(0)
  const [perfs, setPerfs] = useState<Perf[]>([])
  const [watch, setWatch] = useState<{ id: string; url: string } | null>(null)
  const watchRef = useRef<string | null>(null); watchRef.current = watch?.url ?? null
  const pl = useRef<PlayerApi>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const rec = useRef<{ stop: () => Promise<Recording> } | null>(null)
  const camRef = useRef<MediaStream | null>(null)
  const recAt = useRef(0)
  const [vidStarted, setVidStarted] = useState(false)

  const beatReady = !!song?.beatVideoId && song.beatOffset != null
  const off = useBeat && beatReady ? song!.beatOffset! : 0
  const lines = raw.map(l => ({ ...l, start: l.start! + off, end: l.end! + off }))
  const endAt = lines.length ? lines[lines.length - 1].end + 3 : Infinity

  const loadPerfs = () => db.performances.where('songId').equals(songId).toArray()
    .then(ps => setPerfs(ps.filter(p => !p.deletedAt).sort((a, b) => b.createdAt - a.createdAt)))
  useEffect(() => {
    db.songs.get(songId).then(s => { setSong(s); if (s?.beatVideoId && s.beatOffset != null) setUseBeat(true) })
    getLines(songId).then(ls => setRaw(ls.filter(l => l.start != null && l.end != null)))
    loadPerfs()
    return () => { camRef.current?.getTracks().forEach(t => t.stop()); if (watchRef.current) URL.revokeObjectURL(watchRef.current) }
  }, [songId])
  useEffect(() => { if (preview.current && cam) { preview.current.srcObject = cam; preview.current.play().catch(() => {}) } }, [cam])

  // đọc thời gian video; tự dừng quay khi hết bài
  const recOnRef = useRef(false); recOnRef.current = recOn
  useEffect(() => {
    const iv = setInterval(() => {
      const t = pl.current?.time() ?? 0; setNow(t)
      const dur = pl.current?.duration() ?? 0
      const over = t > Math.min(endAt, dur > 0 ? dur - 0.3 : Infinity) || (!!pl.current?.ended() && Date.now() - recAt.current > 2500)
      if (recOnRef.current && over) stop()
    }, 100)
    return () => clearInterval(iv)
  })

  const openCam = async () => {
    setErr('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: false, noiseSuppression: false } })
      camRef.current = s; setCam(s)
    } catch { setErr('Chưa mở được camera/micro. Bố cho phép dùng camera và micro nhé.') }
  }
  const start = async () => {
    if (!cam) return
    rec.current = startRec(cam, true); setRecOn(true); recAt.current = Date.now()
    const p = pl.current!
    p.setRate(1); p.seek(Math.max(0, (lines[0]?.start ?? 0) - 4)); p.play()
  }
  const stop = async () => {
    const r = rec.current; if (!r) return
    rec.current = null; setRecOn(false); pl.current?.pause()
    const out = await r.stop()
    if (out.blob.size < 2000) return setErr('Chưa quay được, con thử lại nhé')
    const perf: Perf = { ...meta(), songId, blob: out.blob, mime: out.mime, seconds: Math.round(out.seconds), beat: useBeat && beatReady }
    try {
      await db.performances.put(perf)
      await logEvent({ songId, lineId: null, type: 'practice', seconds: perf.seconds })
      loadPerfs()
    } catch {
      setErr('Máy hết chỗ trống nên chưa lưu được trong app. Bấm "Lưu / Gửi" bên dưới để giữ video này.')
      setPerfs(ps => [perf, ...ps])
    }
  }

  const view = (p: Perf) => { if (watch) URL.revokeObjectURL(watch.url); setWatch({ id: p.id, url: URL.createObjectURL(p.blob) }) }
  const share = async (p: Perf) => {
    const ext = p.mime.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([p.blob], `${song?.title || 'bieu-dien'}-${new Date(p.createdAt).toLocaleDateString('sv')}.${ext}`, { type: p.mime.split(';')[0] })
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: song?.title }) } catch { /* huỷ */ } return }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 30000)
  }
  const del = async (p: Perf) => {
    if (!confirm('Xoá video biểu diễn này?')) return
    await db.performances.update(p.id, { deletedAt: Date.now(), updatedAt: Date.now() }); loadPerfs()
  }

  if (!song) return null
  let cur = -1
  for (let i = 0; i < lines.length; i++) { if (lines[i].start <= now + 0.05) cur = i; else break }
  const curL = lines[cur], nextL = lines[cur + 1] ?? (cur < 0 ? lines[0] : undefined)
  const p = curL ? Math.max(0, Math.min(1, (now - curL.start) / (curL.end - curL.start))) : 0

  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => { if (!recOn) go('/') }}>← Về</button>
        <h2>🎬 Biểu diễn: {song.title}</h2>
        {beatReady && <button className={useBeat ? 'on' : ''} disabled={recOn} onClick={() => setUseBeat(!useBeat)}>{useBeat ? '🎵 Beat' : '🎤 Có lời'}</button>}
      </div>
      <div className="perform">
        <div className="perform-media">
          <Player key={useBeat && beatReady ? 'b' : 'o'} ref={pl} videoId={useBeat && beatReady ? song.beatVideoId! : song.videoId} onState={p => { if (p) setVidStarted(true) }} />
          <div className="cam">
            {cam ? <video ref={preview} playsInline muted /> : <button className="primary big" onClick={openCam}>📷 Bật camera</button>}
            {recOn && <span className="recdot">● REC</span>}
          </div>
        </div>
        <div className="karaoke">
          <div className="k-cur"><span className="fill" style={{ ['--p' as string]: (p * 100).toFixed(1) + '%' }}>{curL?.text ?? '🎵'}</span></div>
          <div className="k-next">{nextL && nextL !== curL ? nextL.text : ''}</div>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="controls">
          {!recOn ? <button className="primary big" disabled={!cam || !vidStarted} onClick={start}>🔴 Bắt đầu biểu diễn</button>
            : <button className="big recording" onClick={stop}>⏹ Dừng quay</button>}
        </div>
        {cam && !vidStarted && <p className="note">Bấm ▶ trên video một lần để nhạc sẵn sàng, rồi bấm "Bắt đầu biểu diễn".</p>}
        {!cam && <p className="note">Đặt máy ở chỗ chắc chắn, bấm "Bật camera", rồi "Bắt đầu biểu diễn". Nhạc sẽ phát từ trước câu đầu 4 giây.</p>}
      </div>

      <div className="panel">
        <h3>Các lần biểu diễn ({perfs.length})</h3>
        {!perfs.length && <p className="note">Chưa có video nào.</p>}
        {perfs.map(x => <div className="rev" key={x.id}>
          <div className="row">
            <span>{new Date(x.createdAt).toLocaleString('vi-VN')} · {fmt(x.seconds)} {x.beat ? '· 🎵 beat' : ''}</span>
            <button onClick={() => view(x)}>▶ Xem</button>
            <button onClick={() => share(x)}>📤 Lưu / Gửi</button>
            <button onClick={() => del(x)}>🗑</button>
          </div>
          {watch?.id === x.id && <video src={watch.url} controls playsInline style={{ width: '100%', maxWidth: 560, borderRadius: 12, marginTop: 8 }} />}
        </div>)}
      </div>
    </div>
  )
}
