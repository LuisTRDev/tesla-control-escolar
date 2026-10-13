import { supabase } from '@/lib/supabase'
import { getSnapshot, setSnapshot } from '@/lib/offlineDb'
import { WHATSAPP_MESSAGE_TYPES, type WhatsAppTemplates } from '@/services/communicationService'

const SNAPSHOT_KEY = 'whatsapp_templates'
const LOCAL_KEY = 'tesla-whatsapp-templates-v1'
// 42703 = columna inexistente: phase11_whatsapp_templates.sql aún no se ejecutó.
const MISSING_COLUMN = '42703'

/** Solo conserva tipos conocidos con texto no vacío. */
function sanitize(value: unknown): WhatsAppTemplates {
  if (!value || typeof value !== 'object') return {}
  const out: WhatsAppTemplates = {}
  for (const type of WHATSAPP_MESSAGE_TYPES) {
    const text = (value as Record<string, unknown>)[type]
    if (typeof text === 'string' && text.trim()) out[type] = text.slice(0, 4000)
  }
  return out
}

function readLocal(): WhatsAppTemplates {
  try { return sanitize(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}')) } catch { return {} }
}

export type TemplateLoadResult = { templates: WhatsAppTemplates; shared: boolean }

export async function getWhatsAppTemplates(): Promise<TemplateLoadResult> {
  try {
    const { data, error } = await supabase.from('school_settings').select('whatsapp_templates').order('id').limit(1).maybeSingle()
    if (error?.code === MISSING_COLUMN) return { templates: readLocal(), shared: false }
    if (error) throw error
    const templates = sanitize(data?.whatsapp_templates)
    await setSnapshot(SNAPSHOT_KEY, templates)
    return { templates, shared: true }
  } catch {
    const cached = await getSnapshot<WhatsAppTemplates>(SNAPSHOT_KEY)
    return { templates: cached ? sanitize(cached) : readLocal(), shared: true }
  }
}

/** Devuelve true si quedó compartido para todos, false si solo en este dispositivo. */
export async function saveWhatsAppTemplates(templates: WhatsAppTemplates): Promise<boolean> {
  const clean = sanitize(templates)
  if (!navigator.onLine) throw new Error('Guardar las plantillas requiere conexión a Internet.')
  const { data: existing, error: readError } = await supabase.from('school_settings').select('id').order('id').limit(1).maybeSingle()
  if (readError) throw readError
  const { error } = existing?.id
    ? await supabase.from('school_settings').update({ whatsapp_templates: clean }).eq('id', existing.id)
    : await supabase.from('school_settings').insert({ whatsapp_templates: clean })
  if (error?.code === MISSING_COLUMN) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(clean))
    return false
  }
  if (error) throw error
  await setSnapshot(SNAPSHOT_KEY, clean)
  return true
}
