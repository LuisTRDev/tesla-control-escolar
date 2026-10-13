# CLAUDE.md — Tesla Control Escolar

Contexto para Claude Code. Léelo al iniciar y **no leas `docs/conversaciones/`** (historial antiguo, muy pesado; solo respaldo).

## Cómo trabajar conmigo
- Responde siempre en **español**.
- Antes de modificar código, analiza la parte del proyecto afectada. **No asumas reglas de negocio** que no te di: pregunta.
- Lee solo los archivos relevantes para la tarea, no todo el proyecto.
- Un commit por tema, para poder revertir cada uno por separado.
- **No hagas push a `main` sin que yo lo apruebe.** Antes de subir: `npx tsc -b`, `npm test`, `npm run lint`, `npm run build`.
- Al terminar, dime qué probar y si hay que ejecutar algún SQL en Supabase.
- No hay Python en este equipo: usa Node para scripts.
- ⚠️ `.env.local` puede tener activas las claves de **PRODUCCIÓN**. Avísame antes de pruebas que escriban datos.

## Qué es
PWA de control escolar del colegio Nikola Tesla: asistencia (entradas, tardanzas, salidas), control de presentación/uniforme, notificaciones a apoderados (PDF/Word), cobranza de pensiones, reportes, alertas, panel TV y modo PDA por DNI.

- **Stack:** React 18 + TypeScript + Vite + Tailwind + Framer Motion. Supabase (Auth, Postgres con RLS, Realtime). Netlify (despliegue automático al hacer push a `main`).
- **Repo:** `LuisTRDev/tesla-control-escolar`, rama `main`.
- **Documentos:** jsPDF, docxtemplater (plantillas en `public/templates/`), xlsx.
- **Offline:** IndexedDB como caché y cola (`src/lib/offlineDb.ts`), sincronización en `src/services/syncService.ts`, service worker en `public/sw.js`. Supabase es la fuente de verdad. Acciones destructivas exigen conexión.

## Estructura
```
src/pages/        Login, Attendance.tsx (~1.900 líneas, componente central)
src/components/   Un componente por módulo (RosterManager, Cobranza, PdaMode, LiveTvPanel...)
src/services/     Acceso a Supabase por dominio (schoolService, rosterService, cobranzaService, phase6Service...)
src/lib/          dates.ts (fechas en hora local), errorLogger (reportError), security, offlineDb
src/hooks/        Red, actualización PWA, realtime
supabase/         Scripts SQL por fase (ejecutados en orden en el SQL Editor)
```

## Convenciones del código
- **Fechas:** usar siempre los helpers de `src/lib/dates.ts` / `getTodayKey()`. Nunca `toISOString().slice(0,10)` (da la fecha UTC: error a partir de las 7 p. m. en Perú). Excepción: la importación histórica de Excel, que viene en UTC.
- **Errores:** `reportError()` del errorLogger, no `console.error`.
- **Sin `any`** (ESLint los marca).
- **Botones:** usar `variant="default"`. Los colores `brand-*` **no están definidos** en Tailwind y **no quiero definirlos** (vuelven dorada la app). Otros botones antiguos con `variant="brand"` se ven mal en modo claro: pendiente decidir.
- Roles en `profiles.role`: `ADMIN`, `AUXILIAR`, `MANAGEMENT`. Función SQL `is_admin()` y `isAdminRole()` en el frontend.
- Tests con Vitest (`npm test`), ESLint solo reporte (`npm run lint`, 6 avisos conocidos de `useEffect` en Attendance).

## Hecho (todo en `main`)
- Limpieza del repo, helpers unificados, corrección de fechas UTC, Vitest, ESLint, tipado, README.
- **Módulo "Alumnos y apoderados"** (solo ADMIN, `RosterManager.tsx` + `rosterService.ts`): registrar alumnos y apoderados, vincular (con parentesco y principal), filtro con/sin apoderado (sin apoderado parpadea en rojo, animación `blinkRed`).
- **Inhabilitar/reactivar alumno** con motivo (abandono, suspensión, traslado...): aparece gris, tachado y no seleccionable en asistencia; bloqueado en PDA; excluido de TV, dashboard y modo rápido.
- **Eliminar alumno** con confirmación escribiendo `ELIMINAR` (borra su historial, no sus apoderados).
- **Asignar/reasignar aula**, individual y en grupo; filtro "Sin aula".
- SQL ejecutados en Supabase: hasta `phase10_student_status.sql`.

## Pendiente / ideas acordadas (no hacer sin pedirlo)
- Exportar esquema real: `supabase db dump --schema-only > supabase/schema.sql` (faltan tablas y RPC en el repo).
- Permisos por rol (`is_admin()`) en `school_settings`, borrados y cierre de asistencia (hoy RLS permite todo a cualquier autenticado).
- Carga bajo demanda de jsPDF/xlsx/docxtemplater **precargándolas en el service worker** (si no, fallan offline).
- Realtime por tabla en vez de recargar todo.
- Sincronización offline que no pise registros y guarde la hora real de la marca.
- Reemplazar `xlsx` 0.18.5 (vulnerable).
- Un solo estado para modales y dividir `Attendance.tsx`.
- Reportes agrupan por aula actual del alumno (al cambiar de aula, su historial se cuenta en la nueva).
