-- Consultas de apoyo para phase18 (solo leen, no cambian nada). Se ejecutan tal cual.
-- Con los resultados, borra los que sobren escribiendo el número de id, por ejemplo:
--   delete from public.early_exits where id = 123;
--   delete from public.student_permissions where id = 456;

-- A. Salidas anticipadas repetidas (mismo alumno y día).
select 'SALIDA' as tipo, e.id, e.date, e.exit_time, s.last_name, s.first_name, e.picked_up_by_name, e.reason, e.created_at
from public.early_exits e
join public.students s on s.id = e.student_id
where (e.student_id, e.date) in (
  select student_id, date from public.early_exits group by student_id, date having count(*) > 1
)
order by e.student_id, e.date, e.id;

-- B. Permisos repetidos (mismo alumno, tipo y fechas).
select 'PERMISO' as tipo, p.id, p.kind, p.date_from, p.date_to, s.last_name, s.first_name, p.reason, p.created_at
from public.student_permissions p
join public.students s on s.id = p.student_id
where (p.student_id, p.kind, p.date_from, p.date_to) in (
  select student_id, kind, date_from, date_to from public.student_permissions
  group by student_id, kind, date_from, date_to having count(*) > 1
)
order by p.student_id, p.date_from, p.id;
