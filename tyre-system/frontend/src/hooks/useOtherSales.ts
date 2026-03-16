'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OtherSale, OtherSaleCreate, OtherSalesFilter } from '@/lib/types';

export function useOtherSales(filters: OtherSalesFilter = {}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set('start_date', filters.start_date);
  if (filters.end_date) params.set('end_date', filters.end_date);
  if (filters.payment_method) params.set('payment_method', filters.payment_method);
  if (filters.other_product_id) params.set('other_product_id', String(filters.other_product_id));
  if (filters.customer) params.set('customer_name', filters.customer);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();
  const endpoint = `/other-sales${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['other-sales', filters],
    queryFn: () => api.getRaw<OtherSale[]>(endpoint),
  });
}

export function useOtherDailySales(date: string) {
  return useQuery({
    queryKey: ['other-sales', 'daily', date],
    queryFn: () => api.get<OtherSale[]>(`/other-sales?start_date=${date}&end_date=${date}`),
    enabled: !!date,
  });
}

export function useCreateOtherSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OtherSaleCreate) => api.post<OtherSale>('/other-sales', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['other-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['other-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['other-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['others'] }),
      ]);
    },
  });
}

export function useDeleteOtherSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/other-sales/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['other-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['other-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['other-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['others'] }),
      ]);
    },
  });
}
