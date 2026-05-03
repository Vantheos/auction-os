// tests/helpers/setup.ts
import '@testing-library/jest-dom/vitest';
import { config } from 'dotenv';
import { setJwksForTesting } from '../../api/_lib/auth';
import { getTestKeys } from './test-jwt';

// Load .env.test (Test Supabase project) instead of .env (Dev project)
config({ path: '.env.test' });

// Inject a local JWKS into the auth middleware so tests can mint and verify
// their own ES256-signed tokens without hitting Supabase's JWKS endpoint.
const { jwks } = await getTestKeys();
setJwksForTesting(jwks);
