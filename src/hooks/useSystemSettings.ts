// src/hooks/useSystemSettings.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SystemSettingsDTO } from '@shared/types';

export function useSystemSettings() {
  return useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api<SystemSettingsDTO>('/system-settings'),
  });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Pick<SystemSettingsDTO, 'labelPrinterHelperUrl'>>) =>
      api<SystemSettingsDTO>('/system-settings', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (data) => qc.setQueryData(['system-settings'], data),
  });
}
