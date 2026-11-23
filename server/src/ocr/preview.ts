import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { OcrProvider, Warning } from './types.js';
import { extractDocument, diagnostic } from './vision.js';
import { parseSchedule } from './parser.js';
import { MAX_IMAGE_BYTES, validateImage } from './image.js';
import { authorizeOcr, reserveOcr } from './access.js';
import type { AuthorizeOcr, ReserveOcr } from './access.js';
export interface PreviewOptions { enabled?: boolean; environment?: string; origin?: string; provider?: OcrProvider; authenticatedEnabled?: boolean; authorize?: AuthorizeOcr; reserve?: ReserveOcr }
export function schedulePreviewRouter(options: PreviewOptions = {}) {
  const router = express.Router();
  const enabled = (options.enabled ?? process.env.ENABLE_SCHEDULE_PREVIEW === '1') && (process.env.NODE_ENV !== 'production') && (options.environment ?? process.env.NODE_ENV) !== 'production';
  const authenticated = options.authenticatedEnabled ?? process.env.ENABLE_AUTHENTICATED_SCHEDULE_PREVIEW === '1';
  const origin = options.origin ?? process.env.SCHEDULE_PREVIEW_ORIGIN ?? 'http://localhost:5173';
  let validOrigin = false;
  try { const url = new URL(origin); validOrigin = ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.protocol==='http:' && url.origin===origin; } catch { /* invalid origins deny access */ }
  let validHostedOrigin = false;
  try { const url = new URL(origin); validHostedOrigin = url.origin === origin && (url.protocol === 'https:' || validOrigin); } catch { /* fail closed */ }
  let busy = false;
  router.use(async (req,res,next) => {
    if (authenticated) {
      if (!validHostedOrigin || req.get('Origin') !== origin || req.get('X-Schedule-Preview') !== '1') { res.status(403).json({error:'Use the configured schedule import page.'}); return; }
      const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) { res.status(401).json({error:'Sign in before importing a schedule.'}); return; }
      try {
        const userId = await (options.authorize ?? authorizeOcr)(token);
        if (!userId) { res.status(403).json({error:'A verified student account is required.'}); return; }
        res.locals.ocrUserId = userId;
        next();
      } catch { res.status(503).json({error:'Schedule import is temporarily unavailable. Please try again later.'}); }
      return;
    }
    if (!enabled) { res.status(404).json({error:'Schedule preview is disabled. Start the local API with ENABLE_SCHEDULE_PREVIEW=1.'}); return; }
    const address=req.socket.remoteAddress;
    if (!validOrigin || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address ?? '') || req.get('Origin')!==origin || req.get('X-Schedule-Preview')!=='1') { res.status(403).json({error:'Use the configured local preview page.'}); return; }
    next();
  });
  router.post('/', (req,res,next) => {
    if (!['class-list','weekly-calendar'].includes(String(req.query.layout))) { res.status(400).json({error:'Choose class-list or weekly-calendar.'}); return; }
    if (!['image/png','image/jpeg'].includes(req.get('Content-Type') ?? '')) { res.status(415).json({error:'Upload a PNG or JPEG image.'}); return; }
    next();
  }, express.raw({type:['image/png','image/jpeg'],limit:MAX_IMAGE_BYTES}), async(req,res) => {
    try {
      if (!Buffer.isBuffer(req.body)) { res.status(400).json({error:'Upload a nonempty image.'}); return; }
      const type=validateImage(req.body);
      if(type!==req.get('Content-Type')) { res.status(415).json({error:'Image contents do not match its media type.'}); return; }
    } catch { res.status(400).json({error:'Use a nonempty PNG/JPEG image no larger than 10 MiB.'}); return; }
    if(busy){res.status(429).json({error:'Another extraction is running. Try again shortly.'});return;}
    busy=true;
    try {
      if (authenticated) {
        let reserved: boolean;
        try { reserved = await (options.reserve ?? reserveOcr)(res.locals.ocrUserId); }
        catch { res.status(503).json({error:'Schedule import usage limits are unavailable. Please try again later.'}); return; }
        if (!reserved) { res.status(429).json({error:'The daily schedule import limit has been reached. Try again tomorrow (UTC), or enter your courses manually.'}); return; }
      }
      const result=parseSchedule(await (options.provider ?? extractDocument)(req.body), req.query.layout as 'class-list'|'weekly-calendar');
      const rows: {code:string;section:string;warnings:Warning[]}[]=[];
      for(const course of result.classes) {
        const warnings=course.warnings.filter(w=>['CONFLICTING_SECTION','AMBIGUOUS_METADATA'].includes(w.code));
        if(!course.sections.length) warnings.push({code:'MISSING_SECTION',message:'Section not detected. Check the screenshot and enter it.'});
        for(const section of course.sections.length ? course.sections.map(s=>s.label) : ['']) {
          const prior=rows.find(r=>r.code===course.code && r.section===section);
          if(prior) prior.warnings=[...new Map([...prior.warnings,...warnings].map(w=>[w.code,w])).values()];
          else rows.push({code:course.code,section,warnings:[...warnings]});
        }
      }
      res.json({rows,warnings:result.warnings.filter(w=>w.code!=='AMBIGUOUS_TERM'),requiresReview:true});
    } catch(error) {
      const safe=diagnostic(error);res.status(safe.message.includes('timed out')?504:502).json({error:safe.message});
    } finally {busy=false;}
  });
  const errors: ErrorRequestHandler=(error,_req,res,_next)=>{res.status(error.type==='entity.too.large'?413:400).json({error:'Unable to read image. Use a PNG/JPEG up to 10 MiB.'});};
  router.use(errors);
  return router;
}
