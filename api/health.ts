import { handle } from '@hono/node-server/vercel';
// api/health.ts
import { createApp } from './_app.js';

const app = createApp();
app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

export const fetch = (req: Request) => app.fetch(req);
export default handle(app);
