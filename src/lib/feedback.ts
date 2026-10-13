/**
 * Respuesta sonora y táctil al marcar, para que el auxiliar no tenga que
 * mirar la pantalla en cada alumno:
 *  - ok: un tono agudo corto (a tiempo / acción guardada)
 *  - late: dos tonos medios (tardanza)
 *  - error: tono grave largo (inhabilitado, no autorizado o fallo)
 *  - undo: tono breve descendente (marca deshecha)
 */
export type FeedbackKind = 'ok' | 'late' | 'error' | 'undo'

type Tone = { freq: number; start: number; duration: number; type?: OscillatorType }

const TONES: Record<FeedbackKind, Tone[]> = {
  ok: [{ freq: 880, start: 0, duration: 0.12 }],
  late: [{ freq: 660, start: 0, duration: 0.1 }, { freq: 660, start: 0.16, duration: 0.1 }],
  error: [{ freq: 220, start: 0, duration: 0.35, type: 'square' }],
  undo: [{ freq: 600, start: 0, duration: 0.08 }, { freq: 420, start: 0.09, duration: 0.1 }],
}

const VIBRATION: Record<FeedbackKind, number[]> = {
  ok: [40],
  late: [60, 80, 60],
  error: [200, 100, 200],
  undo: [30],
}

// Un solo AudioContext reutilizado: los navegadores limitan cuántos se pueden crear.
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  audioContext = new AudioCtx()
  return audioContext
}

function playTones(kind: FeedbackKind) {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  for (const tone of TONES[kind]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const at = ctx.currentTime + tone.start
    osc.type = tone.type ?? 'sine'
    osc.frequency.value = tone.freq
    gain.gain.setValueAtTime(kind === 'error' ? 0.04 : 0.06, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + tone.duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(at)
    osc.stop(at + tone.duration)
  }
}

export function playFeedback(kind: FeedbackKind, options: { sound: boolean; vibration: boolean }) {
  // Ambos son opcionales: se ignoran en silencio si el navegador los bloquea.
  if (options.sound) {
    try { playTones(kind) } catch { /* sin audio */ }
  }
  if (options.vibration && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(VIBRATION[kind]) } catch { /* sin vibración */ }
  }
}
