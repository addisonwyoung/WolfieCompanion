import { useMemo, useState } from 'react'
import { supabase, configurationError } from './account'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAccount } from './useAccount'
import { classmateApi } from './classmates'
import { useClassmates } from './useClassmates'
import Profile from './Profile'
import CourseBrowser from './CourseBrowser'
import CrowdMeter from './CrowdMeter'
import CourseEvaluations from './CourseEvaluations'
import { courseReviewApi } from './courseReviews'
import './App.css'

function AccountWorkspace({ client }: { client: SupabaseClient }) {
  const account = useAccount(client)
  const reviews = useMemo(() => courseReviewApi(client), [client])
  const discover = useMemo(() => classmateApi(client), [client])
  const [view, setView] = useState('dashboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)
  async function signOut() {
    setActionError(''); setSignOutFailed(false)
    try { await account.signOut() } catch (error) { setActionError((error as Error).message); setSignOutFailed(true) }
  }
  const selected = account.courses.some(c => c.id === selectedId) ? selectedId : account.courses[0]?.id ?? null
  const roster = useClassmates(discover, account.status === 'ready' ? account.userId : null, account.courses.find(c => c.id === selected)?.code ?? null)
  async function signIn() {
    if (signingIn) return
    setSigningIn(true); setActionError('')
    try { await account.signIn() } catch (error) { setActionError((error as Error).message) } finally { setSigningIn(false) }
  }
  return <>
    {account.status !== 'signed-out' && account.status !== 'ineligible' && <div className="account-actions"><button onClick={signOut}>Sign out</button></div>}
    {actionError && <div role="alert" className="error"><p>{actionError}</p>{signOutFailed && <button onClick={signOut}>Retry sign out</button>}</div>}
    {account.status === 'loading' && <p className="auth-panel panel" role="status">Loading your account…</p>}
    {(account.status === 'signed-out' || account.status === 'ineligible') && <section className="auth-panel panel" aria-labelledby="signin-heading">
      <p className="eyebrow">YOUR CAMPUS, A LITTLE CLOSER</p><h1 id="signin-heading">Find your people.</h1><p>Sign in with your Stony Brook Google account. Your first sign-in creates your account.</p>
      <button className="primary" disabled={signingIn} onClick={signIn}>{signingIn ? 'Opening Google…' : 'Continue with Google'}</button>
      {account.message && <p role="alert">{account.message}</p>}<p className="field-help">Use your verified @stonybrook.edu email.</p>
    </section>}
    {account.status === 'error' && <section className="auth-panel panel"><p role="alert">{account.message}</p><button onClick={() => void account.retry()}>Retry loading account</button></section>}
    {account.status === 'ready' && account.profile && <div key={account.userId}>
      <nav className="app-nav" aria-label="Main navigation"><button aria-pressed={view === 'dashboard'} onClick={() => setView('dashboard')}>My dashboard</button><button aria-pressed={view === 'spaces'} onClick={() => setView('spaces')}>Study spaces</button><button aria-pressed={view === 'evaluations'} onClick={() => setView('evaluations')}>Course evaluations</button></nav>
      {!!account.cleanupPaths.length && <div role="status" className="cleanup-notice"><p>An unused picture still needs cleanup. Your saved profile is safe.</p><button onClick={() => void account.retryCleanup()}>Retry picture cleanup</button></div>}
      <div hidden={view !== 'dashboard'}>
        <div className="welcome"><p className="eyebrow">YOUR CAMPUS, A LITTLE CLOSER</p><h1>Find your people.</h1><p>Shared courses. Common interests. Connections start here.</p></div>
        <div className="dashboard"><Profile profile={account.profile} onSave={account.saveProfile} pictureUrl={account.api.pictureUrl} /><CourseBrowser enrolledCourses={account.courses} onAddClasses={account.saveClasses} selectedId={selected} onSelect={setSelectedId} roster={roster} onRetry={roster.retry} /></div>
      </div>
      {view === 'spaces' && <CrowdMeter />}{view === 'evaluations' && <CourseEvaluations api={reviews} />}
    </div>}
  </>
}
export default function App({ client = supabase }: { client?: SupabaseClient | null }) {
  return <>
    <header className="site-header"><div className="header-inner"><a href="#main" className="brand"><span className="brand-mark" aria-hidden="true">W</span><span>Wolfie <strong>Companion</strong></span></a></div></header>
    <main id="main">{client ? <AccountWorkspace client={client} /> : <section className="auth-panel panel"><h1>Account setup needed</h1><p role="alert">{configurationError}</p></section>}</main>
    <footer><span>Wolfie Companion</span><span>A small step toward a more connected campus.</span></footer>
  </>
}
