# Política de backups — Tesla Control Escolar

## Qué hace la app

- **Copias automáticas en el servidor** (requiere `supabase/phase15_users_monitoring_backups.sql`): todos los días a la 1:00 a. m. (hora de Perú) pg_cron guarda una instantánea de las tablas operativas en `backup_snapshots`. Se conservan las 7 automáticas más recientes y las 5 manuales más recientes. El administrador puede crear una al instante y descargar cualquiera en Excel o JSON desde **Copias de seguridad**.
- **Descarga con un clic**: Excel (una hoja por tabla) o JSON con los datos actuales. Se piden por páginas, así que la copia incluye todas las filas aunque pasen de 1000.
- **Estado offline**: exporta la cola pendiente y los conflictos de un equipo que no logra sincronizar.

Si la última copia automática tiene más de un día, la app lo avisa: revisa que la extensión pg_cron esté activa (Supabase > Database > Extensions) y vuelve a ejecutar el bloque 4 de phase15.

## Límites

- Las instantáneas viven en la misma base de datos: protegen ante borrados o errores, no ante la pérdida del proyecto de Supabase. Descarga una copia periódicamente y guárdala fuera (USB, Drive).
- No son una copia nativa de PostgreSQL (no incluyen funciones, políticas ni usuarios de Auth).

## Recomendación operativa

- Descargar una copia antes de ejecutar scripts SQL nuevos.
- Mantener habilitados los backups administrados disponibles en el plan de Supabase.
- Probar restauración en un proyecto de prueba antes de depender de un backup como único mecanismo de recuperación.
- No guardar archivos de backup con datos de alumnos en repositorios públicos.
