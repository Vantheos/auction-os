// src/hooks/useSystemSettings.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SystemSettingsDTO, UpdateSystemSettingsRequest } from '@shared/types';

export function useSystemSettings() {
  return useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api<SystemSettingsDTO>('/system-settings'),
    // Poll every 5s while an AI run holds the server-side lock so the
    // pending-AI badge ticks down live and the Run Now button reflects
    // server state even when the user navigates away and back during a
    // run (the local mutation observer detaches on unmount; the lock
    // does not). Stops polling once the lock clears.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.aiRunLockUntil) return false;
      return new Date(data.aiRunLockUntil).getTime() > Date.now() ? 5000 : false;
    },
  });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSystemSettingsRequest) =>
      api<SystemSettingsDTO>('/system-settings', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (data) => qc.setQueryData(['system-settings'], data),
  });
}
