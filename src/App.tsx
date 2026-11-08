import { useEffect, useState } from 'react'
import Home from './pages/Home'
import AddSong from './pages/AddSong'

export const go = (h: string) => { location.hash = h }

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const f = () => setH(location.hash)
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return h.replace(/^#\/?/, '').split('/')
}

export default function App() {
  const [page, id] = useHash()
  switch (page) {
    case 'add': return <AddSong />
    case 'edit': return <AddSong key={id} songId={id} />
    default: return <Home />
  }
}
