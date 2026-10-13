import { useMemo } from 'react'
import { Grid3x3 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { buildArrivalHeatmap, formatMinutes, type ArrivalRecord } from '@/lib/heatmap'

type Props = { records: ArrivalRecord[] }

/** Intensidad en 5 niveles de celeste (sin amarillo); funciona en modo claro y oscuro. */
const LEVELS = [
  'bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500',
  'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  'bg-sky-300 text-sky-950 dark:bg-sky-800 dark:text-sky-50',
  'bg-sky-500 text-white dark:bg-sky-600',
  'bg-sky-700 text-white dark:bg-sky-400 dark:text-slate-950',
]

function level(total: number, max: number) {
  if (!total || !max) return 0
  return Math.min(4, Math.ceil((total / max) * 4))
}

export default function ArrivalHeatmap({ records }: Props) {
  const map = useMemo(() => buildArrivalHeatmap(records), [records])

  if (!map.total) {
    return (
      <Card className="mt-4 p-5">
        <div className="flex items-center gap-2"><Grid3x3 size={18} /><h3 className="font-black">Mapa de calor de llegadas</h3></div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No hay ingresos con hora en este periodo.</p>
      </Card>
    )
  }

  const lateDay = [...map.days].filter((d) => d.schoolDays > 0).sort((a, b) => b.late / b.schoolDays - a.late / a.schoolDays)[0]
  const labelEvery = map.buckets.length > 12 ? 2 : 1

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center gap-2"><Grid3x3 size={18} /><h3 className="font-black">Mapa de calor de llegadas</h3></div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Cuántos alumnos ingresan en cada franja de {map.bucketMinutes} minutos según el día. Más oscuro = más llegadas; el punto rojo indica que la mayoría llegó con tardanza.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {map.peak && (
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Hora pico: <b>{map.peak.label} {formatMinutes(map.peak.bucket)}–{formatMinutes(map.peak.bucket + map.bucketMinutes)}</b> ({map.peak.total} llegadas)
          </span>
        )}
        {lateDay && lateDay.late > 0 && (
          <span className="rounded-lg bg-red-50 px-3 py-1.5 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Más tardanzas: <b>{lateDay.label}</b> ({(lateDay.late / lateDay.schoolDays).toFixed(1)} por día)
          </span>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white pr-2 text-left font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400" />
              {map.buckets.map((bucket, i) => (
                <th key={bucket} className="min-w-9 text-center font-semibold tabular-nums text-slate-500 dark:text-slate-400">{i % labelEvery === 0 ? formatMinutes(bucket) : ''}</th>
              ))}
              <th className="pl-2 text-right font-semibold text-slate-500 dark:text-slate-400">Tardanzas</th>
            </tr>
          </thead>
          <tbody>
            {map.days.map((day, d) => (
              <tr key={day.weekday}>
                <th scope="row" className="sticky left-0 bg-white pr-2 text-left font-bold dark:bg-slate-900">{day.label}</th>
                {map.cells[d].map((cell, b) => {
                  const mostlyLate = cell.total > 0 && cell.late / cell.total > 0.5
                  return (
                    <td
                      key={map.buckets[b]}
                      title={`${day.label} ${formatMinutes(map.buckets[b])}–${formatMinutes(map.buckets[b] + map.bucketMinutes)}: ${cell.total} llegada${cell.total === 1 ? '' : 's'}${cell.late ? `, ${cell.late} con tardanza` : ''}`}
                      className={`relative h-9 min-w-9 rounded-md text-center font-bold tabular-nums ${LEVELS[level(cell.total, map.max)]}`}
                    >
                      {cell.total || ''}
                      {mostlyLate && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-red-600 ring-1 ring-white dark:ring-slate-900" aria-label="mayoría con tardanza" />}
                    </td>
                  )
                })}
                <td className="pl-2 text-right font-semibold tabular-nums text-slate-600 dark:text-slate-300">{day.total ? Math.round((day.late / day.total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>Menos</span>
        {LEVELS.slice(1).map((cls) => <span key={cls} className={`h-3 w-6 rounded ${cls}`} />)}
        <span>Más</span>
      </div>
    </Card>
  )
}
