-- FASE 5.1 - Migración opcional de incidencias históricas a notifications
-- Ejecutar UNA sola vez si ya tenías presentation_controls NON_COMPLIANT
-- antes de crear la tabla notifications.

insert into public.notifications (
  student_id,
  presentation_control_id,
  notification_number,
  date
)
select
  pc.student_id,
  pc.id,
  least(
    3,
    (
      select count(*)::int
      from public.presentation_controls previous
      where previous.student_id = pc.student_id
        and previous.status = 'NON_COMPLIANT'
        and (
          previous.date < pc.date
          or (previous.date = pc.date and previous.id <= pc.id)
        )
    )
  ) as notification_number,
  pc.date
from public.presentation_controls pc
where pc.status = 'NON_COMPLIANT'
on conflict (presentation_control_id) do nothing;
