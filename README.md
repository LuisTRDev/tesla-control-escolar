# Tesla Control Escolar — Fase 3 completa

Sistema web React + Vite + TypeScript + Tailwind para control de ingreso, tardanzas y presentación institucional.

## Incluye

- Login demo de auxiliar.
- Aula seleccionable desde la misma vista.
- Registro de entrada con hora automática.
- Hora límite configurable y detección automática de tardanzas.
- Filtros y contadores.
- Modo claro, oscuro y sistema.
- Preferencias de interfaz, sonido y recordar última aula.
- Control de presentación: Conforme / Con incumplimiento / Sin revisar.
- Incumplimientos institucionales:
  1. Peinado no acorde con las disposiciones institucionales.
  2. Uso inadecuado o incompleto del uniforme.
  3. Prenda no correspondiente al uniforme institucional.
  4. Otro (requiere descripción).
- Datos demo de padre/madre/apoderado: nombre, DNI y teléfono.
- Tutor docente asociado a cada aula.
- Generación de notificación personalizada al registrar un incumplimiento.
- Descarga de la notificación en PDF y Word (.docx), lista para imprimir/editar.
- Persistencia temporal mediante localStorage. La base de datos real se implementará en la siguiente fase.

## Ejecutar

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Netlify:
- Build command: `npm run build`
- Publish directory: `dist`

## Importante

Los alumnos, DNIs, teléfonos y tutores incluidos son datos de demostración. Antes de usar el sistema con información real del colegio deben reemplazarse por los registros autorizados y, en la fase de backend, almacenarse de forma segura.
