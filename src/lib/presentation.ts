import type { PresentationRecord, PresentationStatus } from '@/types'

export type PresentationDraft = {
  status: PresentationStatus | null
  hairstyleViolation: boolean
  uniformUsageViolation: boolean
  nonInstitutionalGarment: boolean
  lateEntryViolation: boolean
  inappropriateConductViolation: boolean
  observation: string
}

export const emptyPresentationDraft: PresentationDraft = {
  status: null, hairstyleViolation: false, uniformUsageViolation: false, nonInstitutionalGarment: false,
  lateEntryViolation: false, inappropriateConductViolation: false, observation: '',
}

export function getViolationCount(record?: PresentationRecord) {
  if (!record || record.status !== 'NON_COMPLIANT') return 0
  return [record.hairstyleViolation, record.uniformUsageViolation, record.nonInstitutionalGarment, record.lateEntryViolation, record.inappropriateConductViolation].filter(Boolean).length
}

export function getPresentationViolationLabels(record?: PresentationRecord): string[] {
  if (!record || record.status !== 'NON_COMPLIANT') return []
  return [
    record.hairstyleViolation ? 'Peinado no acorde con las disposiciones institucionales.' : '',
    record.uniformUsageViolation ? 'Uso inadecuado o incompleto del uniforme.' : '',
    record.nonInstitutionalGarment ? 'Prenda no correspondiente al uniforme institucional.' : '',
    record.lateEntryViolation ? 'Tardanza en el ingreso.' : '',
    record.inappropriateConductViolation ? 'Conducta inapropiada.' : '',
  ].filter(Boolean)
}
