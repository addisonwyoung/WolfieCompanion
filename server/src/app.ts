import express from 'express';
import { classmatePictureRouter } from './classmatePicture.js';
import { groupPictureRouter } from './groupPicture.js';
import { friendPictureRouter } from './friendPicture.js';
import { avatarRouter } from './avatar.js';
import type { ErrorRequestHandler } from 'express';
import { schedulePreviewRouter } from './ocr/preview.js';
import type { PreviewOptions } from './ocr/preview.js';
import { courseReviewRouter } from './courseReviewModeration.js';
import { libraryOccupancy, type LibraryOccupancy } from './libraryOccupancy.js';
export function createApp(preview: PreviewOptions = {}, occupancy: Pick<LibraryOccupancy, 'list'> = libraryOccupancy,
  history: Pick<LibraryOccupancy, 'history'> = libraryOccupancy) {
  const app = express();
  app.use('/api/classmate-picture', classmatePictureRouter());
  app.use('/api/friend-picture', friendPictureRouter());
  app.use('/api/group-picture', groupPictureRouter());
  app.use('/api/avatar', avatarRouter());
  app.use('/api/schedule-preview', schedulePreviewRouter(preview));
  app.use(express.json({ limit: '8kb' }));
  app.use('/api/course-reviews', courseReviewRouter());
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/libraries', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ libraries: await occupancy.list() });
  });
  app.get('/api/libraries/:id/history', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = /^[1-5]$/.test(req.params.id) ? Number(req.params.id) : NaN;
    if (!Number.isFinite(id)) { res.status(404).json({ error: 'Library not found.' }); return; }
    const result = await history.history(id);
    if (!result) { res.status(404).json({ error: 'Library not found.' }); return; }
    res.json(result);
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const invalid = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    res.status(invalid ? 400 : 500).json({ error: invalid ? 'Invalid request body.' : 'Unable to complete request. Please try again.' });
  };
  app.use(errors);
  return app;
}
