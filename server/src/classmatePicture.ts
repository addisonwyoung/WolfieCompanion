import express from 'express';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export interface PictureAccess {
  caller: (token: string, course: string, peer: string) => Promise<string | null>;
  picture: (caller: string, course: string, peer: string) => Promise<Buffer | null>;
}
export function createPictureAccess(factory: typeof createClient = createClient, env: NodeJS.ProcessEnv = process.env): PictureAccess { return {
  async caller(token, course, peer) {
    const url = env.SUPABASE_URL, key = env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Configuration unavailable');
    const client = factory(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    const detail = await client.rpc('get_classmate_profile', { p_course_code: course, p_student_id: peer });
    if (detail.error) {
      if (['42501', '22023'].includes(detail.error.code)) return null;
      throw new Error('Profile unavailable');
    }
    return detail.data?.has_shared_avatar === true ? data.user.id : null;
  },
  async picture(caller, course, peer) {
    const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Configuration unavailable');
    const client = factory(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const resolved = await client.rpc('resolve_classmate_avatar', { p_caller_id: caller, p_student_id: peer, p_course_code: course });
    if (resolved.error) throw new Error('Picture unavailable');
    const path = resolved.data;
    if (typeof path !== 'string' || !path.startsWith(`${peer}/`) || !/^[a-f0-9-]+\/(?:[a-f0-9-]+)\.(png|jpg)$/.test(path)) return null;
    const { data, error } = await client.storage.from('avatars').download(path);
    if (error || !data) return null;
    if (data.size > 5 * 1024 * 1024) return null;
    return Buffer.from(await data.arrayBuffer());
  },
} }
export const pictureAccess = createPictureAccess();
export function classmatePictureRouter(access: PictureAccess = pictureAccess) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff');
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in to view this picture.' }); return; }
    const { course, student } = req.query;
    if (typeof course !== 'string' || !/^[A-Z]{2,4}\s*\d{3}$/i.test(course.trim()) || typeof student !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(student) || Object.keys(req.query).some(key => !['course','student'].includes(key))) {
      res.status(400).json({ error: 'Invalid picture request.' }); return;
    }
    try {
      const caller = await access.caller(token, course, student);
      if (!caller) { res.status(404).json({ error: 'Picture unavailable.' }); return; }
      const bytes = await access.picture(caller, course, student);
      if (!bytes) { res.status(404).json({ error: 'Picture unavailable.' }); return; }
      // Re-encode validated pixels so stored bytes cannot inject active content.
      const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
      const meta = await image.metadata();
      if (!['png','jpeg'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('Invalid image');
      const output = await image.png().toBuffer();
      res.type('image/png').send(output);
    } catch { res.status(503).json({ error: 'Picture unavailable. Please retry.' }); }
  });
  return router;
}
