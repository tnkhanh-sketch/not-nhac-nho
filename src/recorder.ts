// Thu âm bằng micro (MediaRecorder). Giữ micro mở trong lúc ở trang học để lần thu sau bắt đầu ngay.
let stream: MediaStream | null = null

export async function getMic(): Promise<MediaStream> {
  if (stream && stream.active) return stream
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  return stream
}

export function releaseMic() {
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}

const pickMime = () =>
  ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || ''

export interface Recording { blob: Blob; mime: string; seconds: number }

const pickVideoMime = () =>
  ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || ''

export function startRec(s: MediaStream, video = false): { stop: () => Promise<Recording> } {
  const mime = video ? pickVideoMime() : pickMime()
  const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
  const chunks: Blob[] = []
  const t0 = Date.now()
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  mr.start()
  return {
    stop: () => new Promise(res => {
      mr.onstop = () => {
        const type = mr.mimeType || mime || (video ? 'video/webm' : 'audio/webm')
        res({ blob: new Blob(chunks, { type }), mime: type, seconds: (Date.now() - t0) / 1000 })
      }
      if (mr.state !== 'inactive') mr.stop()
    }),
  }
}

export const canRecord = () => !!navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices && 'MediaRecorder' in window
