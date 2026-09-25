import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { levels, ReportStore } from './crowd.js';
export function createApp(store: ReportStore) {
  const app = express();
  app.use(express.json({ limit: '8kb' }));
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/locations', (_req, res) => { res.json({ locations: store.list() }); });
  app.get('/api/locations/:id', (req, res) => {
    const detail = store.detail(req.params.id);
    if (!detail) { res.status(404).json({ error: 'Location not found.' }); return; }
    res.json(detail);
  });
  app.post('/api/locations/:id/reports', async (req, res) => {
    if (!store.detail(req.params.id)) { res.status(404).json({ error: 'Location not found.' }); return; }
    const { level, note = '' } = req.body ?? {};
    if (!levels.includes(level) || typeof note !== 'string' || note.trim().length > 200) {
      res.status(400).json({ error: 'Choose a valid crowd level and a note of at most 200 characters.' }); return;
    }
    res.status(201).json(await store.add(req.params.id, level, note.trim()));
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const invalid = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    res.status(invalid ? 400 : 500).json({ error: invalid ? 'Invalid request body.' : 'Unable to save report. Please try again.' });
  };
  app.use(errors);
  return app;
}
