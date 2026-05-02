// src/routes/Catalog.tsx
// /catalog — entry point for warehouse cataloging. Renders the
// CustomerJobPicker which navigates to /catalog/session on Begin.

import { CustomerJobPicker } from '@/components/catalog/CustomerJobPicker';

export function Catalog() {
  return <CustomerJobPicker />;
}
