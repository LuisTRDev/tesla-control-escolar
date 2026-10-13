/**
 * Supabase (PostgREST) devuelve como máximo 1000 filas por consulta por defecto, sin
 * avisar que cortó el resultado. Para rangos grandes (un mes de asistencia de todo el
 * colegio, copias de seguridad) hay que pedir las filas por páginas con .range().
 *
 * `build(from, to)` debe crear la consulta completa con un ORDER estable (incluir el id)
 * y aplicarle `.range(from, to)`.
 */
export const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: unknown }

export async function fetchAllPages<T>(build: (from: number, to: number) => PromiseLike<PageResult<T>>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await build(offset, offset + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
    // Freno de seguridad ante un bucle por un ORDER inestable (200 000 filas).
    if (offset > 200 * pageSize) return rows
  }
}
