import { fileURLToPath } from 'node:url';
import { ReportStore } from './crowd.js';
import { createApp } from './app.js';
const store = new ReportStore(process.env.CROWD_REPORTS_PATH ?? fileURLToPath(new URL('../data/crowd-reports.json', import.meta.url)));
await store.load();
createApp(store).listen(Number(process.env.PORT ?? 3000), () => console.log('Wolfie API ready'));
