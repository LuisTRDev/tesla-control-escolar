-- Tesla Control Escolar - Fase 4
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Este script termina restricciones, índices y políticas RLS para el frontend.

-- 1) Restricciones de integridad ---------------------------------------------

-- Un alumno solo puede tener una asistencia por día.
create unique index if not exists attendance_student_date_uidx
  on public.attendance (student_id, date);

-- Un alumno solo puede tener un control de presentación por día.
create unique index if not exists presentation_controls_student_date_uidx
  on public.presentation_controls (student_id, date);

-- Evita repetir el mismo tipo de incumplimiento en un control.
create unique index if not exists presentation_violations_control_type_uidx
  on public.presentation_violations (presentation_control_id, violation_type);

-- Valores válidos. Se crean solo si todavía no existen.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_status_check') then
    alter table public.attendance
      add constraint attendance_status_check check (status in ('ON_TIME', 'LATE'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'presentation_controls_status_check') then
    alter table public.presentation_controls
      add constraint presentation_controls_status_check check (status in ('COMPLIANT', 'NON_COMPLIANT'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'presentation_violations_type_check') then
    alter table public.presentation_violations
      add constraint presentation_violations_type_check check (
        violation_type in ('HAIRSTYLE', 'UNIFORM_INCOMPLETE', 'NON_INSTITUTIONAL_GARMENT', 'OTHER')
      );
  end if;
end $$;

-- Campos opcionales del control (por si fueron creados accidentalmente como NOT NULL).
alter table public.presentation_controls alter column other_description drop not null;
alter table public.presentation_controls alter column checked_at drop not null;

-- 2) RLS ---------------------------------------------------------------------
alter table public.classrooms enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.attendance enable row level security;
alter table public.school_settings enable row level security;
alter table public.presentation_controls enable row level security;
alter table public.presentation_violations enable row level security;
alter table public.profiles enable row level security;

-- Limpiar políticas de esta fase para poder volver a ejecutar el script.
drop policy if exists "Authenticated read classrooms" on public.classrooms;
drop policy if exists "Authenticated read students" on public.students;
drop policy if exists "Authenticated read guardians" on public.guardians;
drop policy if exists "Authenticated manage attendance" on public.attendance;
drop policy if exists "Authenticated read school settings" on public.school_settings;
drop policy if exists "Authenticated update school settings" on public.school_settings;
drop policy if exists "Authenticated insert school settings" on public.school_settings;
drop policy if exists "Authenticated manage presentation controls" on public.presentation_controls;
drop policy if exists "Authenticated manage presentation violations" on public.presentation_violations;
drop policy if exists "Users read own profile" on public.profiles;

-- Catálogos: lectura para usuarios autenticados.
create policy "Authenticated read classrooms"
  on public.classrooms for select to authenticated using (true);

create policy "Authenticated read students"
  on public.students for select to authenticated using (true);

create policy "Authenticated read guardians"
  on public.guardians for select to authenticated using (true);

-- Asistencia: la auxiliar puede leer/crear/corregir/borrar registros.
create policy "Authenticated manage attendance"
  on public.attendance for all to authenticated
  using (true) with check (true);

-- Configuración escolar: lectura y edición para la app en esta fase.
create policy "Authenticated read school settings"
  on public.school_settings for select to authenticated using (true);
create policy "Authenticated update school settings"
  on public.school_settings for update to authenticated using (true) with check (true);
create policy "Authenticated insert school settings"
  on public.school_settings for insert to authenticated with check (true);

-- Presentación personal.
create policy "Authenticated manage presentation controls"
  on public.presentation_controls for all to authenticated
  using (true) with check (true);

create policy "Authenticated manage presentation violations"
  on public.presentation_violations for all to authenticated
  using (true) with check (true);

-- Cada usuario solo puede leer su propio perfil.
create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

-- 3) Datos mínimos ------------------------------------------------------------
-- Si school_settings está vacío, crea la hora límite por defecto.
insert into public.school_settings (entry_limit_time)
select '07:45:00'::time
where not exists (select 1 from public.school_settings);
