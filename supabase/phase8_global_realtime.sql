-- FASE 8.1.1 - Realtime global Tesla Control Escolar
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Habilita Realtime para todas las tablas que alimentan módulos operativos.

do $$
declare
  t text;
  tables_to_enable text[] := array[
    'students',
    'classrooms',
    'guardians',
    'attendance',
    'presentation_controls',
    'presentation_violations',
    'notifications',
    'alerts',
    'attendance_closures',
    'audit_logs',
    'historical_import_batches',
    'historical_import_records',
    'school_settings'
  ];
begin
  foreach t in array tables_to_enable loop
    if to_regclass(format('public.%I', t)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Verificación
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;
