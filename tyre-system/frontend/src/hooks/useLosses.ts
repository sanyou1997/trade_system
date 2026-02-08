'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loss, LossCreate } from '@/lib/types';

export function useLosses(year?: number, month?: number) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  const qs = params.toString();

  return useQuery({
    queryKey: ['losses', year, month],
    queryFn: () => api.get<Loss[]>(`/losses${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateLoss() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LossCreate) => api.post<Loss>('/losses', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['losses'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['tyres'] }),
      ]);
    },
  });
}

export function useDeleteLoss() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (lossId: number) => api.delete(`/losses/${lossId}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['losses'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['tyres'] }),
      ]);
    },
  });
}
