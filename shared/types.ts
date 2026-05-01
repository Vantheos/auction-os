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
};

export type LotPhotoDTO = {
  id: string;
  lotId: string;
  storagePath: string;
  displayOrder: number;
  status: 'pending' | 'uploaded' | 'failed';
  capturedAt: string;
  capturedBy: string;
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
