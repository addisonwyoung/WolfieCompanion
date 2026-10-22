import { useEffect, useId, useLayoutEffect, useRef } from 'react'

export default function AcademicItemActions({ title, open, disabled, onOpenChange, onEdit, onDelete }: {
  title: string; open: boolean; disabled: boolean; onOpenChange: (open: boolean) => void
  onEdit: (trigger: HTMLButtonElement) => void; onDelete: (trigger: HTMLButtonElement) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return
    const box = trigger.current.getBoundingClientRect()
    const size = menu.current.getBoundingClientRect()
    menu.current.style.left = `${Math.max(8, Math.min(box.right - size.width, window.innerWidth - size.width - 8))}px`
    menu.current.style.top = `${Math.max(8, Math.min(box.bottom + 4, window.innerHeight - size.height - 8))}px`
    menu.current.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const dismiss = () => onOpenChange(false)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    document.addEventListener('scroll', dismiss, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', dismiss, true) }
  }, [open, onOpenChange])
  return <div className="academic-actions">
    <button ref={trigger} className="academic-actions-trigger" type="button" disabled={disabled}
      aria-label={`Actions for ${title}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => onOpenChange(!open)}><span aria-hidden="true">⋯</span></button>
    {open && <div ref={menu} id={id} role="menu" aria-label={`Actions for ${title}`} className="academic-menu" onKeyDown={event => {
      const actions = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role=menuitem]'))
      const current = actions.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length
        actions[next]?.focus()
      } else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); onOpenChange(false); trigger.current?.focus()
      } else if (event.key === 'Tab') {
        // Return to the persistent trigger before normal Tab/Shift+Tab navigation.
        trigger.current?.focus(); onOpenChange(false)
      }
    }}>
      <button role="menuitem" tabIndex={-1} type="button" onClick={() => { onOpenChange(false); onEdit(trigger.current!) }}>Edit</button>
      <button role="menuitem" tabIndex={-1} type="button" className="academic-menu-danger" onClick={() => { onOpenChange(false); onDelete(trigger.current!) }}>Delete</button>
    </div>}
  </div>
}
