import { spreadsheetSafeObject } from '@/lib/csvSecurity'
import { isValidPeruWhatsApp } from '@/services/communicationService'
import { inactiveLabel, isInactive } from '@/lib/studentStatus'
import type { RosterGuardian } from '@/services/rosterService'
import type { Classroom, Student } from '@/types'

/** Filas de cada hoja del padrón. Separado de la descarga para poder probarlo. */
export type RosterSheets = {
  Alumnos: Array<Record<string, string | number>>
  Apoderados: Array<Record<string, string | number>>
  Aulas: Array<Record<string, string | number>>
  'Para revisar': Array<Record<string, string>>
}

const byName = (a: Student, b: Student) => a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es')

export function buildRosterSheets(students: Student[], guardians: RosterGuardian[], classrooms: Classroom[]): RosterSheets {
  const classroomMap = new Map(classrooms.map((c) => [c.id, c]))
  const classroomOrder = new Map(classrooms.map((c, i) => [c.id, i]))
  const studentMap = new Map(students.map((s) => [s.id, s]))
  const sorted = [...students].sort((a, b) => (classroomOrder.get(a.classroomId) ?? 9999) - (classroomOrder.get(b.classroomId) ?? 9999) || byName(a, b))

  const Alumnos = sorted.map((s) => {
    const room = classroomMap.get(s.classroomId)
    const linked = s.guardians ?? []
    const primary = linked.find((g) => g.isPrimary) ?? linked[0]
    const others = linked.filter((g) => g !== primary)
    return {
      Apellidos: s.lastName,
      Nombres: s.firstName,
      DNI: s.dni ?? '',
      Grado: room?.grade ?? '',
      Sección: room?.section ?? '',
      Nivel: room?.level ?? '',
      Estado: isInactive(s) ? `Inhabilitado: ${inactiveLabel(s)}` : 'Activo',
      'Inhabilitado desde': s.inactiveSince ?? '',
      'Apoderado principal': primary?.fullName ?? s.guardianName ?? '',
      Parentesco: primary?.relationship ?? '',
      'DNI apoderado': primary?.dni ?? s.guardianDni ?? '',
      'Teléfono apoderado': primary?.phone ?? s.guardianPhone ?? '',
      'Otros apoderados': others.map((g) => `${g.fullName}${g.relationship ? ` (${g.relationship})` : ''}${g.phone ? ` ${g.phone}` : ''}`).join('; '),
    }
  })

  const Apoderados = [...guardians].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')).map((g) => ({
    'Nombre completo': g.fullName,
    DNI: g.dni,
    Teléfono: g.phone,
    'WhatsApp válido': g.phone ? (isValidPeruWhatsApp(g.phone) ? 'Sí' : 'No') : 'Sin número',
    'Alumnos vinculados': g.students.map((link) => {
      const s = studentMap.get(link.studentId)
      const room = s ? classroomMap.get(s.classroomId) : undefined
      return s ? `${s.lastName}, ${s.firstName}${room ? ` (${room.grade} ${room.section})` : ''}${link.relationship ? ` · ${link.relationship}` : ''}${link.isPrimary ? ' · principal' : ''}` : `#${link.studentId}`
    }).join('; '),
    'Cantidad de alumnos': g.students.length,
  }))

  const Aulas = classrooms.map((c) => {
    const inRoom = students.filter((s) => s.classroomId === c.id)
    return {
      Grado: c.grade,
      Sección: c.section,
      Nivel: c.level,
      'Alumnos activos': inRoom.filter((s) => !isInactive(s)).length,
      Inhabilitados: inRoom.filter(isInactive).length,
      'Sin apoderado': inRoom.filter((s) => !isInactive(s) && !(s.guardians?.length)).length,
    }
  })

  // Problemas de datos que conviene corregir antes de depender del padrón.
  const review: RosterSheets['Para revisar'] = []
  const dniCount = new Map<string, number>()
  for (const s of students) if (s.dni) dniCount.set(s.dni, (dniCount.get(s.dni) ?? 0) + 1)
  for (const s of sorted) {
    if (isInactive(s)) continue
    const room = classroomMap.get(s.classroomId)
    const who = { Alumno: `${s.lastName}, ${s.firstName}`, Aula: room ? `${room.grade} ${room.section} · ${room.level}` : '' }
    if (!room) review.push({ ...who, Problema: 'Sin aula asignada' })
    if (!s.dni) review.push({ ...who, Problema: 'Sin DNI' })
    else if ((dniCount.get(s.dni) ?? 0) > 1) review.push({ ...who, Problema: `DNI repetido (${s.dni})` })
    if (!s.guardians?.length) review.push({ ...who, Problema: 'Sin apoderado vinculado' })
    else {
      const primary = s.guardians.find((g) => g.isPrimary) ?? s.guardians[0]
      if (!primary.phone) review.push({ ...who, Problema: `Apoderado sin teléfono (${primary.fullName})` })
      else if (!isValidPeruWhatsApp(primary.phone)) review.push({ ...who, Problema: `Teléfono no válido para WhatsApp: ${primary.phone}` })
    }
  }

  return {
    Alumnos: Alumnos.map(spreadsheetSafeObject),
    Apoderados: Apoderados.map(spreadsheetSafeObject),
    Aulas: Aulas.map(spreadsheetSafeObject),
    'Para revisar': review.map(spreadsheetSafeObject),
  }
}

export async function exportRosterExcel(students: Student[], guardians: RosterGuardian[], classrooms: Classroom[], filename: string) {
  const XLSX = await import('xlsx')
  const sheets = buildRosterSheets(students, guardians, classrooms)
  const book = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([[name === 'Para revisar' ? 'Sin problemas detectados' : '(sin registros)']])
    // Ancho de columnas según el contenido más largo (máx. 50) para que se lea sin ajustar.
    if (rows.length) {
      const headers = Object.keys(rows[0])
      sheet['!cols'] = headers.map((h) => ({ wch: Math.min(50, Math.max(h.length, ...rows.map((r) => String((r as Record<string, unknown>)[h] ?? '').length)) + 2) }))
    }
    XLSX.utils.book_append_sheet(book, sheet, name)
  }
  XLSX.writeFile(book, filename)
}
