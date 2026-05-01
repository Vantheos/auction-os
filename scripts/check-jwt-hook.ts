import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

(async () => {
  const [admin] = await sql`SELECT id FROM app_user WHERE role = 'admin' LIMIT 1`;
  console.log(`admin = ${admin.id}`);

  // Hard-code the JSON literal directly via unsafe — avoid postgres-js parameter binding
  const literal = JSON.stringify({ user_id: admin.id, claims: { sub: admin.id, email: 'x', app_metadata: {}, user_metadata: {} } });
  const escaped = literal.replace(/'/g, "''");
  const out = await sql.unsafe(`SELECT public.custom_access_token_hook('${escaped}'::jsonb) AS out`);
  console.log('hook out:', JSON.stringify(out[0]?.out, null, 2));

  await sql.end();
})();
