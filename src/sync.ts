// Đồng bộ với Supabase bằng "mã gia đình". Bản ghi mới hơn (updatedAt) thì thắng.
import { db, Rec } from './db'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON as string | undefined
export const syncConfigured = () => !!URL_ && !!KEY

const LS = { code: 'familyCode', push: 'sync.lastPush', seq: 'sync.seq', at: 'sync.at' }
const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const set = (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* */ } }

export const getFamilyCode = () => get(LS.code)
export const lastSyncAt = () => Number(get(LS.at) || 0)

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newFamilyCode() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  const s = [...b].map(x => ALPHA[x % ALPHA.length]).join('')
  return s.match(/.{4}/g)!.join('-')
}
export function normalizeCode(c: string) {
  const s = c.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s.length === 16 ? s.match(/.{4}/g)!.join('-') : null
}
export function setFamilyCode(code: string | null) {
  set(LS.code, code); set(LS.push, null); set(LS.seq, null); set(LS.at, null)
}

async function rpc(fn: string, args: object) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`)
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

export const toB64 = (b: Blob) => new Promise<string>((res, rej) => {
  const fr = new FileReader()
  fr.onload = () => res(String(fr.result).split(',')[1] || '')
  fr.onerror = rej
  fr.readAsDataURL(b)
})
export const fromB64 = (s: string, type: string) => {
  const bin = atob(s); const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return new Blob([a], { type })
}

type Kind = 'songs' | 'lines' | 'events' | 'recordings'
const KINDS: Kind[] = ['songs', 'lines', 'events', 'recordings']
let running: Promise<{ pushed: number; pulled: number } | null> | null = null

export function syncNow() {
  if (!running) running = doSync().finally(() => { running = null })
  return running
}

async function doSync(): Promise<{ pushed: number; pulled: number } | null> {
  const code = getFamilyCode()
  if (!code || !syncConfigured() || !navigator.onLine) return null
  const started = Date.now()
  const since = Number(get(LS.push) || 0)

  // 1) Đẩy lên
  const items: { kind: Kind; id: string; updatedAt: number; data: object }[] = []
  for (const k of KINDS) {
    const rows = await db.table(k).where('updatedAt').above(since).toArray()
    for (const r of rows) {
      if (k === 'recordings') {
        const { blob, ...m } = r as Rec
        if (!m.deletedAt) await rpc('nnn_audio_put', { code, rid: r.id, b64: await toB64(blob) })
        items.push({ kind: k, id: r.id, updatedAt: r.updatedAt, data: m })
      } else items.push({ kind: k, id: r.id, updatedAt: r.updatedAt, data: r })
    }
  }
  for (let i = 0; i < items.length; i += 200) await rpc('nnn_push', { code, items: items.slice(i, i + 200) })
  set(LS.push, String(started))

  // 2) Kéo về
  let seq = Number(get(LS.seq) || 0), pulled = 0
  for (;;) {
    const rows: { kind: Kind; id: string; updated_at: number; data: any; seq: number }[] = await rpc('nnn_pull', { code, since: seq })
    for (const r of rows) {
      seq = Math.max(seq, r.seq)
      const t = db.table(r.kind)
      const local = await t.get(r.id)
      if (local && local.updatedAt >= r.updated_at) continue
      if (r.kind === 'recordings') {
        const b64: string | null = await rpc('nnn_audio_get', { code, rid: r.id })
        if (!b64) continue
        await t.put({ ...r.data, blob: fromB64(b64, r.data.mime) })
      } else await t.put(r.data)
      pulled++
    }
    set(LS.seq, String(seq))
    if (rows.length < 2000) break
  }
  set(LS.at, String(Date.now()))
  if (pulled) window.dispatchEvent(new Event('nnn-synced'))
  return { pushed: items.length, pulled }
}

/** Tự đồng bộ: lúc mở app, mỗi 30 giây, và khi chuyển ra/vào app. */
export function startAutoSync() {
  const run = () => { syncNow().catch(e => console.warn('sync', e)) }
  run()
  setInterval(run, 30000)
  document.addEventListener('visibilitychange', run)
  window.addEventListener('online', run)
}
