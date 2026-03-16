'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OtherLoss, OtherLossCreate } from '@/lib/types';

export function useOtherLosses(year?: number, month?: number) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  const qs = params.toString();

  return useQuery({
    queryKey: ['other-losses', year, month],
    queryFn: () => api.get<OtherLoss[]>(`/other-losses${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateOtherLoss() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OtherLossCreate) => api.post<OtherLoss>('/other-losses', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['other-losses'] }),
        queryClient.invalidateQueries({ queryKey: ['other-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['other-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['others'] }),
      ]);
    },
  });
}

export function useDeleteOtherLoss() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (lossId: number) => api.delete(`/other-losses/${lossId}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['other-losses'] }),
        queryClient.invalidateQueries({ queryKey: ['other-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['other-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['others'] }),
      ]);
    },
  });
}
