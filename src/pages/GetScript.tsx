import { useEffect, useRef, useState } from 'react'
import { go } from '../App'

// Chạy trên trang YouTube bố đang xem: mở "Hiện bản chép lời", đọc chữ + giờ, rồi mở Nốt Nhạc Nhỏ với dữ liệu đó.
// Chỉ đọc những gì đang hiện trên màn hình của chính bố (giống bôi đen + sao chép).
const APP = 'https://notnhacnho.bekind.vn/'
const SRC = `(async()=>{const W=t=>new Promise(r=>setTimeout(r,t));const q=s=>document.querySelectorAll(s);
const S='ytd-transcript-segment-renderer,ytm-transcript-segment-renderer,transcript-segment-view-model';
const u=new URL(location.href);const v=u.searchParams.get('v')||(location.pathname.match(/\\/(shorts|live)\\/([\\w-]{11})/)||[])[2];
if(!v){alert('Mở trang một video YouTube rồi bấm lại nhé');return}
if(!q(S).length){const e=document.querySelector('#description-inline-expander #expand,#expand,tp-yt-paper-button#expand');e&&e.click();await W(600);
const b=[...q('button,ytd-button-renderer,yt-button-shape button')].find(x=>/b\\u1ea3n ch\\u00e9p l\\u1eddi|transcript/i.test(x.textContent||x.getAttribute('aria-label')||''));b&&b.click();
for(let i=0;i<25&&!q(S).length;i++)await W(300)}
const g=[...q(S)];if(!g.length){alert('Video ch\\u01b0a c\\u00f3 b\\u1ea3n ch\\u00e9p l\\u1eddi, ho\\u1eb7c ch\\u01b0a m\\u1edf \\u0111\\u01b0\\u1ee3c. B\\u1ea5m \\u2026th\\u00eam \\u2192 Hi\\u1ec7n b\\u1ea3n ch\\u00e9p l\\u1eddi r\\u1ed3i b\\u1ea5m l\\u1ea1i n\\u00fat n\\u00e0y.');return}
const tr=g.map(s=>{const t=(s.querySelector('.segment-timestamp,[class*=timestamp]')||{}).textContent||'';const x=(s.querySelector('.segment-text,yt-formatted-string,[class*=text]')||s).textContent||'';return t.trim()+'\\n'+x.trim().replace(/\\s+/g,' ')}).join('\\n');
const ti=(document.querySelector('h1.ytd-watch-metadata,h1')||{}).textContent||document.title;
window.open('${APP}#/add/imp='+encodeURIComponent(JSON.stringify({v,title:ti.trim(),tr})),'_blank')})()`
export const BOOKMARKLET = 'javascript:' + encodeURIComponent(SRC.replace(/\n/g, ''))

export default function GetScript() {
  const a = useRef<HTMLAnchorElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { a.current?.setAttribute('href', BOOKMARKLET) }, [])
  const copy = async () => { try { await navigator.clipboard.writeText(BOOKMARKLET); setCopied(true) } catch { setCopied(false) } }
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="bar"><button onClick={() => go('/add')}>← Thêm bài</button><h2>📋 Lấy bản chép lời 1 chạm</h2></div>
      <div className="panel">
        <p>Nút này lấy <b>lời kèm thời gian</b> trong mục "Hiện bản chép lời" của video YouTube bố đang xem, rồi mở Nốt Nhạc Nhỏ để <b>tự điền và tự chia câu khớp video</b>. Chỉ cần cài một lần.</p>
        <h3>💻 Trên máy tính (Chrome, Edge, Safari)</h3>
        <ol className="steps">
          <li>Bật thanh dấu trang (Chrome: Ctrl+Shift+B).</li>
          <li>Kéo nút hồng này lên thanh dấu trang: <a ref={a} className="bm" onClick={e => e.preventDefault()}>📋 Nốt Nhạc Nhỏ</a></li>
          <li>Mở video trên YouTube, bấm dấu trang <b>📋 Nốt Nhạc Nhỏ</b>. Một tab mới mở ra với bài đã chia câu sẵn.</li>
        </ol>
        <h3>📱 Trên iPhone / iPad (Safari)</h3>
        <ol className="steps">
          <li>Bấm <button onClick={copy}>{copied ? '✅ Đã chép mã' : 'Chép mã nút'}</button></li>
          <li>Thêm dấu trang cho trang bất kỳ (nút Chia sẻ → Thêm dấu trang), đặt tên <b>📋 Nốt Nhạc Nhỏ</b>.</li>
          <li>Mở Dấu trang → Sửa → chọn dấu trang vừa tạo → xoá địa chỉ cũ, <b>dán mã</b> vào ô địa chỉ → Xong.</li>
          <li>Mở video trên <b>youtube.com trong Safari</b> (không phải app YouTube), gõ vào thanh địa chỉ chữ <b>📋</b> hoặc mở Dấu trang và chọn <b>📋 Nốt Nhạc Nhỏ</b>.</li>
        </ol>
        <p className="note">Nếu video không có bản chép lời (chủ kênh tắt phụ đề), nút sẽ báo. Khi đó dùng 🔎 Tìm lời tự động hoặc ⏱ Chia câu như cũ.</p>
      </div>
    </div>
  )
}
