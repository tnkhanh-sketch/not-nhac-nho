// Tài khoản: tên + số điện thoại + PIN. Đăng nhập xong máy tự đồng bộ theo mã của tài khoản.
import { getFamilyCode, rpc, setFamilyCode, syncNow } from './sync'

export interface Account { name: string; phone: string }
const KEY = 'account'
export function getAccount(): Account | null {
  try { const a = JSON.parse(localStorage.getItem(KEY) || 'null'); return a?.phone ? a : null } catch { return null }
}
const ERR: Record<string, string> = {
  phone: 'Số điện thoại chưa đúng', pin: 'Mã PIN chưa đúng (4–6 chữ số)', name: 'Nhập tên nhé',
  exists: 'Số này đã có tài khoản, hãy chọn "Đăng nhập"', nouser: 'Chưa có tài khoản với số này, hãy chọn "Tạo tài khoản"',
  locked: 'Nhập sai nhiều lần, thử lại sau 15 phút nhé',
}
function done(r: any): Account {
  if (!r || r.error) throw new Error(ERR[r?.error] || 'Có lỗi, thử lại nhé')
  const acc = { name: r.name, phone: r.phone }
  localStorage.setItem(KEY, JSON.stringify(acc))
  if (getFamilyCode() !== r.code) setFamilyCode(r.code) // đồng bộ lại toàn bộ theo tài khoản (gộp với dữ liệu đang có)
  syncNow().catch(() => {})
  return acc
}
export async function register(name: string, phone: string, pin: string) {
  return done(await rpc('nnn_user_register', { phone, name, pin, code: getFamilyCode() || '' }))
}
export async function login(phone: string, pin: string) {
  return done(await rpc('nnn_user_login', { phone, pin }))
}
export function logout() {
  localStorage.removeItem(KEY)
  setFamilyCode(null)
}

// ---- Gửi bài cho bạn ----
export interface InboxItem { id: string; from_name: string; title: string; created_at: string }
export async function sendSong(toPhone: string, title: string, payload: object): Promise<string> {
  const r = await rpc('nnn_share_send', { code: getFamilyCode(), to_phone: toPhone, title, payload })
  if (r?.error) throw new Error({ login: 'Cần đăng nhập trước', nouser: 'Số này chưa có tài khoản Nốt Nhạc Nhỏ', large: 'Bài quá dài', rate: 'Gửi nhiều quá, thử lại sau nhé' }[r.error as string] || 'Chưa gửi được')
  return r.to as string
}
export const inbox = (): Promise<InboxItem[]> => getFamilyCode() ? rpc('nnn_share_inbox', { code: getFamilyCode() }) : Promise.resolve([])
export const takeInbox = (id: string, keep: boolean) => rpc('nnn_share_take', { code: getFamilyCode(), sid: id, keep })
