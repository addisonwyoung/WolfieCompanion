import { useEffect, useRef } from 'react'

export function scrollIfNeeded(element: HTMLElement) {
  const bounds = element.getBoundingClientRect()
  const container = element.closest('dialog')
  const frame = container?.getBoundingClientRect()
  const top = Math.max(0, frame?.top ?? 0)
  const bottom = Math.min(window.innerHeight, frame?.bottom ?? window.innerHeight)
  if (bounds.top >= top && bounds.bottom <= bottom) return
  // For a tall panel, reveal its start without hiding the triggering control unnecessarily.
  if (bounds.height > bottom - top && bounds.top >= top && bounds.top < bottom) return
  element.scrollIntoView?.({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
}

export function useExpandedScroll<T extends HTMLElement>(expanded: boolean) {
  const ref = useRef<T>(null)
  const previous = useRef(expanded)
  useEffect(() => {
    const opening = expanded && !previous.current
    previous.current = expanded
    if (!opening) return
    const frame = requestAnimationFrame(() => { if (ref.current) scrollIfNeeded(ref.current) })
    return () => cancelAnimationFrame(frame)
  }, [expanded])
  return ref
}
