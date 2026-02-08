'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PhoneSale, PhoneSaleCreate, PhoneSalesFilter } from '@/lib/types';

export function usePhoneSales(filters: PhoneSalesFilter = {}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set('start_date', filters.start_date);
  if (filters.end_date) params.set('end_date', filters.end_date);
  if (filters.payment_method) params.set('payment_method', filters.payment_method);
  if (filters.phone_id) params.set('phone_id', String(filters.phone_id));
  if (filters.customer) params.set('customer', filters.customer);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();
  const endpoint = `/phone-sales${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['phone-sales', filters],
    queryFn: () => api.getRaw<PhoneSale[]>(endpoint),
  });
}

export function usePhoneDailySales(date: string) {
  return useQuery({
    queryKey: ['phone-sales', 'daily', date],
    queryFn: () => api.get<PhoneSale[]>(`/phone-sales?start_date=${date}&end_date=${date}`),
    enabled: !!date,
  });
}

export function useCreatePhoneSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PhoneSaleCreate) => api.post<PhoneSale>('/phone-sales', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['phone-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['phones'] }),
      ]);
    },
  });
}

export function useDeletePhoneSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/phone-sales/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['phone-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['phones'] }),
      ]);
    },
  });
}
