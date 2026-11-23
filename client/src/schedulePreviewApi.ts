import { supabase } from './account'

export async function schedulePreviewHeaders(signal: AbortSignal, client = supabase): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'X-Schedule-Preview': '1' }
  if (client) {
    const { data, error } = await client.auth.getSession()
    if (signal.aborted) throw new DOMException('Import cancelled', 'AbortError')
    if (error || !data.session?.access_token) throw new Error('Sign in again before importing a schedule.')
    headers.Authorization = `Bearer ${data.session.access_token}`
  } else if (!import.meta.env.DEV) {
    throw new Error('Sign in before importing a schedule.')
  }
  if (signal.aborted) throw new DOMException('Import cancelled', 'AbortError')
  return headers
}
