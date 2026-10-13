/** Minúsculas, sin tildes ni espacios repetidos: "  JOSÉ  Núñez" -> "jose nunez". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** true si `a` y `b` difieren como máximo en una letra (cambio, falta o sobra). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

function tokenMatchesWord(token: string, word: string): boolean {
  if (word.includes(token)) return true
  // Tolerancia a un error de tipeo solo en palabras de 4+ letras, comparando
  // contra el inicio de la palabra: "gonzales" encuentra "gonzalez", "rodrigez" a "rodriguez".
  if (token.length < 4) return false
  return withinOneEdit(token, word.slice(0, token.length))
    || withinOneEdit(token, word.slice(0, token.length + 1))
    || withinOneEdit(token, word.slice(0, token.length - 1))
}

/**
 * Cada palabra de la búsqueda debe coincidir con alguna palabra de los campos.
 * Ignora tildes, acepta un error de tipeo y los dígitos buscan dentro del DNI.
 */
export function matchesQuery(fields: Array<string | undefined | null>, query: string): boolean {
  const tokens = normalizeText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  const words = normalizeText(fields.filter(Boolean).join(' ')).split(' ')
  return tokens.every((token) => words.some((word) => tokenMatchesWord(token, word)))
}

export function studentMatches(student: { firstName: string; lastName: string; dni?: string }, query: string): boolean {
  return matchesQuery([student.firstName, student.lastName, student.dni], query)
}
