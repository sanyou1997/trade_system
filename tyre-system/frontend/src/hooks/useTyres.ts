'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Tyre, TyreWithStock } from '@/lib/types';

export function useTyres() {
  return useQuery({
    queryKey: ['tyres'],
    queryFn: () => api.get<Tyre[]>('/tyres'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useTyresWithStock(year?: number, month?: number) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  const qs = params.toString();

  return useQuery({
    queryKey: ['tyres', 'with-stock', year, month],
    queryFn: () => api.get<TyreWithStock[]>(`/tyres/with-stock${qs ? `?${qs}` : ''}`),
    staleTime: 2 * 60 * 1000,
  });
}
