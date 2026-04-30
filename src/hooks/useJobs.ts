import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type JobDTO = {
  id: string;
  customerId: string;
  jobNumber: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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
    mutationFn: (input: { jobNumber: string }) => api<JobDTO>('/jobs', { method: 'POST', body: JSON.stringify({ customerId, ...input }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', customerId] }),
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
