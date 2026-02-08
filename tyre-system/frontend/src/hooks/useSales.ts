'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Sale, SaleCreate, SalesFilter } from '@/lib/types';

export function useSales(filters: SalesFilter = {}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set('start_date', filters.start_date);
  if (filters.end_date) params.set('end_date', filters.end_date);
  if (filters.payment_method) params.set('payment_method', filters.payment_method);
  if (filters.tyre_id) params.set('tyre_id', String(filters.tyre_id));
  if (filters.customer) params.set('customer', filters.customer);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();
  const endpoint = `/sales${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['sales', filters],
    queryFn: () => api.getRaw<Sale[]>(endpoint),
  });
}

export function useDailySales(date: string) {
  return useQuery({
    queryKey: ['sales', 'daily', date],
    queryFn: () => api.get<Sale[]>(`/sales?start_date=${date}&end_date=${date}`),
    enabled: !!date,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SaleCreate) => api.post<Sale>('/sales', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['tyres'] }),
      ]);
    },
  });
}

export function useDeleteSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/sales/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['tyres'] }),
      ]);
    },
  });
}
