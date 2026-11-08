// Ẩn chữ dần để con tự nhớ lời: 0 tắt, 1 ẩn ít, 2 ẩn nhiều, 3 chỉ còn chữ cái đầu.
export const MASK_LEVELS = ['Tắt', 'Ít', 'Nhiều', 'Chữ đầu'] as const

export function maskLine(text: string, level: number, seed: number): string {
  if (!level) return text
  return text.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w) || !w) return w
    const k = (i / 2 + seed) % 3
    const hide = level === 1 ? k === 1 : level === 2 ? k !== 0 : true
    if (!hide) return w
    if (level === 3) return w[0] + '…'
    return '＿'.repeat(Math.min(4, Math.max(2, Math.ceil(w.length / 2))))
  }).join('')
}
