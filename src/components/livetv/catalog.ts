import { BarChart3, Clock3, LayoutDashboard, ShieldAlert, Users } from 'lucide-react'

export type CardSize = 'sm' | 'md' | 'lg'
export type CardKind =
  | 'metrics'
  | 'recentEntries'
  | 'lateStudents'
  | 'lateByGrade'
  | 'lateByPrimaria'
  | 'lateBySecundaria'
  | 'todayIncidents'
  | 'topIncidents'
  | 'topStudents'
  | 'attendanceSummary'
  | 'exitSummary'
  | 'presentationCompliance'
  | 'pendingStudents'
  | 'classroomSummary'
  | 'incidentsByClassroom'

export type LayoutCard = {
  id: string
  kind: CardKind
  size: CardSize
}

export const STORAGE_KEY = 'tesla-live-tv-layout-v2'
export const MOBILE_STORAGE_KEY = 'tesla-live-tv-layout-mobile-v1'
export const DEFAULT_LAYOUT: LayoutCard[] = [
  { id: 'metrics', kind: 'metrics', size: 'lg' },
  { id: 'recentEntries', kind: 'recentEntries', size: 'md' },
  { id: 'lateStudents', kind: 'lateStudents', size: 'md' },
  { id: 'todayIncidents', kind: 'todayIncidents', size: 'lg' },
  { id: 'topIncidents', kind: 'topIncidents', size: 'sm' },
  { id: 'topStudents', kind: 'topStudents', size: 'sm' },
]
// En celular lo primero son las tardanzas; las cifras generales ya van fijas arriba.
export const MOBILE_DEFAULT_LAYOUT: LayoutCard[] = [
  { id: 'lateByGrade', kind: 'lateByGrade', size: 'lg' },
  { id: 'attendanceSummary', kind: 'attendanceSummary', size: 'md' },
  { id: 'recentEntries', kind: 'recentEntries', size: 'md' },
  { id: 'todayIncidents', kind: 'todayIncidents', size: 'lg' },
  { id: 'pendingStudents', kind: 'pendingStudents', size: 'md' },
  { id: 'classroomSummary', kind: 'classroomSummary', size: 'lg' },
]

export type TabId = 'tardanzas' | 'resumen' | 'incidencias' | 'pendientes' | 'aulas'
export const TABS: Array<{ id: TabId; label: string; icon: typeof Clock3; kinds: CardKind[] }> = [
  { id: 'tardanzas', label: 'Tardanzas', icon: Clock3, kinds: ['lateByGrade', 'lateByPrimaria', 'lateBySecundaria', 'lateStudents'] },
  { id: 'resumen', label: 'Resumen', icon: BarChart3, kinds: ['metrics', 'attendanceSummary', 'recentEntries', 'exitSummary', 'presentationCompliance'] },
  { id: 'incidencias', label: 'Incidencias', icon: ShieldAlert, kinds: ['todayIncidents', 'topIncidents', 'topStudents', 'incidentsByClassroom'] },
  { id: 'pendientes', label: 'Pendientes', icon: Users, kinds: ['pendingStudents'] },
  { id: 'aulas', label: 'Aulas', icon: LayoutDashboard, kinds: ['classroomSummary'] },
]
export const tabOfKind = (kind: CardKind): TabId => TABS.find((item) => item.kinds.includes(kind))?.id ?? 'resumen'

export const CATALOG: Array<{ kind: CardKind; title: string; description: string; defaultSize: CardSize }> = [
  { kind: 'metrics', title: 'Métricas generales', description: 'Resumen de alumnos, ingresos, tardanzas y pendientes.', defaultSize: 'lg' },
  { kind: 'recentEntries', title: 'Últimos ingresos', description: 'Últimos alumnos que registraron ingreso.', defaultSize: 'md' },
  { kind: 'lateStudents', title: 'Alumnos con tardanza', description: 'Lista completa del día, ordenada por hora.', defaultSize: 'md' },
  { kind: 'lateByGrade', title: 'Tardanzas por nivel y grado', description: 'Primaria y secundaria por separado, agrupadas por grado y año.', defaultSize: 'lg' },
  { kind: 'lateByPrimaria', title: 'Tardanzas de primaria', description: 'Solo primaria, agrupada por grado.', defaultSize: 'md' },
  { kind: 'lateBySecundaria', title: 'Tardanzas de secundaria', description: 'Solo secundaria, agrupada por año.', defaultSize: 'md' },
  { kind: 'todayIncidents', title: 'Incidencias del día', description: 'Detalle de incidencias y conductas registradas.', defaultSize: 'lg' },
  { kind: 'topIncidents', title: 'Top incidencias', description: 'Tipos de incidencias más repetidos.', defaultSize: 'sm' },
  { kind: 'topStudents', title: 'Alumnos con más incidencias', description: 'Ranking del día.', defaultSize: 'sm' },
  { kind: 'attendanceSummary', title: 'Resumen de asistencia', description: 'A tiempo, tardanzas y porcentaje de ingreso.', defaultSize: 'sm' },
  { kind: 'exitSummary', title: 'Salidas registradas', description: 'Control de alumnos con salida registrada.', defaultSize: 'sm' },
  { kind: 'presentationCompliance', title: 'Cumplimiento de presentación', description: 'Cumplimiento y porcentaje de incidencias de presentación.', defaultSize: 'sm' },
  { kind: 'pendingStudents', title: 'Alumnos sin ingreso', description: 'Lista de alumnos pendientes de marcar.', defaultSize: 'md' },
  { kind: 'classroomSummary', title: 'Resumen por aula', description: 'Estado de asistencia por cada aula.', defaultSize: 'lg' },
  { kind: 'incidentsByClassroom', title: 'Incidencias por aula', description: 'Concentración de incidencias por sección.', defaultSize: 'md' },
]


export function loadLayout(key: string, fallback: LayoutCard[]): LayoutCard[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as LayoutCard[]
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback
    return parsed.filter((item) => CATALOG.some((card) => card.kind === item.kind))
      .map((item) => ({ id: String(item.id), kind: item.kind, size: item.size === 'sm' || item.size === 'lg' ? item.size : 'md' }))
  } catch {
    return fallback
  }
}

export function sizeClass(size: CardSize) {
  if (size === 'sm') return 'col-span-12 xl:col-span-4'
  if (size === 'md') return 'col-span-12 xl:col-span-6'
  return 'col-span-12'
}
