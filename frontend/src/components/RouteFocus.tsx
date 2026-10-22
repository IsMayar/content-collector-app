import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

// Kept above the switching layouts so cross-layout navigation also moves focus.
export function RouteFocus() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current !== pathname) {
      document.getElementById('main-content')?.focus()
      window.scrollTo(0, 0)
      previous.current = pathname
    }
    document.title = `${document.querySelector('h1')?.textContent || 'Welcome'} | Website Content Collector`
  }, [pathname])
  return null
}
