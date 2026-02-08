'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DailySummary,
  MonthlyStats,
  SalesTrendPoint,
  Sale,
} from '@/lib/types';

export function useDailySummary(date: string) {
  return useQuery({
    queryKey: ['dashboard', 'summary', date],
    queryFn: () => api.get<DailySummary>(`/dashboard/daily-summary/${date}`),
    enabled: !!date,
  });
}

export function useWeChatMessage(date: string) {
  return useQuery({
    queryKey: ['dashboard', 'wechat', date],
    queryFn: () => api.get<{ message: string }>(`/dashboard/wechat-message/${date}`),
    enabled: !!date,
  });
}

export function useMonthlyStats(year: number, month: number) {
  return useQuery({
    queryKey: ['dashboard', 'monthly-stats', year, month],
    queryFn: () =>
      api.get<MonthlyStats>(`/dashboard/monthly-stats/${year}/${month}`),
  });
}

export function useSalesTrend(year: number, month: number) {
  return useQuery({
    queryKey: ['dashboard', 'sales-trend', year, month],
    queryFn: async () => {
      const result = await api.get<{ daily_data: SalesTrendPoint[] }>(
        `/dashboard/sales-trend/${year}/${month}`,
      );
      return result.daily_data;
    },
  });
}

export function useRecentSales(limit: number = 10) {
  return useQuery({
    queryKey: ['dashboard', 'recent-sales', limit],
    queryFn: () => api.get<Sale[]>(`/sales?limit=${limit}`),
  });
}
