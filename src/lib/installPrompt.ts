/**
 * Instalación de la app (PWA). El navegador avisa con `beforeinstallprompt` una sola vez y
 * puede hacerlo antes de iniciar sesión, cuando la pantalla principal aún no existe: por eso
 * el aviso se captura al arrancar (main.tsx) y se guarda aquí hasta que alguien lo use.
 */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

export type InstallSnapshot = { prompt: InstallPromptEvent | null; installed: boolean }

function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

let snapshot: InstallSnapshot = { prompt: null, installed: false }
const listeners = new Set<() => void>()

function update(next: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

let captured = false
export function captureInstallPrompt() {
  if (captured) return
  captured = true
  snapshot = { prompt: null, installed: isStandalone() }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    update({ prompt: event as InstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => update({ prompt: null, installed: true }))
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getInstallSnapshot(): InstallSnapshot {
  return snapshot
}

/** Abre el diálogo del sistema. true si el usuario aceptó instalar. */
export async function runInstallPrompt(): Promise<boolean> {
  const event = snapshot.prompt
  if (!event) return false
  await event.prompt()
  const result = await event.userChoice
  // El aviso solo se puede usar una vez.
  update({ prompt: null, installed: result.outcome === 'accepted' ? true : snapshot.installed })
  return result.outcome === 'accepted'
}

// ---- Invitación: cuándo y cómo mostrarla (funciones puras, con pruebas) ------------------

export type InstallPlatform = 'prompt' | 'ios' | 'android-menu' | 'none'

/** Cómo se puede instalar en este equipo: con el diálogo del sistema o con pasos manuales. */
export function detectInstallPlatform(userAgent: string, hasPrompt: boolean, touchPoints = 0): InstallPlatform {
  if (hasPrompt) return 'prompt'
  // iPadOS 13+ se presenta como Mac, pero tiene pantalla táctil.
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios'
  if (/android/i.test(userAgent)) return 'android-menu'
  return 'none'
}

export type InviteMemory = { count: number; until: number }

const DAY_MS = 24 * 60 * 60 * 1000
const MEMORY_KEY = 'tesla-install-invite-v1'

/** Cada "Ahora no" retrasa más la invitación: 7 días la primera vez y 90 después. */
export function nextInviteMemory(previous: InviteMemory, now: number): InviteMemory {
  const count = previous.count + 1
  return { count, until: now + (count >= 2 ? 90 : 7) * DAY_MS }
}

export function inviteAllowed(memory: InviteMemory, now: number): boolean {
  return now >= memory.until
}

export function readInviteMemory(): InviteMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? 'null') as Partial<InviteMemory> | null
    if (raw && Number.isFinite(raw.count) && Number.isFinite(raw.until)) return { count: Number(raw.count), until: Number(raw.until) }
  } catch { /* sin memoria guardada */ }
  return { count: 0, until: 0 }
}

export function saveInviteMemory(memory: InviteMemory) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memory)) } catch { /* modo privado: se volverá a mostrar */ }
}
