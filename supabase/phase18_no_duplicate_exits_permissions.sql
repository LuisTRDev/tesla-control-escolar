-- Fase 18 — Sin salidas anticipadas ni permisos repetidos.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de phase17. Es idempotente.
--
-- Problema (19/10/2026): al registrar una salida anticipada, el segundo paso (poner la
-- hora de salida en la asistencia) fallaba por el CHECK de exit_source; la salida ya
-- estaba guardada, el auxiliar reintentaba y quedaba duplicada. También se registraron
-- permisos idénticos varias veces. La app ya lo evita (commits 37e9db4 y 729c663);
-- esto lo garantiza en la base aunque dos celulares guarden a la vez.
--
-- Qué hace:
--   1. Borra las copias EXACTAS (mismos datos) de salidas anticipadas y permisos,
--      dejando la más antigua.
--   2. Si aún quedan dos salidas del mismo alumno el mismo día con datos distintos
--      (p. ej. otro nombre de quien recoge), se detiene SIN cambiar nada: decide cuál
--      borrar con la consulta A del final y vuelve a ejecutar el script.
--   3. Crea los índices únicos:
--        early_exits (student_id, date)                          una salida por alumno y día
--        student_permissions (student_id, kind, date_from, date_to)  sin permisos idénticos
--   4. Pone la hora de salida que les faltó a las asistencias con salida anticipada.

begin;

-- 1. Copias exactas -----------------------------------------------------------
delete from public.early_exits e
using public.early_exits k
where e.student_id = k.student_id
  and e.date = k.date
  and e.exit_time = k.exit_time
  and e.picked_up_by_name = k.picked_up_by_name
  and e.picked_up_by_dni is not distinct from k.picked_up_by_dni
  and e.relationship is not distinct from k.relationship
  and e.reason = k.reason
  and e.is_authorized_person = k.is_authorized_person
  and e.id > k.id;

delete from public.student_permissions p
using public.student_permissions k
where p.student_id = k.student_id
  and p.kind = k.kind
  and p.date_from = k.date_from
  and p.date_to = k.date_to
  and p.reason = k.reason
  and p.document_path is not distinct from k.document_path
  and p.id > k.id;

-- 2. Repetidos con datos distintos: los decide una persona ------------------------
do $$
declare
  v_exits integer;
  v_permissions integer;
begin
  select count(*) into v_exits from (
    select 1 from public.early_exits group by student_id, date having count(*) > 1
  ) x;
  select count(*) into v_permissions from (
    select 1 from public.student_permissions group by student_id, kind, date_from, date_to having count(*) > 1
  ) x;
  if v_exits > 0 or v_permissions > 0 then
    raise exception 'Quedan repetidos con datos distintos (salidas: %, permisos: %). Usa las consultas A y B al final de este archivo, borra los que sobren y vuelve a ejecutarlo. No se cambió nada.', v_exits, v_permissions;
  end if;
end $$;

-- 3. Índices únicos -----------------------------------------------------------------
create unique index if not exists early_exits_student_date_uidx
  on public.early_exits (student_id, date);

create unique index if not exists student_permissions_unique_uidx
  on public.student_permissions (student_id, kind, date_from, date_to);

-- 4. Hora de salida que faltó en la asistencia ----------------------------------------
update public.attendance a
set exit_time = e.exit_time,
    exit_recorded_at = e.created_at,
    exit_source = 'MANUAL'
from public.early_exits e
where e.student_id = a.student_id
  and e.date = a.date
  and a.exit_time is null;

commit;

-- ---------------------------------------------------------------------------------
-- A. Salidas anticipadas repetidas (mismo alumno y día). Borra la que sobre con:
--      delete from public.early_exits where id = <id>;
-- select e.id, e.date, e.exit_time, s.last_name, s.first_name, e.picked_up_by_name, e.reason, e.created_at
-- from public.early_exits e join public.students s on s.id = e.student_id
-- where (e.student_id, e.date) in (
--   select student_id, date from public.early_exits group by student_id, date having count(*) > 1
-- )
-- order by e.student_id, e.date, e.id;
--
-- B. Permisos repetidos (mismo alumno, tipo y fechas). Borra el que sobre con:
--      delete from public.student_permissions where id = <id>;
-- select p.id, p.kind, p.date_from, p.date_to, s.last_name, s.first_name, p.reason, p.created_at
-- from public.student_permissions p join public.students s on s.id = p.student_id
-- where (p.student_id, p.kind, p.date_from, p.date_to) in (
--   select student_id, kind, date_from, date_to from public.student_permissions
--   group by student_id, kind, date_from, date_to having count(*) > 1
-- )
-- order by p.student_id, p.date_from, p.id;
