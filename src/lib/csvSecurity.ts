// Evita que Excel/LibreOffice interpreten datos provenientes de usuarios como fórmulas.
const FORMULA_PREFIX = /^[\s\u0000-\u001F]*[=+\-@]/

export function spreadsheetSafeText(value: unknown): string {
  const text = String(value ?? '')
  return FORMULA_PREFIX.test(text) ? `'${text}` : text
}

export function spreadsheetSafeObject<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? spreadsheetSafeText(value) : value]),
  ) as T
}
