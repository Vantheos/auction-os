// shared/types.ts
export type CustomerDTO = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerRequest = { name: string };
export type UpdateCustomerRequest = { name?: string };

export type ApiError = { error: { code: string; message: string } };

export type LotState = 'assigned' | 'unassigned' | 'sold' | 'picked-up' | 'not-sellable';

export type LotDTO = {
  id: string;
  jobId: string | null;
  customerId: string | null;        // resolved server-side via job join
  customerName: string | null;
  jobNumber: string | null;
  lotNumber: number | null;
  quantity: number | null;
  title: string | null;
  description: string | null;
  price: string | null;             // numeric serialized as string
  condition: 'used';
  ref1: string | null;
  ref2: string | null;
  specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
  specialNotesText: string | null;
  untested: boolean;
  state: LotState;
  lastAiRunStatus: 'success' | 'partial' | 'failure' | null;
  lastAiRunError: string | null;
  intakeOperatorId: string;
  intakeTimestamp: string;
  createdAt: string;
  updatedAt: string;
  // Phase 3: cover thumbnail signed URL (only present on list responses)
  coverSignedUrl?: string | null;
};

export type LotPhotoDTO = {
  id: string;
  lotId: string;
  storagePath: string;
  displayOrder: number;
  status: 'pending' | 'uploaded' | 'failed';
  capturedAt: string;
  capturedBy: string;
  // Phase 3: signed read URL — present on GET responses for uploaded photos
  signedUrl?: string | null;
};

// Returned in CreateLotResponse.firstPhoto when the request included
// firstPhoto: { displayOrder: 1 }. Client uses uploadUrl to PUT the file.
export type CreatedFirstPhotoDTO = {
  id: string;
  lotId: string;
  storagePath: string;
  displayOrder: 1;
  status: 'pending';
  uploadUrl: string;
  token: string;
};

// Returned in POST /api/lots/[id]/photos for subsequent photos
export type CreatedPhotoDTO = LotPhotoDTO & {
  uploadUrl: string;
  token: string;
};

export type LotsListResponse = { lots: LotDTO[]; total: number };

export type CreateLotRequest = {
  jobId: string;
  quantity?: number;
  title?: string;
  description?: string;
  price?: string;
  ref1?: string;
  ref2?: string;
  specialNotesCategory?: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
  specialNotesText?: string;
  untested?: boolean;
  // Phase 3: when present, the server creates the first lot_photo row in the
  // same transaction as the lot row and returns it (with a signed upload URL)
  // in CreateLotResponse.firstPhoto.
  firstPhoto?: { displayOrder: 1 };
};

export type CreateLotResponse = LotDTO & {
  firstPhoto?: CreatedFirstPhotoDTO | null;
};

export type SystemSettingsDTO = {
  id: 1;
  aiScheduleEnabled: boolean;
  aiScheduleFrequency: 'hourly' | 'daily';
  aiScheduleTimeOfDay: string;
  aiLastRunAt: string | null;
  labelPrinterHelperUrl: string | null;
  updatedAt: string;
};
