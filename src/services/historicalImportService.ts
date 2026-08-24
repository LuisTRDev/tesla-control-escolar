import { supabase } from '@/lib/supabase'
import { validateHistoricalFile } from '@/lib/fileValidation'
import { cleanSingleLine, cleanText, positiveInteger, safeJsonRecord, safeUserMessage, validIsoDate, validTime } from '@/lib/security'

export type HistoricalSourceType = 'EXCEL' | 'CSV' | 'PDF' | 'WORD' | 'IMAGE' | 'PAPER' | 'MANUAL'
export type HistoricalBatchStatus = 'PENDING' | 'PROCESSING' | 'REVIEW' | 'COMPLETED' | 'FAILED'
export type HistoricalRecordType = 'ATTENDANCE' | 'LATE' | 'ABSENCE' | 'PRESENTATION' | 'CONDUCT' | 'NOTIFICATION' | 'OTHER'
export type HistoricalReviewStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'ERROR'

export type HistoricalImportBatch = {
  id: string
  name: string
  fileName: string | null
  sourceType: HistoricalSourceType
  status: HistoricalBatchStatus
  totalRecords: number
  importedRecords: number
  failedRecords: number
  notes: string
  storagePath: string | null
  createdAt: string
  completedAt: string | null
}

export type HistoricalImportRecord = {
  id: string
  batchId: string
  studentId: string | null
  recordType: HistoricalRecordType
  recordDate: string | null
  recordTime: string | null
  studentNameRaw: string
  classroomRaw: string
  violationType: string
  observation: string
  notificationNumber: number | null
  rawData: Record<string, unknown> | null
  confidence: number | null
  reviewStatus: HistoricalReviewStatus
  errorMessage: string
  createdAt: string
}

export type HistoricalRecordInput = Omit<HistoricalImportRecord, 'id' | 'createdAt'>

function mapBatch(row: any): HistoricalImportBatch {
  return {
    id: String(row.id),
    name: row.name ?? '',
    fileName: row.file_name ?? null,
    sourceType: row.source_type,
    status: row.status,
    totalRecords: row.total_records ?? 0,
    importedRecords: row.imported_records ?? 0,
    failedRecords: row.failed_records ?? 0,
    notes: row.notes ?? '',
    storagePath: row.storage_path ?? null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
  }
}

function mapRecord(row: any): HistoricalImportRecord {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    studentId: row.student_id == null ? null : String(row.student_id),
    recordType: row.record_type,
    recordDate: row.record_date ?? null,
    recordTime: row.record_time ?? null,
    studentNameRaw: row.student_name_raw ?? '',
    classroomRaw: row.classroom_raw ?? '',
    violationType: row.violation_type ?? '',
    observation: row.observation ?? '',
    notificationNumber: row.notification_number ?? null,
    rawData: row.raw_data ?? null,
    confidence: row.confidence == null ? null : Number(row.confidence),
    reviewStatus: row.review_status,
    errorMessage: row.error_message ?? '',
    createdAt: row.created_at,
  }
}

export async function listHistoricalBatches(): Promise<HistoricalImportBatch[]> {
  const { data, error } = await supabase
    .from('historical_import_batches')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(safeUserMessage(error))
  return (data ?? []).map(mapBatch)
}

export async function listHistoricalRecords(batchId: string): Promise<HistoricalImportRecord[]> {
  const { data, error } = await supabase
    .from('historical_import_records')
    .select('*')
    .eq('batch_id', positiveInteger(batchId, 'Lote'))
    .order('created_at', { ascending: true })
  if (error) throw new Error(safeUserMessage(error))
  return (data ?? []).map(mapRecord)
}

function sourceTypeForFile(file: File): HistoricalSourceType {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'xlsx' || ext === 'xls') return 'EXCEL'
  if (ext === 'csv') return 'CSV'
  if (ext === 'pdf') return 'PDF'
  if (ext === 'doc' || ext === 'docx') return 'WORD'
  if (['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(ext ?? '')) return 'IMAGE'
  return 'MANUAL'
}


export async function createHistoricalBatch(name: string, file?: File, notes = ''): Promise<HistoricalImportBatch> {
  const cleanName = cleanSingleLine(name, 120)
  const cleanNotes = cleanText(notes, 1500)
  let sourceType: HistoricalSourceType = 'MANUAL'
  let storagePath: string | null = null

  if (file) {
    const validation = await validateHistoricalFile(file)
    sourceType = sourceTypeForFile(file)
    storagePath = `${new Date().getFullYear()}/${crypto.randomUUID()}-${validation.safeName}`
    const { error: uploadError } = await supabase.storage
      .from('historical-imports')
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined, cacheControl: '3600' })
    if (uploadError) throw new Error(safeUserMessage(uploadError, 'No se pudo subir el archivo histórico.'))
  }

  const { data, error } = await supabase
    .from('historical_import_batches')
    .insert({
      name: cleanName || file?.name || 'Carga histórica',
      file_name: file?.name ? cleanSingleLine(file.name, 180) : null,
      source_type: sourceType,
      status: 'PROCESSING',
      total_records: 0,
      imported_records: 0,
      failed_records: 0,
      notes: cleanNotes,
      storage_path: storagePath,
    })
    .select('*')
    .single()

  if (error) throw new Error(safeUserMessage(error, 'No se pudo crear la carga histórica.'))
  return mapBatch(data)
}

export async function insertHistoricalRecords(records: HistoricalRecordInput[]): Promise<HistoricalImportRecord[]> {
  if (!records.length) return []
  const payload = records.map((record) => ({
    batch_id: positiveInteger(record.batchId, 'Lote'),
    student_id: record.studentId == null ? null : positiveInteger(record.studentId, 'Alumno'),
    record_type: record.recordType,
    record_date: record.recordDate && validIsoDate(record.recordDate) ? record.recordDate : null,
    record_time: record.recordTime && validTime(record.recordTime) ? record.recordTime.slice(0, 8) : null,
    student_name_raw: cleanSingleLine(record.studentNameRaw, 180) || null,
    classroom_raw: cleanSingleLine(record.classroomRaw, 120) || null,
    violation_type: cleanSingleLine(record.violationType, 180) || null,
    observation: cleanText(record.observation, 2000) || null,
    notification_number: record.notificationNumber && Number.isSafeInteger(record.notificationNumber) && record.notificationNumber > 0 ? Math.min(record.notificationNumber, 9999) : null,
    raw_data: safeJsonRecord(record.rawData),
    confidence: record.confidence == null ? null : Math.max(0, Math.min(100, Number(record.confidence))),
    review_status: record.reviewStatus,
    error_message: cleanSingleLine(record.errorMessage, 300) || null,
  }))

  const { data, error } = await supabase.from('historical_import_records').insert(payload).select('*')
  if (error) throw new Error(safeUserMessage(error))
  return (data ?? []).map(mapRecord)
}

export async function updateHistoricalRecord(id: string, patch: Partial<HistoricalImportRecord>): Promise<HistoricalImportRecord> {
  const payload: Record<string, unknown> = {}
  if ('studentId' in patch) payload.student_id = patch.studentId == null ? null : positiveInteger(patch.studentId, 'Alumno')
  if ('recordType' in patch) payload.record_type = patch.recordType
  if ('recordDate' in patch) payload.record_date = patch.recordDate && validIsoDate(patch.recordDate) ? patch.recordDate : null
  if ('recordTime' in patch) payload.record_time = patch.recordTime && validTime(patch.recordTime) ? patch.recordTime.slice(0, 8) : null
  if ('studentNameRaw' in patch) payload.student_name_raw = cleanSingleLine(patch.studentNameRaw, 180) || null
  if ('classroomRaw' in patch) payload.classroom_raw = cleanSingleLine(patch.classroomRaw, 120) || null
  if ('violationType' in patch) payload.violation_type = cleanSingleLine(patch.violationType, 180) || null
  if ('observation' in patch) payload.observation = cleanText(patch.observation, 2000) || null
  if ('notificationNumber' in patch) payload.notification_number = patch.notificationNumber
  if ('reviewStatus' in patch) payload.review_status = patch.reviewStatus
  if ('errorMessage' in patch) payload.error_message = cleanSingleLine(patch.errorMessage, 300) || null
  if (patch.reviewStatus === 'CONFIRMED' || patch.reviewStatus === 'REJECTED') {
    const { data: { user } } = await supabase.auth.getUser()
    payload.reviewed_by = user?.id ?? null
    payload.reviewed_at = new Date().toISOString()
  }

  const { data, error } = await supabase.from('historical_import_records').update(payload).eq('id', positiveInteger(id, 'Registro')).select('*').single()
  if (error) throw new Error(safeUserMessage(error))
  return mapRecord(data)
}

export async function deleteHistoricalRecord(id: string) {
  const { error } = await supabase.from('historical_import_records').delete().eq('id', positiveInteger(id, 'Registro'))
  if (error) throw new Error(safeUserMessage(error))
}

export async function updateHistoricalBatchStats(batchId: string) {
  const records = await listHistoricalRecords(batchId)
  const imported = records.filter((item) => item.reviewStatus === 'CONFIRMED').length
  const failed = records.filter((item) => item.reviewStatus === 'ERROR' || item.reviewStatus === 'REJECTED').length
  const pending = records.filter((item) => item.reviewStatus === 'PENDING').length
  const status: HistoricalBatchStatus = pending > 0 ? 'REVIEW' : records.length > 0 ? 'COMPLETED' : 'REVIEW'
  const { error } = await supabase
    .from('historical_import_batches')
    .update({
      total_records: records.length,
      imported_records: imported,
      failed_records: failed,
      status,
      completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
    })
    .eq('id', positiveInteger(batchId, 'Lote'))
  if (error) throw new Error(safeUserMessage(error))
}


export async function confirmAllPendingHistoricalRecords(batchId: string): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser()
  const reviewedAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('historical_import_records')
    .update({
      review_status: 'CONFIRMED',
      reviewed_by: user?.id ?? null,
      reviewed_at: reviewedAt,
      error_message: null,
    })
    .eq('batch_id', positiveInteger(batchId, 'Lote'))
    .eq('review_status', 'PENDING')
    .not('student_id', 'is', null)
    .not('record_date', 'is', null)
    .select('id')

  if (error) throw new Error(safeUserMessage(error))
  await updateHistoricalBatchStats(batchId)
  return data?.length ?? 0
}

export async function getHistoricalFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('historical-imports').createSignedUrl(cleanSingleLine(storagePath, 300), 60 * 5)
  if (error) throw new Error(safeUserMessage(error))
  return data.signedUrl
}

export async function listConfirmedHistoricalRecordsByStudent(studentId: string): Promise<HistoricalImportRecord[]> {
  const { data, error } = await supabase
    .from('historical_import_records')
    .select('*')
    .eq('student_id', positiveInteger(studentId, 'Alumno'))
    .eq('review_status', 'CONFIRMED')
    .order('record_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(safeUserMessage(error))
  return (data ?? []).map(mapRecord)
}
