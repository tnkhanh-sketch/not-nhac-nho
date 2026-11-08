# Nốt Nhạc Nhỏ

App học hát từ YouTube cho con: https://notnhacnho.bekind.vn

## Cách dùng nhanh
1. **+ Thêm bài**: dán link YouTube, dán lời (mỗi dòng 1 câu). Có thể thêm link **bản beat/karaoke**.
2. **⏱ Chia câu**: phát video, bấm nút to (hoặc phím cách) đúng lúc mỗi câu bắt đầu; câu cuối bấm "Hết bài". Sau đó **🔧 Rà soát** để chỉnh ±0,1 s.
3. **🎤 Học**: chạm câu để nhảy tới; chọn số lần lặp 1/2/3/5/∞; **Lặp A-B**: chạm câu A rồi câu B; 🐢 chậm; 🎙️ thu giọng và nghe lại.
4. **👩‍🏫 Cô giáo**: 4 bước mỗi câu, rồi chọn 😊 Thuộc rồi / 😐 Cần tập thêm.
5. **🎬 Biểu diễn**: bật camera, hát theo nhạc (beat nếu có), quay video, lưu/gửi.
6. **📺 TV**: màn hình lớn, chữ to. Phím: Space phát/dừng, ←/→ đổi câu, B beat, F toàn màn hình.
7. **👨 Bố** (mã 4 số): thống kê, nghe bản thu, **đồng bộ giữa các máy** bằng mã gia đình hoặc quét QR.

## Kỹ thuật
- Vite + React + TypeScript, Dexie (IndexedDB), YouTube IFrame API, PWA.
- Đồng bộ: Supabase (`supabase/schema.sql`), truy cập qua hàm `nnn_*` có kiểm tra mã gia đình; bảng đóng RLS.
- Đăng tự động bằng GitHub Actions lên GitHub Pages (tên miền `notnhacnho.bekind.vn`, CNAME ở Hostinger).
- Video biểu diễn chỉ lưu trên máy (không đồng bộ).
