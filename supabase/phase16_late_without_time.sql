-- Fase 16 — Tardanza sin hora.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de phase15. Es idempotente.
-- No borra datos: solo permite que attendance.entry_time quede vacío y ajusta
-- el texto de la notificación automática de tardanza.
--
-- Una marca con status = 'LATE' y entry_time NULL es una "tardanza sin hora":
-- el auxiliar sabe que el alumno llegó tarde pero no a qué hora.

begin;

alter table public.attendance alter column entry_time drop not null;

-- Igual que en phase8, pero sin hora no se arma "Hora registrada: ." (quedaba NULL).
create or replace function public.ensure_late_notification_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_next integer;
begin
  if new.status <> 'LATE' then
    return new;
  end if;

  select coalesce(late_notification_enabled, true)
  into v_enabled
  from public.school_settings
  order by id
  limit 1;

  if coalesce(v_enabled, true) = false then
    return new;
  end if;

  if exists (
    select 1 from public.notifications n where n.attendance_id = new.id
  ) then
    return new;
  end if;

  select coalesce(max(notification_number), 0) + 1
  into v_next
  from public.notifications
  where student_id = new.student_id;

  insert into public.notifications (
    student_id,
    presentation_control_id,
    attendance_id,
    notification_number,
    notification_type,
    observation,
    date
  ) values (
    new.student_id,
    null,
    new.id,
    v_next,
    'LATE_ENTRY',
    case
      when new.entry_time is null then 'Tardanza en el ingreso (sin hora registrada).'
      else 'Tardanza en el ingreso. Hora registrada: ' || to_char(new.entry_time, 'HH24:MI') || '.'
    end,
    new.date
  )
  on conflict do nothing;

  return new;
end;
$$;

commit;
