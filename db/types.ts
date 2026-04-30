import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as s from './schema.js';

export type AppUser = InferSelectModel<typeof s.appUser>;
export type AppUserInsert = InferInsertModel<typeof s.appUser>;
export type Customer = InferSelectModel<typeof s.customer>;
export type CustomerInsert = InferInsertModel<typeof s.customer>;
export type Job = InferSelectModel<typeof s.job>;
export type JobInsert = InferInsertModel<typeof s.job>;
export type Lot = InferSelectModel<typeof s.lot>;
export type LotPhoto = InferSelectModel<typeof s.lotPhoto>;
