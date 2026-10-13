import { Suspense, useEffect, useState, type ReactNode } from 'react'

/**
 * Monta `children` recién la primera vez que `when` es true y lo mantiene
 * montado después (para no perder la animación de cierre). Pensado para
 * módulos cargados con React.lazy: su código se descarga solo al abrirlos.
 */
export function Deferred({ when, children }: { when: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(when)
  useEffect(() => { if (when) setOpened(true) }, [when])
  if (!opened && !when) return null
  return <Suspense fallback={null}>{children}</Suspense>
}
