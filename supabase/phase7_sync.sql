-- Fase 7: soporte de sincronización incremental.
-- Si ya ejecutaste este parche en Supabase, conserva este archivo solo como respaldo.

alter table public.students add column if not exists updated_at timestamptz not null default now();
alter table public.classrooms add column if not exists updated_at timestamptz not null default now();
alter table public.attendance add column if not exists updated_at timestamptz not null default now();
alter table public.presentation_controls add column if not exists updated_at timestamptz not null default now();
alter table public.notifications add column if not exists updated_at timestamptz not null default now();
alter table public.alerts add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at before update on public.students for each row execute function public.set_updated_at();
drop trigger if exists trg_classrooms_updated_at on public.classrooms;
create trigger trg_classrooms_updated_at before update on public.classrooms for each row execute function public.set_updated_at();
drop trigger if exists trg_attendance_updated_at on public.attendance;
create trigger trg_attendance_updated_at before update on public.attendance for each row execute function public.set_updated_at();
drop trigger if exists trg_presentation_updated_at on public.presentation_controls;
create trigger trg_presentation_updated_at before update on public.presentation_controls for each row execute function public.set_updated_at();
drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at before update on public.notifications for each row execute function public.set_updated_at();
drop trigger if exists trg_alerts_updated_at on public.alerts;
create trigger trg_alerts_updated_at before update on public.alerts for each row execute function public.set_updated_at();

create index if not exists idx_students_updated_at on public.students(updated_at);
create index if not exists idx_classrooms_updated_at on public.classrooms(updated_at);
create index if not exists idx_attendance_updated_at on public.attendance(updated_at);
create index if not exists idx_presentation_updated_at on public.presentation_controls(updated_at);
create index if not exists idx_notifications_updated_at on public.notifications(updated_at);
create index if not exists idx_alerts_updated_at on public.alerts(updated_at);
