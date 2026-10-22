import { useLayoutEffect, useRef } from 'react'

// Presentation lifecycle only. Keeping the dialog in the account subtree makes
// unmount authoritative: no prompt, pending focus callback, or global draft survives.
export function useAcademicDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current!
    const previousOverflow = document.body.style.overflow
    if (!dialog.open) dialog.showModal()
    document.body.style.overflow = 'hidden'
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    // Native modality blocks the page; explicitly wrap the document tab cycle
    // rather than allowing a boundary Tab to leave for browser chrome.
    function containFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,[tabindex]'))
        .filter(control => !control.matches(':disabled') && control.tabIndex >= 0 && control.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (!first) {
        event.preventDefault(); dialog.querySelector<HTMLElement>('[data-progress]')?.focus()
      } else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); first.focus()
      }
    }
    dialog.addEventListener('keydown', containFocus)
    return () => {
      dialog.removeEventListener('keydown', containFocus)
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])
  return ref
}
