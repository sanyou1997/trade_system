'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PhoneLoss, PhoneLossCreate } from '@/lib/types';

export function usePhoneLosses(year?: number, month?: number) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  const qs = params.toString();

  return useQuery({
    queryKey: ['phone-losses', year, month],
    queryFn: () => api.get<PhoneLoss[]>(`/phone-losses${qs ? `?${qs}` : ''}`),
  });
}

export function useCreatePhoneLoss() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PhoneLossCreate) => api.post<PhoneLoss>('/phone-losses', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['phone-losses'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['phones'] }),
      ]);
    },
  });
}

export function useDeletePhoneLoss() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (lossId: number) => api.delete(`/phone-losses/${lossId}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['phone-losses'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['phones'] }),
      ]);
    },
  });
}
