import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { startAutoSync } from './sync'
import './styles.css'

registerSW({ immediate: true })
startAutoSync()
createRoot(document.getElementById('root')!).render(<App />)
