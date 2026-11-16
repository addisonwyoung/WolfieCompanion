import { useCallback, useEffect, useState } from 'react'

export const appViews = ['dashboard', 'messages', 'spaces', 'study-groups', 'explorer', 'evaluations', 'academic'] as const
export type AppView = typeof appViews[number]
export function currentView(): AppView {
  const value = new URLSearchParams(window.location.search).get('view')
  return appViews.includes(value as AppView) ? value as AppView : 'dashboard'
}
export function useAppNavigation(onRestore: () => void) {
  const [view, setView] = useState(currentView)
  useEffect(() => {
    function restore() { onRestore(); setView(currentView()) }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [onRestore])
  const navigate = useCallback((next: AppView) => {
    if (currentView() !== next) {
      const url = new URL(window.location.href)
      if (next === 'dashboard') url.searchParams.delete('view')
      else url.searchParams.set('view', next)
      window.history.pushState(window.history.state, '', url)
    }
    setView(next)
  }, [])
  return [view, navigate] as const
}
