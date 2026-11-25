import 'dotenv/config';
import { createApp } from './app.js';
const previewEnabled = process.env.ENABLE_SCHEDULE_PREVIEW === '1' && process.env.NODE_ENV !== 'production';
createApp().listen(Number(process.env.PORT ?? 3000), previewEnabled ? '127.0.0.1' : '0.0.0.0', () => console.log('Wolfie API ready'));
