import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CustomerDTO } from '@shared/types';

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => api<{ customers: CustomerDTO[] }>('/customers').then((r) => r.customers),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api<CustomerDTO>('/customers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
