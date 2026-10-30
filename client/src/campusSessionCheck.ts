import { supabase } from './account'

// Manually imported from the Vite development console; never imported by the app.
// Both RPCs are read-only and use the existing client's signed-in session.
export async function checkCampusSession(expectedEditor: boolean) {
  if (!import.meta.env.DEV) throw new Error('Campus session checks are development-only.')
  if (typeof expectedEditor !== 'boolean') throw new Error('Supply the expected editor permission as true or false.')
  if (!supabase) throw new Error('Configure the existing Supabase client before checking campus permissions.')

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token || session.user.role !== 'authenticated') throw new Error()

    // Distinguish an eligible non-editor from an ineligible account: both would
    // otherwise receive false from the capability RPC. The database is authority.
    const eligibility = await supabase.rpc('account_is_eligible')
    if (eligibility.error || eligibility.data !== true) throw new Error()

    const capability = await supabase.rpc('campus_locations_can_manage')
    if (capability.error || typeof capability.data !== 'boolean') throw new Error()
    return { passed: capability.data === expectedEditor, eligible: true, canManage: capability.data }
  } catch {
    // Never propagate raw Auth/PostgREST errors, session objects or identifiers.
    throw new Error('Campus session check could not complete. Sign in with an eligible student account, then check RPC availability and retry.')
  }
}
