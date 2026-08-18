# Tesla Control Escolar — Fase 4

Fase 4 convierte la demo local en un sistema persistente con **Supabase Auth + PostgreSQL + RLS**.

## Incluye

- Login real con Supabase Auth.
- Perfil real (`profiles`) y cierre de sesión.
- Aulas cargadas desde `classrooms`.
- Alumnos y apoderados cargados desde `students` + `guardians`.
- Hora límite centralizada en `school_settings`.
- Asistencia/tardanzas guardadas en PostgreSQL.
- Control de presentación e incumplimientos guardados en PostgreSQL.
- PDF y Word usando los datos reales del alumno/apoderado/tutor.
- Notificación individual optimizada para impresión en ficha de **210 × 99 mm (1/3 A4)**.
- Multinotificación de **1 a 3 alumnos** en una sola hoja A4 vertical, con líneas de corte.
- Selección de alumnos con incidencia desde distintas aulas, con límite visible **3/3**.
- Historial mensual por alumno.
- Dashboard por aula con datos reales y selector **Hoy / Este mes**.
- Preferencias visuales (tema, tamaño, sonido, última aula) siguen en `localStorage`, porque son preferencias del dispositivo y no datos escolares.

## 1. Preparar Supabase

Las tablas esperadas son:

- `classrooms`: `id`, `created_at`, `grade`, `section`, `level`, `tutor_name`
- `students`: `id`, `created_at`, `first_name`, `last_name`, `classroom_id`
- `guardians`: `id`, `created_at`, `student_id`, `full_name`, `dni`, `phone`, `relationship`
- `attendance`: `id`, `created_at`, `student_id`, `date`, `entry_time`, `status`
- `school_settings`: `id`, `created_at`, `entry_limit_time`
- `presentation_controls`: `id`, `created_at`, `student_id`, `date`, `status`, `other_description`, `checked_at`
- `presentation_violations`: `id`, `created_at`, `presentation_control_id`, `violation_type`
- `profiles`: `id uuid`, `created_at`, `full_name`, `role`

Ejecuta en **Supabase > SQL Editor**:

`supabase/phase4_setup.sql`

Ese script agrega los índices únicos que necesita `upsert`, checks y las políticas RLS de esta fase.

## 2. Variables de entorno

Copia `.env.example` como `.env.local`:

```bash
cp .env.example .env.local
```

En Windows puedes crear `.env.local` manualmente.

Usa la **Publishable key** de Supabase, nunca una Secret key:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxx
```

`.env.local` está ignorado por Git.

### Netlify

En **Site configuration > Environment variables** crea las mismas dos variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No subas `.env.local` al repositorio.

## 3. Usuario

Crea el usuario en **Supabase > Authentication > Users**. Luego inserta en `profiles` una fila cuyo `id` sea exactamente el UUID de `auth.users.id`.

Ejemplo:

- `id`: UUID del usuario Auth
- `full_name`: Auxiliar Tesla
- `role`: AUXILIARY

## 4. Ejecutar

```bash
npm install
npm run dev
```

Para validar antes de GitHub/Netlify:

```bash
npm run build
```

## 5. Datos de prueba

Carga al menos:

- 2 aulas
- 4 alumnos
- 1 apoderado por alumno
- 1 fila en `school_settings` con `07:45:00`

La aplicación ya no utiliza los mocks de `src/data` para operar. Esos archivos pueden conservarse como referencia o eliminarse más adelante.

## Seguridad

La Fase 4 exige usuario autenticado para acceder a los datos. Las políticas actuales permiten a usuarios autenticados operar asistencia/presentación. En una futura fase administrativa se pueden endurecer las políticas por rol (`AUXILIARY`, `ADMIN`, `MANAGEMENT`).


## Módulo de notificaciones — formato de impresión

### Individual

- PDF: página personalizada de **210 × 99 mm**.
- Word: página personalizada de **210 × 99 mm**.
- Mantiene alumno, aula, tutor, apoderado, DNI, fecha, incumplimientos, observación, seguimiento y firmas.
- El número de notificación se calcula con el historial de incumplimientos del alumno: primera, segunda o tercera.

### Multinotificación

Desde el botón **Notificaciones** del encabezado se pueden elegir hasta tres alumnos con incidencias registradas en el día. Pueden pertenecer a distintas aulas.

- 1 seleccionado: primera franja ocupada, dos espacios vacíos.
- 2 seleccionados: dos franjas ocupadas, un espacio vacío.
- 3 seleccionados: tres franjas ocupadas.
- PDF/Word: hoja **A4 vertical 210 × 297 mm**.
- Cada ficha ocupa **210 × 99 mm**.
- Incluye separación/línea de corte entre fichas.
- Constante central: `MAX_NOTIFICATIONS_PER_PAGE = 3`.

La ficha fue compactada para conservar legibilidad en un tercio de A4, especialmente en la sección de compromiso y seguimiento.

## Word mediante plantillas DOCX

La exportación Word ya no construye el documento desde cero. Usa plantillas físicas ubicadas en:

- `public/templates/notification-individual.docx` — ficha individual 210 x 99 mm.
- `public/templates/notification-multiple.docx` — A4 vertical con tres fichas.

`src/lib/notification.ts` carga estas plantillas con `docxtemplater` + `pizzip` y únicamente reemplaza los datos del alumno. Esto hace que Word conserve la maquetación de la ficha.

Si el colegio pide mover textos, cambiar márgenes o ajustar tamaños, se puede editar directamente la plantilla DOCX en Word sin rehacer el generador PDF. No cambies los marcadores `{{...}}` si quieres que los datos sigan completándose automáticamente.

Después de descargar esta versión ejecuta:

```bash
npm install
npm run dev
```

El `package-lock.json` no se incluye deliberadamente en esta entrega porque las dependencias de Word cambiaron; `npm install` lo regenerará con las versiones correctas para tu entorno.
