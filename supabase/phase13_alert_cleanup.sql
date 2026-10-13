-- Fase 13 — Quitar alertas de reincidencia que ya no corresponden.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de phase12, EN DOS PASOS. Es idempotente.
--
-- Las alertas "Reincidencia" (REPEAT_OFFENDER) y "Tercera notificación"
-- (THIRD_NOTIFICATION) las crea una regla de la base que no guarda qué
-- notificación las originó, así que phase12 no pudo enlazarlas. Aquí se usa
-- la condición de la propia alerta:
--   REPEAT_OFFENDER     exige 2 o más notificaciones del alumno
--   THIRD_NOTIFICATION  exige 3 o más notificaciones del alumno
-- Si el alumno ya no llega a ese número (porque se borraron marcas de prueba),
-- la alerta es un rastro y se borra. Se cuentan TODAS las notificaciones,
-- incluidas las anuladas, para no tocar alertas de casos reales anulados.

-- ============================================================================
-- PASO 1 — VISTA PREVIA (no borra nada). Revisa que sean solo tus pruebas.
-- ============================================================================
select al.id as alerta_id,
       al.alert_type as tipo,
       al.status as estado,
       al.created_at as creada,
       s.last_name || ', ' || s.first_name as alumno,
       (select count(*) from public.notifications n where n.student_id = al.student_id) as notificaciones_actuales
from public.alerts al
join public.students s on s.id = al.student_id
where (al.alert_type = 'REPEAT_OFFENDER'
        and (select count(*) from public.notifications n where n.student_id = al.student_id) < 2)
   or (al.alert_type = 'THIRD_NOTIFICATION'
        and (select count(*) from public.notifications n where n.student_id = al.student_id) < 3)
order by al.created_at desc;

-- ============================================================================
-- PASO 2 — LIMPIEZA Y PREVENCIÓN. Selecciona desde "begin;" hasta "commit;".
-- ============================================================================
begin;

-- 2.1 Borra las alertas listadas en la vista previa.
delete from public.alerts al
where (al.alert_type = 'REPEAT_OFFENDER'
        and (select count(*) from public.notifications n where n.student_id = al.student_id) < 2)
   or (al.alert_type = 'THIRD_NOTIFICATION'
        and (select count(*) from public.notifications n where n.student_id = al.student_id) < 3);

-- 2.2 Para el futuro: al borrar una notificación se quitan las alertas del
--     alumno que dejaron de cumplirse (reemplaza la versión de phase12, que
--     buscaba por source_id y no encontraba nada).
create or replace function public.delete_alerts_of_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.notifications where student_id = old.student_id;

  delete from public.alerts
  where student_id = old.student_id
    and (
      (alert_type = 'REPEAT_OFFENDER' and v_count < 2)
      or (alert_type = 'THIRD_NOTIFICATION' and v_count < 3)
      or (source_table = 'notifications' and source_id::text = old.id::text)
    );
  return old;
end;
$$;

drop trigger if exists trg_delete_alerts_of_notification on public.notifications;
create trigger trg_delete_alerts_of_notification
after delete on public.notifications
for each row
execute function public.delete_alerts_of_notification();

commit;
