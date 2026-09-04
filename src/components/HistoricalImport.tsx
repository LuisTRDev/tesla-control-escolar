import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/lib/toast'
import * as XLSX from 'xlsx'
import {
  Archive, Check, ChevronDown, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon,
  Link2, Loader2, Plus, RefreshCw, Search, Trash2, Upload, X, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import type { Classroom, Student } from '@/types'
import { validateHistoricalFile } from '@/lib/fileValidation'
import { cleanSingleLine, cleanText, safeJsonRecord, safeUserMessage } from '@/lib/security'
import {
  confirmAllPendingHistoricalRecords, createHistoricalBatch, deleteHistoricalRecord, getHistoricalFileUrl, insertHistoricalRecords,
  listHistoricalBatches, listHistoricalRecords, updateHistoricalBatchStats, updateHistoricalRecord,
  type HistoricalImportBatch, type HistoricalImportRecord, type HistoricalRecordInput,
  type HistoricalRecordType,
} from '@/services/historicalImportService'

type Props = { open: boolean; onClose: () => void; students: Student[]; classrooms: Classroom[]; refreshKey?: number }

type ParsedRow = Record<string, unknown>
const MAX_IMPORT_ROWS = 5000

const recordTypes: Array<{ value: HistoricalRecordType; label: string }> = [
  { value: 'ATTENDANCE', label: 'Asistencia' },
  { value: 'LATE', label: 'Tardanza' },
  { value: 'ABSENCE', label: 'Ausencia' },
  { value: 'PRESENTATION', label: 'Presentación' },
  { value: 'CONDUCT', label: 'Conducta' },
  { value: 'NOTIFICATION', label: 'Notificación' },
  { value: 'OTHER', label: 'Otro' },
]

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function getCell(row: ParsedRow, candidates: string[]) {
  const entries = Object.entries(row)
  for (const candidate of candidates) {
    const found = entries.find(([key]) => normalize(key) === normalize(candidate))
    if (found) return found[1]
  }
  for (const candidate of candidates) {
    const found = entries.find(([key]) => normalize(key).includes(normalize(candidate)))
    if (found) return found[1]
  }
  return ''
}

function parseDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const latam = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (latam) {
    const year = latam[3].length === 2 ? `20${latam[3]}` : latam[3]
    return `${year}-${latam[2].padStart(2, '0')}-${latam[1].padStart(2, '0')}`
  }
  return null
}

function parseTime(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60)
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
  }
  const match = String(value).match(/(\d{1,2}):(\d{2})/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
}

function inferType(value: unknown, row: ParsedRow): HistoricalRecordType {
  const text = normalize(`${value ?? ''} ${getCell(row, ['motivo', 'incumplimiento', 'estado', 'observacion'])}`)
  if (text.includes('tard')) return 'LATE'
  if (text.includes('ausen') || text.includes('falto') || text.includes('falta')) return 'ABSENCE'
  if (text.includes('conduct')) return 'CONDUCT'
  if (text.includes('notific')) return 'NOTIFICATION'
  if (text.includes('uniform') || text.includes('peinado') || text.includes('prenda') || text.includes('present')) return 'PRESENTATION'
  if (text.includes('asisten') || text.includes('ingreso') || text.includes('entrada')) return 'ATTENDANCE'
  return 'OTHER'
}

function studentDisplayName(student: Student) { return `${student.firstName} ${student.lastName}`.trim() }

function findStudent(rawName: string, students: Student[]) {
  const target = normalize(rawName)
  if (!target) return null
  const exact = students.find((student) => normalize(studentDisplayName(student)) === target || normalize(`${student.lastName} ${student.firstName}`) === target)
  if (exact) return { student: exact, confidence: 100 }
  const tokens = target.split(' ').filter((token) => token.length > 2)
  if (!tokens.length) return null
  const scored = students.map((student) => {
    const name = normalize(studentDisplayName(student))
    const hits = tokens.filter((token) => name.includes(token)).length
    return { student, score: Math.round((hits / tokens.length) * 100) }
  }).sort((a, b) => b.score - a.score)
  return scored[0]?.score >= 60 ? { student: scored[0].student, confidence: scored[0].score } : null
}

async function parseStructuredFile(file: File): Promise<ParsedRow[]> {
  await validateHistoricalFile(file)
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error('El archivo no contiene hojas para importar.')
  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '', raw: true })
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`La carga supera el máximo de ${MAX_IMPORT_ROWS} filas por archivo.`)
  return rows
}

function mapParsedRows(batchId: string, rows: ParsedRow[], students: Student[]): HistoricalRecordInput[] {
  return rows.map((row) => {
    const first = getCell(row, ['nombre', 'nombres'])
    const last = getCell(row, ['apellido', 'apellidos'])
    const rawName = cleanSingleLine(getCell(row, ['alumno', 'estudiante', 'nombre completo', 'apellidos y nombres']) || `${first} ${last}`, 180)
    const match = findStudent(rawName, students)
    const typeValue = getCell(row, ['tipo', 'tipo registro', 'record type'])
    const observation = cleanText(getCell(row, ['observacion', 'observación', 'detalle', 'descripcion', 'descripción', 'motivo']), 2000)
    const notificationRaw = getCell(row, ['n notificacion', 'n° notificacion', 'numero notificacion', 'notificacion numero'])
    const parsedNumber = Number(String(notificationRaw).replace(/\D/g, ''))
    return {
      batchId,
      studentId: match?.student.id ?? null,
      recordType: inferType(typeValue, row),
      recordDate: parseDate(getCell(row, ['fecha', 'date'])),
      recordTime: parseTime(getCell(row, ['hora', 'hora ingreso', 'hora entrada', 'time'])),
      studentNameRaw: rawName,
      classroomRaw: cleanSingleLine(getCell(row, ['aula', 'salon', 'salón', 'grado y seccion', 'grado', 'seccion', 'sección']), 120),
      violationType: cleanSingleLine(getCell(row, ['incumplimiento', 'tipo incumplimiento', 'violation type']), 180),
      observation,
      notificationNumber: Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null,
      rawData: safeJsonRecord(row),
      confidence: match?.confidence ?? null,
      reviewStatus: 'PENDING',
      errorMessage: !rawName ? 'No se encontró nombre de alumno en la fila.' : '',
    }
  })
}

export default function HistoricalImport({ open, onClose, students, classrooms, refreshKey = 0 }: Props) {
  const toast = useToast()
  const [batches, setBatches] = useState<HistoricalImportBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<HistoricalImportBatch | null>(null)
  const [records, setRecords] = useState<HistoricalImportRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'ERROR'>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [batchName, setBatchName] = useState('')
  const [batchNotes, setBatchNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [bulkConfirming, setBulkConfirming] = useState(false)

  async function reloadBatches() {
    setLoading(true); setError('')
    try { setBatches(await listHistoricalBatches()) }
    catch (e) { setError(safeUserMessage(e, 'No se pudieron cargar las importaciones históricas.')) }
    finally { setLoading(false) }
  }

  async function selectBatch(batch: HistoricalImportBatch) {
    setSelectedBatch(batch); setLoading(true); setError('')
    try { setRecords(await listHistoricalRecords(batch.id)) }
    catch (e) { setError(safeUserMessage(e, 'No se pudieron cargar los registros del lote.')) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) void reloadBatches() }, [open])
  useEffect(() => {
    if (!open || refreshKey <= 0) return
    void (async () => {
      const nextBatches = await listHistoricalBatches()
      setBatches(nextBatches)
      if (selectedBatch) {
        const fresh = nextBatches.find((item) => item.id === selectedBatch.id)
        if (fresh) setSelectedBatch(fresh)
        setRecords(await listHistoricalRecords(selectedBatch.id))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const filtered = useMemo(() => records.filter((record) => {
    if (statusFilter !== 'ALL' && record.reviewStatus !== statusFilter) return false
    const student = students.find((item) => item.id === record.studentId)
    const haystack = `${record.studentNameRaw} ${student ? studentDisplayName(student) : ''} ${record.classroomRaw} ${record.observation} ${record.recordType}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  }), [records, query, statusFilter, students])

  async function handleCreate() {
    if (!batchName.trim() && !file) return
    setLoading(true); setError('')
    try {
      if (file) await validateHistoricalFile(file)
      const batch = await createHistoricalBatch(cleanSingleLine(batchName, 120), file ?? undefined, cleanText(batchNotes, 1500))
      let createdRecords: HistoricalImportRecord[] = []
      const ext = file?.name.split('.').pop()?.toLowerCase()
      if (file && ['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
        const rows = await parseStructuredFile(file)
        const mapped = mapParsedRows(batch.id, rows, students)
        createdRecords = await insertHistoricalRecords(mapped)
        await updateHistoricalBatchStats(batch.id)
      }
      setCreateOpen(false); setBatchName(''); setBatchNotes(''); setFile(null)
      await reloadBatches()
      await selectBatch({ ...batch, totalRecords: createdRecords.length, status: 'REVIEW' })
    } catch (e) { setError(safeUserMessage(e, 'No se pudo crear la carga histórica.')) }
    finally { setLoading(false) }
  }

  async function saveRecord(record: HistoricalImportRecord, patch: Partial<HistoricalImportRecord>) {
    try {
      const saved = await updateHistoricalRecord(record.id, patch)
      setRecords((current) => current.map((item) => item.id === saved.id ? saved : item))
      await updateHistoricalBatchStats(record.batchId)
      setBatches(await listHistoricalBatches())
      if (patch.reviewStatus === 'CONFIRMED') toast.success('Registro confirmado')
      else if (patch.reviewStatus === 'REJECTED') toast.info('Registro rechazado')
    } catch (e) { setError(safeUserMessage(e, 'No se pudo actualizar el registro.')); toast.error('No se pudo actualizar el registro') }
  }

  async function removeRecord(record: HistoricalImportRecord) {
    if (!confirm('¿Eliminar este registro histórico de la bandeja?')) return
    try {
      await deleteHistoricalRecord(record.id)
      setRecords((current) => current.filter((item) => item.id !== record.id))
      await updateHistoricalBatchStats(record.batchId)
      setBatches(await listHistoricalBatches())
      toast.success('Registro eliminado')
    } catch (e) { setError(safeUserMessage(e, 'No se pudo eliminar el registro.')); toast.error('No se pudo eliminar el registro') }
  }

  async function openOriginal() {
    if (!selectedBatch?.storagePath) return
    try { window.open(await getHistoricalFileUrl(selectedBatch.storagePath), '_blank', 'noopener,noreferrer') }
    catch (e) { setError(safeUserMessage(e, 'No se pudo abrir el archivo original.')) }
  }

  async function confirmAllPending() {
    if (!selectedBatch) return
    const pending = records.filter((record) => record.reviewStatus === 'PENDING')
    const valid = pending.filter((record) => record.studentId && record.recordDate)
    const omitted = pending.length - valid.length

    if (!valid.length) {
      alert('No hay registros pendientes válidos para confirmar. Revisa los que no tienen alumno o fecha.')
      return
    }

    const message = omitted > 0
      ? `Se confirmarán ${valid.length} registros válidos. ${omitted} quedarán pendientes porque necesitan revisión. ¿Continuar?`
      : `Se confirmarán los ${valid.length} registros pendientes de este lote. ¿Continuar?`

    if (!confirm(message)) return

    setBulkConfirming(true)
    setError('')
    try {
      const confirmed = await confirmAllPendingHistoricalRecords(selectedBatch.id)
      const freshRecords = await listHistoricalRecords(selectedBatch.id)
      const freshBatches = await listHistoricalBatches()
      setRecords(freshRecords)
      setBatches(freshBatches)
      const freshBatch = freshBatches.find((batch) => batch.id === selectedBatch.id)
      if (freshBatch) setSelectedBatch(freshBatch)
      alert(`${confirmed} registros confirmados correctamente.${omitted > 0 ? ` ${omitted} siguen pendientes de revisión.` : ''}`)
    } catch (e) {
      setError(safeUserMessage(e, 'No se pudieron confirmar los registros.'))
    } finally {
      setBulkConfirming(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/55 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section className="absolute inset-0 overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100 lg:left-[260px]" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-gold">Migración histórica</p>
            <h2 className="text-xl font-black">Carga histórica de alumnos</h2>
          </div>
          <Button variant="ghost" onClick={onClose}><X size={20} /></Button>
        </header>

        <div className="grid h-[calc(100vh-4rem)] lg:grid-cols-[320px_1fr]">
          <aside className="overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <Button className="w-full" onClick={() => setCreateOpen(true)}><Upload className="mr-2" size={17}/>Nueva carga</Button>
            <p className="mt-5 px-1 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Lotes importados</p>
            <div className="mt-2 space-y-2">
              {batches.map((batch) => (
                <button key={batch.id} type="button" onClick={() => void selectBatch(batch)} className={`w-full rounded-xl border p-3 text-left transition ${selectedBatch?.id===batch.id?'border-brand-gold bg-brand-gold/10 dark:border-brand-navy dark:bg-brand-navyDeep/30':'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-800'}`}>
                  <div className="flex items-start gap-3"><Archive className="mt-0.5 shrink-0 text-slate-400" size={18}/><div className="min-w-0"><p className="truncate text-sm font-black">{batch.name}</p><p className="mt-1 truncate text-xs text-slate-500">{batch.fileName ?? 'Carga manual'} · {batch.sourceType}</p><div className="mt-2 flex gap-2 text-[10px] font-bold"><span className="text-slate-500">{batch.totalRecords} reg.</span><span className="text-emerald-600">{batch.importedRecords} conf.</span>{batch.failedRecords>0&&<span className="text-red-600">{batch.failedRecords} obs.</span>}</div></div></div>
                </button>
              ))}
              {!batches.length&&!loading&&<p className="p-4 text-center text-sm text-slate-400">Aún no hay cargas históricas.</p>}
            </div>
          </aside>

          <main className="overflow-y-auto p-4 sm:p-6">
            {error&&<div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
            {loading&&<div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={17}/>Procesando...</div>}

            {!selectedBatch ? (
              <Card className="mx-auto mt-12 max-w-2xl p-8 text-center"><FileArchive className="mx-auto text-slate-300" size={42}/><h3 className="mt-4 text-xl font-black">Digitaliza registros anteriores</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">Excel y CSV se convierten en registros pendientes de revisión. PDF, Word, fotos o papel escaneado se conservan como respaldo y permiten registrar los datos manualmente sin afectar automatizaciones actuales.</p><Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus className="mr-2" size={17}/>Crear primera carga</Button></Card>
            ) : (
              <>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Lote #{selectedBatch.id}</p><h3 className="mt-1 text-2xl font-black">{selectedBatch.name}</h3><p className="mt-1 text-sm text-slate-500">{selectedBatch.fileName ?? 'Carga manual'} · {selectedBatch.sourceType} · {selectedBatch.status}</p>{selectedBatch.notes&&<p className="mt-2 max-w-3xl text-sm text-slate-500">{selectedBatch.notes}</p>}</div>
                  <div className="flex flex-wrap gap-2">{selectedBatch.storagePath&&<Button variant="outline" onClick={() => void openOriginal()}><Link2 className="mr-2" size={16}/>Ver original</Button>}{records.some((record)=>record.reviewStatus==='PENDING')&&<Button onClick={() => void confirmAllPending()} disabled={bulkConfirming}>{bulkConfirming?<Loader2 className="mr-2 animate-spin" size={16}/>:<Check className="mr-2" size={16}/>}Confirmar todos</Button>}<Button variant="outline" onClick={() => setManualOpen(true)}><Plus className="mr-2" size={16}/>Agregar registro</Button><Button variant="outline" onClick={() => void selectBatch(selectedBatch)}><RefreshCw className="mr-2" size={16}/>Actualizar</Button></div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Total" value={records.length}/><Stat label="Pendientes" value={records.filter(r=>r.reviewStatus==='PENDING').length}/><Stat label="Confirmados" value={records.filter(r=>r.reviewStatus==='CONFIRMED').length}/><Stat label="Observados" value={records.filter(r=>r.reviewStatus==='ERROR'||r.reviewStatus==='REJECTED').length}/></div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]"><div className="relative"><Search className="absolute left-4 top-3.5 text-slate-400" size={18}/><Input className="pl-11" placeholder="Buscar alumno, aula u observación..." value={query} onChange={(e)=>setQuery(e.target.value.slice(0,120))}/></div><select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as typeof statusFilter)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"><option value="ALL">Todos</option><option value="PENDING">Pendientes</option><option value="CONFIRMED">Confirmados</option><option value="REJECTED">Rechazados</option><option value="ERROR">Con error</option></select></div>

                <div className="mt-4 space-y-3">{filtered.map((record)=><RecordCard key={record.id} record={record} students={students} classrooms={classrooms} onSave={saveRecord} onDelete={removeRecord}/>) }{!filtered.length&&!loading&&<Card className="p-8 text-center text-sm text-slate-400">No hay registros para este filtro.</Card>}</div>
              </>
            )}
          </main>
        </div>
      </section>

      {createOpen&&<CreateBatchDialog file={file} setFile={setFile} name={batchName} setName={setBatchName} notes={batchNotes} setNotes={setBatchNotes} loading={loading} onCancel={()=>setCreateOpen(false)} onCreate={()=>void handleCreate()}/>} 
      {manualOpen&&selectedBatch&&<ManualRecordDialog batchId={selectedBatch.id} students={students} classrooms={classrooms} onCancel={()=>setManualOpen(false)} onCreate={async(input)=>{setLoading(true);try{await insertHistoricalRecords([input]);await updateHistoricalBatchStats(selectedBatch.id);setRecords(await listHistoricalRecords(selectedBatch.id));setBatches(await listHistoricalBatches());setManualOpen(false)}catch(e){setError(e instanceof Error?e.message:'No se pudo crear el registro.')}finally{setLoading(false)}}}/>} 
    </div>
  )
}

function Stat({label,value}:{label:string;value:number}) { return <Card className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></Card> }

function CreateBatchDialog({file,setFile,name,setName,notes,setNotes,loading,onCancel,onCreate}:{file:File|null;setFile:(file:File|null)=>void;name:string;setName:(v:string)=>void;notes:string;setNotes:(v:string)=>void;loading:boolean;onCancel:()=>void;onCreate:()=>void}) {
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4" onMouseDown={onCancel}><Card className="w-full max-w-xl p-6" onMouseDown={(e)=>e.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Nuevo lote</p><h3 className="text-xl font-black">Importar registros históricos</h3></div><Button variant="ghost" onClick={onCancel}><X size={18}/></Button></div><div className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-sm font-bold">Nombre de la carga</span><Input maxLength={120} value={name} onChange={(e)=>setName(e.target.value)} placeholder="Ej. Tardanzas marzo 2026"/></label><label className="block"><span className="mb-2 block text-sm font-bold">Archivo</span><input type="file" accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic" onChange={(e)=>setFile(e.target.files?.[0]??null)} className="block w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm dark:border-slate-700"/><p className="mt-2 text-xs text-slate-500">Máximo 10 MB. Excel/CSV: lectura automática. PDF/Word/foto: se guarda el original y luego se revisan/agregan los registros manualmente.</p></label><label className="block"><span className="mb-2 block text-sm font-bold">Notas</span><textarea rows={3} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" maxLength={1500} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Ej. Libro físico entregado por auxiliar..."/></label></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancelar</Button><Button disabled={loading||(!name.trim()&&!file)} onClick={onCreate}>{loading?<Loader2 className="mr-2 animate-spin" size={16}/>:<Upload className="mr-2" size={16}/>}Crear carga</Button></div></Card></div>
}

function RecordCard({record,students,classrooms,onSave,onDelete}:{record:HistoricalImportRecord;students:Student[];classrooms:Classroom[];onSave:(r:HistoricalImportRecord,p:Partial<HistoricalImportRecord>)=>Promise<void>;onDelete:(r:HistoricalImportRecord)=>Promise<void>}) {
  const [editing,setEditing]=useState(false)
  const [draft,setDraft]=useState(record)
  useEffect(()=>setDraft(record),[record])
  const student=students.find((item)=>item.id===record.studentId)
  const classroom=student?classrooms.find((item)=>item.id===student.classroomId):undefined
  const badge=record.reviewStatus==='CONFIRMED'?'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300':record.reviewStatus==='REJECTED'||record.reviewStatus==='ERROR'?'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300':'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
  return <Card className="p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${badge}`}>{record.reviewStatus}</span><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black dark:bg-slate-800">{record.recordType}</span>{record.confidence!=null&&<span className="text-xs text-slate-400">coincidencia {record.confidence}%</span>}</div>{editing?<div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold">Alumno<select value={draft.studentId??''} onChange={(e)=>setDraft({...draft,studentId:e.target.value||null})} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="">Sin identificar</option>{students.map(s=><option key={s.id} value={s.id}>{studentDisplayName(s)}</option>)}</select></label><label className="text-xs font-bold">Tipo<select value={draft.recordType} onChange={(e)=>setDraft({...draft,recordType:e.target.value as HistoricalRecordType})} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950">{recordTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label><label className="text-xs font-bold">Fecha<Input className="mt-1" type="date" value={draft.recordDate??''} onChange={(e)=>setDraft({...draft,recordDate:e.target.value||null})}/></label><label className="text-xs font-bold">Hora<Input className="mt-1" type="time" value={draft.recordTime??''} onChange={(e)=>setDraft({...draft,recordTime:e.target.value||null})}/></label><label className="text-xs font-bold md:col-span-2">Observación<textarea rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" maxLength={2000} value={draft.observation} onChange={(e)=>setDraft({...draft,observation:e.target.value})}/></label></div>:<><h4 className="mt-3 text-base font-black">{student?studentDisplayName(student):(record.studentNameRaw||'Alumno sin identificar')}</h4><p className="mt-1 text-sm text-slate-500">{classroom?`${classroom.grade} ${classroom.section} · ${classroom.level}`:(record.classroomRaw||'Aula no identificada')} · {record.recordDate??'Sin fecha'} {record.recordTime?`· ${record.recordTime}`:''}</p>{record.observation&&<p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{record.observation}</p>}{record.errorMessage&&<p className="mt-2 text-xs font-semibold text-red-600">{record.errorMessage}</p>}</>}</div><div className="flex flex-wrap gap-2 xl:w-auto xl:justify-end">{editing?<><Button variant="outline" onClick={()=>{setDraft(record);setEditing(false)}}>Cancelar</Button><Button onClick={async()=>{await onSave(record,draft);setEditing(false)}}>Guardar</Button></>:<Button variant="outline" onClick={()=>setEditing(true)}>Editar</Button>}{record.reviewStatus!=='CONFIRMED'&&<Button onClick={()=>void onSave(record,{reviewStatus:'CONFIRMED'})}><Check className="mr-2" size={16}/>Confirmar</Button>}{record.reviewStatus!=='REJECTED'&&<Button variant="outline" onClick={()=>void onSave(record,{reviewStatus:'REJECTED'})}><XCircle className="mr-2" size={16}/>Rechazar</Button>}<Button variant="ghost" onClick={()=>void onDelete(record)}><Trash2 size={16}/></Button></div></div></Card>
}

function ManualRecordDialog({batchId,students,classrooms,onCancel,onCreate}:{batchId:string;students:Student[];classrooms:Classroom[];onCancel:()=>void;onCreate:(input:HistoricalRecordInput)=>Promise<void>}) {
  const [studentId,setStudentId]=useState(''); const [recordType,setRecordType]=useState<HistoricalRecordType>('OTHER'); const [date,setDate]=useState(''); const [time,setTime]=useState(''); const [observation,setObservation]=useState('')
  const student=students.find(s=>s.id===studentId); const classroom=student?classrooms.find(c=>c.id===student.classroomId):undefined
  return <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-950/65 p-4" onMouseDown={onCancel}><Card className="w-full max-w-xl p-6" onMouseDown={(e)=>e.stopPropagation()}><h3 className="text-xl font-black">Agregar registro desde papel/documento</h3><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold md:col-span-2">Alumno<select value={studentId} onChange={(e)=>setStudentId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">Seleccionar alumno</option>{students.map(s=><option key={s.id} value={s.id}>{studentDisplayName(s)}</option>)}</select></label><label className="text-sm font-bold">Tipo<select value={recordType} onChange={(e)=>setRecordType(e.target.value as HistoricalRecordType)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">{recordTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label><label className="text-sm font-bold">Fecha<Input className="mt-2" type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></label><label className="text-sm font-bold">Hora (opcional)<Input className="mt-2" type="time" value={time} onChange={(e)=>setTime(e.target.value)}/></label><label className="text-sm font-bold md:col-span-2">Observación<textarea rows={4} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" maxLength={2000} value={observation} onChange={(e)=>setObservation(e.target.value)}/></label></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancelar</Button><Button disabled={!studentId||!date} onClick={()=>void onCreate({batchId,studentId:studentId||null,recordType,recordDate:date||null,recordTime:time||null,studentNameRaw:student?studentDisplayName(student):'',classroomRaw:classroom?`${classroom.grade} ${classroom.section} ${classroom.level}`:'',violationType:'',observation,notificationNumber:null,rawData:{manual:true},confidence:100,reviewStatus:'PENDING',errorMessage:''})}><Plus className="mr-2" size={16}/>Agregar</Button></div></Card></div>
}
