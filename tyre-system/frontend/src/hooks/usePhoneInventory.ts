'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PhoneInventoryItem } from '@/lib/types';

export function usePhoneInventory(year: number, month: number) {
  return useQuery({
    queryKey: ['phone-inventory', year, month],
    queryFn: () =>
      api.get<PhoneInventoryItem[]>(`/phone-inventory/${year}/${month}`),
  });
}

export function useUpdatePhoneStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      phone_id: number;
      year: number;
      month: number;
      initial_stock?: number;
      added_stock?: number;
    }) => api.put('/phone-inventory/stock', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] });
    },
  });
}

export function usePhoneLowStock(year?: number, month?: number) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  return useQuery({
    queryKey: ['phone-inventory', 'low-stock', y, m],
    queryFn: () =>
      api.get<PhoneInventoryItem[]>(`/phone-inventory/low-stock?year=${y}&month=${m}`),
  });
}
