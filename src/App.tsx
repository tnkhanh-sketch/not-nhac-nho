import { useEffect, useState } from 'react'
import Home from './pages/Home'
import AddSong from './pages/AddSong'
import Mark from './pages/Mark'
import Review from './pages/Review'
import Learn from './pages/Learn'
import Parent from './pages/Parent'
import Join from './pages/Join'
import Perform from './pages/Perform'
import TV from './pages/TV'
import Quiz from './pages/Quiz'

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
    case 'mark': return <Mark key={id} songId={id} />
    case 'review': return <Review key={id} songId={id} />
    case 'learn': return <Learn key={'l' + id} songId={id} />
    case 'bo': return <Parent />
    case 'join': return <Join raw={id} />
    case 'show': return <Perform key={id} songId={id} />
    case 'tv': return <TV key={id} songId={id} />
    case 'quiz': return <Quiz key={id} songId={id} />
    case 'teach': return <Learn key={'t' + id} songId={id} teach />
    default: return <Home />
  }
}
