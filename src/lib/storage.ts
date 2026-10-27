import { toDateKey } from '@/lib/dates'

export function getTodayKey() {
  return toDateKey()
}

export function getCurrentTime() {
  return new Date().toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export type ThemePreference = 'light' | 'dark' | 'system'
export type InterfaceSize = 'normal' | 'large'

export type UserPreferences = {
  theme: ThemePreference
  interfaceSize: InterfaceSize
  soundEnabled: boolean
  vibrationEnabled: boolean
  /** Deslizar la tarjeta de un alumno (celular): derecha marca entrada/salida, izquierda falta o "Más". */
  swipeActionsEnabled: boolean
  /** Sin animaciones ni desenfoques: para celulares de gama baja. */
  lowPowerMode: boolean
  rememberClassroom: boolean
  lastClassroomId: string | null
}

const PREFERENCES_KEY = 'tesla-control-preferences-v1'

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  interfaceSize: 'normal',
  soundEnabled: true,
  vibrationEnabled: true,
  swipeActionsEnabled: true,
  lowPowerMode: false,
  rememberClassroom: true,
  lastClassroomId: null,
}

export function getPreferences(): UserPreferences {
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(preferences: UserPreferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
  return preferences
}

export function resetPreferences() {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(DEFAULT_PREFERENCES))
  return DEFAULT_PREFERENCES
}
