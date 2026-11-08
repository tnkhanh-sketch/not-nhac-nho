import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { startAutoSync } from './sync'
import './styles.css'

registerSW({ immediate: true })
startAutoSync()
// Xin trình duyệt giữ dữ liệu lâu dài (Safari có thể xoá dữ liệu web ít dùng)
navigator.storage?.persist?.().catch(() => {})
createRoot(document.getElementById('root')!).render(<App />)
