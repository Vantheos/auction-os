// api/_lib/storage.ts
// Supabase Storage helpers for the `lot-photos` bucket. Uses the service-role
// admin client so signed URLs can be issued without a per-request user session.
// Bucket is private; clients PUT to signed upload URLs and GET via signed read
// URLs (both have a 1h TTL by default).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'lot-photos';
const READ_URL_TTL_SECONDS = 60 * 60; // 1 hour

let _admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

export type Transform = {
  width?: number;
  height?: number;
  quality?: number;
  // Supabase's storage transform defaults to 'cover' when not specified, which
  // can crop horizontally even when only `width` is given (verified empirically
  // 2026-05-02). Pass 'contain' explicitly when full-image preservation matters.
  resize?: 'cover' | 'contain' | 'fill';
};

/**
 * Issue a signed upload URL the browser can PUT to. The DB `lot_photo` row
 * should already exist in `pending` state when this is called.
 */
export async function signUploadUrl(
  path: string
): Promise<{ uploadUrl: string; token: string }> {
  const { data, error } = await getAdmin()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`Failed to sign upload URL for ${path}: ${error?.message ?? 'unknown'}`);
  }
  return { uploadUrl: data.signedUrl, token: data.token };
}

/**
 * Sign a single read URL with optional image transformation. TTL = 1h.
 */
export async function signReadUrl(
  path: string,
  transform?: Transform
): Promise<string> {
  const { data, error } = await getAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, READ_URL_TTL_SECONDS, transform ? { transform } : undefined);
  if (error || !data) {
    throw new Error(`Failed to sign read URL for ${path}: ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

/**
 * Bulk-sign read URLs in parallel. Used by GET /api/lots to attach
 * `coverSignedUrl` per row without N+1 round trips. Order is preserved.
 * Returns a Map keyed by storage path.
 *
 * If individual signs fail, the entry is omitted from the map (caller can
 * treat absence as "no URL available" — caller chose to render placeholder).
 */
export async function bulkSignReadUrls(
  paths: string[],
  transform?: Transform
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  const settled = await Promise.allSettled(
    paths.map((p) => signReadUrl(p, transform))
  );
  for (let i = 0; i < paths.length; i++) {
    const entry = settled[i];
    if (entry.status === 'fulfilled') {
      result.set(paths[i], entry.value);
    } else {
      console.error(`bulkSignReadUrls: failed for ${paths[i]}: ${String(entry.reason)}`);
    }
  }
  return result;
}

/**
 * Remove storage objects. Used by lot-delete and photo-delete handlers.
 * Best-effort: failures are logged but do not throw — DB state is the
 * source of truth, and orphaned files (if any) are tolerable since the
 * cleanup-orphan-lots cron runs periodically.
 */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getAdmin().storage.from(BUCKET).remove(paths);
  if (error) {
    console.error(`removeObjects: failed for ${paths.length} paths: ${error.message}`);
  }
}

/**
 * List all object paths under a lot's prefix `lots/{lotId}/`. Used by the
 * cleanup-orphan-lots sweep to clear any storage objects when a lot row is
 * removed (defense in depth — orphans by definition have zero `lot_photo`
 * rows so usually this is empty).
 */
export async function listLotObjects(lotId: string): Promise<string[]> {
  const { data, error } = await getAdmin()
    .storage.from(BUCKET)
    .list(`lots/${lotId}`, { limit: 100 });
  if (error || !data) {
    console.error(`listLotObjects: failed for lot ${lotId}: ${error?.message ?? 'unknown'}`);
    return [];
  }
  return data.map((entry) => `lots/${lotId}/${entry.name}`);
}

export const STORAGE_BUCKET = BUCKET;
