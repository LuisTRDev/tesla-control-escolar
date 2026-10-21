import { useMemo, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import type { Classroom, Student } from '@/types'
import { studentMatches } from '@/lib/search'

const PAGE_SIZE = 10
// Con pocas filas buscar no aporta; el buscador aparece cuando la lista empieza a ser larga.
const SEARCH_FROM = 6

type Entry = { student: Student; classroom?: Classroom }
type LevelFilter = 'all' | Classroom['level']

const LEVEL_CHIPS: Array<{ id: LevelFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'Primaria', label: 'Primaria' },
  { id: 'Secundaria', label: 'Secundaria' },
]

type Props<T extends Entry> = {
  items: T[]
  /** En celular: buscador, filtro por nivel y "Ver más". En TV se muestra la lista completa con scroll propio. */
  mobile: boolean
  scrollClass: string
  empty: ReactNode
  keyOf: (item: T) => string
  renderItem: (item: T) => ReactNode
}

export function FilteredStudentList<T extends Entry>({ items, mobile, scrollClass, empty, keyOf, renderItem }: Props<T>) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [shown, setShown] = useState(PAGE_SIZE)
  const filtered = useMemo(
    () => items.filter((entry) => (level === 'all' || entry.classroom?.level === level) && studentMatches(entry.student, query)),
    [items, level, query],
  )
  const visible = mobile ? filtered.slice(0, shown) : filtered
  const filterable = mobile && items.length >= SEARCH_FROM

  return (
    <div>
      {filterable && (
        <div className="mb-3 space-y-2">
          <label className="relative block">
            <span className="sr-only">Buscar alumno</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setShown(PAGE_SIZE) }}
              placeholder="Buscar alumno…"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-10 text-base font-semibold text-white placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && <button type="button" onClick={() => { setQuery(''); setShown(PAGE_SIZE) }} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 active:bg-white/10" aria-label="Borrar búsqueda"><X size={17} /></button>}
          </label>
          <div className="flex gap-2">
            {LEVEL_CHIPS.map((chip) => (
              <button key={chip.id} type="button" onClick={() => { setLevel(chip.id); setShown(PAGE_SIZE) }} aria-pressed={level === chip.id} className={`min-h-9 rounded-full border px-3.5 text-xs font-black ${level === chip.id ? 'border-sky-400/50 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/5 text-slate-400 active:bg-white/10'}`}>{chip.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className={`space-y-2 ${scrollClass}`}>
        {items.length === 0
          ? empty
          : filtered.length === 0
            ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-semibold text-slate-500">Nadie coincide con la búsqueda.</div>
            : visible.map((entry) => <div key={keyOf(entry)}>{renderItem(entry)}</div>)}
      </div>
      {mobile && filtered.length > visible.length && (
        <button type="button" onClick={() => setShown((value) => value + PAGE_SIZE)} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 text-sm font-black text-slate-200 active:bg-white/10">
          Ver más ({filtered.length - visible.length})
        </button>
      )}
    </div>
  )
}
