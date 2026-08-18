# Fase 7 — PWA, offline, sincronización y producción

## Incluido

- PWA instalable: manifest, service worker, iconos 192/512 y botón de instalación cuando el navegador lo permite.
- Caché local con IndexedDB para aulas, alumnos, asistencia, presentación, configuración y notificaciones.
- Cola offline persistente para:
  - marcación de entrada;
  - control de reglamento/presentación.
- Sincronización automática:
  - al recuperar conexión;
  - cada 2 minutos;
  - al volver a la pestaña;
  - manual desde el indicador superior.
- Pull periódico: después de vaciar la cola se recarga la información de Supabase y se actualiza la caché local.
- Reintentos: una operación fallida permanece en la cola con contador y último error.
- Modo Auxiliar Rápido para marcar entradas con un toque.
- Estado visible: En línea / Offline / Sincronizando / cambios pendientes / última sync.
- Centro de backups:
  - exportación lógica JSON de tablas operativas de Supabase;
  - exportación del estado offline del dispositivo.
- Alertas de Fase 6 reutilizadas como notificaciones internas y complementadas con avisos de sincronización/offline.
- Seguridad de acciones destructivas: Reiniciar hoy y cambio de hora límite requieren conexión.
- Sesión operativa offline: conserva el último perfil autenticado y las aulas cacheadas si existe una sesión local de Supabase.

## Fuente de verdad

Supabase sigue siendo la fuente de verdad. IndexedDB actúa como caché y cola de contingencia. Las operaciones pendientes se envían al recuperar Internet usando upsert/constraints existentes.

## Pruebas recomendadas

1. Abrir online y navegar por varias aulas para llenar la caché.
2. Desactivar Internet.
3. Marcar varias entradas y un control de reglamento.
4. Recargar la PWA: los pendientes deben reaparecer desde IndexedDB.
5. Recuperar Internet y verificar que la cola llegue a 0.
6. Revisar Supabase desde otro dispositivo.
7. Probar dos dispositivos y confirmar que el pull periódico actualiza la información.
8. Instalar la PWA en Android/Chrome/Edge.

## SQL

La fase asume que ya se ejecutó el parche de `updated_at`, triggers e índices de sincronización preparado para Fase 7.
