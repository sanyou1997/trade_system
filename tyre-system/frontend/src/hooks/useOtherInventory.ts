'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OtherInventoryItem } from '@/lib/types';

export function useOtherInventory(year: number, month: number) {
  return useQuery({
    queryKey: ['other-inventory', year, month],
    queryFn: () =>
      api.get<OtherInventoryItem[]>(`/other-inventory/${year}/${month}`),
  });
}

export function useUpdateOtherStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      other_product_id: number;
      year: number;
      month: number;
      initial_stock?: number;
      added_stock?: number;
    }) => api.put('/other-inventory/stock', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['other-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['other-dashboard'] });
    },
  });
}

export function useOtherLowStock(year?: number, month?: number) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  return useQuery({
    queryKey: ['other-inventory', 'low-stock', y, m],
    queryFn: () =>
      api.get<OtherInventoryItem[]>(`/other-inventory/low-stock?year=${y}&month=${m}`),
  });
}
