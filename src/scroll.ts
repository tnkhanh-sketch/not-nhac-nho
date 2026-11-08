/** Cuộn câu đang hát vào giữa khung lời (.side có position: relative), không cuộn cả trang. */
export function centerInParent(el: HTMLElement | null) {
  const box = el?.parentElement
  if (!el || !box) return
  const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2
  box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}
