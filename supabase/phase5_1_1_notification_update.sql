-- =============================================================
-- FASE 5.1.1 · Nueva notificación de reglamento interno
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- =============================================================

-- La notificación ya no depende obligatoriamente de presentación:
-- también puede originarse directamente desde una tardanza.
alter table public.notifications
  alter column presentation_control_id drop not null;

-- Campos generales de la nueva ficha.
alter table public.notifications
  add column if not exists notification_type text;

alter table public.notifications
  add column if not exists observation text;

-- Si en una prueba anterior attendance_id se creó como uuid, lo corregimos
-- a bigint para que coincida con public.attendance.id.
do $$
declare
  current_type text;
begin
  select data_type
    into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notifications'
    and column_name = 'attendance_id';

  if current_type is null then
    alter table public.notifications add column attendance_id bigint;
  elsif current_type <> 'bigint' then
    if exists (select 1 from public.notifications where attendance_id is not null) then
      raise exception 'attendance_id existe con tipo % y contiene datos. Revísalo antes de convertirlo a bigint.', current_type;
    end if;
    alter table public.notifications drop column attendance_id;
    alter table public.notifications add column attendance_id bigint;
  end if;
end $$;

-- El nuevo N° es correlativo real: 1, 2, 3, 4, 5...
alter table public.notifications
  drop constraint if exists notifications_number_check;
alter table public.notifications
  drop constraint if exists notifications_notification_number_check;

alter table public.notifications
  add constraint notifications_notification_number_positive
  check (notification_number >= 1);

-- Tipos permitidos de origen.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

update public.notifications
set notification_type = 'PRESENTATION'
where notification_type is null;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in ('PRESENTATION', 'LATE_ENTRY', 'INAPPROPRIATE_CONDUCT'));

alter table public.notifications
  alter column notification_type set not null;

-- Relación opcional con la tardanza.
alter table public.notifications
  drop constraint if exists notifications_attendance_fkey;

alter table public.notifications
  add constraint notifications_attendance_fkey
  foreign key (attendance_id)
  references public.attendance(id)
  on delete cascade;

-- Una tardanza concreta solo puede originar una notificación.
create unique index if not exists notifications_attendance_unique
  on public.notifications(attendance_id)
  where attendance_id is not null;

create index if not exists notifications_student_number_idx
  on public.notifications(student_id, notification_number desc);

create index if not exists notifications_type_idx
  on public.notifications(notification_type);
