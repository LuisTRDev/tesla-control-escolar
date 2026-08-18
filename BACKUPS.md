# Política de backups — Tesla Control Escolar

El botón Backups genera una copia lógica JSON útil para contingencia y revisión. No sustituye una copia nativa de PostgreSQL.

Recomendación operativa:

- Copia lógica manual antes de migraciones SQL importantes.
- Mantener habilitados los backups administrados disponibles en el plan de Supabase.
- Conservar periódicamente una copia fuera de la cuenta principal.
- Probar restauración en un proyecto de prueba antes de depender de un backup como único mecanismo de recuperación.
- No guardar archivos de backup con datos de alumnos en repositorios públicos.
