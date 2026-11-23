import { createClient } from '@supabase/supabase-js';

export type AuthorizeOcr = (token: string) => Promise<string | null>;
export type ReserveOcr = (userId: string) => Promise<boolean>;

export const authorizeOcr: AuthorizeOcr = async token => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('OCR authentication is not configured.');
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;
  const eligibility = await client.rpc('account_is_eligible');
  if (eligibility.error) throw new Error('Unable to check OCR eligibility.');
  return eligibility.data === true ? user.id : null;
};

// Only the backend service key can reserve requests. Never send this key to the browser.
export const reserveOcr: ReserveOcr = async userId => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('OCR usage storage is not configured.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('reserve_schedule_ocr', { p_user_id: userId });
  if (error || typeof data !== 'boolean') throw new Error('OCR usage storage is unavailable.');
  return data;
};
