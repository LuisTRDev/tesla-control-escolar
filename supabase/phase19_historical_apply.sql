-- Fase 19 — La carga histórica confirmada pasa a ser asistencia real.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de phase18. Es idempotente y no borra datos.
--
-- Qué hace:
--   1. attendance.is_historical: marca las asistencias que vienen de una carga histórica.
--      El trigger de notificación de tardanza las ignora: cuentan como tardanza en
--      reportes y asistencia, pero NO crean notificaciones ni alertas nuevas.
--   2. historical_import_records: guarda si el registro ya se aplicó, a qué tabla y
--      con qué id (para poder revertirlo) y la nota de conflicto si no se pudo.
--   3. apply_historical_batch(lote): aplica los registros CONFIRMADOS del lote.
--        ATTENDANCE / LATE -> attendance      ABSENCE -> student_absences
--        PRESENTATION      -> presentation_controls (+ violaciones por palabras clave)
--        CONDUCT / NOTIFICATION / OTHER -> no se aplican (quedan como historial).
--      Nunca pisa datos reales: si el alumno ya tiene una marca, falta o control ese
--      día, el registro queda como "conflicto" y se resuelve a mano.
--   4. revert_historical_batch(lote): deshace lo aplicado de ese lote.
-- Solo ADMIN (is_admin()).

begin;

-- 1. Marca de origen histórico ----------------------------------------------------
alter table public.attendance add column if not exists is_historical boolean not null default false;

drop trigger if exists trg_auto_late_notification on public.attendance;
create trigger trg_auto_late_notification
after insert or update of status, entry_time on public.attendance
for each row
when (new.status = 'LATE' and not new.justified and not new.is_historical)
execute function public.ensure_late_notification_from_attendance();

-- 2. Seguimiento en los registros históricos --------------------------------------
alter table public.historical_import_records
  add column if not exists applied_at timestamptz,
  add column if not exists applied_to text,
  add column if not exists applied_id bigint,
  add column if not exists apply_note text;

-- 3. Aplicar un lote ------------------------------------------------------------------
create or replace function public.apply_historical_batch(p_batch_id bigint)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_id bigint;
  v_applied int := 0;
  v_conflicts int := 0;
  v_history int := 0;
  v_text text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede aplicar cargas históricas.';
  end if;

  for r in
    select * from public.historical_import_records
    where batch_id = p_batch_id
      and review_status = 'CONFIRMED'
      and applied_at is null
      and student_id is not null
      and record_date is not null
    order by record_date, id
  loop
    v_id := null;

    if r.record_type in ('CONDUCT', 'NOTIFICATION', 'OTHER') then
      v_history := v_history + 1;
      continue;
    end if;

    if r.record_type in ('ATTENDANCE', 'LATE') then
      if r.record_type = 'ATTENDANCE' and r.record_time is null then
        update public.historical_import_records set apply_note = 'Falta la hora de ingreso.' where id = r.id;
        v_conflicts := v_conflicts + 1;
        continue;
      end if;
      if exists (select 1 from public.attendance where student_id = r.student_id and date = r.record_date)
         or exists (select 1 from public.student_absences where student_id = r.student_id and date = r.record_date) then
        update public.historical_import_records set apply_note = 'Ya existe asistencia o falta real ese día.' where id = r.id;
        v_conflicts := v_conflicts + 1;
        continue;
      end if;
      insert into public.attendance (student_id, date, entry_time, status, entry_source, is_historical)
      values (r.student_id, r.record_date, r.record_time,
              case when r.record_type = 'LATE' then 'LATE' else 'ON_TIME' end, 'MANUAL', true)
      returning id into v_id;
      update public.historical_import_records
        set applied_at = now(), applied_to = 'attendance', applied_id = v_id, apply_note = null where id = r.id;

    elsif r.record_type = 'ABSENCE' then
      if exists (select 1 from public.attendance where student_id = r.student_id and date = r.record_date)
         or exists (select 1 from public.student_absences where student_id = r.student_id and date = r.record_date) then
        update public.historical_import_records set apply_note = 'Ya existe asistencia o falta real ese día.' where id = r.id;
        v_conflicts := v_conflicts + 1;
        continue;
      end if;
      insert into public.student_absences (student_id, classroom_id, date, status)
      select r.student_id, s.classroom_id, r.record_date, 'UNJUSTIFIED'
      from public.students s where s.id = r.student_id
      returning id into v_id;
      update public.historical_import_records
        set applied_at = now(), applied_to = 'absence', applied_id = v_id, apply_note = null where id = r.id;

    elsif r.record_type = 'PRESENTATION' then
      if exists (select 1 from public.presentation_controls where student_id = r.student_id and date = r.record_date) then
        update public.historical_import_records set apply_note = 'Ya existe un control de presentación ese día.' where id = r.id;
        v_conflicts := v_conflicts + 1;
        continue;
      end if;
      v_text := nullif(btrim(concat_ws(' - ', nullif(btrim(coalesce(r.violation_type, '')), ''), nullif(btrim(coalesce(r.observation, '')), ''))), '');
      insert into public.presentation_controls (student_id, date, status, other_description, checked_at)
      values (r.student_id, r.record_date, 'NON_COMPLIANT', v_text, r.record_time)
      returning id into v_id;
      v_text := lower(coalesce(r.violation_type, '') || ' ' || coalesce(r.observation, ''));
      insert into public.presentation_violations (presentation_control_id, violation_type)
      select v_id, t from (
        select case
          when v_text ~ '(peinado|cabello|corte|pelo)' then 'HAIRSTYLE'
          when v_text ~ '(uniforme|corbata|camisa|falda|pantal)' then 'UNIFORM_INCOMPLETE'
          when v_text ~ '(prenda|casaca|polo|buzo)' then 'NON_INSTITUTIONAL_GARMENT'
          else 'OTHER' end as t
      ) x
      on conflict do nothing;
      update public.historical_import_records
        set applied_at = now(), applied_to = 'presentation', applied_id = v_id, apply_note = null where id = r.id;
    end if;

    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('applied', v_applied, 'conflicts', v_conflicts, 'history_only', v_history);
end;
$$;

-- 4. Revertir un lote -----------------------------------------------------------------
create or replace function public.revert_historical_batch(p_batch_id bigint)
returns integer
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revertir cargas históricas.';
  end if;

  for r in
    select id, applied_to, applied_id from public.historical_import_records
    where batch_id = p_batch_id and applied_at is not null
  loop
    if r.applied_to = 'attendance' then
      delete from public.attendance where id = r.applied_id and is_historical;
    elsif r.applied_to = 'absence' then
      delete from public.student_absences where id = r.applied_id;
    elsif r.applied_to = 'presentation' then
      delete from public.presentation_violations where presentation_control_id = r.applied_id;
      delete from public.presentation_controls where id = r.applied_id;
    end if;
    update public.historical_import_records
      set applied_at = null, applied_to = null, applied_id = null, apply_note = null where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.apply_historical_batch(bigint) to authenticated;
grant execute on function public.revert_historical_batch(bigint) to authenticated;

commit;
