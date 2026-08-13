'use client'

import { useEffect, useState } from 'react'

export type ViewportMode = 'phone' | 'tablet' | 'desktop'

const PHONE_QUERY = '(max-width: 699px)'
const TABLET_QUERY = '(min-width: 700px) and (max-width: 1099px)'

function readMode(): ViewportMode {
  if (typeof window === 'undefined') {
    return 'desktop'
  }

  if (window.matchMedia(PHONE_QUERY).matches) {
    return 'phone'
  }

  if (window.matchMedia(TABLET_QUERY).matches) {
    return 'tablet'
  }

  return 'desktop'
}

export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>('desktop')

  useEffect(() => {
    setMode(readMode())

    const phone = window.matchMedia(PHONE_QUERY)
    const tablet = window.matchMedia(TABLET_QUERY)

    const onChange = () => setMode(readMode())
    phone.addEventListener('change', onChange)
    tablet.addEventListener('change', onChange)

    return () => {
      phone.removeEventListener('change', onChange)
      tablet.removeEventListener('change', onChange)
    }
  }, [])

  return mode
}
