import { randomUUID } from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export interface AvatarOwner { id: string; upload: (path: string, bytes: Buffer) => Promise<void> }
export type AuthorizeAvatar = (token: string) => Promise<AvatarOwner | null>;
export const authorizeAvatar: AuthorizeAvatar = async token => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Avatar storage is not configured.');
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;
  const eligibility = await client.rpc('account_is_eligible');
  if (eligibility.error || eligibility.data !== true) return null;
  return { id: user.id, upload: async (path, bytes) => {
    const { error } = await client.storage.from('avatars').upload(path, bytes, { contentType: 'image/png', upsert: false });
    if (error) throw new Error('Picture upload failed. Please retry.');
  } };
};
export function avatarRouter(authorize: AuthorizeAvatar = authorizeAvatar) {
  const router = express.Router();
  router.post('/', async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in before uploading a picture.' }); return; }
    try {
      const owner = await authorize(token);
      if (!owner) { res.status(403).json({ error: 'A verified Stony Brook Google account is required.' }); return; }
      res.locals.avatarOwner = owner; next();
    } catch { res.status(503).json({ error: 'Picture storage is unavailable. Please retry.' }); }
  }, express.raw({ type: ['image/png','image/jpeg'], limit: '5mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) { res.status(400).json({ error: 'Choose a nonempty PNG or JPEG up to 5 MiB.' }); return; }
    let bytes: Buffer;
    try {
      const image = sharp(req.body, { limitInputPixels: 20_000_000, animated: false });
      const metadata = await image.metadata();
      if (!['png','jpeg'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
      bytes = await image.rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Image too large');
    } catch { res.status(400).json({ error: 'This picture could not be opened. Choose a readable PNG or JPEG up to 5 MiB.' }); return; }
    try {
      const owner: AvatarOwner = res.locals.avatarOwner;
      const path = `${owner.id}/${randomUUID()}.png`;
      await owner.upload(path, bytes);
      res.status(201).json({ path });
    } catch { res.status(503).json({ error: 'Picture upload failed. Please retry.' }); }
  });
  router.use(((error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Choose a nonempty PNG or JPEG up to 5 MiB.' });
  }) as express.ErrorRequestHandler);
  return router;
}
