'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InventoryItem, InventoryFilter } from '@/lib/types';

export function useInventory(filters: InventoryFilter) {
  return useQuery({
    queryKey: ['inventory', filters.year, filters.month],
    queryFn: () =>
      api.get<InventoryItem[]>(
        `/inventory/${filters.year}/${filters.month}`
      ),
    select: (data) => {
      if (!filters.category) return data;
      return data.filter((item) => item.category === filters.category);
    },
  });
}

export function useUpdateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      tyre_id: number;
      year: number;
      month: number;
      initial_stock?: number;
      added_stock?: number;
    }) => api.put(`/inventory/stock`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useLowStock(year?: number, month?: number) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  return useQuery({
    queryKey: ['inventory', 'low-stock', y, m],
    queryFn: () =>
      api.get<InventoryItem[]>(`/inventory/low-stock?year=${y}&month=${m}`),
  });
}
