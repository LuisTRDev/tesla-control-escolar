-- Fase 10 — Inhabilitar y eliminar alumnos desde el padrón.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de phase9_admin_roster.sql.
-- Es idempotente: se puede correr más de una vez.

-- 1. Estado del alumno. Un alumno inhabilitado (abandono, suspensión, traslado...)
--    conserva todo su historial pero ya no se puede marcar en asistencia.
alter table public.students
  add column if not exists is_active boolean not null default true,
  add column if not exists inactive_reason text,
  add column if not exists inactive_note text,
  add column if not exists inactive_since date;

-- 2. Borrado recursivo interno: antes de borrar una fila elimina las filas que la
--    referencian (asistencias, controles, notificaciones, alertas, vínculos...).
--    Si la columna que referencia admite NULL (ej. guardians.student_id del modelo
--    antiguo) se deja en NULL en vez de borrar la fila, para no perder apoderados
--    compartidos con hermanos.
create or replace function public._purge_rows(p_table regclass, p_column text, p_values text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fk record;
  child_ids text[];
begin
  if p_values is null or coalesce(array_length(p_values, 1), 0) = 0 then
    return;
  end if;

  for fk in
    select c.conrelid::regclass as child_table, a.attname as child_column, a.attnotnull as not_null
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = p_table
      and c.conrelid <> p_table
      and array_length(c.conkey, 1) = 1
  loop
    if not fk.not_null then
      execute format('update %s set %I = null where %I::text = any($1)', fk.child_table, fk.child_column, fk.child_column) using p_values;
    else
      if exists (select 1 from pg_attribute where attrelid = fk.child_table and attname = 'id' and not attisdropped) then
        execute format('select array_agg(id::text) from %s where %I::text = any($1)', fk.child_table, fk.child_column) into child_ids using p_values;
        perform public._purge_rows(fk.child_table, 'id', child_ids);
      else
        execute format('delete from %s where %I::text = any($1)', fk.child_table, fk.child_column) using p_values;
      end if;
    end if;
  end loop;

  execute format('delete from %s where %I::text = any($1)', p_table, p_column) using p_values;
end;
$$;

revoke all on function public._purge_rows(regclass, text, text[]) from public;
revoke all on function public._purge_rows(regclass, text, text[]) from anon, authenticated;

-- 3. Eliminación definitiva de un alumno y TODO su historial. Solo ADMIN.
create or replace function public.admin_delete_student(p_student_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'permission denied: solo un administrador puede eliminar alumnos';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'El alumno ya no existe.';
  end if;
  perform public._purge_rows('public.students'::regclass, 'id', array[p_student_id::text]);
end;
$$;

revoke all on function public.admin_delete_student(bigint) from public, anon;
grant execute on function public.admin_delete_student(bigint) to authenticated;
