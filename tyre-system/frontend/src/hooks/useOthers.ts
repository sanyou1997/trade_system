'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OtherProduct, OtherProductWithStock } from '@/lib/types';

export function useOthers() {
  return useQuery({
    queryKey: ['others'],
    queryFn: () => api.get<OtherProduct[]>('/others'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useOthersWithStock(year?: number, month?: number) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  const qs = params.toString();

  return useQuery({
    queryKey: ['others', 'with-stock', year, month],
    queryFn: () => api.get<OtherProductWithStock[]>(`/others/with-stock${qs ? `?${qs}` : ''}`),
    staleTime: 2 * 60 * 1000,
  });
}
