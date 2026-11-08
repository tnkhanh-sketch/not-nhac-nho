import { useEffect, useRef, useState } from 'react'
import { db, getLines, meta, Line, Song } from '../db'
import { parseYouTube, checkEmbed, thumb, EMBED_BLOCKED } from '../yt'
import { go } from '../App'
import { findLyrics, parseLrc, plainLines, LyricHit } from '../lyrics'
import TranscriptPanel from './TranscriptPanel'
import { alignLyrics, parseTranscript, segsToLines, Timed } from '../transcript'

type Item = Pick<Line, 'text' | 'start' | 'end' | 'hard' | 'learned'> & { id?: string; key: string }
let k = 0
const mk = (text: string, o: Partial<Item> = {}): Item => ({ text, start: null, end: null, hard: false, learned: false, key: 'k' + k++, ...o })

export default function AddSong({ songId, importRaw }: { songId?: string; importRaw?: string }) {
  const [link, setLink] = useState('')
  const [beat, setBeat] = useState('')
  const [beatOk, setBeatOk] = useState<boolean | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [hits, setHits] = useState<LyricHit[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [timedNote, setTimedNote] = useState<LyricHit | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState('')
  const [embedOk, setEmbedOk] = useState<boolean | null>(null)
  const [song, setSong] = useState<Song | null>(null)
  const caret = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!songId) return
    ;(async () => {
      const s = await db.songs.get(songId)
      if (!s) return
      setSong(s); setLink('https://youtu.be/' + s.videoId + (s.startAt ? '?t=' + s.startAt : '')); setBeat(s.beatVideoId ? 'https://youtu.be/' + s.beatVideoId : ''); setTitle(s.title); setArtist(s.artist)
      const ls = await getLines(songId)
      setItems(ls.map(l => mk(l.text, { id: l.id, start: l.start, end: l.end, hard: l.hard, learned: l.learned })))
    })()
  }, [songId])

  const yt = parseYouTube(link)

  // Nhận dữ liệu từ nút "Lấy bản chép lời" trên YouTube: tự điền link, tên, tìm lời và chia câu khớp giờ
  const [importMsg, setImportMsg] = useState('')
  useEffect(() => {
    if (!importRaw?.startsWith('imp=')) return
    let d: { v: string; title?: string; tr: string }
    try { d = JSON.parse(decodeURIComponent(importRaw.slice(4))) } catch { setImportMsg('Dữ liệu nhận được bị lỗi, bố thử bấm lại nút nhé.'); return }
    history.replaceState(null, '', '#/add')
    setLink('https://youtu.be/' + d.v)
    if (d.title) setTitle(d.title)
    const segs = parseTranscript(d.tr || '')
    if (segs.length < 3) { setImportMsg('Chưa đọc được bản chép lời của video này.'); return }
    setImportMsg('Đang tìm lời chuẩn để khớp với bản chép lời…')
    ;(async () => {
      let best: { lines: Timed[]; matched: number; total: number; who: string } | null = null
      try {
        for (const h of (await findLyrics(d.title || '', '')).slice(0, 4)) {
          const ls = plainLines(h.plain || '')
          if (ls.length < 4) continue
          const r = alignLyrics(ls, segs)
          if (!best || r.matched / ls.length > best.matched / best.total) best = { ...r, total: ls.length, who: h.artist }
        }
      } catch { /* không có mạng tới LRCLIB: dùng bản chép lời */ }
      if (best && best.matched / best.total >= 0.6) {
        setItems(best.lines.map(x => mk(x.text, { start: x.start, end: x.end })))
        setImportMsg(`✅ Đã lấy lời chuẩn và chia ${best.total} câu khớp giờ video (khớp chắc ${best.matched} câu). Kiểm tra rồi bấm Lưu bài.`)
      } else {
        setItems(segsToLines(segs).map(x => mk(x.text, { start: x.start, end: x.end })))
        setImportMsg(`✅ Đã chia ${segs.length} câu theo bản chép lời của video. Có thể gộp/tách hoặc sửa chữ cho đúng rồi bấm Lưu bài.`)
      }
    })()
  }, [importRaw])
  const bt = beat.trim() ? parseYouTube(beat) : null
  useEffect(() => { setBeatOk(null); if (bt) checkEmbed(bt.id).then(r => setBeatOk(r.ok)) }, [bt?.id])
  useEffect(() => {
    setEmbedOk(null)
    if (!yt) return
    let dead = false
    checkEmbed(yt.id).then(r => {
      if (dead) return
      setEmbedOk(r.ok)
      if (r.ok && !songId) {
        setTitle(t => t || r.title || '')
        setArtist(a => a || r.author || '')
      }
    })
    return () => { dead = true }
  }, [yt?.id])

  const autoFind = async () => {
    if (!title.trim()) return setErr('Cần có tên bài trước (dán link để app tự điền)')
    setErr(''); setFinding(true); setHits(null)
    try { setHits(await findLyrics(title, artist)) } catch { setErr('Chưa tìm được, kiểm tra mạng rồi thử lại nhé') }
    setFinding(false)
  }
  const useHit = (h: LyricHit) => {
    setHits(null)
    const timed = h.synced ? parseLrc(h.synced) : []
    if (timed.length >= 3) {
      // có mốc thời gian: chia câu sẵn luôn
      setItems(timed.map(x => mk(x.text, { start: x.start, end: x.end })))
      setTimedNote(h)
    } else setLyrics(plainLines(h.plain).join(String.fromCharCode(10)))
  }
  const applyTimed = (ls: Timed[]) => { setItems(ls.map(x => mk(x.text, { start: x.start, end: x.end }))); setTimedNote(null) }
  const fmtD = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const splitLyrics = () => {
    const ls = lyrics.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (!ls.length) return setErr('Con dán lời bài hát vào ô trên nhé')
    setErr(''); setItems(ls.map(t => mk(t)))
  }

  const upd = (i: number, p: Partial<Item>) => setItems(it => it!.map((x, j) => j === i ? { ...x, ...p } : x))
  const merge = (i: number) => setItems(it => {
    const a = it![i], b = it![i + 1]
    return [...it!.slice(0, i), { ...a, text: a.text + ' ' + b.text, end: b.end }, ...it!.slice(i + 2)]
  })
  const split = (i: number) => setItems(it => {
    const a = it![i]
    let c = caret.current[a.key] ?? -1
    if (c <= 0 || c >= a.text.length) {
      // không có vị trí con trỏ: tách ở dấu cách giữa câu
      const mid = a.text.length / 2
      const sp = [...a.text].map((ch, j) => ch === ' ' ? j : -1).filter(j => j > 0)
      if (!sp.length) return it!
      c = sp.reduce((p, j) => Math.abs(j - mid) < Math.abs(p - mid) ? j : p)
    }
    const t1 = a.text.slice(0, c).trim(), t2 = a.text.slice(c).trim()
    if (!t1 || !t2) return it!
    return [...it!.slice(0, i), { ...a, text: t1, end: null }, mk(t2), ...it!.slice(i + 1)]
  })
  const remove = (i: number) => setItems(it => it!.filter((_, j) => j !== i))
  const addAfter = (i: number) => setItems(it => [...it!.slice(0, i + 1), mk(''), ...it!.slice(i + 1)])

  const save = async () => {
    if (!yt) return setErr('Link YouTube chưa đúng')
    if (embedOk === false) return setErr(EMBED_BLOCKED)
    if (!title.trim()) return setErr('Con nhập tên bài nhé')
    if (beat.trim() && !bt) return setErr('Link bản beat chưa đúng')
    if (bt && beatOk === false) return setErr('Bản beat: ' + EMBED_BLOCKED)
    const list = (items || []).filter(x => x.text.trim())
    if (!list.length) return setErr('Chưa có câu nào')
    const now = Date.now()
    const s: Song = song
      ? { ...song, videoId: yt.id, title: title.trim(), artist: artist.trim(), updatedAt: now }
      : { ...meta(), videoId: yt.id, title: title.trim(), artist: artist.trim() }
    const beatId = bt?.id ?? null
    if (beatId !== (song?.beatVideoId ?? null) || (song && song.videoId !== yt.id)) s.beatOffset = null // đổi video: căn lại beat
    s.beatVideoId = beatId
    s.startAt = yt.t || 0
    const videoChanged = song && song.videoId !== yt.id
    const old = song ? await getLines(song.id) : []
    const keep = new Set(list.map(x => x.id).filter(Boolean))
    await db.transaction('rw', db.songs, db.lines, async () => {
      await db.songs.put(s)
      for (const o of old) if (!keep.has(o.id)) await db.lines.update(o.id, { deletedAt: now, updatedAt: now })
      for (const [idx, x] of list.entries()) {
        const base = x.id ? old.find(o => o.id === x.id)! : { ...meta(), songId: s.id }
        await db.lines.put({
          ...base, idx, text: x.text.trim(), hard: x.hard, learned: x.learned, updatedAt: now,
          start: videoChanged ? null : x.start, end: videoChanged ? null : x.end,
        })
      }
    })
    const timed = !videoChanged && list.every(x => x.start != null && x.end != null)
    go((timed ? '/review/' : '/mark/') + s.id)
  }

  return (
    <div className="wrap">
      <div className="bar">
        <button onClick={() => go('/')}>← Về</button>
        <h2>{songId ? 'Sửa bài' : 'Thêm bài mới'}</h2>
      </div>
      {importMsg && <div className="panel" style={{ fontWeight: 600 }}>{importMsg}</div>}
      {!songId && !importMsg && <p className="note">💡 Mẹo: dùng nút <a href="#/getscript">📋 Lấy bản chép lời 1 chạm</a> trên YouTube để app tự điền và tự chia câu.</p>}
      <label>Link YouTube</label>
      <input value={link} onChange={e => setLink(e.target.value)} placeholder="Dán link youtube.com hoặc youtu.be" inputMode="url" />
      {link && !yt && <div className="err">Link chưa đúng, con kiểm tra lại nhé</div>}
      {embedOk === false && <div className="err">{EMBED_BLOCKED}</div>}
      {yt && <img src={thumb(yt.id)} alt="" style={{ width: 240, borderRadius: 12, marginTop: 8 }} />}
      <label>Tên bài</label>
      <input value={title} onChange={e => setTitle(e.target.value)} />
      <label>Ca sĩ</label>
      <input value={artist} onChange={e => setArtist(e.target.value)} />
      <label>Link bản beat / karaoke (không bắt buộc)</label>
      <input value={beat} onChange={e => setBeat(e.target.value)} placeholder="Tìm trên YouTube: tên bài + beat hoặc karaoke" inputMode="url" />
      {beat.trim() && !bt && <div className="err">Link bản beat chưa đúng</div>}
      {beatOk === false && <div className="err">Bản beat: {EMBED_BLOCKED}</div>}

      {!items ? <>
        <label>Lời bài hát (mỗi dòng 1 câu)</label>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="primary" disabled={finding} onClick={autoFind}>{finding ? 'Đang tìm…' : '🔎 Tìm lời tự động'}</button>
          <span className="note">hoặc dán lời vào ô bên dưới</span>
        </div>
        {hits && (hits.length ? <div className="panel" style={{ margin: '0 0 10px' }}>
          <b>Chọn bài đúng:</b>
          {hits.map(h => <div key={h.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid #f3dbe6', padding: '8px 0' }}>
            <span>{h.track} – <i>{h.artist}</i> · {fmtD(h.duration)} {h.synced ? '· ⏱ có mốc giờ' : ''}</span>
            <button onClick={() => useHit(h)}>Dùng lời này</button>
          </div>)}
          <button onClick={() => setHits(null)}>Không có bài đúng</button>
        </div> : <div className="err">Chưa tìm thấy lời bài này. Con thử sửa tên bài cho đúng rồi tìm lại, hoặc dán lời nhé.</div>)}
        <textarea value={lyrics} onChange={e => setLyrics(e.target.value)} placeholder="Dán lời vào đây..." />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary big" onClick={splitLyrics}>Tạo câu →</button>
        </div>
        <TranscriptPanel lyrics={plainLines(lyrics)} onApply={applyTimed} />
      </> : <>
        <TranscriptPanel lyrics={items.map(x => x.text).filter(Boolean)} onApply={applyTimed} />
        {timedNote && <div className="panel" style={{ margin: '8px 0' }}>⏱ Lời này có sẵn mốc thời gian (theo bản thu của <b>{timedNote.artist}</b>, dài {fmtD(timedNote.duration)}) nên đã chia câu xong.
          <br />⚠️ Nếu video là bản khác (hát live, cover, remix…) thì chữ sẽ lệch: sau khi lưu, ở trang <b>Rà soát</b> bấm ▶ rồi bấm <b>📍</b> ở vài câu khi ca sĩ bắt đầu hát, hoặc dùng <b>⏱ Chia lại theo video</b>.</div>}
        <label>Các câu ({items.length}) — ⤵ gộp với câu dưới, ✂ tách tại vị trí con trỏ</label>
        {items.map((x, i) => (
          <div className="edit-line" key={x.key}>
            <span className="note" style={{ width: 28 }}>{i + 1}</span>
            <input value={x.text} onChange={e => upd(i, { text: e.target.value })}
              onSelect={e => { caret.current[x.key] = (e.target as HTMLInputElement).selectionStart ?? -1 }} />
            <button title="Gộp với câu dưới" disabled={i === items.length - 1} onClick={() => merge(i)}>⤵</button>
            <button title="Tách" onClick={() => split(i)}>✂</button>
            <button title="Thêm câu" onClick={() => addAfter(i)}>＋</button>
            <button title="Xoá" onClick={() => remove(i)}>🗑</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          {!songId && <button onClick={() => setItems(null)}>← Dán lại lời</button>}
          <button className="primary big" onClick={save}>Lưu bài ✓</button>
        </div>
      </>}
      {err && <div className="err">{err}</div>}
    </div>
  )
}
