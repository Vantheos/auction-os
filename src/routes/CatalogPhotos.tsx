// src/routes/CatalogPhotos.tsx
// /catalog/session/photos?focus=<photoId> — full-screen photo manager
// for the current in-progress lot. Reads lotId from the catalog session
// hook (URL params + state) and the focused photoId from the query.

import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCatalogSession } from '@/hooks/useCatalogSession';
import { PhotoManager } from '@/components/catalog/PhotoManager';

export function CatalogPhotos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { lotId, customerId, jobId } = useCatalogSession();
  const focus = params.get('focus');

  if (!lotId) {
    // No in-progress lot — go back to session
    const session = customerId && jobId ? `?customer=${customerId}&job=${jobId}` : '';
    navigate(`/catalog/session${session}`, { replace: true });
    return null;
  }

  const close = () => {
    const session = customerId && jobId ? `?customer=${customerId}&job=${jobId}` : '';
    navigate(`/catalog/session${session}`);
  };

  return <PhotoManager lotId={lotId} initialFocusId={focus} onClose={close} />;
}
