-- Fase 9 — Gestión del padrón desde la app (alumnos, apoderados y vínculos).
-- Ejecutar en Supabase > SQL Editor. Es idempotente: se puede correr más de una vez.
--
-- Solo los perfiles con role = 'ADMIN' pueden crear/editar alumnos, apoderados
-- y vínculos. El resto de usuarios autenticados mantiene acceso de lectura.

-- 1. Helper de rol. SECURITY DEFINER para poder leer profiles sin depender de su RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and upper(role) = 'ADMIN'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 2. guardians.student_id es del modelo antiguo (1 apoderado por alumno).
--    Los vínculos ahora viven en student_guardians, así que no debe ser obligatorio.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'guardians' and column_name = 'student_id'
  ) then
    execute 'alter table public.guardians alter column student_id drop not null';
  end if;
end $$;

-- 3. Evitar vincular dos veces el mismo apoderado al mismo alumno
--    (solo se crea si los datos actuales no tienen duplicados).
do $$
begin
  if not exists (
    select 1 from public.student_guardians
    group by student_id, guardian_id having count(*) > 1
  ) then
    execute 'create unique index if not exists student_guardians_student_guardian_key on public.student_guardians (student_id, guardian_id)';
  else
    raise notice 'student_guardians tiene vínculos duplicados: límpialos y vuelve a ejecutar para crear el índice único.';
  end if;
end $$;

-- 4. Políticas de escritura (solo ADMIN).
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;

drop policy if exists "Admin insert students" on public.students;
drop policy if exists "Admin update students" on public.students;
create policy "Admin insert students"
  on public.students for insert to authenticated with check (public.is_admin());
create policy "Admin update students"
  on public.students for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin insert guardians" on public.guardians;
drop policy if exists "Admin update guardians" on public.guardians;
create policy "Admin insert guardians"
  on public.guardians for insert to authenticated with check (public.is_admin());
create policy "Admin update guardians"
  on public.guardians for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Authenticated read student guardians" on public.student_guardians;
drop policy if exists "Admin insert student guardians" on public.student_guardians;
drop policy if exists "Admin update student guardians" on public.student_guardians;
drop policy if exists "Admin delete student guardians" on public.student_guardians;
create policy "Authenticated read student guardians"
  on public.student_guardians for select to authenticated using (true);
create policy "Admin insert student guardians"
  on public.student_guardians for insert to authenticated with check (public.is_admin());
create policy "Admin update student guardians"
  on public.student_guardians for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin delete student guardians"
  on public.student_guardians for delete to authenticated using (public.is_admin());

-- 5. Para dar rol de administrador a un usuario:
-- update public.profiles set role = 'ADMIN' where id = '<uuid del usuario>';
