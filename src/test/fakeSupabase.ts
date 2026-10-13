/**
 * Supabase falso en memoria para pruebas de servicios. Implementa solo lo que usan
 * los servicios: select/insert/upsert/update/delete con eq, gte, lte, in, order,
 * limit, range, single y maybeSingle, más relaciones simples como
 * `presentation_violations(violation_type)`.
 */

type Row = Record<string, unknown>
type Result = { data: unknown; error: unknown; count?: number | null }
type Filter = (row: Row) => boolean

/** Tabla hija → columna que apunta al padre (para selects anidados). */
const RELATIONS: Record<string, string> = { presentation_violations: 'presentation_control_id' }

export class FakeSupabase {
  tables: Record<string, Row[]> = {}
  private nextId = 1000
  private failures: Array<{ table: string; op: string; error: unknown }> = []
  calls: Array<{ table: string; op: string; payload?: unknown }> = []

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows.map((row) => ({ ...row }))
    return this
  }

  rows(table: string) {
    return this.tables[table] ?? []
  }

  /** La próxima operación `op` sobre `table` devuelve este error. */
  failNext(table: string, op: 'select' | 'insert' | 'upsert' | 'update' | 'delete', error: unknown) {
    this.failures.push({ table, op, error })
  }

  takeFailure(table: string, op: string) {
    const index = this.failures.findIndex((f) => f.table === table && f.op === op)
    if (index < 0) return null
    return this.failures.splice(index, 1)[0].error
  }

  newId() {
    return this.nextId++
  }

  from(table: string) {
    return new Query(this, table)
  }

  rpc = async () => ({ data: null, error: null })
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  private filters: Filter[] = []
  private payload: Row | Row[] | null = null
  private onConflict: string[] = []
  private ignoreDuplicates = false
  private columns = '*'
  private returning = false
  private countMode = false
  private head = false
  private sorts: Array<{ column: string; ascending: boolean }> = []
  private limitCount: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private mode: 'many' | 'single' | 'maybeSingle' = 'many'

  constructor(private db: FakeSupabase, private table: string) {}

  select(columns = '*', options?: { count?: string; head?: boolean }) {
    if (this.op === 'select') this.columns = columns
    else this.returning = true
    this.columns = columns
    this.countMode = Boolean(options?.count)
    this.head = Boolean(options?.head)
    return this
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this }
  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert'; this.payload = rows
    this.onConflict = (options?.onConflict ?? 'id').split(',').map((c) => c.trim())
    this.ignoreDuplicates = Boolean(options?.ignoreDuplicates)
    return this
  }
  update(values: Row) { this.op = 'update'; this.payload = values; return this }
  delete() { this.op = 'delete'; return this }
  eq(column: string, value: unknown) { this.filters.push((row) => String(row[column]) === String(value)); return this }
  gte(column: string, value: unknown) { this.filters.push((row) => String(row[column]) >= String(value)); return this }
  lte(column: string, value: unknown) { this.filters.push((row) => String(row[column]) <= String(value)); return this }
  in(column: string, values: unknown[]) { const set = new Set(values.map(String)); this.filters.push((row) => set.has(String(row[column]))); return this }
  order(column: string, options?: { ascending?: boolean }) { this.sorts.push({ column, ascending: options?.ascending ?? true }); return this }
  limit(count: number) { this.limitCount = count; return this }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybeSingle'; return this }

  then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject)
  }

  private matches(row: Row) {
    return this.filters.every((filter) => filter(row))
  }

  private project(row: Row): Row {
    const out: Row = { ...row }
    for (const match of this.columns.matchAll(/(\w+)\(([^)]*)\)/g)) {
      const [, child, cols] = match
      const fk = RELATIONS[child]
      if (!fk) continue
      const wanted = cols.split(',').map((c) => c.trim())
      out[child] = this.db.rows(child).filter((c) => String(c[fk]) === String(row.id)).map((c) => Object.fromEntries(wanted.map((w) => [w, c[w]])))
    }
    return out
  }

  private finish(rows: Row[]): Result {
    let list = [...rows]
    for (const sort of [...this.sorts].reverse()) {
      list.sort((a, b) => {
        const x = String(a[sort.column] ?? ''); const y = String(b[sort.column] ?? '')
        return (x < y ? -1 : x > y ? 1 : 0) * (sort.ascending ? 1 : -1)
      })
    }
    const count = list.length
    if (this.rangeFrom !== null && this.rangeTo !== null) list = list.slice(this.rangeFrom, this.rangeTo + 1)
    if (this.limitCount !== null) list = list.slice(0, this.limitCount)
    list = list.map((row) => this.project(row))
    if (this.head) return { data: null, error: null, count }
    if (this.mode === 'single') {
      return list.length === 1 ? { data: list[0], error: null, count } : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
    }
    if (this.mode === 'maybeSingle') return { data: list[0] ?? null, error: null, count }
    return { data: list, error: null, count: this.countMode ? count : null }
  }

  private execute(): Result {
    this.db.calls.push({ table: this.table, op: this.op, payload: this.payload ?? undefined })
    const failure = this.db.takeFailure(this.table, this.op)
    if (failure) return { data: null, error: failure }
    const table = (this.db.tables[this.table] ??= [])

    if (this.op === 'select') return this.finish(table.filter((row) => this.matches(row)))

    if (this.op === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((row) => ({ id: this.db.newId(), ...row }))
      table.push(...inserted)
      return this.returning ? this.finish(inserted) : { data: null, error: null }
    }

    if (this.op === 'upsert') {
      const affected: Row[] = []
      for (const row of Array.isArray(this.payload) ? this.payload : [this.payload!]) {
        const existing = table.find((r) => this.onConflict.every((c) => String(r[c]) === String(row[c])))
        if (existing) {
          if (this.ignoreDuplicates) continue
          Object.assign(existing, row)
          affected.push(existing)
        } else {
          const created = { id: this.db.newId(), ...row }
          table.push(created)
          affected.push(created)
        }
      }
      return this.returning ? this.finish(affected) : { data: null, error: null }
    }

    if (this.op === 'update') {
      const affected = table.filter((row) => this.matches(row))
      for (const row of affected) Object.assign(row, this.payload)
      return this.returning ? this.finish(affected) : { data: null, error: null }
    }

    const keep = table.filter((row) => !this.matches(row))
    this.db.tables[this.table] = keep
    return { data: null, error: null }
  }
}
