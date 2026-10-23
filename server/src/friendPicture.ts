import express from 'express';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export interface FriendPictureAccess { caller: (token: string, peer: string) => Promise<string | null>; picture: (caller: string, peer: string) => Promise<Buffer | null> }
export function createFriendPictureAccess(factory: typeof createClient = createClient, env: NodeJS.ProcessEnv = process.env): FriendPictureAccess { return {
  async caller(token, peer) {
    const url=env.SUPABASE_URL, key=env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Configuration unavailable');
    const client=factory(url,key,{ global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false} });
    const {data,error}=await client.auth.getUser(token); if(error || !data.user) return null;
    const detail=await client.rpc('get_friend_profile',{p_student_id:peer});
    if(detail.error) { if(['42501','22023'].includes(detail.error.code)) return null; throw new Error('Profile unavailable'); }
    return detail.data?.has_shared_avatar===true ? data.user.id : null;
  },
  async picture(caller,peer) {
    const url=env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY; if(!url||!key) throw new Error('Configuration unavailable');
    const client=factory(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const resolved=await client.rpc('resolve_friend_avatar',{p_caller_id:caller,p_student_id:peer}); if(resolved.error) throw new Error('Picture unavailable');
    const path=resolved.data;
    if(typeof path!=='string'||!path.startsWith(`${peer}/`)||!/^[a-f0-9-]+\/(?:[a-f0-9-]+)\.(png|jpg)$/.test(path)) return null;
    const {data,error}=await client.storage.from('avatars').download(path); if(error||!data||data.size>5*1024*1024) return null;
    return Buffer.from(await data.arrayBuffer());
  },
} }
export const friendPictureAccess=createFriendPictureAccess();
export function friendPictureRouter(access: FriendPictureAccess=friendPictureAccess) {
  const router=express.Router();
  router.get('/',async(req,res)=>{
    res.set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff');
    const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const student=req.query.student;
    if(!token){res.status(401).json({error:'Sign in to view this picture.'});return;}
    if(typeof student!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(student)||Object.keys(req.query).some(key=>key!=='student')){res.status(400).json({error:'Invalid picture request.'});return;}
    try{
      const caller=await access.caller(token,student); if(!caller){res.status(404).json({error:'Picture unavailable.'});return;}
      const bytes=await access.picture(caller,student); if(!bytes){res.status(404).json({error:'Picture unavailable.'});return;}
      const image=sharp(bytes,{limitInputPixels:20_000_000,animated:false}); const meta=await image.metadata();
      if(!['png','jpeg'].includes(meta.format??'')||(meta.pages??1)>1) throw new Error('Invalid image');
      res.type('image/png').send(await image.png().toBuffer());
    }catch{res.status(503).json({error:'Picture unavailable. Please retry.'});}
  });
  return router;
}
