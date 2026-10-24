import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { ReportStore } from './crowd.js';
import { createApp } from './app.js';
const store = new ReportStore(process.env.CROWD_REPORTS_PATH ?? fileURLToPath(new URL('../data/crowd-reports.json', import.meta.url)));
await store.load();
const previewEnabled = process.env.ENABLE_SCHEDULE_PREVIEW === '1' && process.env.NODE_ENV !== 'production';
createApp(store).listen(Number(process.env.PORT ?? 3000), previewEnabled ? '127.0.0.1' : '0.0.0.0', () => console.log('Wolfie API ready'));
