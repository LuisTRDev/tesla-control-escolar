import { useEffect, useState } from 'react'

/** Celular (vertical) o celular girado / tablet pequeña con pantalla táctil. La TV y el PC siguen con el diseño grande. */
const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-width: 1023px)'

export function useMobileLayout() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return mobile
}
