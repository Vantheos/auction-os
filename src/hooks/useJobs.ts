import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { JobDTO, CreateJobRequest, UpdateJobRequest } from '@shared/types';

export type { JobDTO } from '@shared/types';

export function useJobs(customerId: string | undefined) {
  return useQuery({
    queryKey: ['jobs', customerId],
    enabled: !!customerId,
    queryFn: () => api<{ jobs: JobDTO[] }>(`/jobs?customerId=${customerId}`).then((r) => r.jobs),
  });
}

export function useCreateJob(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateJobRequest, 'customerId'>) =>
      api<JobDTO>('/jobs', { method: 'POST', body: JSON.stringify({ customerId, ...input }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', customerId] }),
  });
}

export function useUpdateJob(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & UpdateJobRequest) =>
      api<JobDTO>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    // onSettled keeps the UI in sync after both success and error.
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['jobs', customerId] });
      qc.invalidateQueries({ queryKey: ['job', vars.id] });
    },
  });
}

export function useToggleJobClosed(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, closed }: { id: string; closed: boolean }) =>
      api<JobDTO>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ closed }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', customerId] }),
  });
}
