# Troubleshooting

Common issues and how to recover.

## "I'm signed in but pages won't load"

Two likely causes:

1. **Your account was disabled** while you were signed in. Sign out and
   try to sign back in — you'll see the disabled-account message if
   that's the cause. Ask an admin to re-enable you.
2. **Stale session.** Hard-refresh (`Ctrl+Shift+R` on desktop, or close
   and reopen the tab on mobile). If that doesn't fix it, sign out and
   back in.

## "I see the previous user's toast or data"

Sign out from the sidebar rather than navigating to `/login` directly.
The proper sign-out clears toasts and cached data so nothing leaks
across to the next user. If you've already hit this, sign out fully now
and back in.

## "My iPhone shows an old version of the app"

iOS Safari is aggressive about caching. In order of escalation:

1. Pull-to-refresh on the page.
2. Close the tab and open a new one to the same URL.
3. Open the page in a Private tab — that bypasses the cache entirely.
4. Settings → Safari → Clear History and Website Data (last resort,
   wipes other site data too).

The HTML itself is set to no-cache, so once you bypass the stale
cached copy you should stay on the latest build.

## "Save Changes button doesn't seem to do anything"

Look for the toast — it now appears above any open dialog (z-index was
fixed for this). If you see "Saved" briefly, the change went through.
If you see an error toast, the message tells you what failed.

If there's no toast at all, your form might still think nothing's
changed — try editing a field again and re-saving.

## "Photo I just uploaded looks blank"

Wait a few seconds. Photos upload in the background and the thumbnail
finalizes after the upload queue dequeues. If it's still blank after
~10 seconds, refresh the page — the photo is on the server even if the
thumbnail didn't render the first time.

## "I lost my place after pull-to-refresh in catalog"

Catalog stores the lot ID in the URL specifically so this doesn't
happen — you should land back on the same lot. If you don't, reopen
Catalog and the in-progress lot will be at the top, ready to pick back
up.

## "Export got 'BlobError' or fails repeatedly"

That's an infrastructure issue, not something you can fix in the UI.
Use the **Retry** button on the failed batch first. If it still fails,
contact an admin so they can check the Vercel Blob store config.

## "I can't see Customers / Settings / bulk actions"

Those are role-gated. See
[Roles and permissions](./roles-and-permissions.md) for the full
matrix of what each role can do.
