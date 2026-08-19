import { supabase } from '@/lib/supabase'

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
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapBatch)
}

export async function listHistoricalRecords(batchId: string): Promise<HistoricalImportRecord[]> {
  const { data, error } = await supabase
    .from('historical_import_records')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
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

function safeName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
}

export async function createHistoricalBatch(name: string, file?: File, notes = ''): Promise<HistoricalImportBatch> {
  const sourceType = file ? sourceTypeForFile(file) : 'MANUAL'
  let storagePath: string | null = null

  if (file) {
    storagePath = `${new Date().getFullYear()}/${Date.now()}-${safeName(file.name)}`
    const { error: uploadError } = await supabase.storage
      .from('historical-imports')
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined })
    if (uploadError) throw new Error(`No se pudo subir el archivo: ${uploadError.message}`)
  }

  const { data, error } = await supabase
    .from('historical_import_batches')
    .insert({
      name: name.trim() || file?.name || 'Carga histórica',
      file_name: file?.name ?? null,
      source_type: sourceType,
      status: 'PROCESSING',
      total_records: 0,
      imported_records: 0,
      failed_records: 0,
      notes,
      storage_path: storagePath,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapBatch(data)
}

export async function insertHistoricalRecords(records: HistoricalRecordInput[]): Promise<HistoricalImportRecord[]> {
  if (!records.length) return []
  const payload = records.map((record) => ({
    batch_id: Number(record.batchId),
    student_id: record.studentId == null ? null : Number(record.studentId),
    record_type: record.recordType,
    record_date: record.recordDate || null,
    record_time: record.recordTime || null,
    student_name_raw: record.studentNameRaw || null,
    classroom_raw: record.classroomRaw || null,
    violation_type: record.violationType || null,
    observation: record.observation || null,
    notification_number: record.notificationNumber,
    raw_data: record.rawData,
    confidence: record.confidence,
    review_status: record.reviewStatus,
    error_message: record.errorMessage || null,
  }))

  const { data, error } = await supabase.from('historical_import_records').insert(payload).select('*')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRecord)
}

export async function updateHistoricalRecord(id: string, patch: Partial<HistoricalImportRecord>): Promise<HistoricalImportRecord> {
  const payload: Record<string, unknown> = {}
  if ('studentId' in patch) payload.student_id = patch.studentId == null ? null : Number(patch.studentId)
  if ('recordType' in patch) payload.record_type = patch.recordType
  if ('recordDate' in patch) payload.record_date = patch.recordDate || null
  if ('recordTime' in patch) payload.record_time = patch.recordTime || null
  if ('studentNameRaw' in patch) payload.student_name_raw = patch.studentNameRaw || null
  if ('classroomRaw' in patch) payload.classroom_raw = patch.classroomRaw || null
  if ('violationType' in patch) payload.violation_type = patch.violationType || null
  if ('observation' in patch) payload.observation = patch.observation || null
  if ('notificationNumber' in patch) payload.notification_number = patch.notificationNumber
  if ('reviewStatus' in patch) payload.review_status = patch.reviewStatus
  if ('errorMessage' in patch) payload.error_message = patch.errorMessage || null
  if (patch.reviewStatus === 'CONFIRMED' || patch.reviewStatus === 'REJECTED') {
    const { data: { user } } = await supabase.auth.getUser()
    payload.reviewed_by = user?.id ?? null
    payload.reviewed_at = new Date().toISOString()
  }

  const { data, error } = await supabase.from('historical_import_records').update(payload).eq('id', Number(id)).select('*').single()
  if (error) throw new Error(error.message)
  return mapRecord(data)
}

export async function deleteHistoricalRecord(id: string) {
  const { error } = await supabase.from('historical_import_records').delete().eq('id', Number(id))
  if (error) throw new Error(error.message)
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
    .eq('id', Number(batchId))
  if (error) throw new Error(error.message)
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
    .eq('batch_id', Number(batchId))
    .eq('review_status', 'PENDING')
    .not('student_id', 'is', null)
    .not('record_date', 'is', null)
    .select('id')

  if (error) throw new Error(error.message)
  await updateHistoricalBatchStats(batchId)
  return data?.length ?? 0
}

export async function getHistoricalFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('historical-imports').createSignedUrl(storagePath, 60 * 10)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function listConfirmedHistoricalRecordsByStudent(studentId: string): Promise<HistoricalImportRecord[]> {
  const { data, error } = await supabase
    .from('historical_import_records')
    .select('*')
    .eq('student_id', Number(studentId))
    .eq('review_status', 'CONFIRMED')
    .order('record_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRecord)
}
