// api/health.ts
import { handle } from 'hono/vercel';
import { createApp } from './_app';

const app = createApp();
app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

export default handle(app);
export const config = { runtime: 'nodejs' };
