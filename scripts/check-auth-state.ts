// scripts/check-auth-state.ts — diagnose JWT custom claim hook state on the configured DB
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

(async () => {
  console.log('--- app_user rows ---');
  const users = await sql`SELECT id, role, display_name, disabled_at FROM app_user ORDER BY role, display_name`;
  for (const u of users) console.log(`${u.role.padEnd(12)} ${u.display_name.padEnd(20)} ${u.id} disabled=${u.disabled_at ? 'YES' : 'no'}`);

  console.log('\n--- custom_access_token_hook function ---');
  const fns = await sql`
    SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer, pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'custom_access_token_hook'
  `;
  if (fns.length === 0) console.log('NOT FOUND — hook function missing');
  for (const f of fns) console.log(`${f.schema}.${f.name}(${f.args}) → ${f.result}  SECURITY ${f.security_definer ? 'DEFINER' : 'INVOKER'}`);

  console.log('\n--- search_path on hook ---');
  const sp = await sql`SELECT proname, proconfig FROM pg_proc WHERE proname = 'custom_access_token_hook'`;
  for (const r of sp) console.log(`config: ${JSON.stringify(r.proconfig)}`);

  console.log('\n--- raw_app_meta_data on auth.users (admin) ---');
  try {
    const auth = await sql`SELECT id, email, raw_app_meta_data FROM auth.users WHERE email = 'admin@auction-os.local' LIMIT 1`;
    for (const u of auth) console.log(`${u.email}  meta=${JSON.stringify(u.raw_app_meta_data)}`);
  } catch (e) {
    console.log('cannot read auth.users with this connection:', (e as Error).message);
  }

  await sql.end();
})();
