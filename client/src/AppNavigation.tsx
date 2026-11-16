import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppView } from './useAppNavigation'
import { MessagesNavigation } from './MessagingNotifications'
import NotificationBell from './NotificationBell'

type Menu = 'academics' | 'explore' | 'profile' | 'notifications'
type Destination = { view: AppView; label: string }
const academics: Destination[] = [{ view: 'academic', label: 'Assignments & Exams' }, { view: 'evaluations', label: 'Course evaluations' }]
const explore: Destination[] = [{ view: 'explorer', label: 'Campus Explorer' }, { view: 'spaces', label: 'Study spaces' }]

export function NavigationHeader({ children }: { children?: ReactNode }) {
  return <header className="site-header"><div className="header-inner"><a href="#main" className="brand"><span className="brand-mark" aria-hidden="true">W</span><span>Wolfie <strong>Companion</strong></span></a>{children}</div></header>
}

function Dropdown({ name, label, open, active = false, onToggle, onOpen, children, icon = false }: {
  name: Menu; label: string; open: boolean; active?: boolean; onToggle: () => void; onOpen: () => void; children: ReactNode; icon?: boolean
}) {
  const id = useId(), panel = useRef<HTMLDivElement>(null)
  function focusItem(last: boolean) {
    requestAnimationFrame(() => {
      const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button')
      const button = last ? buttons?.[buttons.length - 1] : buttons?.[0]
      button?.focus()
    })
  }
  return <div className={`header-dropdown${icon ? ' header-account' : ''}`} data-header-dropdown={name}>
    <button type="button" className={icon ? 'header-icon-button' : 'header-nav-button'} data-menu-trigger={name} data-active={active}
      aria-label={icon ? label : undefined} title={icon ? label : undefined} aria-expanded={open} aria-controls={id} aria-describedby={active ? `${id}-current` : undefined}
      onClick={onToggle} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); onOpen(); focusItem(event.key === 'ArrowUp') }
      }}>
      {icon ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg> : <>{label}<svg className="header-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg></>}
    </button>
    {active && <span id={`${id}-current`} className="sr-only">Contains the current page</span>}
    <div ref={panel} id={id} className="header-menu" role="group" aria-label={`${label} options`} hidden={!open} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      event.preventDefault(); buttons[next]?.focus()
    }}>{children}</div>
  </div>
}

export default function AppNavigation({ view, onNavigate, onSignOut, checkItem, onViewItem, ready = true }: {
  view: AppView; onNavigate: (view: AppView) => void; onSignOut: () => void
  checkItem: (id: string) => Promise<boolean>; onViewItem: (id: string) => void; ready?: boolean
}) {
  const [open, setOpen] = useState<Menu | null>(null), root = useRef<HTMLElement>(null)
  useEffect(() => {
    function outside(event: Event) {
      const dropdown = root.current?.querySelector(`[data-header-dropdown="${open}"]`)
      if (open && !dropdown?.contains(event.target as Node)) setOpen(null)
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !open || open === 'notifications') return
      setOpen(null); root.current?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${open}"]`)?.focus()
    }
    const close = () => setOpen(null)
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside); document.addEventListener('keydown', escape)
    window.addEventListener('popstate', close)
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', escape)
      window.removeEventListener('popstate', close)
    }
  }, [open])
  function navigate(next: AppView) {
    setOpen(null)
    if (open) root.current?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${open}"]`)?.focus()
    onNavigate(next)
  }
  function menu(name: Menu, label: string, destinations: Destination[]) {
    return <Dropdown name={name} label={label} open={open === name} active={destinations.some(item => item.view === view)} onToggle={() => setOpen(open === name ? null : name)} onOpen={() => setOpen(name)}>
      {destinations.map(item => <button type="button" key={item.view} aria-current={view === item.view ? 'page' : undefined} aria-pressed={view === item.view} onClick={() => navigate(item.view)}>{item.label}</button>)}
    </Dropdown>
  }
  return <nav ref={root} className="app-nav" aria-label="Main navigation">
    {ready && <div className="header-primary">
      <button type="button" className="header-nav-button" aria-current={view === 'dashboard' ? 'page' : undefined} aria-pressed={view === 'dashboard'} onClick={() => navigate('dashboard')}>Dashboard</button>
      <MessagesNavigation active={view === 'messages'} onClick={() => navigate('messages')}/>
      <button type="button" className="header-nav-button" aria-current={view === 'study-groups' ? 'page' : undefined} aria-pressed={view === 'study-groups'} onClick={() => navigate('study-groups')}>Study buddies</button>
      {menu('academics', 'Academics', academics)}{menu('explore', 'Explore', explore)}
    </div>}
    <div className="header-actions">
      {ready && <div data-header-dropdown="notifications"><NotificationBell key={view} iconOnly open={open === 'notifications'} onOpenChange={value => setOpen(value ? 'notifications' : null)} checkItem={checkItem} onViewItem={onViewItem}/></div>}
      <Dropdown name="profile" label="Account" open={open === 'profile'} icon onToggle={() => setOpen(open === 'profile' ? null : 'profile')} onOpen={() => setOpen('profile')}>
        <button type="button" onClick={() => { setOpen(null); onSignOut() }}>Sign out</button>
      </Dropdown>
    </div>
  </nav>
}
