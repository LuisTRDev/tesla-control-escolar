# Tesla Control Escolar — Fase 2

Web responsive construida con el mismo enfoque del proyecto YARG: React + Vite + TypeScript + Tailwind CSS.

## Incluye
- Login demo.
- Aula seleccionada por defecto y selector de aulas en la misma vista.
- Lista y búsqueda de alumnos.
- Registro de hora de llegada.
- Hora límite configurable (07:45 por defecto).
- Cálculo automático de **A tiempo** o **Tardanza**.
- Contadores de alumnos, a tiempo, tardanzas y pendientes.
- Filtros: Todos / A tiempo / Tardanza / Pendientes.
- Persistencia en localStorage.
- Recalcula los registros del día si cambia la hora límite.
- Migra automáticamente registros locales de la Fase 1.

## Ejecutar
```bash
npm install
npm run dev
```

## Login demo
- Usuario: `auxiliar`
- Contraseña: `123456`

## Nota
Esta fase sigue siendo frontend/local para facilitar la demostración. Backend, base de datos y autenticación real se incorporarán en fases posteriores sin rehacer esta interfaz.
