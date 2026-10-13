-- Fase 12 — Borrar una marca de asistencia no debe dejar rastro.
-- Ejecutar en Supabase > SQL Editor EN DOS PASOS (ver abajo). Es idempotente.
--
-- Problema: al borrar/deshacer una marca de tardanza, la notificación que creó
-- trg_auto_late_notification (y la alerta de reincidencia que esa notificación
-- disparó) seguían apareciendo en el expediente del alumno.
--
-- QUÉ SE CONSIDERA RASTRO (y solo eso se borra):
--   notificación de tipo LATE_ENTRY
--   + SIN control de presentación vinculado (presentation_control_id is null)
--   + cuya marca de asistencia ya no existe.
-- NO se tocan: notificaciones de presentación o conducta, notificaciones de
-- tardanza registradas desde "Revisar normas" (tienen presentation_control_id),
-- ni ninguna notificación cuya marca de asistencia siga existiendo.

-- ============================================================================
-- PASO 1 — VISTA PREVIA (no borra nada). Ejecuta solo este SELECT y revisa la
-- lista: deberían ser únicamente las marcas que borraste/deshiciste.
-- ============================================================================
select n.id as notificacion_id,
       n.notification_number as numero,
       n.date as fecha,
       s.last_name || ', ' || s.first_name as alumno,
       n.observation as detalle,
       (select count(*) from public.alerts al
         where al.source_table = 'notifications'
           and al.source_id::text = n.id::text
           and al.student_id = n.student_id) as alertas_vinculadas
from public.notifications n
join public.students s on s.id = n.student_id
where n.notification_type = 'LATE_ENTRY'
  and n.presentation_control_id is null
  and (n.attendance_id is null
       or not exists (select 1 from public.attendance a where a.id = n.attendance_id))
order by n.date desc, alumno;

-- ============================================================================
-- PASO 2 — LIMPIEZA Y PREVENCIÓN. Selecciona desde "begin;" hasta "commit;"
-- y ejecútalo cuando la vista previa sea correcta.
-- ============================================================================
begin;

-- 2.1 Borra los rastros listados en la vista previa y las alertas que generaron.
with orphan as (
  delete from public.notifications n
  where n.notification_type = 'LATE_ENTRY'
    and n.presentation_control_id is null
    and (n.attendance_id is null
         or not exists (select 1 from public.attendance a where a.id = n.attendance_id))
  returning n.id, n.student_id
)
delete from public.alerts al
using orphan o
where al.source_table = 'notifications'
  and al.source_id::text = o.id::text
  and al.student_id = o.student_id;

-- 2.2 Al borrar una marca: su notificación automática de tardanza se borra;
--     si la notificación también pertenece a un control de presentación, se
--     conserva y solo se desvincula de la marca.
create or replace function public.cleanup_notifications_of_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where attendance_id = old.id
    and presentation_control_id is null;

  update public.notifications
  set attendance_id = null
  where attendance_id = old.id;

  return old;
end;
$$;

drop trigger if exists trg_cleanup_notifications_of_attendance on public.attendance;
create trigger trg_cleanup_notifications_of_attendance
before delete on public.attendance
for each row
execute function public.cleanup_notifications_of_attendance();

-- 2.3 Al borrar una notificación se borran las alertas que ella misma generó.
create or replace function public.delete_alerts_of_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.alerts
  where source_table = 'notifications'
    and source_id::text = old.id::text
    and student_id = old.student_id;
  return old;
end;
$$;

drop trigger if exists trg_delete_alerts_of_notification on public.notifications;
create trigger trg_delete_alerts_of_notification
after delete on public.notifications
for each row
execute function public.delete_alerts_of_notification();

commit;
