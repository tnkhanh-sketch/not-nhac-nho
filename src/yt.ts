export function parseYouTube(url: string): { id: string; t: number } | null {
  const s = url.trim()
  if (/^[\w-]{11}$/.test(s)) return { id: s, t: 0 }
  let u: URL
  try { u = new URL(s.startsWith('http') ? s : 'https://' + s) } catch { return null }
  const host = u.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
  else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    if (u.pathname === '/watch') id = u.searchParams.get('v')
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/)
      if (m) id = m[2]
    }
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null
  const tr = u.searchParams.get('t') || u.searchParams.get('start') || ''
  let t = 0
  const m = tr.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  if (m) t = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0))
  return { id, t }
}

export const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`

/** Kiểm tra video có cho nhúng không, kèm tên/ca sĩ (best effort). */
export async function checkEmbed(id: string): Promise<{ ok: boolean | null; title?: string; author?: string }> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`)
    if (r.status === 401 || r.status === 403) return { ok: false }
    if (r.status === 404 || r.status === 400) return { ok: false }
    if (!r.ok) return { ok: null }
    const j = await r.json()
    return { ok: true, title: j.title, author: j.author_name }
  } catch { return { ok: null } }
}

declare global { interface Window { YT: any; onYouTubeIframeAPIReady?: () => void } }
let apiP: Promise<any> | null = null
export function loadYT(): Promise<any> {
  if (apiP) return apiP
  apiP = new Promise(res => {
    if (window.YT?.Player) return res(window.YT)
    window.onYouTubeIframeAPIReady = () => res(window.YT)
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return apiP
}

export const EMBED_BLOCKED = 'Video này không cho phát trong app, con tìm bản khác nhé'
