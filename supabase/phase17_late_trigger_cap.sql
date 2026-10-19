-- Fase 17 — La 4ta tardanza ya no bloquea la marca de asistencia.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de phase16. Es idempotente y no borra datos.
--
-- Problema (19/10/2026): el trigger trg_auto_late_notification creaba la notificación
-- N° (máximo + 1). Cuando el alumno ya tenía 3, intentaba crear la N° 4, el CHECK de
-- notifications (solo 1, 2 o 3) la rechazaba y Postgres deshacía TAMBIÉN la marca
-- de asistencia. La app la dejaba en la cola local ("Algún dato no tiene un valor
-- permitido") y no se podía corregir la hora.
--
-- Ahora, igual que la app (notificationService.ts):
--   * hasta la N° 3 se crea la notificación como antes;
--   * desde la 4ta tardanza se abre una alerta REPEAT_OFFENDER (una sola abierta por alumno);
--   * si aun así algo falla al crear la notificación o la alerta, la asistencia se guarda igual.

begin;

-- Por si phase16 no se ejecutó: permite la tardanza sin hora.
alter table public.attendance alter column entry_time drop not null;

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

  begin
    select coalesce(max(notification_number), 0) + 1
    into v_next
    from public.notifications
    where student_id = new.student_id;

    if v_next > 3 then
      if not exists (
        select 1 from public.alerts a
        where a.student_id = new.student_id
          and a.alert_type = 'REPEAT_OFFENDER'
          and a.status = 'OPEN'
      ) then
        insert into public.alerts (student_id, alert_type, message, source_table)
        values (
          new.student_id,
          'REPEAT_OFFENDER',
          'El alumno superó las 3 notificaciones. Nueva tardanza el ' || new.date ||
            case when new.entry_time is null then ' (sin hora).'
                 else ' a las ' || to_char(new.entry_time, 'HH24:MI') || '.' end,
          'notifications'
        );
      end if;
      return new;
    end if;

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
  exception when others then
    -- La notificación es secundaria: nunca debe impedir guardar la asistencia.
    raise warning 'No se pudo crear la notificación de tardanza (alumno %, fecha %): %', new.student_id, new.date, sqlerrm;
  end;

  return new;
end;
$$;

commit;

-- Comprobación opcional: alumnos que ya llegaron al tope de 3 notificaciones.
-- select student_id, max(notification_number) as ultima
-- from public.notifications group by student_id having max(notification_number) >= 3;
