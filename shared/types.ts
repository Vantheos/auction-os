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
