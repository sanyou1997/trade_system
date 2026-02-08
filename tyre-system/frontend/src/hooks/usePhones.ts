'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Phone, PhoneWithStock } from '@/lib/types';

export function usePhones() {
  return useQuery({
    queryKey: ['phones'],
    queryFn: () => api.get<Phone[]>('/phones'),
    staleTime: 10 * 60 * 1000,
  });
}

export function usePhonesWithStock(year?: number, month?: number) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  const qs = params.toString();

  return useQuery({
    queryKey: ['phones', 'with-stock', year, month],
    queryFn: () => api.get<PhoneWithStock[]>(`/phones/with-stock${qs ? `?${qs}` : ''}`),
    staleTime: 2 * 60 * 1000,
  });
}
