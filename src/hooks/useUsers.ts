// src/hooks/useUsers.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateUserRequest, UpdateUserRequest, UserDTO } from '@shared/types';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: UserDTO[] }>('/users').then((r) => r.users),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserRequest) =>
      api<UserDTO>('/users', { method: 'POST', body: JSON.stringify(input) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserRequest }) =>
      api<UserDTO>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
