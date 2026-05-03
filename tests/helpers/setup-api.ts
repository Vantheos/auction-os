// tests/helpers/setup-api.ts
// API project setup. Loads the test Supabase env and injects a local JWKS
// into the auth middleware so tests can mint and verify their own
// ES256-signed tokens without hitting Supabase's JWKS endpoint.
import { config } from 'dotenv';
import { setJwksForTesting } from '../../api/_lib/auth';
import { getTestKeys } from './test-jwt';

config({ path: '.env.test' });

const { jwks } = await getTestKeys();
setJwksForTesting(jwks);
