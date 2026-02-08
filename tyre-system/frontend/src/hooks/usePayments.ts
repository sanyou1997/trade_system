'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Payment, PaymentCreate, ReceivablesData } from '@/lib/types';

export function usePayments(year?: number, month?: number) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  const qs = params.toString();

  return useQuery({
    queryKey: ['payments', year, month],
    queryFn: () => api.get<Payment[]>(`/payments${qs ? `?${qs}` : ''}`),
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PaymentCreate) => api.post<Payment>('/payments', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/payments/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}

export function useReceivables(year: number, month: number) {
  return useQuery({
    queryKey: ['payments', 'receivables', year, month],
    queryFn: () => api.get<ReceivablesData>(`/payments/receivables/${year}/${month}`),
  });
}
