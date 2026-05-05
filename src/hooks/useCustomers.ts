import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CustomerDTO, CreateCustomerRequest, UpdateCustomerRequest } from '@shared/types';

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => api<{ customers: CustomerDTO[] }>('/customers').then((r) => r.customers),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerRequest) =>
      api<CustomerDTO>('/customers', { method: 'POST', body: JSON.stringify(input) }),
    // onSettled (not onSuccess) so the customer list refetches on error too,
    // keeping the UI in sync with server state regardless of mutation outcome.
    onSettled: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & UpdateCustomerRequest) =>
      api<CustomerDTO>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', vars.id] });
    },
  });
}

export function useToggleCustomerDisabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      api<CustomerDTO>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ disabled }) }),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', vars.id] });
    },
  });
}
