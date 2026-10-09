# Tesla Control Escolar

PWA para el control diario del colegio: asistencia y tardanzas, control de presentación (reglamento interno), notificaciones a apoderados, cobranza de pensiones, reportes y panel en vivo. Funciona offline y sincroniza con Supabase al recuperar conexión.

**Stack:** React 18 + TypeScript + Vite + Tailwind · Supabase (Auth, PostgreSQL, RLS, Realtime) · Netlify.

## Módulos

| Área | Módulo |
|---|---|
| Operación | Inicio (asistencia y presentación por aula), Modo auxiliar rápido, Modo PDA (DNI), Panel TV en vivo, Dashboard, Reportes, Cobranza, Notificaciones |
| Automatización | Centro de alertas (reincidencias, 3+ notificaciones), Resumen diario |
| Sistema | Alumnos y apoderados (solo ADMIN), Auditoría, Backups, Carga histórica, Configuración |

## Puesta en marcha

### 1. Variables de entorno

Copia `.env.example` como `.env.local` y completa los valores de tu proyecto Supabase:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxx
```

Usa la **Publishable/anon key**, nunca la `service_role`/secret key. `.env.local` está ignorado por Git.

En **Netlify > Site configuration > Environment variables** crea las mismas dos variables.

### 2. Base de datos

Ejecuta en **Supabase > SQL Editor**, en este orden, los scripts de `supabase/`:

| Script | Qué hace |
|---|---|
| `phase4_setup.sql` | Índices únicos para `upsert`, checks y RLS base |
| `phase5_1_1_notification_update.sql` | Notificaciones de reglamento (también desde tardanzas) |
| `phase5_1_backfill_notifications.sql` | *Opcional:* migra incidencias antiguas a `notifications` |
| `phase7_sync.sql` | `updated_at` + triggers para la sincronización offline |
| `phase8_realtime_access.sql` | Modo PDA/DNI, salidas, `access_events`, tardanza automática |
| `phase8_global_realtime.sql` | Habilita Realtime en las tablas operativas |
| `phase9_admin_roster.sql` | `is_admin()` y permisos de escritura del padrón solo para ADMIN |

> **Pendiente:** varias tablas y funciones RPC que usa la app (`alerts`, `notifications`, `audit_logs`, `attendance_closures`, `pension_payments`, `historical_import_*`, `student_guardians`, `get_student_case_file`, etc.) existen en la base de producción pero no están versionadas aquí. Para poder reconstruir la base desde cero, exporta el esquema con `supabase db dump --schema-only > supabase/schema.sql`.

### 3. Usuarios y roles

1. Crea el usuario en **Supabase > Authentication > Users**.
2. Inserta en `profiles` una fila con `id` = UUID de `auth.users.id`, `full_name` y `role`.

| Rol | Acceso |
|---|---|
| `AUXILIARY` | Operación diaria |
| `ADMIN` | Todo lo anterior + módulo **Alumnos y apoderados** |
| `MANAGEMENT` | Reservado (hoy equivale a AUXILIARY) |

### 4. Ejecutar

```bash
npm install
npm run dev
```

## Scripts

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción (lo que corre Netlify) |
| `npm test` | Tests (Vitest) |
| `npm run lint` | ESLint (solo reporta; no bloquea el build) |

Antes de subir cambios: `npm test && npm run build`.

## Estructura

```
src/
  pages/        Login y Attendance (pantalla principal)
  components/   Módulos (modales) y componentes UI
  services/     Acceso a Supabase por dominio (+ *.test.ts)
  lib/          Utilidades: fechas, seguridad, offline (IndexedDB), notificaciones PDF/Word
  hooks/        Red/sincronización, Realtime, PWA
supabase/       Scripts SQL por fase
public/         Service worker, manifest, iconos, plantillas DOCX
```

**Fechas:** usa siempre `src/lib/dates.ts` (`toDateKey`, `addDaysToKey`, …). `toISOString().slice(0, 10)` devuelve el día en UTC y desde las 19:00 (Perú, UTC-5) da la fecha de mañana.

## Offline y sincronización

- IndexedDB guarda una caché de aulas, alumnos, asistencia, presentación y configuración, y una **cola** de operaciones pendientes (entradas, salidas, control de presentación).
- La cola se envía al recuperar conexión, cada 2 minutos, al volver a la pestaña y manualmente desde el indicador superior. Las operaciones fallidas quedan con contador de reintentos y último error.
- Supabase es la fuente de verdad; IndexedDB es caché y contingencia.
- Acciones destructivas (Reiniciar hoy, cambiar hora límite) y los cambios del padrón requieren conexión.
- La versión nueva de la PWA espera a que el usuario pulse **Actualizar ahora**.

## Notificaciones — formato de impresión

- **Individual:** PDF y Word en página de **210 × 99 mm** (1/3 de A4).
- **Multinotificación:** de 1 a 3 alumnos (pueden ser de aulas distintas) en una hoja **A4 vertical**, cada ficha de 210 × 99 mm con línea de corte. Constante: `MAX_NOTIFICATIONS_PER_PAGE = 3`.
- El número de notificación (primera, segunda, tercera) sale del historial del alumno.

### Plantillas Word

Word se genera desde plantillas DOCX con `docxtemplater` + `pizzip`:

- `public/templates/notification-individual.docx`
- `public/templates/notification-multiple.docx`

Para mover textos o ajustar márgenes, edita la plantilla directamente en Word. No cambies los marcadores `{{...}}`.

## Backups

Ver [BACKUPS.md](BACKUPS.md). El botón **Backups** genera una copia lógica JSON; no sustituye los backups nativos de Supabase.
