import { useState } from 'react'
import { alignLyrics, parseTranscript, segsToLines, Timed } from '../transcript'

/** Dán bản chép lời có thời gian của YouTube để tự chia câu và đặt mốc. */
export default function TranscriptPanel({ lyrics, onApply }: { lyrics: string[]; onApply: (lines: Timed[]) => void }) {
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [msg, setMsg] = useState('')
  const apply = () => {
    const segs = parseTranscript(raw)
    if (segs.length < 3) return setMsg('Chưa đọc được thời gian. Dán cả phần có số giờ như "0:33" nhé.')
    if (lyrics.length) {
      const r = alignLyrics(lyrics, segs)
      onApply(r.lines)
      setMsg(`Đã khớp ${r.matched}/${lyrics.length} câu theo bản chép lời${r.matched < lyrics.length ? '; các câu còn lại được ước lượng, kiểm tra lại ở Rà soát' : ''}.`)
    } else {
      onApply(segsToLines(segs))
      setMsg(`Đã tạo ${segs.length} câu từ bản chép lời. Có thể gộp/tách câu bên dưới.`)
    }
    setOpen(false); setRaw('')
  }
  return (
    <div className="panel" style={{ margin: '10px 0' }}>
      {!open ? <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>📋 Có <b>bản chép lời YouTube</b> (kèm giờ)? Dán vào để tự chia câu khớp video.</span>
        <button className="primary" onClick={() => setOpen(true)}>Dán bản chép lời</button>
      </div> : <>
        <b>Dán bản chép lời có thời gian</b>
        <ol className="steps note" style={{ margin: '6px 0' }}>
          <li>Trên máy tính, mở video trên YouTube, bấm <b>…thêm</b> ở phần mô tả → <b>Hiện bản chép lời</b>.</li>
          <li>Bôi đen toàn bộ khung bản chép lời (có các số giờ như 0:33) → <b>Sao chép</b>.</li>
          <li>Dán vào ô dưới rồi bấm <b>Khớp thời gian</b>. (Cũng nhận file phụ đề .srt / .vtt dạng chữ.)</li>
        </ol>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={'0:33\nThời gian trôi qua mau\n0:38\nchỉ còn lại những kỉ niệm…'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={apply}>⏱ Khớp thời gian</button>
          <button onClick={() => { setOpen(false); setRaw('') }}>Huỷ</button>
        </div>
      </>}
      {msg && <p className="note" style={{ fontWeight: 600 }}>{msg}</p>}
    </div>
  )
}
