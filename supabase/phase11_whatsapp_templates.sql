-- Fase 11 — Plantillas de WhatsApp editables por el administrador.
-- Ejecutar en Supabase > SQL Editor. Es idempotente: se puede correr más de una vez.
-- Mientras no se ejecute, la app guarda las plantillas solo en el dispositivo
-- del administrador (los auxiliares seguirán viendo el texto por defecto).

alter table public.school_settings
  add column if not exists whatsapp_templates jsonb not null default '{}'::jsonb;
